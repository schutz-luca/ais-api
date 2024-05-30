import { sql } from "@vercel/postgres";

export async function updateTokens(access: string, refresh: string) {
    try {
        const { rows } = await sql`UPDATE blingtokens SET access = ${access}, refresh = ${refresh} WHERE id = 0`;
        return rows[0]
    }
    catch (error) {
        console.error('Error on updateTokens:', error)
    }
}

type Tokens = { access: string, refresh: string }

export async function getTokens(): Promise<Tokens> {
    try {
        const { rows } = await sql`select * from blingtokens`;
        return rows[0] as Tokens
    }
    catch (error) {
        console.error('Error on getTokens:', error)
    }
}