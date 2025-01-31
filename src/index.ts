import express from 'express'
import cors from 'cors'
import { createDimonaOrdersEndpoint } from './controllers/create-dimona-orders';
import { orderPaidEndpoint } from './controllers/order-paid';
import { addTracking, findShopifyOrder, getShopifyOrder } from './services/shopify.service';
import { addNFe } from './services/bling.service';
import { getCollectionsEndpoint } from './controllers/shopify/get-collections';
import { uploadFileEndpoint } from './controllers/drive/upload-file';
import { insertProductEndpoint } from './controllers/insert-product';
const multer = require("multer");

require('dotenv').config()

// import { orderExample } from './ignore/order.example';
// const result = orderExample

const port = process.env.PORT || '8080';
const app = express()
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json())

app.use(cors())

app.get('/', (_, res) => {
  res.send('🚀 This is the AI Spirit API')
})

// Endpoint triggered on Shopify order payment webhook
app.post(`/order-paid`, orderPaidEndpoint)

// Get all Shopify paid orders and create Dimona orders if it wasn't created yet
app.get('/create-dimona-orders', createDimonaOrdersEndpoint)

app.get('/shopify-order', getShopifyOrder)

app.get('/collections', getCollectionsEndpoint)

app.post('/upload-file', upload.single("file"), uploadFileEndpoint)

app.post('/insert-product', upload.fields([
  { name: 'designFront' },
  { name: 'designBack' }
]), insertProductEndpoint);

app.post('/add-tracking', async (req, res) => {
  const orderId = req.body.orderId as number;
  const dimonaOrderId = req.body.dimonaOrderId as string;

  const result = await addTracking(orderId, dimonaOrderId);
  res.json({ trackingStatus: result })
})

app.post('/add-nfe', async (req, res) => {
  const orderId = req.body.orderId as number;
  const dimonaOrderId = req.body.dimonaOrderId as string;

  const order = await findShopifyOrder(orderId);
  const nfeStatus = await addNFe(order, dimonaOrderId)

  res.json({ nfeStatus })
})

app.listen(port, () =>
  console.log(`🚀 Server ready at: http://localhost:${port}`),
)

export default app;