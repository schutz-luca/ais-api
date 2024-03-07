import { app, InvocationContext } from "@azure/functions";
import { createOrdersFromShopify } from "../services/dimona.service";

export async function timerTrigger(_, context: InvocationContext): Promise<void> {
    context.log(`[CRON] Running Timer Trigger...`);
    await createOrdersFromShopify();
}

app.timer('timerTrigger', {
    schedule: '0 0 4-21 * * *',
    handler: timerTrigger
});
