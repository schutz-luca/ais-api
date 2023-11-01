import csv from 'csvtojson';
import { aisProducts } from "../model/products-correlation.model";

/**
 * Correlates a Shopify product with its current Dimona product
 * @param gender 
 * @param sku 
 * @param size 
 * @param color 
 * @returns dimonaSkuId
 */
export async function correlateProduct(gender: string | null, sku: string | null, size: string | null, color: string | null) {
    if (!gender || !sku || !size || !color)
        return

    // Normalize strings to lower case and get initials
    const modelInitials = sku.toLowerCase().split('-')[0];
    const genderChar = gender.toLowerCase().charAt(0);

    // Use shopify variants data to get current AIS product
    const product = aisProducts.find(product => product.gender === genderChar && product.model === modelInitials);

    // The shopify variant has no AIS product correlated
    if (!product)
        return null

    let dimonaSkuId = '';

    // Read CSV file to get current Dimona product
    const csvFilePath = 'src/assets/dimona-products.csv';
    (await csv().fromFile(csvFilePath)).forEach(row => {
        const item = (Object.values(row)[0] as string).split(';');

        if (
            item[1] === product.product &&
            item[2] === product.style &&
            item[3] === color &&
            item[4] === size
        )
            dimonaSkuId = item[0]

    });

    return dimonaSkuId
}




