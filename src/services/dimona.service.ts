import csv from 'csvtojson';
import { insertOrderPaid, listOrderPaid } from '../db/orders-paid';
import { LogsKind, insertLog } from '../db/logs';
import { DimonaOrderCreation, DimonaSendNFe } from '../dto/dimona.dto';
import { BLACK, PRIME, WHITE, aisProducts } from "../model/products-correlation.model";
import { ShopifyOrder } from '../model/shopify.model';
import { log } from '../utils/log';
import { UNEXECUTED } from '../utils/constants';
import { getStreetAndNumber } from '../utils/getStreetAndNumber';
import { reduceFilesArray } from '../utils/reduceFilesArray';
import { addNFe } from './bling.service';
import { addTracking, getDimonaItems, getPaidOrders } from './shopify.service';

const path = require('path');

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
export async function formatDimonaOrder(shopifyOrder: ShopifyOrder) {
    const items = await getDimonaItems(shopifyOrder)

    // Get address from Shopify order
    const address = shopifyOrder.shipping_address.address1.trim();

    // Get address street and number from Shopify address
    const { number, street } = getStreetAndNumber(address)

    // Create Dimona order object
    return {
        order_id: `${shopifyOrder.id}`,
        customer_name: [shopifyOrder.customer.first_name, shopifyOrder.customer.last_name].join(' '),
        customer_email: shopifyOrder.customer.email,
        customer_document: shopifyOrder.billing_address.company,

        address: {
            city: shopifyOrder.shipping_address.city,
            zipcode: shopifyOrder.shipping_address.zip,
            state: shopifyOrder.shipping_address.province,
            neighborhood: shopifyOrder.shipping_address.company,
            complement: shopifyOrder.shipping_address.address2,
            street,
            number
        },
        items
    } as DimonaOrderCreation
}

/**
 * It creates a order on Dimona API from a Shopify order
 * @param shopifyOrder 
 * @returns The response to Dimona's order creation request
 */
export async function createDimonaOrder(shopifyOrder: ShopifyOrder) {
    try {
        // Preparing logs
        const before = (new Date()).getTime();
        await log(LogsKind.INFO, 'Starting process', {
            order: shopifyOrder.id
        })

        const dimonaOrder = await formatDimonaOrder(shopifyOrder)

        // Send Dimona order creation request
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
        await log(LogsKind.INFO, 'Dimona result', {
            dimonaResult
        });

        // Post order creation
        let nfeStatus = UNEXECUTED;
        let trackingStatus = UNEXECUTED;

        // When Dimona order creation has success
        if (!dimonaResult.error && dimonaResult.order) {
            // Insert its id to Order Paid table
            await insertOrderPaid(shopifyOrder.id);
            const dimonaOrderId = dimonaResult.order;

            // Generate and add NFe to Dimona order
            nfeStatus = await addNFe(shopifyOrder, dimonaOrderId);

            // Add tracking to Shopify order
            trackingStatus = await addTracking(shopifyOrder.id, dimonaOrderId);
        }
        const duration = (((new Date()).getTime()) - before) / 1000;

        return { ...summary, nfeStatus, trackingStatus, duration }
    }
    catch (error) {
        console.error(error);
        await insertLog(LogsKind.INFO, 'Error on createDimonaOrder', { ...error, message: error?.message });
    }
}

export async function createOrdersFromShopify() {
    try {
        // Get paid orders from Shopify
        const orders = await getPaidOrders();

        // Get already processed orders
        const existingOrders = await listOrderPaid();

        const summaries = [];

        for (let i = 0; i < orders.length; i++) {
            // If the order has been already processed, just ignore
            if (!existingOrders?.includes(`${orders[i].id}`)) {
                // Create Dimona order and get summary
                const item = await createDimonaOrder(orders[i]);

                if (item) summaries.push(item);
            }
        }

        await log(LogsKind.INFO, 'Process completed', { summaries })
        return summaries
    }
    catch (error) {
        await log(LogsKind.ERROR, 'Error on process', error)
        return [error];
    }

}
