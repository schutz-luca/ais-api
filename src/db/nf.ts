import { sql } from '@vercel/postgres';

export type NfRecord = {
    timestamp: string;
    number: number;
    orderid: string;
    blingid: string | null;
    status: string | null;
};

export async function getLastNf(): Promise<{ number: number }> {
    const { rows } = await sql`SELECT "number" FROM nf ORDER BY "number" DESC LIMIT 1`;
    return { number: Number(rows[0]?.number || 0) };
}

export async function getNfByOrder(orderId: string): Promise<NfRecord | undefined> {
    const { rows } = await sql`SELECT * FROM nf WHERE orderid = ${orderId} ORDER BY (status IS NOT NULL) DESC, timestamp DESC LIMIT 1`;
    return rows[0] as NfRecord | undefined;
}

export async function reserveNfForOrder(orderId: string, number: number): Promise<{ reservation: NfRecord; created: boolean }> {
    const now = new Date().toISOString().split('.')[0];
    const inserted = await sql`INSERT INTO nf (timestamp, "number", orderid, blingid, status)
        VALUES (${now}, ${number}, ${orderId}, NULL, 'creating')
        ON CONFLICT (orderid) WHERE status IS NOT NULL DO NOTHING
        RETURNING timestamp, "number", orderid, blingid, status`;
    if (inserted.rowCount === 1) return { reservation: inserted.rows[0] as NfRecord, created: true };
    const reservation = await getNfByOrder(orderId);
    if (!reservation || reservation.status === null || reservation.status === undefined)
        throw new Error(`Could not reserve NF-e number for Shopify order ${orderId}`);
    return { reservation, created: false };
}

export async function saveNfProgress(orderId: string, number: number, blingId: string, status: string): Promise<void> {
    const { rowCount } = await sql`UPDATE nf SET blingid = ${blingId}, status = ${status}
        WHERE orderid = ${orderId} AND status IS NOT NULL`;
    if (!rowCount) throw new Error(`NF-e reservation for order ${orderId} is missing (number ${number})`);
}

export async function updateNfStatus(orderId: string, status: string): Promise<void> {
    const { rowCount } = await sql`UPDATE nf SET status = ${status} WHERE orderid = ${orderId} AND status IS NOT NULL`;
    if (!rowCount) throw new Error(`NF-e persistence record for order ${orderId} is missing`);
}
