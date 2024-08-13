import Shopify from 'shopify-api-node';
import { LogsKind } from '../db/logs';
import { DimonaOrderItem } from '../dto/dimona.dto';
import { ShopifyOrder } from "../model/shopify.model";
import { getFrontMockupQuery } from '../utils/graphqlQueries';
import { normalizePt } from '../utils/normalizePt';
import { log } from '../utils/log';
import { getDesignInDrive } from './drive.service';
import { correlateProduct } from './dimona.service';

function getShopifyClient() {
    return new Shopify({
        shopName: process.env.SHOPIFY_SHOPNAME || '',
        accessToken: process.env.SHOPIFY_ACCESS_TOKEN || ''
    });
}

export async function addTracking(orderId: number, dimonaOrderId: string): Promise<string> {
    try {
        const shopifyClient = getShopifyClient();

        // Create tracking data
        let trackingUrl = process.env.TRACKING_URL_BASE || '';
        const trackingNumber = dimonaOrderId.split('-').join('');
        trackingUrl = `${trackingUrl}/${trackingNumber}`;

        // Get fulfillment order data
        const fulfillmentOrderId = (await shopifyClient.order.fulfillmentOrders(orderId))[0].id;
        const fullfilment = await shopifyClient.fulfillmentOrder.fulfillments(fulfillmentOrderId);

        const updateParams = {
            tracking_info: {
                number: trackingNumber,
                url: trackingUrl,
                company: 'Outro'
            },
            notify_customer: true,
            message: 'Delivery status: ' + trackingUrl
        };

        const result = await shopifyClient.fulfillment.updateTracking(fullfilment[0].id, updateParams);

        return result?.tracking_url ? result?.tracking_url : result?.status || 'Not tracked';
    }
    catch (error) {
        console.error(error);
        return error;
    }

}

export async function getCustomerCpf(graphqlId: string): Promise<string | undefined> {
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

    return result.order.localizationExtensions.edges[0]?.node.value;
}

export async function findShopifyOrder(orderId: number) {
    const shopifyClient = getShopifyClient();
    const order = await shopifyClient.order.get(orderId) as unknown as ShopifyOrder;
    return order;
}

export async function getShopifyOrder(req, res) {
    const id = req.query.id;

    const order = await findShopifyOrder(id);

    res.json(order);
}

async function getFrontMock(shopifyClient: Shopify, productId: number, gender: string, color: string) {
    const query = getFrontMockupQuery(productId);
    const graphQl = await shopifyClient.graphql(query);

    // Filter product images by altText to find the back mockup
    const alt = normalizePt(`${gender === 'p' ? 'm' : gender}-${color.replace(/\s+/g, '-')}-front`.toLowerCase());

    const images: { altText: string, url: string }[] = graphQl.product.media.edges.map(item => item.node.preview.image);

    const frontMock = images.filter(item => item.altText.includes(alt));

    if (frontMock.length > 0)
        return frontMock[0]

    return null
}

async function getShopifyMock(shopifyClient: Shopify, productId: number, imageId: number | null, gender: string, color: string, hasBack: boolean) {
    try {
        if (!hasBack) {
            const mockFront = await shopifyClient.productImage.get(productId, imageId || 0, { fields: 'src' });
            return [mockFront.src]
        }
        else {
            const mockFront = await getFrontMock(shopifyClient, productId, gender, color);
            const mockBack = await shopifyClient.productImage.get(productId, imageId || 0, { fields: 'src' });

            return [mockFront?.url, mockBack.src]
        }
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
        const genderChar = variant.option1?.toLowerCase().charAt(0);

        const designs = await getDesignInDrive(product.sku);

        const hasBack = designs.length > 1;
        const mocks = await getShopifyMock(shopifyClient, product.product_id, variant.image_id, genderChar, variant.option2, hasBack);

        // Get Dimona product using variants data
        const dimonaSkuId = await correlateProduct(genderChar, variant.sku, variant.option3, variant.option2)

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