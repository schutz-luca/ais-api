import Shopify from 'shopify-api-node';
import { ShopifyOrder } from "../model/shopify.model";
import { getFilesIdByItem } from './drive.service';
import { correlateProduct } from './dimona.service';
import { DimonaOrderItem } from '../model/dimona.model';

function getShopifyClient() {
    return new Shopify({
        shopName: process.env.SHOPIFY_SHOPNAME || '',
        accessToken: process.env.SHOPIFY_ACCESS_TOKEN || ''
    });
}

/**
 * Get formatted Dimona items from a Shopify order
 * @param shopifyOrder 
 * @returns Promise<DimonaOrderItem[]>
 */
export async function getDimonaItems(shopifyOrder: ShopifyOrder) {
    return await Promise.all(shopifyOrder.line_items.map(async (product) => {
        const shopifyClient = getShopifyClient();
        const variant = await shopifyClient.productVariant.get(product.variant_id);

        // Get mock and design files using product SKU and variant COLOR
        const filesLinks = await getFilesIdByItem(product.sku, variant?.option2);

        // Get Dimona product using variants data
        const dimonaSkuId = await correlateProduct(variant.option1, variant.sku, variant.option3, variant.option2)

        return {
            sku: variant.sku,
            dimona_sku_id: dimonaSkuId,
            name: product.name,
            qty: product.fulfillable_quantity,
            ...filesLinks
        } as DimonaOrderItem
    }))
}