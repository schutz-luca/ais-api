import { sql } from "@vercel/postgres";

export enum LogsKind {
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

export async function insertLog(kind: LogsKind, message: string, body: any) {
    try {
        const now = (new Date()).toISOString().split('.')[0];

        await sql`INSERT INTO logs (timestamp, kind, body, message) VALUES (
            ${now},
            ${kind},
            ${body},
            ${message}
        );`;
    }
    catch (error) {
        console.error('Error on insert log:', error)
    }
}

export async function listLogs() {
    try {
        const { rows } = await sql`SELECT * FROM logs ORDER BY timestamp DESC`;
        console.log(rows);
    }
    catch (error) {
        console.error('Error on list log:', error)
    }
}