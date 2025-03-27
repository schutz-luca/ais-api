import Shopify from 'shopify-api-node';
import { LogsKind } from '../db/logs';
import { DimonaOrderItem } from '../dto/dimona.dto';
import { ShopifyOrder } from "../model/shopify.model";
import { getFrontMockupQuery } from '../utils/graphqlQueries';
import { normalizePt } from '../utils/normalizePt';
import { log } from '../utils/log';
import { getDesignInDrive, uploadDesigns } from './drive.service';
import { correlateProduct } from './dimona.service';
import { mergeArrays } from '../utils/mergeArrays';
import { colorsMascGhost, createPrintfulMockups } from './printful.service';
import { normalizeCamelCase } from '../utils/normalizeCamelCase';

function getShopifyClient() {
    return new Shopify({
        shopName: process.env.SHOPIFY_SHOPNAME || '',
        accessToken: process.env.SHOPIFY_ACCESS_TOKEN || ''
    });
}

const shopifyApi = async (endpoint: string, body?: any) => {
    const options: any = {
        headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }
    };

    if (body) {
        options.method = 'POST';
        options.body = JSON.stringify(body);
    }

    return await (await fetch(`https://${process.env.SHOPIFY_SHOPNAME}/admin/api/${process.env.SHOPIFY_VERSION}/${endpoint}.json`, options)).json();
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
        return error?.message;
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
        await log(LogsKind.ERROR, 'Error on handleShopifyMock: ', error)
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

        if (designs === undefined)
            throw { message: `Product (${product.sku}) without design` }

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

export async function getCollections() {
    try {
        const shopifyClient = getShopifyClient();
        const customCollections = await shopifyClient.customCollection.list();
        const smartCollections = await shopifyClient.smartCollection.list();
        return [...smartCollections, ...customCollections];
    }
    catch (error) {
        console.error('Error on getCollections:', error);
    }
}

export async function createProduct(product, mockups) {
    try {
        const variantDefault = {
            weight: 0.3,
            weight_unit: "kg",
            taxable: true,
        }

        const variantsPerGender = [
            {
                title: 'Masculino',
                colors: ['Preto', 'Branco', 'Amarelo Canário', 'Laranja', 'Vermelho', 'Rosa Pink', 'Azul Royal', 'Azul Marinho', 'Cinza Mescla'],
                sizes: ['P', 'M', 'G', 'GG', 'XGG']
            },
            {
                title: 'Feminino',
                colors: ['Preto', 'Branco', 'Amarelo Canário', 'Laranja', 'Vermelho', 'Rosa Pink', 'Azul Royal', 'Azul Marinho', 'Cinza Mescla'],
                sizes: ['P', 'M', 'G', 'GG']
            },
            {
                title: 'Plus Size',
                colors: ['Preto', 'Branco'],
                sizes: ['G1', 'G2', 'G3', 'G4']
            }
        ];

        const extraChargeSizes = ['XGG', 'G1', 'G2', 'G3'];
        const extraChargePrice = 15;
        const checkExtraCharge = (size: string, price: string) => {
            const priceNumber = parseFloat(price);
            return `${extraChargeSizes.includes(size) ? priceNumber + extraChargePrice : priceNumber}`
        }

        const options = [
            {
                name: 'Gênero',
                values: variantsPerGender.map(gender => gender.title)
            },
            {
                name: 'Cor',
                values: mergeArrays(variantsPerGender.map(gender => gender.colors))
            },
            {
                name: 'Tamanho',
                values: mergeArrays(variantsPerGender.map(gender => gender.sizes))
            }
        ];

        const variantsImagesPerId = {};
        colorsMascGhost.map(key => variantsImagesPerId[key] = []);

        const variants = [];
        variantsPerGender.forEach(gender => {
            gender.colors.forEach(color => {
                gender.sizes.forEach(size => {
                    const id = variants.length;
                    variantsImagesPerId[normalizeCamelCase(color)].push(id);

                    variants.push({
                        title: `${gender.colors} / ${color} / ${size}`,
                        price: checkExtraCharge(size, product.price),
                        option1: gender.title,
                        option2: color,
                        option3: size,
                        sku: `${product.sku}-${id + 1}`,
                        ...variantDefault
                    })
                })
            })
        })



        // Create product
        const productResponse: any = await shopifyApi('products', {
            "product": {
                "status": product.draft ? 'draft' : 'active',
                "title": `${product.title} #${product.tag}`,
                "body_html": product.description,
                "vendor": "AiSpirit",
                "variants": variants,
                "options": options,
                "tags": product.tags,
                "images": [
                    // Product cover
                    { src: mockups.mascGhost.preto },
                    ...mockups.models.map(url => ({ src: url })),
                    ...Object.values(mockups.femGhost).map(value => ({ src: value })),
                ]
            }
        });

        console.log('Product response:', productResponse);

        const createdVariants = productResponse.product.variants;
        const createdProductId = productResponse.product.id;

        const colorKeys = Object.keys(variantsImagesPerId);
        let imagesResponse = [];

        // Add variants covers
        for (let i = 0; i < colorKeys.length; i++) {
            const key = colorKeys[i];
            const variantIds = variantsImagesPerId[key].map(variantPosition => createdVariants[variantPosition].id);

            imagesResponse.push(await shopifyApi(`products/${createdProductId}/images`, {
                "image": {
                    "src": mockups.mascGhost[key],
                    "variant_ids": variantIds
                }
            }));
        };

        console.log('Images response:', imagesResponse);

        // Add product to collection
        let collectionResponse;
        if (product.collection)
            collectionResponse = await shopifyApi('collects', {
                "collect": {
                    "product_id": createdProductId,
                    "collection_id": parseInt(product.collection)
                }
            });

        return {
            productResponse,
            imagesResponse,
            collectionResponse
        };
    }
    catch (error) {
        console.error('Error on Shopify create product:', error);
        throw { message: 'Error on Shopify create product:' + error };
    }
}

export async function insertProduct(product) {
    // Upload designs to Drive
    const designUrls = await uploadDesigns(product.sku, product.designFront, product.designBack);

    // Create mockups on Printful
    const mockups = await createPrintfulMockups(product, designUrls);

    // Create product on Shopify
    return await createProduct(product, mockups);
}