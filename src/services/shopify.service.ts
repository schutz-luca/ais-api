import Shopify from 'shopify-api-node';
import { ShopifyOrder } from "../model/shopify.model";
import { getDesignInDrive } from './drive.service';
import { correlateProduct } from './dimona.service';
import { DimonaOrderItem } from '../dto/dimona.dto';
import { log } from '../utils/log';
import { LogsKind } from '../db/logs';

function getShopifyClient() {
    return new Shopify({
        shopName: process.env.SHOPIFY_SHOPNAME || '',
        accessToken: process.env.SHOPIFY_ACCESS_TOKEN || ''
    });
}

export async function getCustomerCpf(graphqlId: string) {
    const shopifyClient = getShopifyClient();

    const result = await shopifyClient.graphql(`
    {
        order(id: "${graphqlId}") {
          id
          localizationExtensions(first: 5) {
            edges {
              node {
                countryCode
                purpose
                title
                value
              }
            }
          }
        }
      }`);

    return result.order.localizationExtensions.edges[0].node.value as string;
}

export async function getShopifyOrder(req, res) {
    const shopifyClient = getShopifyClient();
    const id = req.query.id;

    const order = await shopifyClient.order.get(id) as unknown as ShopifyOrder;

    res.json(order);
}

async function getShopifyMock(shopifyClient: Shopify, productId: number, imageId: number | null) {
    try {
        const mockImage = await shopifyClient.productImage.get(productId, imageId || 0, { fields: 'src' })
        return [mockImage.src];
    }
    catch (error) {
        log(LogsKind.ERROR, 'Error on handleShopifyMock: ', error)
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

    const dimonaItems = await Promise.all(items.map(async (product) => {
        if (!product.variant_id)
            return

        const variant = await shopifyClient.productVariant.get(product.variant_id, { fields: 'image_id,option1,sku,option3,option2' });

        const designs = await getDesignInDrive(product.sku);
        const mocks = await getShopifyMock(shopifyClient, product.product_id, variant.image_id);

        // Get Dimona product using variants data
        const dimonaSkuId = await correlateProduct(variant.option1, variant.sku, variant.option3, variant.option2)

        const item = {
            sku: variant.sku,
            dimona_sku_id: dimonaSkuId,
            name: product.name,
            qty: product.quantity,
            designs,
            mocks
        }

        return item as DimonaOrderItem
    }))
    return dimonaItems.filter(item => item !== undefined)
}

export async function getPaidOrders() {
    const shopifyClient = getShopifyClient();

    return (await shopifyClient.order.list({ financial_status: 'paid' })) as unknown as ShopifyOrder[]
}