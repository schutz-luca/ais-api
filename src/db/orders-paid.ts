import { sql } from "@vercel/postgres";

export async function insertOrderPaid(orderId) {
    try {
        const now = (new Date()).toISOString().split('.')[0];

        await sql`INSERT INTO ordersPaid VALUES (${orderId},${now});`;
    }
    catch (error) {
        console.error('Error on insert orderPaid:', error)
    }
}

export async function listOrderPaid() {
    try {
        const { rows } = await sql`SELECT * FROM ordersPaid`;
        return rows.map(row => row.orderid)
    }
    catch (error) {
        console.error('Error on list ordersPaid:', error)
    }
}