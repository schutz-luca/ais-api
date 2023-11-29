import Shopify from 'shopify-api-node';
import { ShopifyOrder } from "../model/shopify.model";
import { getDesignInDrive } from './drive.service';
import { correlateProduct } from './dimona.service';
import { DimonaOrderItem } from '../model/dimona.model';

function getShopifyClient() {
    return new Shopify({
        shopName: process.env.SHOPIFY_SHOPNAME || '',
        accessToken: process.env.SHOPIFY_ACCESS_TOKEN || ''
    });
}

async function getShopifyMock(shopifyClient: Shopify, productId: number, imageId: number | null) {
    try {
        const mockImage = await shopifyClient.productImage.get(productId, imageId || 0)
        return [mockImage.src];
    }
    catch (error) {
        console.error('Error on handleShopifyMock: ', error)
        return undefined
    }
}

/**
 * Get formatted Dimona items from a Shopify order
 * @param shopifyOrder 
 * @returns Promise<DimonaOrderItem[]>
 */
export async function getDimonaItems(shopifyOrder: ShopifyOrder) {
    const shopifyClient = getShopifyClient();

    // Check if order items exist
    const items = shopifyOrder?.line_items;
    if (!items)
        throw { status: 400, message: 'Bad Request: missing items field' }

    return await Promise.all(items.map(async (product) => {
        const variant = await shopifyClient.productVariant.get(product.variant_id);

        const designs = await getDesignInDrive(product.sku);
        const mocks = await getShopifyMock(shopifyClient, product.product_id, variant.image_id);

        // Get Dimona product using variants data
        const dimonaSkuId = await correlateProduct(variant.option1, variant.sku, variant.option3, variant.option2)

        return {
            sku: variant.sku,
            dimona_sku_id: dimonaSkuId,
            name: product.name,
            qty: product.fulfillable_quantity,
            designs,
            mocks
        } as DimonaOrderItem
    }))
}