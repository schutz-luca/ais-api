import { sql } from "@vercel/postgres";

export enum LogsKind {
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

function getSearchMetadata(body: unknown) {
    let value = body;
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { return {}; }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    const data = value as Record<string, any>;
    const order = data.order && typeof data.order === 'object' ? data.order as Record<string, any> : undefined;
    const dimonaResult = data.dimonaResult && typeof data.dimonaResult === 'object'
        ? data.dimonaResult as Record<string, any> : undefined;
    const dimonaResponse = data.dimonaResponse && typeof data.dimonaResponse === 'object'
        ? data.dimonaResponse as Record<string, any> : undefined;
    const summaries = Array.isArray(data.summaries) ? data.summaries : [];
    const firstSummary = summaries.find((summary: unknown) => summary && typeof summary === 'object') as Record<string, any> | undefined;
    const summaryDimonaResponse = firstSummary?.dimonaResponse && typeof firstSummary.dimonaResponse === 'object'
        ? firstSummary.dimonaResponse as Record<string, any> : undefined;
    const customerName = data.customerName || data.customer_name || order?.customer_name
        || order?.shipping_address?.name || firstSummary?.customer_name;
    const rawShopifyOrderId = data.shopifyOrderId || data.shopify_order_id || data.order_id
        || order?.id || (typeof data.order === 'number' || (typeof data.order === 'string' && /^\d+$/.test(data.order)) ? data.order : undefined)
        || firstSummary?.order_id;
    const rawDimonaOrderId = data.dimonaOrderId || data.dimona_order_id || dimonaResult?.order
        || dimonaResponse?.order || summaryDimonaResponse?.order;
    const shopifyOrderName = data.shopifyOrderName || data.shopify_order_name || order?.name
        || firstSummary?.name;

    return {
        customerName: typeof customerName === 'string' && customerName.trim() ? customerName.trim() : null,
        shopifyOrderId: rawShopifyOrderId !== undefined && rawShopifyOrderId !== null ? String(rawShopifyOrderId) : null,
        shopifyOrderName: typeof shopifyOrderName === 'string' && shopifyOrderName.trim() ? shopifyOrderName.trim() : null,
        dimonaOrderId: rawDimonaOrderId !== undefined && rawDimonaOrderId !== null ? String(rawDimonaOrderId) : null,
    };
}

export async function insertLog(kind: LogsKind, message: string, body: any) {
    try {
        const now = (new Date()).toISOString().split('.')[0];
        const metadata = getSearchMetadata(body);

        await sql`INSERT INTO logs (timestamp, kind, body, message, customer_name, shopify_order_id, shopify_order_name, dimona_order_id) VALUES (
            ${now},
            ${kind},
            ${body},
            ${message},
            ${metadata.customerName},
            ${metadata.shopifyOrderId},
            ${metadata.shopifyOrderName},
            ${metadata.dimonaOrderId}
        );`;

    }
    catch (error) {
        console.error('Error on insert log:', error)
    }
}

export interface LogsPageOptions {
    search?: string;
    cursor?: string;
}

export interface LogsPage {
    logs: Array<Record<string, unknown>>;
    nextCursor?: string;
    hasMore: boolean;
}

const LOGS_PAGE_SIZE = 25;

type LogCursor = { timestamp: string; id: string };

function decodeCursor(value?: string): LogCursor | undefined {
    if (!value) return undefined;
    try {
        const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<LogCursor>;
        if (typeof parsed.timestamp !== 'string' || typeof parsed.id !== 'string' || !/^\d+$/.test(parsed.id))
            throw new Error('Invalid log cursor');
        return { timestamp: parsed.timestamp, id: parsed.id };
    } catch {
        throw new Error('Cursor de paginação inválido.');
    }
}

function encodeCursor(row: Record<string, unknown>): string {
    const cursor: LogCursor = {
        timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
        id: String(row.log_id),
    };
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function escapeLikePrefix(value: string): string {
    return value.replace(/[\\%_]/g, '').trim();
}

export async function listLogs(options: LogsPageOptions = {}): Promise<LogsPage> {
    try {
        const search = escapeLikePrefix(options.search || '');
        const cursor = decodeCursor(options.cursor);
        const limit = LOGS_PAGE_SIZE + 1;
        let rows;

        if (search && cursor) {
            const normalizedName = search.toLocaleLowerCase('pt-BR');
            const namePrefix = normalizedName.length >= 3 ? `%${normalizedName}%` : `${normalizedName}%`;
            const codePrefix = `${search}%`;
            rows = (await sql`SELECT log_id, timestamp, kind, message, body, customer_name AS "customerName",
                    shopify_order_id AS "shopifyOrderId", shopify_order_name AS "shopifyOrderName",
                    dimona_order_id AS "dimonaOrderId"
                FROM logs
                WHERE (LOWER(customer_name) LIKE ${namePrefix}
                    OR shopify_order_id LIKE ${codePrefix}
                    OR shopify_order_name LIKE ${codePrefix}
                    OR dimona_order_id LIKE ${codePrefix})
                    AND (timestamp < ${cursor.timestamp}
                        OR (timestamp = ${cursor.timestamp} AND log_id < ${cursor.id}::bigint))
                ORDER BY timestamp DESC, log_id DESC LIMIT ${limit}`).rows;
        } else if (search) {
            const normalizedName = search.toLocaleLowerCase('pt-BR');
            const namePrefix = normalizedName.length >= 3 ? `%${normalizedName}%` : `${normalizedName}%`;
            const codePrefix = `${search}%`;
            rows = (await sql`SELECT log_id, timestamp, kind, message, body, customer_name AS "customerName",
                    shopify_order_id AS "shopifyOrderId", shopify_order_name AS "shopifyOrderName",
                    dimona_order_id AS "dimonaOrderId"
                FROM logs
                WHERE LOWER(customer_name) LIKE ${namePrefix}
                    OR shopify_order_id LIKE ${codePrefix}
                    OR shopify_order_name LIKE ${codePrefix}
                    OR dimona_order_id LIKE ${codePrefix}
                ORDER BY timestamp DESC, log_id DESC LIMIT ${limit}`).rows;
        } else if (cursor) {
            rows = (await sql`SELECT log_id, timestamp, kind, message, body, customer_name AS "customerName",
                    shopify_order_id AS "shopifyOrderId", shopify_order_name AS "shopifyOrderName",
                    dimona_order_id AS "dimonaOrderId"
                FROM logs
                WHERE timestamp < ${cursor.timestamp}
                    OR (timestamp = ${cursor.timestamp} AND log_id < ${cursor.id}::bigint)
                ORDER BY timestamp DESC, log_id DESC LIMIT ${limit}`).rows;
        } else {
            rows = (await sql`SELECT log_id, timestamp, kind, message, body, customer_name AS "customerName",
                    shopify_order_id AS "shopifyOrderId", shopify_order_name AS "shopifyOrderName",
                    dimona_order_id AS "dimonaOrderId"
                FROM logs
                ORDER BY timestamp DESC, log_id DESC LIMIT ${limit}`).rows;
        }

        const hasMore = rows.length > LOGS_PAGE_SIZE;
        const pageRows = rows.slice(0, LOGS_PAGE_SIZE);
        const nextCursor = hasMore ? encodeCursor(pageRows[pageRows.length - 1]) : undefined;
        return {
            logs: pageRows.map(({ log_id: _logId, ...row }) => row),
            ...(nextCursor ? { nextCursor } : {}),
            hasMore,
        };
    }
    catch (error) {
        console.error('Error on list log:', error)
        throw error;
    }
}
