import express from 'express'
import { createDimonaOrders } from './controllers/create-dimona-orders';
import { orderPaidEndpoint } from './controllers/order-paid';
import { addTracking, getShopifyOrder } from './services/shopify.service';

require('dotenv').config()

// import { orderExample } from './ignore/order.example';
// const result = orderExample

const port = process.env.PORT || '8080';
const app = express()

app.use(express.json())

app.get('/', (_, res) => {
  res.send('🚀 This is the AI Spirit API')
})

// Endpoint triggered on Shopify order payment webhook
app.post(`/order-paid`, orderPaidEndpoint)

// Get all Shopify paid orders and create Dimona orders if it wasn't created yet
app.get('/create-dimona-orders', createDimonaOrders)

app.get('/shopify-order', getShopifyOrder)

app.post('/add-tracking', async (req, res) => {
  const orderId = req.body.orderId as number;
  const dimonaOrderId = req.body.dimonaOrderId as string;

  const result = await addTracking(orderId, dimonaOrderId);
  res.json({ trackingUrl: result.tracking_url })
})

app.listen(port, () =>
  console.log(`🚀 Server ready at: http://localhost:${port}`),
)

export default app;