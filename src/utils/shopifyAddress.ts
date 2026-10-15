import { ShopifyOrder, Address } from '../model/shopify.model';

type AddressPurpose = 'shipping' | 'billing';

function noteAttribute(order: ShopifyOrder, name: string): string | undefined {
    const matches = (order.note_attributes || [])
        .filter(attribute => attribute?.name === name)
        .map(attribute => String(attribute?.value ?? '').trim());
    const distinct = [...new Set(matches)];
    if (distinct.length > 1)
        throw new Error(`Atributo Shopify duplicado e conflitante: ${name}`);
    return distinct[0] || undefined;
}

function required(value: unknown, field: string): string {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) throw new Error(`Campo obrigatório ausente no endereço Shopify: ${field}`);
    return normalized;
}

function splitNativeStreet(address1: string): { street: string; number: string } {
    const input = required(address1, 'address1');
    // Shopify native address1 is unstructured. Only accept an unambiguous trailing
    // street number; don't silently turn an arbitrary final word into the number.
    const match = input.match(/^(.+?)(?:,\s*|\s+)(\d+[a-zA-Z]?(?:\s*[-/]\s*[\w]+)?)\s*$/);
    if (!match || !match[1].trim())
        throw new Error('Não foi possível separar rua e número do endereço Shopify address1');
    return { street: match[1].trim().replace(/,$/, ''), number: match[2].trim() };
}

export function normalizeBrazilPhone(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Telefone ausente no endereço Shopify: ${field}`);
    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
    if (digits.length !== 10 && digits.length !== 11)
        throw new Error(`Telefone inválido no endereço Shopify: ${field}`);
    return digits;
}

export interface MappedShopifyAddress {
    name: string;
    phone?: string;
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    zipcode: string;
    state: string;
    country: string;
}

function recipientName(address: Address, order: ShopifyOrder, purpose: AddressPurpose): string {
    return required(address.name || [address.first_name, address.last_name].filter(Boolean).join(' ')
        || [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' '), `${purpose}_name`);
}

function mapAddress(order: ShopifyOrder, purpose: AddressPurpose, address: Address | null | undefined, requirePhone: boolean): MappedShopifyAddress {
    if (!address) throw new Error(`Endereço ${purpose} ausente no pedido Shopify`);
    const explicitStreet = noteAttribute(order, `${purpose}_street_name`);
    const explicitNumber = noteAttribute(order, `${purpose}_street_number`);
    const nativeStreet = explicitStreet && explicitNumber
        ? { street: '', number: '' }
        : splitNativeStreet(address.address1 || '');
    const phone = address.phone?.trim() ? normalizeBrazilPhone(address.phone, `${purpose}_phone`) : undefined;
    if (requirePhone && !phone) throw new Error(`Telefone ausente no endereço Shopify: ${purpose}_phone`);
    const mapped: MappedShopifyAddress = {
        name: recipientName(address, order, purpose),
        phone,
        street: required(explicitStreet || nativeStreet.street, `${purpose}_street_name`),
        number: required(explicitNumber || nativeStreet.number, `${purpose}_street_number`),
        complement: noteAttribute(order, `${purpose}_street_complement`) || address.address2?.trim() || '',
        neighborhood: required(noteAttribute(order, `${purpose}_neighborhood`), `${purpose}_neighborhood`),
        city: required(address.city, `${purpose}_city`),
        zipcode: required(address.zip, `${purpose}_zip`),
        state: required(address.province_code, `${purpose}_province_code`).toUpperCase(),
        country: required(address.country_code, `${purpose}_country_code`).toUpperCase(),
    };
    if (!/^[A-Z]{2}$/.test(mapped.state)) throw new Error(`UF inválida no endereço Shopify: ${purpose}_province_code`);
    return mapped;
}

export function mapShopifyShippingAddress(order: ShopifyOrder): MappedShopifyAddress {
    return mapAddress(order, 'shipping', order.shipping_address, true);
}

export function mapShopifyBillingAddress(order: ShopifyOrder): MappedShopifyAddress {
    return mapAddress(order, 'billing', order.billing_address, false);
}
