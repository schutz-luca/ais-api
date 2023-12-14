import { createOrdersFromShopify } from "../services/dimona.service"

export async function createDimonaOrders(_, res) {
    const summaries = await createOrdersFromShopify()
    res.send({ summaries })
}