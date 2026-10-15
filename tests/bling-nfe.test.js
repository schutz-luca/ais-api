const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BLING_API_BASE = 'https://api.bling.com.br/Api/v3';
process.env.BLING_TOKEN = 'test-basic-token';

const { getCustomerDocument } = require('../dist/src/utils/customerDocument');
const { mapShopifyShippingAddress, mapShopifyBillingAddress } = require('../dist/src/utils/shopifyAddress');
const { parseShopifyMoney } = require('../dist/src/utils/money');
const { getBlingApiBase } = require('../dist/src/utils/blingConfig');
const bling = require('../dist/src/services/bling.service');
const { formatDimonaPayload } = require('../dist/src/services/dimona.service');

function order(overrides = {}) {
    return {
        id: 123,
        note_attributes: [
            { name: 'customer_document', value: '529.982.247-25' },
            { name: 'shipping_street_name', value: 'Rua Entrega' },
            { name: 'shipping_street_number', value: '456' },
            { name: 'shipping_neighborhood', value: 'Vila Entrega' },
            { name: 'shipping_street_complement', value: 'Casa 2' },
            { name: 'billing_street_name', value: 'Rua Cobrança' },
            { name: 'billing_street_number', value: '789' },
            { name: 'billing_neighborhood', value: 'Centro Cobrança' },
            { name: 'billing_street_complement', value: 'Sala 4' },
        ],
        billing_address: {
            name: 'Recebedor da cobrança', first_name: 'Recebedor', last_name: 'Cobrança',
            address1: 'Rua Nativa, 12', address2: 'Apto nativo', phone: '+55 (11) 3333-4444',
            zip: '11111-000', city: 'Campinas', province: 'São Paulo', province_code: 'SP',
            country: 'Brazil', country_code: 'BR', company: 'Empresa, não bairro',
        },
        customer: { first_name: 'Teste', last_name: 'Cliente', email: 'teste@example.com', phone: '' },
        shipping_address: {
            name: 'Destinatário da entrega', first_name: 'Destinatário', last_name: 'Entrega',
            address1: 'Rua Nativa, 123', address2: 'Complemento nativo', phone: '+55 (11) 99999-8888',
            company: 'Empresa, não bairro', zip: '12345-000', city: 'São Paulo',
            province: 'São Paulo', province_code: 'SP', country: 'Brazil', country_code: 'BR',
        },
        current_total_discounts: '5.10',
        total_shipping_price_set: { shop_money: { amount: '12.00' } },
        line_items: [{ id: 9, sku: 'CAMISA-1', name: 'Camiseta', price: '49.90', quantity: 1 }],
        ...overrides,
    };
}

function response(status, body = {}) {
    return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) };
}

function harness({ existing, apiResponses, tokenResponses, failSave = false, lastNf = 10 } = {}) {
    const calls = [];
    let saved = existing ? { ...existing } : null;
    let persistedTokens = { access: 'old-access', refresh: 'old-refresh' };
    let dimonaCalls = 0;
    const persistence = {
        getTokens: async () => ({ ...persistedTokens }),
        updateTokens: async (access, refresh) => { persistedTokens = { access, refresh }; },
        getLastNf: async () => ({ number: lastNf }),
        getNfByOrder: async () => saved && { ...saved },
        reserveNfForOrder: async (orderId, number) => {
            if (saved) return { reservation: { ...saved }, created: false };
            saved = { orderid: orderId, number, blingid: null, status: 'creating' };
            return { reservation: { ...saved }, created: true };
        },
        saveNfProgress: async (orderId, number, blingid, status) => {
            if (failSave) { failSave = false; throw new Error('mock persistence failure'); }
            saved = Object.assign(saved || {}, { orderid: orderId, number, blingid, status });
        },
        updateNfStatus: async (_orderId, status) => { if (saved) saved.status = status; },
        sendDimonaNFe: async () => { dimonaCalls++; return { success: true }; },
    };
    let apiIndex = 0;
    let tokenIndex = 0;
    const fetch = async (url, init) => {
        calls.push({ url, init });
        const queue = url.endsWith('/oauth/token') ? tokenResponses || [] : apiResponses || [];
        const index = url.endsWith('/oauth/token') ? tokenIndex++ : apiIndex++;
        return queue[index] || response(500, { error: { message: 'unexpected mocked request' } });
    };
    bling.configureBlingForTests({ persistence, fetch, pollDelays: [0] });
    return { calls, get saved() { return saved; }, get dimonaCalls() { return dimonaCalls; }, get persistedTokens() { return persistedTokens; } };
}

test('document comes only from note_attributes and validates CPF/CNPJ checksums', () => {
    assert.equal(getCustomerDocument(order()), '52998224725');
    assert.equal(getCustomerDocument(order({ note_attributes: [{ name: 'customer_document', value: '11.222.333/0001-81' }] })), '11222333000181');
    assert.throws(() => getCustomerDocument(order({ note_attributes: [{ name: 'customer_document', value: 'Partenon' }] })), /CPF ou CNPJ válido/);
    assert.throws(() => getCustomerDocument(order({ note_attributes: [] })), /ausente ou inválido/);
    assert.throws(() => getCustomerDocument(order({ note_attributes: [{ name: 'other', value: '52998224725' }] })), /ausente ou inválido/);
    assert.throws(() => getCustomerDocument(order({ note_attributes: [
        { name: 'customer_document', value: '529.982.247-25' },
        { name: 'customer_document', value: '11.222.333/0001-81' },
    ] })), /duplicado e conflitante/);
});

test('Dimona shipping mapper prefers explicit attributes, province_code, recipient and shipping phone', () => {
    const mapped = mapShopifyShippingAddress(order());
    assert.equal(mapped.name, 'Destinatário da entrega');
    assert.equal(mapped.phone, '11999998888');
    assert.equal(mapped.street, 'Rua Entrega');
    assert.equal(mapped.number, '456');
    assert.equal(mapped.neighborhood, 'Vila Entrega');
    assert.equal(mapped.complement, 'Casa 2');
    assert.equal(mapped.state, 'SP');
    assert.equal(mapped.country, 'BR');
    assert.notEqual(mapped.neighborhood, 'Empresa, não bairro');
    const payload = formatDimonaPayload(order(), []);
    assert.equal(payload.customer_name, 'Destinatário da entrega');
    assert.equal(payload.customer_document, '52998224725');
    assert.equal(payload.address.state, 'SP');
    assert.equal(payload.address.phone, '11999998888');
    assert.equal(payload.address.neighborhood, 'Vila Entrega');
    assert.equal(payload.address.country, 'BR');
});

test('Bling billing mapper uses billing data and never company as neighborhood', () => {
    const mapped = mapShopifyBillingAddress(order());
    assert.equal(mapped.name, 'Recebedor da cobrança');
    assert.equal(mapped.phone, '1133334444');
    assert.equal(mapped.street, 'Rua Cobrança');
    assert.equal(mapped.number, '789');
    assert.equal(mapped.neighborhood, 'Centro Cobrança');
    assert.equal(mapped.city, 'Campinas');
    assert.equal(mapped.zipcode, '11111-000');
    assert.notEqual(mapped.neighborhood, 'Empresa, não bairro');
});

test('Bling NF-e payload uses billing recipient and address fields', async () => {
    const nfe = await bling.formatNFe(order(), '52998224725', 44);
    assert.equal(nfe.contato.nome, 'Recebedor da cobrança');
    assert.equal(nfe.contato.telefone, '1133334444');
    assert.equal(nfe.contato.endereco.endereco, 'Rua Cobrança');
    assert.equal(nfe.contato.endereco.numero, '789');
    assert.equal(nfe.contato.endereco.bairro, 'Centro Cobrança');
    assert.equal(nfe.contato.endereco.municipio, 'Campinas');
    assert.equal(nfe.contato.endereco.cep, '11111-000');
    assert.equal(nfe.contato.endereco.uf, 'SP');
    assert.equal(nfe.contato.endereco.pais, 'BR');
});

test('native address fields are validated fallbacks and conflicting duplicates fail closed', () => {
    const fixture = order({ note_attributes: [
        { name: 'customer_document', value: '529.982.247-25' },
        { name: 'shipping_neighborhood', value: 'Bairro explícito' },
    ] });
    const shipping = mapShopifyShippingAddress(fixture);
    assert.equal(shipping.street, 'Rua Nativa');
    assert.equal(shipping.number, '123');
    assert.equal(shipping.complement, 'Complemento nativo');
    assert.equal(shipping.neighborhood, 'Bairro explícito');
    assert.throws(() => mapShopifyShippingAddress(order({ note_attributes: [
        ...order().note_attributes,
        { name: 'shipping_street_name', value: 'Outra rua' },
    ] })), /duplicado e conflitante/);
    assert.throws(() => mapShopifyShippingAddress(order({ shipping_address: {
        ...order().shipping_address, phone: '',
    } })), /Telefone ausente/);
    assert.throws(() => mapShopifyBillingAddress(order({ billing_address: {
        ...order().billing_address, province_code: '',
    } })), /province_code/);
    assert.throws(() => mapShopifyShippingAddress(order({ note_attributes: [
        { name: 'customer_document', value: '529.982.247-25' },
    ] })), /shipping_neighborhood/);
});

test('money parser keeps cent precision and rejects malformed amounts', () => {
    assert.equal(parseShopifyMoney('49.90', 'price'), 49.9);
    assert.equal(parseShopifyMoney('5', 'discount'), 5);
    assert.throws(() => parseShopifyMoney('1,25', 'price'), /inválido/);
    assert.throws(() => parseShopifyMoney('1.234', 'price'), /inválido/);
});

test('canonical URL validation accepts the production API host only', () => {
    assert.equal(getBlingApiBase(), 'https://api.bling.com.br/Api/v3');
    const previous = process.env.BLING_API_BASE;
    process.env.BLING_API_BASE = 'https://www.bling.com.br/Api/v3';
    assert.throws(() => getBlingApiBase(), /BLING_API_BASE/);
    process.env.BLING_API_BASE = previous;
});

test('401 refreshes once with form data and JWT headers, then authorization gates Dimona', async () => {
    const h = harness({
        apiResponses: [
            response(200, { data: [] }), // no prior Bling note occupies the local candidate
            response(401, { error: { message: 'expired' } }),
            response(201, { data: { id: 9001 } }),
            response(200, { data: {} }),
            response(200, { data: { situacao: 'Autorizada', chaveAcesso: 'key', serie: 1, numero: 11, linkPDF: 'https://pdf' } }),
        ],
        tokenResponses: [response(200, { access_token: 'new-access', refresh_token: 'new-refresh' })],
    });
    const result = await bling.generateNFe(order());
    assert.equal(result.success, true);
    assert.equal(h.calls.filter(call => call.url.endsWith('/nfe')).length, 2);
    const tokenCall = h.calls.find(call => call.url.endsWith('/oauth/token'));
    assert.match(tokenCall.init.headers['Content-Type'], /x-www-form-urlencoded/);
    assert.equal(tokenCall.init.headers['enable-jwt'], '1');
    assert.match(tokenCall.init.body, /grant_type=refresh_token/);
    const apiCall = h.calls.find(call => call.url.endsWith('/nfe'));
    assert.equal(apiCall.init.headers['enable-jwt'], '1');
    const serializedNfe = JSON.parse(apiCall.init.body);
    assert.equal(typeof serializedNfe.desconto, 'number');
    assert.equal(typeof serializedNfe.itens[0].valor, 'number');
    assert.equal(typeof serializedNfe.transporte.frete, 'number');
    assert.equal(serializedNfe.contato.numeroDocumento, '52998224725');
    assert.equal(serializedNfe.contato.tipoPessoa, 'F');
    assert.equal(h.persistedTokens.access, 'new-access');
    assert.equal(h.saved.status, 'authorized');
    assert.equal(result.nfe.numero, 11);
    bling.resetBlingTestConfiguration();
    const authorized = harness({ existing: { orderid: '123', number: 11, blingid: '9001', status: 'pending' }, apiResponses: [response(200, { data: { situacao: 'Autorizada', chaveAcesso: 'key', serie: 1, numero: 11, linkPDF: 'https://pdf' } })] });
    const nfeResult = await bling.generateNFe(order());
    assert.equal(nfeResult.success, true);
    assert.equal(authorized.calls.some(call => call.url.endsWith('/nfe')), false);
    assert.equal(authorized.dimonaCalls, 0);
    bling.resetBlingTestConfiguration();
});

test('pending, rejected, HTTP failure, invalid money, and second 401 never report success', async t => {
    const pending = harness({ existing: { orderid: '123', number: 11, blingid: '9001', status: 'pending' }, apiResponses: [response(200, { data: { situacao: 'Pendente' } })] });
    assert.equal((await bling.generateNFe(order())).success, false);
    assert.equal(pending.dimonaCalls, 0);
    bling.resetBlingTestConfiguration();

    harness({ existing: { orderid: '123', number: 11, blingid: '9001', status: 'pending' }, apiResponses: [response(200, { data: { situacao: 'Rejeitada' } })] });
    assert.equal((await bling.generateNFe(order())).success, false);
    bling.resetBlingTestConfiguration();

    harness({ apiResponses: [response(200, { data: [] }), response(500, { error: { message: 'provider failed' } })] });
    assert.equal((await bling.generateNFe(order())).success, false);
    bling.resetBlingTestConfiguration();

    const invalidMoney = harness({ apiResponses: [] });
    assert.equal((await bling.generateNFe(order({ line_items: [{ id: 9, price: 'bad' }] }))).success, false);
    assert.equal(invalidMoney.calls.length, 0);
    assert.equal(invalidMoney.saved, null);
    bling.resetBlingTestConfiguration();

    harness({ tokenResponses: [response(400, { error: { message: 'refresh revoked' } })] });
    await assert.rejects(() => bling.refreshBlingToken(), /HTTP 400.*refresh revoked/);
    bling.resetBlingTestConfiguration();

    harness({ apiResponses: [response(200, { data: [] }), response(401, {}), response(401, {})], tokenResponses: [response(200, { access_token: 'new', refresh_token: 'new-refresh' })] });
    assert.equal((await bling.generateNFe(order())).success, false);
    bling.resetBlingTestConfiguration();
});

test('Bling error response keeps validation details without echoing field values', async () => {
    const h = harness({ apiResponses: [response(200, { data: [] }), response(400, { error: {
        type: 'VALIDATION_ERROR',
        message: 'Não foi possível salvar a nota fiscal',
        description: 'Revise os campos tributários do item',
        fields: [{ element: 'itens[0].classificacaoFiscal', msg: 'NCM inválido', value: 'sensitive-value' }],
    } })] });
    const result = await bling.generateNFe(order());
    assert.equal(result.success, false);
    assert.match(result.status, /VALIDATION_ERROR/);
    assert.match(result.status, /Revise os campos tributários do item/);
    assert.match(result.status, /itens\[0\]\.classificacaoFiscal: NCM inválido/);
    assert.doesNotMatch(result.status, /sensitive-value/);
    assert.equal(h.saved.status, 'creating');
    bling.resetBlingTestConfiguration();
});

test('NF-e numbering skips a number already present in Bling, including zero-padded numbers', async () => {
    const h = harness({
        lastNf: 404,
        apiResponses: [
            response(200, { data: [{ id: 25984806253, numero: '000405' }] }),
            response(200, { data: [] }),
            response(201, { data: { id: 9002 } }),
            response(200, { data: {} }),
            response(200, { data: { situacao: 'Autorizada', chaveAcesso: 'key', serie: 1, numero: 406, linkPDF: 'https://pdf' } }),
        ],
    });
    const result = await bling.generateNFe(order());
    assert.equal(result.success, true);
    const numberChecks = h.calls.filter(call => call.init.method === 'GET' && call.url.includes('/nfe?numero='));
    assert.match(numberChecks[0].url, /numero=000405$/);
    assert.match(numberChecks[1].url, /numero=000406$/);
    const createCall = h.calls.find(call => call.init.method === 'POST' && call.url.endsWith('/nfe'));
    assert.equal(JSON.parse(createCall.init.body).numero, '406');
    bling.resetBlingTestConfiguration();
});

test('Dimona transfer occurs only after authorized result', async () => {
    const h = harness({
        existing: { orderid: '123', number: 11, blingid: '9001', status: 'pending' },
        apiResponses: [response(200, { data: { situacao: 'Autorizada', chaveAcesso: 'key', serie: 1, numero: 11, linkPDF: 'https://pdf' } })],
    });
    await bling.addNFe(order(), 'dimona-order');
    assert.equal(h.dimonaCalls, 1);
    bling.resetBlingTestConfiguration();
});

test('explicit rejection overrides an authorization phrase in stale XML', async () => {
    const h = harness({
        existing: { orderid: '123', number: 11, blingid: '9001', status: 'pending' },
        apiResponses: [response(200, { data: { situacao: 4, xml: '<infProt>Autorizado o uso da NF-e</infProt>' } })],
    });
    const result = await bling.addNFe(order(), 'dimona-order');
    assert.match(result, /rejeitada pelo Bling/);
    assert.equal(result.includes('success: true'), false);
    assert.equal(h.dimonaCalls, 0);
    bling.resetBlingTestConfiguration();
});

test('explicit pending status overrides an authorization phrase in XML', async () => {
    const h = harness({
        existing: { orderid: '123', number: 11, blingid: '9001', status: 'pending' },
        apiResponses: [response(200, { data: { situacao: 1, xml: '<infProt>Autorizado o uso da NF-e</infProt>' } })],
    });
    const result = await bling.addNFe(order(), 'dimona-order');
    assert.match(result, /ainda aguarda autorização/);
    assert.equal(result.includes('success: true'), false);
    assert.equal(h.dimonaCalls, 0);
    bling.resetBlingTestConfiguration();
});

test('reservation reconciles a created Bling NF-e after local ID persistence fails', async () => {
    const h = harness({
        failSave: true,
        apiResponses: [
            response(200, { data: [] }),
            response(201, { data: { id: 9001 } }),
            response(200, { data: [{ id: 9001, numero: '000011' }] }),
            response(200, { data: { id: 9001, situacao: 5, chaveAcesso: 'key', serie: 1, numero: 11, linkPDF: 'https://pdf', itens: [{ numeroPedidoCompra: '123' }] } }),
            response(200, { data: { id: 9001, situacao: 5, chaveAcesso: 'key', serie: 1, numero: 11, linkPDF: 'https://pdf', itens: [{ numeroPedidoCompra: '123' }] } }),
        ],
    });
    const firstAttempt = await bling.generateNFe(order());
    assert.equal(firstAttempt.success, false);
    assert.equal(h.saved.status, 'creating');
    assert.equal(h.saved.blingid, null);

    const retry = await bling.generateNFe(order());
    assert.equal(retry.success, true);
    assert.equal(retry.nfe.numero, 11);
    assert.equal(h.saved.blingid, '9001');
    assert.equal(h.calls.filter(call => call.url.endsWith('/nfe') && call.init.method === 'POST').length, 1);
    assert.equal(h.calls.some(call => call.url.endsWith('/nfe?numero=000011')), true);
    bling.resetBlingTestConfiguration();
});

test('unmatched reservation blocks another Bling create request', async () => {
    const h = harness({
        existing: { orderid: '123', number: 11, blingid: null, status: 'creating' },
        apiResponses: [response(200, { data: [] })],
    });
    const result = await bling.generateNFe(order());
    assert.equal(result.success, false);
    assert.match(result.status, /não foi reconciliada/);
    assert.equal(h.calls.filter(call => call.init.method === 'POST' && call.url.endsWith('/nfe')).length, 0);
    bling.resetBlingTestConfiguration();
});
