import { app, InvocationContext } from "@azure/functions";
import { createOrdersFromShopify } from "../services/dimona.service";

export async function timerTrigger(_, context: InvocationContext): Promise<void> {
    const prefix = `[CRON]`;
    context.log(`${prefix} Running Timer Trigger...`);
    const summaries = await createOrdersFromShopify();
    context.log(`${prefix} Runned and created ${summaries.length} orders`, summaries);
}

app.timer('timerTrigger', {
    schedule: '0 0 */1 * * *',
    handler: timerTrigger
});
