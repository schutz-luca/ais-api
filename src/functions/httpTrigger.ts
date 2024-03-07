import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createDimonaOrder, createOrdersFromShopify } from '../services/dimona.service';
import { ShopifyOrder } from '../model/shopify.model';

export async function handlerCreateAll(_, context: InvocationContext): Promise<HttpResponseInit> {
    const prefix = '[CREATE-ALL]';
    context.log(`${prefix} Starting creating all unprocessed orders from Shopify`);
    const summaries = await createOrdersFromShopify();
    context.log(`${prefix} Order processed`);
    return { jsonBody: summaries };
}

export async function handlerOrderPaid(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const prefix = '[ORDER-PAID]';
    const shopifyOrder = (await request.json()) as ShopifyOrder;
    context.log(`${prefix} Starting process order ${shopifyOrder.id}`);
    const dimonaResult = await createDimonaOrder(shopifyOrder);
    context.log(`${prefix} Order processed`);
    return { jsonBody: dimonaResult };
}

app.get('create-dimona-orders', {
    authLevel: 'anonymous',
    handler: handlerCreateAll,
});

app.post('order-paid', {
    authLevel: 'anonymous',
    handler: handlerOrderPaid
})