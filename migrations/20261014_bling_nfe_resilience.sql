-- Bling JWT access and refresh tokens can exceed the previous column width.
ALTER TABLE blingtokens
    ALTER COLUMN access TYPE TEXT USING access::text,
    ALTER COLUMN refresh TYPE TEXT USING refresh::text;

-- Preserve the existing NF rows and add checkpoints for resumable issuance.
ALTER TABLE nf
    ADD COLUMN IF NOT EXISTS blingid TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT;

-- Old rows keep status NULL. New reservations are unique per Shopify order.
CREATE UNIQUE INDEX IF NOT EXISTS nf_one_active_order_reservation
    ON nf (orderid)
    WHERE status IS NOT NULL;
