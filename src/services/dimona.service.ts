import csv from 'csvtojson';
import { insertOrderPaid, listOrderPaid } from '../db/orders-paid';
import { LogsKind } from '../db/logs';
import { DimonaOrderCreation, DimonaSendNFe } from '../dto/dimona.dto';
import { BLACK, PRIME, WHITE, aisProducts } from "../model/products-correlation.model";
import { ShopifyOrder } from '../model/shopify.model';
import { log } from '../utils/log';
import { UNEXECUTED } from '../utils/constants';
import { reduceFilesArray } from '../utils/reduceFilesArray';
import { getCustomerDocument } from '../utils/customerDocument';
import { mapShopifyShippingAddress } from '../utils/shopifyAddress';
import { addNFe } from './bling.service';
import { addTracking, getDimonaItems, getPaidOrders } from './shopify.service';

const path = require('path');

type NfeLogStatus = 'authorized' | 'rejected' | 'pending' | 'failed' | 'not_attempted' | 'unknown';
type TrackingLogStatus = 'updated' | 'failed' | 'not_confirmed' | 'not_attempted';

function getCustomerNameForLog(order: ShopifyOrder): string | undefined {
    const recipientName = String(order.shipping_address?.name || '').trim();
    const customerName = [order.customer?.first_name, order.customer?.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();
    return recipientName || customerName || undefined;
}

function getNfeLogStatus(status: string): NfeLogStatus {
    const summary = String(status || '').split(' /// ')[0].toLowerCase();
    if (status === UNEXECUTED) return 'not_attempted';
    if (summary.includes('autorizada')) return 'authorized';
    if (summary.includes('rejeitada')) return 'rejected';
    if (summary.includes('aguarda autorização') || summary.includes('ainda não foi reconciliada')) return 'pending';
    if (summary.includes('bloqueada') || summary.includes('sem id bling') || summary.includes('legado')) return 'failed';
    if (summary.includes('error') || summary.includes('erro') || status.includes('success: false')) return 'failed';
    return 'unknown';
}

function getTrackingLogStatus(status: string): TrackingLogStatus {
    if (!status || status === UNEXECUTED) return 'not_attempted';
    if (/^https?:\/\//i.test(status)) return 'updated';
    if (/^(success|fulfilled|complete|completed)$/i.test(status.trim())) return 'updated';
    if (/error|failed|not found|not tracked|invalid|unauthorized/i.test(status)) return 'failed';
    return 'not_confirmed';
}

function getOrderFailureCode(error: any): string {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('customer_document')) return 'customer_document_invalid';
    if (message.includes('endereço') || message.includes('telefone') || message.includes('uf inválida')) return 'shopify_address_invalid';
    if (message.includes('design')) return 'product_design_unavailable';
    return 'order_processing_failed';
}

async function logOrderResult(input: {
    shopifyOrderId: string;
    shopifyOrderName?: string;
    customerName?: string;
    dimonaOrderId?: string;
    dimonaStatus: 'created' | 'rejected' | 'unconfirmed';
    nfeStatus: NfeLogStatus;
    trackingStatus: TrackingLogStatus;
    durationSeconds: number;
}) {
    const { shopifyOrderId, shopifyOrderName, customerName, dimonaOrderId, dimonaStatus, nfeStatus, trackingStatus, durationSeconds } = input;
    const dimonaText = dimonaStatus === 'created'
        ? 'pedido criado na Dimona'
        : dimonaStatus === 'rejected' ? 'a Dimona recusou o pedido' : 'a Dimona não confirmou a criação';
    const nfeText: Record<NfeLogStatus, string> = {
        authorized: 'autorizada', rejected: 'rejeitada', pending: 'aguardando autorização',
        failed: 'com falha', not_attempted: 'não iniciada', unknown: 'sem confirmação',
    };
    const trackingText: Record<TrackingLogStatus, string> = {
        updated: 'atualizado', failed: 'com falha', not_confirmed: 'sem confirmação', not_attempted: 'não iniciado',
    };
    const complete = dimonaStatus === 'created' && nfeStatus === 'authorized' && trackingStatus === 'updated';
    const kind = complete ? LogsKind.INFO : dimonaStatus !== 'created' ? LogsKind.ERROR : LogsKind.WARN;

    await log(kind, `Pedido Shopify #${shopifyOrderId}: ${dimonaText}; NF-e ${nfeText[nfeStatus]}; rastreamento ${trackingText[trackingStatus]}.`, {
        event: 'shopify_order_processing',
        shopifyOrderId,
        ...(shopifyOrderName ? { shopifyOrderName } : {}),
        ...(customerName ? { customerName } : {}),
        ...(dimonaOrderId ? { dimonaOrderId } : {}),
        dimonaStatus,
        nfeStatus,
        trackingStatus,
        durationSeconds,
    });
}

export const dimonaApi = {
    createOrder: async (dimonaOrder: DimonaOrderCreation) => {
        return (await fetch(`${process.env.DIMONA_API_BASE}/order`, {
            method: 'POST',
            headers: {
                'api-key': process.env.DIMONA_API_KEY || '',
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dimonaOrder)
        })).json()
    },
    sendNFe: async (nfe: DimonaSendNFe, orderId: string) => {
        return (await fetch(`${process.env.DIMONA_API_BASE}/order/${orderId}/nfe`, {
            method: 'POST',
            headers: {
                'api-key': process.env.DIMONA_API_KEY || '',
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(nfe)
        })).json()
    }
}

/**
 * Correlates a Shopify product with its current Dimona product
 * @param gender 
 * @param sku 
 * @param size 
 * @param color 
 * @returns dimonaSkuId
 */
export async function correlateProduct(gender: string | null, sku: string | null, size: string | null, color: string | null) {
    if (!gender || !sku || !size || !color)
        return

    // Normalize strings to lower case and get initials
    const modelInitials = sku.toLowerCase().split('-')[0];

    // Use shopify variants data to get current AIS product
    const product = aisProducts.find(product => product.gender === gender && product.model === modelInitials);

    // Use PRIME product when color is black or white
    let dimonaProduct;

    // If product is black or white and it's not Pluse Size, makes it Prime
    if (product && (color === BLACK || color === WHITE) && product.gender !== 'p')
        dimonaProduct = PRIME;
    else
        dimonaProduct = product?.product

    // The shopify variant has no AIS product correlated
    if (!product)
        return null

    let dimonaSkuId = '';

    // Read CSV file to get current Dimona product
    const CSV_PATH = path.join(process.cwd(), '/src/assets/dimona-products.csv');

    (await csv().fromFile(CSV_PATH)).forEach(row => {
        const item = (Object.values(row)[0] as string).split(';');

        if (
            item[1] === dimonaProduct &&
            item[2] === product.style &&
            item[3] === color &&
            item[4] === size
        )
            dimonaSkuId = item[0]
    });

    return dimonaSkuId
}
/**
 * Get formatted Dimona order from Shopify order
 * @param shopifyOrder 
 * @returns formatted Dimona order
 */
export function formatDimonaPayload(shopifyOrder: ShopifyOrder, items: DimonaOrderCreation['items']): DimonaOrderCreation {
    const customerDocument = getCustomerDocument(shopifyOrder);
    const address = mapShopifyShippingAddress(shopifyOrder);

    // Create Dimona order object
    return {
        order_id: `${shopifyOrder.id}`,
        customer_name: address.name,
        customer_email: shopifyOrder.customer.email,
        customer_document: customerDocument,

        address: {
            city: address.city,
            zipcode: address.zipcode,
            state: address.state,
            neighborhood: address.neighborhood,
            complement: address.complement,
            street: address.street,
            number: address.number,
            name: address.name,
            phone: address.phone!,
            country: address.country,
        },
        items
    }
}

export async function formatDimonaOrder(shopifyOrder: ShopifyOrder) {
    // Validate customer and recipient fields before fetching/creating provider items.
    getCustomerDocument(shopifyOrder);
    mapShopifyShippingAddress(shopifyOrder);
    const items = await getDimonaItems(shopifyOrder);
    return formatDimonaPayload(shopifyOrder, items);
}

/**
 * It creates a order on Dimona API from a Shopify order
 * @param shopifyOrder 
 * @returns The response to Dimona's order creation request
 */
export async function createDimonaOrder(shopifyOrder: ShopifyOrder) {
    const startedAt = Date.now();
    const shopifyOrderId = String(shopifyOrder.id);
    const customerName = getCustomerNameForLog(shopifyOrder);
    let stage = 'prepare_order';
    try {
        const dimonaOrder = await formatDimonaOrder(shopifyOrder)

        // Send Dimona order creation request
        stage = 'create_dimona_order';
        const dimonaResult: any = await dimonaApi.createOrder(dimonaOrder);


        // Create summary log
        const summary = {
            ...dimonaOrder,
            items: dimonaOrder.items.map(item => ({
                ...item,
                mocks: item.mocks?.reduce(reduceFilesArray),
                designs: item.designs?.reduce(reduceFilesArray),
            })),
            dimonaResponse: dimonaResult
        }
        // Post order creation
        let nfeStatus = UNEXECUTED;
        let trackingStatus = UNEXECUTED;
        let dimonaOrderId: string | undefined;

        // When Dimona order creation has success
        if (!dimonaResult.error && dimonaResult.order) {
            // Insert its id to Order Paid table
            await insertOrderPaid(shopifyOrder.id);
            dimonaOrderId = String(dimonaResult.order);

            // Generate and add NFe to Dimona order
            stage = 'generate_nfe';
            nfeStatus = await addNFe(shopifyOrder, dimonaOrderId);

            // Add tracking to Shopify order
            stage = 'update_tracking';
            trackingStatus = await addTracking(shopifyOrder.id, dimonaOrderId);
        }
        const duration = (Date.now() - startedAt) / 1000;
        const dimonaStatus = dimonaOrderId
            ? 'created'
            : dimonaResult.error ? 'rejected' : 'unconfirmed';

        await logOrderResult({
            shopifyOrderId,
            shopifyOrderName: shopifyOrder.name,
            customerName,
            dimonaOrderId,
            dimonaStatus,
            nfeStatus: getNfeLogStatus(nfeStatus),
            trackingStatus: getTrackingLogStatus(trackingStatus),
            durationSeconds: Math.round(duration * 100) / 100,
        });

        return { ...summary, nfeStatus, trackingStatus, duration }
    }
    catch (error) {
        const durationSeconds = Math.round(((Date.now() - startedAt) / 1000) * 100) / 100;
        await log(LogsKind.ERROR, `Pedido Shopify #${shopifyOrderId} não foi processado.`, {
            event: 'shopify_order_processing',
            shopifyOrderId,
            shopifyOrderName: shopifyOrder.name,
            ...(customerName ? { customerName } : {}),
            outcome: 'failed',
            stage,
            failureCode: getOrderFailureCode(error),
            durationSeconds,
        });
    }
}

export async function createOrdersFromShopify(source: 'manual' | 'timer' = 'manual') {
    try {
        // Get paid orders from Shopify
        const orders = await getPaidOrders();

        // Get already processed orders
        const existingOrders = await listOrderPaid();
        const pendingOrders = orders.filter(order => !existingOrders?.includes(`${order.id}`));
        const summaries = [];
        let dimonaCreated = 0;
        let dimonaFailed = 0;
        let completed = 0;
        let needsAttention = 0;
        const nfeTotals: Record<NfeLogStatus, number> = {
            authorized: 0, rejected: 0, pending: 0, failed: 0, not_attempted: 0, unknown: 0,
        };
        const trackingTotals: Record<TrackingLogStatus, number> = {
            updated: 0, failed: 0, not_confirmed: 0, not_attempted: 0,
        };

        for (const order of pendingOrders) {
            const item = await createDimonaOrder(order);
            if (item) {
                summaries.push(item);
                const orderCreated = !item.dimonaResponse?.error && Boolean(item.dimonaResponse?.order);
                if (orderCreated) dimonaCreated++;
                else dimonaFailed++;

                const nfeStatus = getNfeLogStatus(item.nfeStatus);
                const trackingStatus = getTrackingLogStatus(item.trackingStatus);
                nfeTotals[nfeStatus]++;
                trackingTotals[trackingStatus]++;
                if (orderCreated && nfeStatus === 'authorized' && trackingStatus === 'updated') completed++;
                else needsAttention++;
            } else {
                dimonaFailed++;
                needsAttention++;
                nfeTotals.not_attempted++;
                trackingTotals.not_attempted++;
            }
        }

        const attempted = pendingOrders.length;
        if (source === 'manual' || attempted > 0) {
            const kind = needsAttention === 0 ? LogsKind.INFO : completed === 0 ? LogsKind.ERROR : LogsKind.WARN;
            const message = attempted === 0
                ? 'Execução manual concluída: nenhum pedido novo encontrado na Shopify.'
                : `Execução concluída: ${completed} pedido(s) sem pendências e ${needsAttention} que precisam de atenção.`;
            await log(kind, message, {
                event: 'shopify_order_batch',
                source,
                paidOrders: orders.length,
                alreadyProcessed: orders.length - attempted,
                attempted,
                completed,
                needsAttention,
                dimonaCreated,
                dimonaFailed,
                nfe: nfeTotals,
                tracking: trackingTotals,
            });
        }
        return summaries
    }
    catch (error) {
        await log(LogsKind.ERROR, 'Não foi possível concluir a busca e o processamento dos pedidos Shopify.', {
            event: 'shopify_order_batch',
            source,
            outcome: 'failed',
            failureCode: 'shopify_batch_failed',
        });
        return [error];
    }

}
