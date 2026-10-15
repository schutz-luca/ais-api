import { app } from "@azure/functions";
import { createOrdersFromShopify } from "../services/dimona.service";
import { refreshBlingToken } from "../services/bling.service";

export async function timerTrigger(): Promise<void> {
    await refreshBlingToken();
    await createOrdersFromShopify('timer');
}

app.timer('timerTrigger', {
    schedule: '0 0 */1 * * *',
    handler: timerTrigger
});
