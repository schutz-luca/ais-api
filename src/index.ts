import express from 'express'
import { orderPaidEndpoint } from './controllers/order-paid';

require('dotenv').config()

// Use orderExample to simulate Shopify webhook trigger
// import { orderExample } from './examples/order.example';
// const result = orderExample

const port = process.env.PORT || '8080';
const app = express()

app.use(express.json())

// Endpoint triggered on Shopify order payment webhook
app.post(`/order-paid`, orderPaidEndpoint)

app.listen(port, () =>
  console.log(`🚀 Server ready at: http://localhost:${port}`),
)