import { LogsKind, insertLog } from "../db/logs";

export async function log(kind: LogsKind, message: string, body: any) {
    if (kind === LogsKind.INFO)
        console.log(message, body)
    else if (kind === LogsKind.WARN)
        console.warn(message, body)
    else if (kind === LogsKind.ERROR)
        console.error(message, body)

    if (!!process.env.SAVE_LOGS)
        await insertLog(kind, message, body)
}