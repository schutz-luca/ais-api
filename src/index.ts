import express from 'express'
import { orderPaidEndpoint } from './controllers/order-paid';

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

app.listen(port, () =>
  console.log(`🚀 Server ready at: http://localhost:${port}`),
)

export default app;