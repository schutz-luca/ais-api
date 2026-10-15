import { Request, Response } from "express";
import { ShopifyOrder } from "../model/shopify.model";
import { createDimonaOrder } from "../services/dimona.service";
import { log } from "../utils/log";
import { LogsKind } from "../db/logs";

/**
 * This endpoint will:
 * 1. Receive Shopify order from request
 * 2. Get order items variants details
 * 3. Get item's current files in Google Drive
 * 4. Get Dimona product correlated to the item
 * 5. Format everything into a Dimona order
 * 6. Create the order trought Dimona API v2
 */
export async function orderPaidEndpoint(req: Request, res: Response) {
    try {
        const shopifyOrder: ShopifyOrder = req.body
        const dimonaResult = await createDimonaOrder(shopifyOrder);
        res.json(dimonaResult)
    }
    catch (error: any) {
        await log(LogsKind.ERROR, 'Não foi possível processar o pedido recebido da Shopify.', {
            event: 'shopify_order_processing',
            shopifyOrderId: req.body?.id ? String(req.body.id) : undefined,
            outcome: 'failed',
            stage: 'webhook',
            failureCode: 'order_paid_endpoint_failed',
        });
        res
            .status(error?.status || 500)
            .send(error)
    }
}
