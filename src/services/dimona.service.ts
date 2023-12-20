import csv from 'csvtojson';
import { aisProducts } from "../model/products-correlation.model";
import { LogsKind } from '../db/logs';
import { DimonaOrderCreation } from '../model/dimona.model';
import { ShopifyOrder } from '../model/shopify.model';
import { log } from '../utils/log';
import { reduceFilesArray } from '../utils/reduceFilesArray';
import { insertOrderPaid, listOrderPaid } from '../db/orders-paid';
import { getDimonaItems, getPaidOrders } from './shopify.service';

const path = require('path');

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
    const genderChar = gender.toLowerCase().charAt(0);

    // Use shopify variants data to get current AIS product
    const product = aisProducts.find(product => product.gender === genderChar && product.model === modelInitials);

    // The shopify variant has no AIS product correlated
    if (!product)
        return null

    let dimonaSkuId = '';

    // Read CSV file to get current Dimona product
    const CSV_PATH = path.join(process.cwd(), '/src/assets/dimona-products.csv');

    (await csv().fromFile(CSV_PATH)).forEach(row => {
        const item = (Object.values(row)[0] as string).split(';');

        if (
            item[1] === product.product &&
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
    const address = shopifyOrder.shipping_address.address1;

    // Get address street and number from Shopify address
    const street = address.split(',')[0]?.trim();
    const number = address.split(',')[1]?.trim();

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
            neighborhood: shopifyOrder.shipping_address.address2,
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
    // Preparing logs
    const before = (new Date()).getTime();
    await log(LogsKind.INFO, 'Starting process...', {
        order: shopifyOrder.id
    })

    const dimonaOrder = await formatDimonaOrder(shopifyOrder)

    // Send Dimona order creation request
    const dimonaResult = await fetch(`${process.env.DIMONA_API_BASE}/order`, {
        method: 'POST',
        headers: {
            'api-key': process.env.DIMONA_API_KEY || '',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(dimonaOrder)
    })
    const response: any = await dimonaResult.json();

    const duration = (((new Date()).getTime()) - before) / 1000;

    // Create summary log
    const summary = {
        order: dimonaOrder.order_id,
        custumer: dimonaOrder.customer_name,
        items: dimonaOrder.items.map(item => ({
            ...item,
            mocks: item.mocks.reduce(reduceFilesArray),
            designs: item.designs.reduce(reduceFilesArray),
        })),
        dimonaResponse: {
            status: dimonaResult.status,
            text: dimonaResult.statusText,
            ...response
        },
        duration
    }
    await log(LogsKind.INFO, `Dimona Order Created`, summary);

    return summary
}

export async function createOrdersFromShopify() {
    // Get paid orders from Shopify
    const orders = await getPaidOrders();

    // Get already processed orders
    const existingOrders = await listOrderPaid();

    const promises = orders.map(async (order) => {
        // If the order has been already processed, return
        if (existingOrders?.includes(`${order.id}`))
            return

        // Create Dimona order and get summary
        const summary = await createDimonaOrder(order);

        // If there was a 40* error, don't insert it to orders paid table in db
        if (!`${summary.dimonaResponse.status}`.includes('40'))
            await insertOrderPaid(order.id)

        return summary
    })
    const summaries = (await Promise.all(promises)).filter(item => !!item);

    await log(LogsKind.INFO, 'Create Dimona Orders from Shopify', summaries)
    return summaries
}
