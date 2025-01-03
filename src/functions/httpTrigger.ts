import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createDimonaOrder, createOrdersFromShopify } from '../services/dimona.service';
import { ShopifyOrder } from '../model/shopify.model';
import { findShopifyOrder } from '../services/shopify.service';
import { addNFe } from '../services/bling.service';

export async function handlerCreateAll(_, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        const prefix = '[CREATE-ALL]';
        context.log(`${prefix} Starting creating all unprocessed orders from Shopify`);
        const summaries = await createOrdersFromShopify();
        context.log(`${prefix} Runned and created ${summaries?.length} orders`, summaries);
        return { jsonBody: { summaries } };
    }
    catch (error) {
        context.error('Error on create all:', error)
        return { jsonBody: { error } }
    }
}

export async function handlerOrderPaid(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const prefix = '[ORDER-PAID]';
    const shopifyOrder = (await request.json()) as ShopifyOrder;
    context.log(`${prefix} Starting process order ${shopifyOrder.id}`);
    const dimonaResult = await createDimonaOrder(shopifyOrder);
    context.log(`${prefix} Order processed`, dimonaResult);
    return { jsonBody: dimonaResult };
}

app.post('add-nfe', {
    authLevel: 'anonymous',
    handler: async (request: HttpRequest) => {
        const body: any = await request.json();
        const orderId = body.orderId as number;
        const dimonaOrderId = body.dimonaOrderId as string;

        const order = await findShopifyOrder(orderId);
        const nfeStatus = await addNFe(order, dimonaOrderId)

        return { jsonBody: { nfeStatus } }
    },
});

app.get('create-dimona-orders', {
    authLevel: 'anonymous',
    handler: handlerCreateAll,
});

app.post('order-paid', {
    authLevel: 'anonymous',
    handler: handlerOrderPaid
})