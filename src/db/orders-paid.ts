import { sql } from "@vercel/postgres";

export async function insertOrderPaid(orderId) {
    try {
        await sql`INSERT INTO ordersPaid VALUES (${orderId});`;
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