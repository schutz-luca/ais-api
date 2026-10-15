import { ShopifyOrder } from '../model/shopify.model';

function isValidCpf(value: string): boolean {
    if (/^(\d)\1{10}$/.test(value)) return false;
    const digits = value.split('').map(Number);
    const first = digits.slice(0, 9).reduce((sum, digit, index) => sum + digit * (10 - index), 0);
    const firstCheck = (first * 10) % 11 % 10;
    const second = digits.slice(0, 10).reduce((sum, digit, index) => sum + digit * (11 - index), 0);
    const secondCheck = (second * 10) % 11 % 10;
    return digits[9] === firstCheck && digits[10] === secondCheck;
}

function isValidCnpj(value: string): boolean {
    if (/^(\d)\1{13}$/.test(value)) return false;
    const calculateDigit = (base: string, weights: number[]) => {
        const sum = base.split('').reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
        const remainder = sum % 11;
        return remainder < 2 ? 0 : 11 - remainder;
    };
    const first = calculateDigit(value.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const second = calculateDigit(value.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return value.endsWith(`${first}${second}`);
}

export function normalizeCustomerDocument(value: unknown): string {
    if (typeof value !== 'string' && typeof value !== 'number')
        throw new Error('customer_document ausente ou inválido em note_attributes');

    const digits = String(value).replace(/\D/g, '');
    const valid = digits.length === 11 ? isValidCpf(digits) : digits.length === 14 ? isValidCnpj(digits) : false;
    if (!valid) throw new Error('customer_document deve conter um CPF ou CNPJ válido em note_attributes');
    return digits;
}

export function getCustomerDocument(order: ShopifyOrder): string {
    const attributes = order.note_attributes?.filter(item => item?.name === 'customer_document') || [];
    const values = [...new Set(attributes.map(item => String(item?.value ?? '').trim()))];
    if (values.length > 1) throw new Error('Atributo Shopify duplicado e conflitante: customer_document');
    return normalizeCustomerDocument(values[0]);
}
