import { sql } from '@vercel/postgres';

export type Tokens = { access: string; refresh: string };

export async function updateTokens(access: string, refresh: string): Promise<void> {
    if (access.length > 3000 || refresh.length > 3000)
        throw new Error('Bling OAuth token exceeds the supported 3,000 character limit');

    const { rowCount } = await sql`UPDATE blingtokens SET access = ${access}, refresh = ${refresh} WHERE id = 0`;
    if (rowCount !== 1) throw new Error(`Expected to update one Bling token row, updated ${rowCount}`);
}

export async function getTokens(): Promise<Tokens> {
    const { rows } = await sql`SELECT access, refresh FROM blingtokens WHERE id = 0`;
    const tokens = rows[0] as Tokens | undefined;
    if (!tokens?.access || !tokens?.refresh) throw new Error('Bling OAuth tokens are missing from storage');
    return tokens;
}
