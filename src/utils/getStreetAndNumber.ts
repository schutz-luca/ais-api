/**
 * @param address Shopify address
 * @returns an object with `number` and `street`
 */
export const getStreetAndNumber = (address: string) => {
    const fields = [];
    const addressArray = address.split(' ');
    addressArray.forEach(item => {
        const field = item.replace(/(,)/g, ' ').trim().replace(/(-)/g, ' ').trim();
        if (field)
            fields.push(field);
    })
    const number = fields.pop();
    const street = fields.join(' ');
    return {
        number,
        street
    }
}