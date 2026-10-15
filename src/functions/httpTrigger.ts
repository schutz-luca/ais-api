import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createDimonaOrder, createOrdersFromShopify } from '../services/dimona.service';
import { ShopifyOrder } from '../model/shopify.model';
import { findShopifyOrder, getCollections, insertProduct } from '../services/shopify.service';
import { addNFe } from '../services/bling.service';
import { addTracking } from '../services/shopify.service';
import { listLogs } from '../db/logs';
import { extractFormDataTexts } from '../utils/extractFormDataTexts';
import {
    clearDashboardCookieOptions,
    createDashboardSession,
    dashboardCookieOptions,
    dashboardCorsHeaders,
    DASHBOARD_COOKIE_NAME,
    isDashboardOriginAllowed,
    isDashboardPasswordConfigured,
    isDashboardSessionValid,
    verifyDashboardPassword,
} from '../utils/dashboardAuth';

function dashboardAuthorized(request: HttpRequest): boolean {
    return isDashboardOriginAllowed(request.headers.get('origin'))
        && isDashboardSessionValid(request.headers.get('cookie') || undefined);
}

function dashboardUnauthorized(request: HttpRequest): HttpResponseInit {
    return {
        status: 401,
        jsonBody: { error: 'Faça login para acessar o dashboard.' },
        headers: dashboardCorsHeaders(request.headers.get('origin') || undefined),
    };
}

app.http('dashboard-login', {
    route: 'dashboard/login',
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
        const headers = dashboardCorsHeaders(request.headers.get('origin') || undefined);
        if (!isDashboardPasswordConfigured())
            return { status: 503, jsonBody: { error: 'A senha do dashboard ainda não foi configurada no servidor.' }, headers };

        const body: any = await request.json();
        if (!verifyDashboardPassword(body?.password))
            return { status: 401, jsonBody: { error: 'Senha incorreta.' }, headers };

        const session = createDashboardSession();
        if (!session)
            return { status: 503, jsonBody: { error: 'Não foi possível iniciar a sessão do dashboard.' }, headers };

        return {
            jsonBody: { authenticated: true },
            headers: { ...headers, 'Set-Cookie': `${DASHBOARD_COOKIE_NAME}=${session}; ${dashboardCookieOptions()}` },
        };
    },
});

app.http('dashboard-session', {
    route: 'dashboard/session',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
        const authenticated = dashboardAuthorized(request);
        return {
            status: authenticated ? 200 : 401,
            jsonBody: { authenticated },
            headers: dashboardCorsHeaders(request.headers.get('origin') || undefined),
        };
    },
});

app.http('dashboard-logout', {
    route: 'dashboard/logout',
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request: HttpRequest): Promise<HttpResponseInit> => ({
        jsonBody: { authenticated: false },
        headers: {
            ...dashboardCorsHeaders(request.headers.get('origin') || undefined),
            'Set-Cookie': `${DASHBOARD_COOKIE_NAME}=; ${clearDashboardCookieOptions()}`,
        },
    }),
});

app.http('dashboard-logs', {
    route: 'dashboard/logs',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
        if (!dashboardAuthorized(request)) return dashboardUnauthorized(request);
        const search = (request.query.get('search') || '').trim();
        const cursor = request.query.get('cursor') || undefined;
        const headers = dashboardCorsHeaders(request.headers.get('origin') || undefined);
        if (search.length > 100)
            return { status: 400, jsonBody: { error: 'A busca deve ter até 100 caracteres.' }, headers };
        try {
            return {
                jsonBody: await listLogs({ search, cursor }),
                headers,
            };
        } catch (error) {
            if (error instanceof Error && error.message === 'Cursor de paginação inválido.')
                return { status: 400, jsonBody: { error: error.message }, headers };
            return {
                status: 500,
                jsonBody: { error: 'Não foi possível carregar o histórico.' },
                headers,
            };
        }
    },
});

export async function handlerCreateAll(): Promise<HttpResponseInit> {
    try {
        const summaries = await createOrdersFromShopify('manual');
        return { jsonBody: { summaries } };
    }
    catch (error) {
        return { jsonBody: { error } }
    }
}

export async function handlerOrderPaid(request: HttpRequest): Promise<HttpResponseInit> {
    const shopifyOrder = (await request.json()) as ShopifyOrder;
    const dimonaResult = await createDimonaOrder(shopifyOrder);
    return { jsonBody: dimonaResult };
}

app.post('add-nfe', {
    authLevel: 'anonymous',
    handler: async (request: HttpRequest) => {
        if (!dashboardAuthorized(request)) return dashboardUnauthorized(request);
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
    handler: async (request: HttpRequest) => dashboardAuthorized(request)
        ? handlerCreateAll()
        : dashboardUnauthorized(request),
});

app.post('add-tracking', {
    authLevel: 'anonymous',
    handler: async (request: HttpRequest) => {
        if (!dashboardAuthorized(request)) return dashboardUnauthorized(request);
        const body: any = await request.json();
        const trackingStatus = await addTracking(body.orderId as number, body.dimonaOrderId as string);
        return { jsonBody: { trackingStatus } };
    },
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
    handler: async (request: HttpRequest) => {
        if (!dashboardAuthorized(request)) return dashboardUnauthorized(request);
        const collections = await getCollections();
        return {
            jsonBody: collections,
            headers: dashboardCorsHeaders(request.headers.get('origin') || undefined),
        }
    },
});

app.http('insert-product', {
    authLevel: 'anonymous',
    methods: ['POST'],
    handler: async (request: HttpRequest, context: InvocationContext) => {
        if (!dashboardAuthorized(request)) return dashboardUnauthorized(request);
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
                headers: dashboardCorsHeaders(request.headers.get('origin') || undefined),
            };
        } catch (error) {
            context.error(error);
            return {
                status: 500,
                body: `Error creating product: ${error.message}`,
                headers: dashboardCorsHeaders(request.headers.get('origin') || undefined),
            };
        }
    }
})
