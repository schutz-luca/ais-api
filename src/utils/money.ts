/** Parse Shopify decimal money strings without relying on binary float rounding. */
export function parseShopifyMoney(value: unknown, fieldName: string): number {
    if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value.trim()))
        throw new Error(`${fieldName} inválido: esperado valor decimal Shopify com até duas casas`);

    const [whole, fraction = ''] = value.trim().split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(cents)) throw new Error(`${fieldName} fora do limite suportado`);
    return cents / 100;
}
