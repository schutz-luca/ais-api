import { sql } from "@vercel/postgres";

export async function addNfNumber(orderId: string) {
    try {
        const now = (new Date()).toISOString().split('.')[0];
        const { number } = await getLastNf();

        await sql`INSERT INTO nf VALUES (${now},${number + 1},${orderId});`;
    }
    catch (error) {
        console.error('Error on addNfNumber:', error)
    }
}

export async function getLastNf() {
    try {
        const { rows } = await sql`select * from nf order by "number" desc limit 1`;
        return rows[0]
    }
    catch (error) {
        console.error('Error on getLastNfNumber:', error)
    }
}

export async function checkExists(orderId){
    try {
        const { rows } = await sql`select * from nf where orderid = ${orderId}`;
        return !!rows[0]
    }
    catch (error) {
        console.error('Error on checkExists:', error)
    }
}