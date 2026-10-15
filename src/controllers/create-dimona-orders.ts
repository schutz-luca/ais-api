import { createOrdersFromShopify } from "../services/dimona.service"

export async function createDimonaOrdersEndpoint(_, res) {
    const summaries = await createOrdersFromShopify('manual')
    res.send({ summaries })
}
