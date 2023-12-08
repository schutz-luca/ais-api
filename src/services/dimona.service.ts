import csv from 'csvtojson';
import { aisProducts } from "../model/products-correlation.model";
import { LogsKind } from '../db/logs';
import { DimonaOrderCreation } from '../model/dimona.model';
import { ShopifyOrder } from '../model/shopify.model';
import { log } from '../utils/log';
import { getDimonaItems } from './shopify.service';

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
            neightborhood: shopifyOrder.shipping_address.address2,
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
    const dimonaOrder = await formatDimonaOrder(shopifyOrder)

    log(LogsKind.INFO, '💙 Sending Dimona Order...', dimonaOrder);

    const dimonaResult = await fetch(`${process.env.DIMONA_API_BASE}/order`, {
        method: 'POST',
        headers: {
            'api-key': process.env.DIMONA_API_KEY || '',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(dimonaOrder)
    })
    const response = await dimonaResult.json();

    log(LogsKind.INFO, `💙 Dimona Order creation response: [${dimonaResult.status}] ${dimonaResult.statusText}\n`, response);

    return response
}




