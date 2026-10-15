import 'dotenv/config';
import { getTokens, updateTokens } from '../db/blingtokens';
import { getLastNf, getNfByOrder, NfRecord, reserveNfForOrder, saveNfProgress, updateNfStatus } from '../db/nf';
import { DimonaSendNFe } from '../dto/dimona.dto';
import { NFe } from '../model/bling.model';
import { ShopifyOrder } from '../model/shopify.model';
import { getCustomerDocument } from '../utils/customerDocument';
import { parseShopifyMoney } from '../utils/money';
import { getBlingApiBase } from '../utils/blingConfig';
import { mapShopifyBillingAddress } from '../utils/shopifyAddress';
import { dimonaApi } from './dimona.service';

type BlingResponse = { data?: any; error?: any; [key: string]: any };
type Persistence = {
    getTokens: typeof getTokens;
    updateTokens: typeof updateTokens;
    getLastNf: typeof getLastNf;
    getNfByOrder: typeof getNfByOrder;
    reserveNfForOrder: typeof reserveNfForOrder;
    saveNfProgress: typeof saveNfProgress;
    updateNfStatus: typeof updateNfStatus;
    sendDimonaNFe: (nfe: DimonaSendNFe, orderId: string) => Promise<any>;
};

// Defer dereferencing dimonaApi until invocation to avoid a circular-import crash:
// dimona.service imports addNFe from this module.
const defaultPersistence: Persistence = {
    getTokens,
    updateTokens,
    getLastNf,
    getNfByOrder,
    reserveNfForOrder,
    saveNfProgress,
    updateNfStatus,
    sendDimonaNFe: async (nfe, orderId) => dimonaApi.sendNFe(nfe, orderId),
};
let persistence = defaultPersistence;
let fetcher: typeof fetch = (...args) => fetch(...args);
let refreshInFlight: Promise<void> | null = null;
let pollDelays = [0, 1000, 2000];
const apiBase = getBlingApiBase();

/** Dependency seam for local tests; production uses the repository and global fetch. */
export function configureBlingForTests(options: {
    persistence?: Partial<Persistence>;
    fetch?: typeof fetch;
    pollDelays?: number[];
}): void {
    persistence = { ...defaultPersistence, ...options.persistence };
    fetcher = options.fetch || ((...args) => fetch(...args));
    pollDelays = options.pollDelays || [0, 1000, 2000];
    refreshInFlight = null;
}

export function resetBlingTestConfiguration(): void {
    persistence = defaultPersistence;
    fetcher = (...args) => fetch(...args);
    pollDelays = [0, 1000, 2000];
    refreshInFlight = null;
}

function parseResponseBody(text: string): BlingResponse {
    if (!text) return {};
    try { return JSON.parse(text); } catch { return { raw: text }; }
}

function formatBlingError(body: BlingResponse): string {
    const error = body.error;
    if (!error) return body.raw || JSON.stringify(body);

    // Bling's generic `message` often hides the useful validation detail in
    // `description`. Include field paths/messages when present, but never echo
    // submitted field values that could contain customer data.
    const parts = [error.type, error.description, error.message]
        .filter(value => typeof value === 'string' && value.trim())
        .map(value => value.trim());
    const fields = Array.isArray(error.fields) ? error.fields : Array.isArray(error.violations) ? error.violations : [];
    for (const field of fields) {
        if (!field || typeof field !== 'object') continue;
        const path = field.element || field.field || field.property || field.path || field.name;
        const message = field.msg || field.message || field.description;
        if (path || message) parts.push(`${path ? `${String(path)}: ` : ''}${message ? String(message) : 'valor inválido'}`);
    }
    return parts.join(' — ') || 'Erro sem detalhes retornados pelo Bling';
}

async function readResponse(response: Response): Promise<BlingResponse> {
    const body = parseResponseBody(await response.text());
    if (!response.ok || body.error)
        throw new Error(`Bling HTTP ${response.status}: ${formatBlingError(body)}`);
    return body;
}

export async function refreshBlingToken(): Promise<void> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
        const tokens = await persistence.getTokens();
        const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh });
        const response = await fetcher(`${apiBase}/oauth/token`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${process.env.BLING_TOKEN}`,
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
                'enable-jwt': '1',
            },
            body: body.toString(),
        });
        const result = await readResponse(response);
        if (typeof result.access_token !== 'string' || typeof result.refresh_token !== 'string')
            throw new Error(`Bling token refresh returned an incomplete token pair: ${JSON.stringify(result)}`);
        await persistence.updateTokens(result.access_token, result.refresh_token);
        console.log('Bling token refreshed and persisted');
    })();
    try {
        await refreshInFlight;
    } finally {
        refreshInFlight = null;
    }
}

async function requestBling(path: string, init: RequestInit): Promise<BlingResponse> {
    const tokens = await persistence.getTokens();
    const perform = (access: string) => fetcher(`${apiBase}${path}`, {
        ...init,
        headers: {
            ...(init.headers || {}),
            Authorization: `Bearer ${access}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'enable-jwt': '1',
        },
    });

    let response = await perform(tokens.access);
    if (response.status === 401) {
        await refreshBlingToken();
        const refreshedTokens = await persistence.getTokens();
        response = await perform(refreshedTokens.access);
    }
    return readResponse(response);
}

const blingApi = {
    postNFe: (nfe: NFe) => requestBling('/nfe', { method: 'POST', body: JSON.stringify(nfe) }),
    findNFeByNumber: (number: number) => requestBling(`/nfe?numero=${encodeURIComponent(String(number).padStart(6, '0'))}`, { method: 'GET' }),
    sendNFe: (nfeId: string) => requestBling(`/nfe/${encodeURIComponent(nfeId)}/enviar`, { method: 'POST' }),
    getNFe: (nfeId: string) => requestBling(`/nfe/${encodeURIComponent(nfeId)}`, { method: 'GET' }),
};

async function getNextAvailableNfNumber(): Promise<number> {
    let candidate = (await persistence.getLastNf()).number + 1;
    // The local counter can lag behind notes created directly in Bling. Its API
    // returns padded numbers (for example, "000405"), so check each candidate
    // before reserving it locally or attempting a create.
    for (let attempt = 0; attempt < 100; attempt++, candidate++) {
        const result = await blingApi.findNFeByNumber(candidate);
        if (!Array.isArray(result.data))
            throw new Error(`Bling não retornou a consulta da numeração ${candidate}; emissão interrompida`);
        if (result.data.length === 0) return candidate;
    }
    throw new Error('Não foi encontrado número livre de NF-e nos próximos 100 números; revise a numeração no Bling');
}

function getDate() {
    return new Date().toLocaleString('sv', { timeZoneName: 'short' }).split(' ').slice(0, -1).join(' ');
}

export async function formatNFe(shopifyOrder: ShopifyOrder, customerDocument = getCustomerDocument(shopifyOrder), invoiceNumber?: number) {
    const recipient = mapShopifyBillingAddress(shopifyOrder);
    const nfe: NFe = {
        tipo: 1,
        numero: `${invoiceNumber ?? (await persistence.getLastNf()).number + 1}`,
        dataOperacao: getDate(),
        contato: {
            nome: recipient.name,
            email: shopifyOrder.customer.email?.trim(),
            telefone: recipient.phone,
            tipoPessoa: customerDocument.length === 14 ? 'J' : 'F',
            contribuinte: 9,
            numeroDocumento: customerDocument,
            endereco: {
                bairro: recipient.neighborhood,
                cep: recipient.zipcode,
                endereco: recipient.street,
                numero: recipient.number,
                complemento: recipient.complement,
                municipio: recipient.city,
                uf: recipient.state,
                pais: recipient.country,
            },
        },
        desconto: parseShopifyMoney(shopifyOrder.current_total_discounts, 'current_total_discounts'),
        finalidade: 1,
        naturezaOperacao: { id: 15104989232 },
        itens: shopifyOrder.line_items.map(item => ({
            codigo: item.sku,
            descricao: item.name,
            valor: parseShopifyMoney(item.price, `line_items[${item.id}].price`),
            quantidade: item.quantity,
            tipo: 'P',
            numeroPedidoCompra: `${shopifyOrder.id}`,
            classificacaoFiscal: '6105.10.00',
            unidade: 'UN',
            origem: 0,
        })),
        transporte: {
            frete: parseShopifyMoney(shopifyOrder.total_shipping_price_set.shop_money.amount, 'shipping'),
            volume: { quantidade: 1 },
        },
    };
    return nfe;
}

async function reconcileReservation(orderId: string, reservation: NfRecord): Promise<NfRecord | undefined> {
    const list = await blingApi.findNFeByNumber(reservation.number);
    const candidates = Array.isArray(list.data)
        ? [...new Map(list.data.filter(item => item?.id).map(item => [String(item.id), item])).values()]
        : [];
    const matches: Array<{ id: string; data: any }> = [];

    for (const candidate of candidates) {
        const data = getNfeData(await blingApi.getNFe(String(candidate.id)));
        const ownsOrder = Array.isArray(data.itens) && data.itens.some(item => String(item?.numeroPedidoCompra ?? '').trim() === orderId);
        if (ownsOrder) matches.push({ id: String(candidate.id), data });
    }

    if (matches.length !== 1) return undefined;
    const match = matches[0];
    const status = authorizationState(match.data);
    await persistence.saveNfProgress(orderId, reservation.number, match.id, status);
    return { ...reservation, blingid: match.id, status };
}

function getNfeData(response: BlingResponse): any {
    if (!response?.data || typeof response.data !== 'object') throw new Error(`Bling returned no NF-e data: ${JSON.stringify(response)}`);
    return response.data;
}

function authorizationState(data: any): 'authorized' | 'rejected' | 'pending' {
    const situation = data?.situacao ?? data?.status;
    const normalized = String(situation ?? '').trim().toLowerCase();
    const statusCode = typeof situation === 'number' ? situation : /^\d+$/.test(normalized) ? Number(normalized) : undefined;
    const xml = String(data?.xml || '');
    // Trust an explicit Bling state over XML text, which can be stale or unrelated.
    if (statusCode !== undefined) {
        if ([2, 4, 9, 11].includes(statusCode)) return 'rejected';
        if ([5, 6].includes(statusCode)) return 'authorized';
        if ([1, 3, 7, 8, 10, 12].includes(statusCode)) return 'pending';
    }
    if (/rejeitad|denegad|cancelad/i.test(normalized)) return 'rejected';
    if (/autorizad/.test(normalized)) return 'authorized';
    if (/pendente|aguardando|processando|em processamento|registrad|consult|bloquead/i.test(normalized)) return 'pending';
    // The XML phrase is only a fallback when Bling did not provide a recognized state.
    if (xml.includes('Autorizado o uso da NF-e')) return 'authorized';
    return 'pending';
}

function toDimonaNfe(data: any): DimonaSendNFe {
    if (!data.chaveAcesso || !data.linkPDF) throw new Error('Authorized Bling NF-e is missing chaveAcesso or linkPDF');
    return { chave: data.chaveAcesso, serie: data.serie, numero: data.numero, link: data.linkPDF };
}

async function waitForAuthorization(orderId: string, nfeId: string, record: NfRecord): Promise<{ state: string; nfe?: DimonaSendNFe }> {
    for (let index = 0; index < pollDelays.length; index++) {
        if (pollDelays[index] > 0) await new Promise(resolve => setTimeout(resolve, pollDelays[index]));
        const response = await blingApi.getNFe(nfeId);
        const data = getNfeData(response);
        const state = authorizationState(data);
        await persistence.updateNfStatus(orderId, state);
        if (state === 'authorized') return { state, nfe: toDimonaNfe(data) };
        if (state === 'rejected') return { state };
    }
    return { state: 'pending' };
}

export async function generateNFe(shopifyOrder: ShopifyOrder): Promise<{ success: boolean; status: string; nfe?: DimonaSendNFe }> {
    const orderId = `${shopifyOrder.id}`;
    try {
        const document = getCustomerDocument(shopifyOrder);
        let existing = await persistence.getNfByOrder(orderId);
        let record: NfRecord;
        if (existing) {
            if (!existing.blingid && existing.status === 'creating') {
                const recovered = await reconcileReservation(orderId, existing);
                if (!recovered) return { success: false, status: `Reserva NF-e do pedido ${orderId} ainda não foi reconciliada; nova emissão bloqueada` };
                existing = recovered;
            }
            if (!existing.blingid) return { success: false, status: `Pedido ${orderId} possui registro NF-e legado sem ID Bling; necessário revisar antes de nova emissão` };
            if (existing.status === 'rejected') return { success: false, status: `NF-e ${existing.blingid} foi rejeitada e exige correção antes de nova tentativa` };
            record = existing;
        } else {
            // Validate all source data before persisting a reservation that would block future retries.
            const localCandidate = (await persistence.getLastNf()).number + 1;
            const formattedNFe = await formatNFe(shopifyOrder, document, localCandidate);
            const nextNumber = await getNextAvailableNfNumber();
            formattedNFe.numero = `${nextNumber}`;
            const reservation = await persistence.reserveNfForOrder(orderId, nextNumber);
            if (!reservation.created) {
                if (!reservation.reservation.blingid && reservation.reservation.status === 'creating') {
                    const recovered = await reconcileReservation(orderId, reservation.reservation);
                    if (!recovered) return { success: false, status: `Reserva NF-e do pedido ${orderId} ainda não foi reconciliada; nova emissão bloqueada` };
                    existing = recovered;
                } else {
                    existing = reservation.reservation;
                }
                if (!existing.blingid) return { success: false, status: `Reserva NF-e do pedido ${orderId} sem ID Bling; nova emissão bloqueada` };
                if (existing.status === 'rejected') return { success: false, status: `NF-e ${existing.blingid} foi rejeitada e exige correção antes de nova tentativa` };
                record = existing;
            } else {
                const created = getNfeData(await blingApi.postNFe(formattedNFe));
                if (!created.id) throw new Error(`Bling create response did not include NF-e id: ${JSON.stringify(created)}`);
                record = {
                    timestamp: new Date().toISOString(),
                    number: Number(formattedNFe.numero),
                    orderid: orderId,
                    blingid: String(created.id),
                    status: 'created',
                };
                await persistence.saveNfProgress(orderId, record.number, record.blingid, record.status);
            }
        }

        if (record.status === 'created') {
            await persistence.updateNfStatus(orderId, 'sending');
            await blingApi.sendNFe(record.blingid);
        }

        const result = await waitForAuthorization(orderId, record.blingid, record);
        if (result.state !== 'authorized')
            return { success: false, status: result.state === 'rejected' ? `NF-e ${record.blingid} rejeitada pelo Bling` : `NF-e ${record.blingid} ainda aguarda autorização` };

        return { success: true, status: `NF-e ${record.blingid} autorizada`, nfe: result.nfe };
    }
    catch (error) {
        console.error('Error on generateNFe:', error);
        return { success: false, status: `Error on generateNFe: ${error?.message || `${error}`}` };
    }
}

export async function addNFe(order: ShopifyOrder, dimonaOrderId: string) {
    const { status, success, nfe } = await generateNFe(order);
    let nfeStatus = `${status} /// { dimonaOrderId: ${dimonaOrderId}, nfe: ${JSON.stringify(nfe)}, success: ${success} }`;
    if (dimonaOrderId && nfe && success) {
        try {
            const response = await persistence.sendDimonaNFe(nfe, dimonaOrderId);
            if (response) nfeStatus = `${nfeStatus} /// DimonaResponse: ${JSON.stringify(response)}`;
        } catch (error) {
            nfeStatus = `${nfeStatus} /// Unable to send NFe to Dimona: ${error?.message || error}`;
        }
    }
    return nfeStatus;
}
