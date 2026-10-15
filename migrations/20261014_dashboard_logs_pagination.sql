-- Structured search fields let the dashboard filter without scanning each JSON body.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE logs
    ADD COLUMN IF NOT EXISTS log_id BIGSERIAL,
    ADD COLUMN IF NOT EXISTS customer_name TEXT,
    ADD COLUMN IF NOT EXISTS shopify_order_id TEXT,
    ADD COLUMN IF NOT EXISTS shopify_order_name TEXT,
    ADD COLUMN IF NOT EXISTS dimona_order_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS logs_log_id_unique_idx ON logs (log_id);

-- Populate searchable fields from existing JSON log payloads. The logs table stores
-- structured request/result bodies, including older Shopify/Dimona field names.
UPDATE logs
SET customer_name = COALESCE(customer_name,
        NULLIF(body::jsonb ->> 'customerName', ''),
        NULLIF(body::jsonb ->> 'customer_name', ''),
        NULLIF(body::jsonb #>> '{order,customer_name}', ''),
        NULLIF(body::jsonb #>> '{order,shipping_address,name}', ''),
        NULLIF(body::jsonb #>> '{summaries,0,customer_name}', '')
    ),
    shopify_order_id = COALESCE(shopify_order_id,
        NULLIF(body::jsonb ->> 'shopifyOrderId', ''),
        NULLIF(body::jsonb ->> 'shopify_order_id', ''),
        NULLIF(body::jsonb ->> 'order_id', ''),
        NULLIF(body::jsonb #>> '{order,id}', ''),
        CASE WHEN body::jsonb ->> 'order' ~ '^[0-9]+$' THEN body::jsonb ->> 'order' END,
        NULLIF(body::jsonb #>> '{summaries,0,order_id}', '')
    ),
    shopify_order_name = COALESCE(shopify_order_name,
        NULLIF(body::jsonb ->> 'shopifyOrderName', ''),
        NULLIF(body::jsonb ->> 'shopify_order_name', ''),
        NULLIF(body::jsonb #>> '{order,name}', '')
    ),
    dimona_order_id = COALESCE(dimona_order_id,
        NULLIF(body::jsonb ->> 'dimonaOrderId', ''),
        NULLIF(body::jsonb ->> 'dimona_order_id', ''),
        NULLIF(body::jsonb #>> '{dimonaResult,order}', ''),
        NULLIF(body::jsonb #>> '{dimonaResponse,order}', ''),
        NULLIF(body::jsonb #>> '{summaries,0,dimonaResponse,order}', '')
    )
WHERE body IS NOT NULL;

-- Materialize the old batch summaries once, then associate matching records by
-- indexed IDs instead of comparing every log body with every batch entry.
CREATE TEMP TABLE dashboard_log_batch_orders ON COMMIT DROP AS
SELECT DISTINCT ON (summary ->> 'order_id')
    summary ->> 'customer_name' AS customer_name,
    summary ->> 'order_id' AS shopify_order_id,
    summary #>> '{dimonaResponse,order}' AS dimona_order_id
FROM logs AS batch_log
CROSS JOIN LATERAL jsonb_array_elements(
    CASE
        WHEN jsonb_typeof(batch_log.body::jsonb -> 'summaries') = 'array'
            THEN batch_log.body::jsonb -> 'summaries'
        ELSE '[]'::jsonb
    END
) AS summaries(summary)
WHERE batch_log.body IS NOT NULL
    AND summary ->> 'order_id' IS NOT NULL
ORDER BY summary ->> 'order_id', batch_log.timestamp DESC, batch_log.log_id DESC;

CREATE INDEX ON dashboard_log_batch_orders (shopify_order_id);
CREATE INDEX ON dashboard_log_batch_orders (dimona_order_id);

UPDATE logs AS entry
SET customer_name = batch.customer_name
FROM dashboard_log_batch_orders AS batch
WHERE entry.customer_name IS NULL
    AND batch.customer_name IS NOT NULL
    AND entry.shopify_order_id = batch.shopify_order_id;

UPDATE logs AS entry
SET customer_name = batch.customer_name
FROM dashboard_log_batch_orders AS batch
WHERE entry.customer_name IS NULL
    AND batch.customer_name IS NOT NULL
    AND entry.dimona_order_id = batch.dimona_order_id;

CREATE INDEX IF NOT EXISTS logs_timestamp_log_id_idx ON logs (timestamp DESC, log_id DESC);
CREATE INDEX IF NOT EXISTS logs_customer_name_prefix_idx ON logs (LOWER(customer_name) text_pattern_ops) WHERE customer_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS logs_customer_name_search_idx ON logs USING GIN (LOWER(customer_name) gin_trgm_ops) WHERE customer_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS logs_shopify_order_id_prefix_idx ON logs (shopify_order_id text_pattern_ops) WHERE shopify_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS logs_shopify_order_name_prefix_idx ON logs (shopify_order_name text_pattern_ops) WHERE shopify_order_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS logs_dimona_order_id_prefix_idx ON logs (dimona_order_id text_pattern_ops) WHERE dimona_order_id IS NOT NULL;
