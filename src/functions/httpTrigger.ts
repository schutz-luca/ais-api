import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createDimonaOrder, createOrdersFromShopify } from '../services/dimona.service';
import { ShopifyOrder } from '../model/shopify.model';
import { findShopifyOrder, getCollections, insertProduct } from '../services/shopify.service';
import { addNFe } from '../services/bling.service';
import { extractFormDataTexts } from '../utils/extractFormDataTexts';

export async function handlerCreateAll(_, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        const prefix = '[CREATE-ALL]';
        context.log(`${prefix} Starting creating all unprocessed orders from Shopify`);
        const summaries = await createOrdersFromShopify();
        context.log(`${prefix} Runned and created ${summaries?.length} orders`, summaries);
        return { jsonBody: { summaries } };
    }
    catch (error) {
        context.error('Error on create all:', error)
        return { jsonBody: { error } }
    }
}

export async function handlerOrderPaid(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const prefix = '[ORDER-PAID]';
    const shopifyOrder = (await request.json()) as ShopifyOrder;
    context.log(`${prefix} Starting process order ${shopifyOrder.id}`);
    const dimonaResult = await createDimonaOrder(shopifyOrder);
    context.log(`${prefix} Order processed`, dimonaResult);
    return { jsonBody: dimonaResult };
}

app.post('add-nfe', {
    authLevel: 'anonymous',
    handler: async (request: HttpRequest) => {
        const body: any = await request.json();
        const orderId = body.orderId as number;
        const dimonaOrderId = body.dimonaOrderId as string;

        const order = await findShopifyOrder(orderId);
        const nfeStatus = await addNFe(order, dimonaOrderId)

        return { jsonBody: { nfeStatus } }
    },
});

app.get('create-dimona-orders', {
    authLevel: 'anonymous',
    handler: handlerCreateAll,
});

app.post('order-paid', {
    authLevel: 'anonymous',
    handler: handlerOrderPaid
})

const getFormFile = async (formData: FormData, name: string) => {
    const file: any = formData.get(name);

    if (!file) return;

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    return {
        fieldname: '',
        originalname: file.name,
        mimetype: `image/${file.name.split('.')[file.name.split('.').length - 1]}`,
        size: file.size,
        buffer: fileBuffer,
    }
}

app.get('collections', {
    authLevel: 'anonymous',
    handler: async () => {
        const collections = await getCollections();
        return {
            jsonBody: collections,
            headers: {
                'Access-Control-Allow-Origin': '*',  // Allow all origins
                'Access-Control-Allow-Methods': 'GET',  // Allowed methods
                'Access-Control-Allow-Headers': 'Content-Type',  // Allowed headers
            },
        }
    },
});

app.http('insert-product', {
    authLevel: 'anonymous',
    methods: ['POST'],
    handler: async (request: HttpRequest, context: InvocationContext) => {
        try {
            const formData = await request.formData();

            const designFrontMale = await getFormFile(formData, 'designFrontMale');
            const designBackMale = await getFormFile(formData, 'designBackMale');
            const designFrontFemale = await getFormFile(formData, 'designFrontFemale');
            const designBackFemale = await getFormFile(formData, 'designBackFemale');

            const fields = extractFormDataTexts(formData);

            const product = {
                ...fields,
                designFrontMale,
                designBackMale,
                designFrontFemale,
                designBackFemale
            }

            const response = await insertProduct(product);

            if (!Object.keys(response).length) throw { message: 'Empty response' };

            return {
                status: 200,
                body: JSON.stringify(response),
                headers: {
                    'Access-Control-Allow-Origin': '*',  // Allow all origins
                    'Access-Control-Allow-Methods': 'POST',  // Allowed methods
                    'Access-Control-Allow-Headers': 'Content-Type',  // Allowed headers
                },
            };
        } catch (error) {
            context.error(error);
            return {
                status: 500,
                body: `Error creating product: ${error.message}`,
                headers: {
                    'Access-Control-Allow-Origin': '*',  // Allow all origins
                    'Access-Control-Allow-Methods': 'POST',  // Allowed methods
                    'Access-Control-Allow-Headers': 'Content-Type',  // Allowed headers
                }
            };
        }
    }
})