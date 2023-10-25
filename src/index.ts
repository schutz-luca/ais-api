import express from 'express'
import Shopify from 'shopify-api-node';
import { DimonaOrderCreation, DimonaOrderItem } from './model/dimona.model';
import { ShopifyOrder } from './model/shopify.model';
import { getFilesIdByItem } from './services/drive.service';

// import { orderExample } from './examples/order.example';

const port = process.env.PORT;
const app = express()

app.use(express.json())
const shopify = new Shopify({
  shopName: 'aispirit.myshopify.com',
  accessToken: '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'
});


app.post(`/order-paid`, async (req, res) => {
  const result: ShopifyOrder = req.body

  // Use orderExample to simulate Shopify webhook trigger
  // const result = orderExample

  const items: DimonaOrderItem[] = await Promise.all(result.line_items.map(async (product) => {
    const variant = await shopify.productVariant.get(product.variant_id);

    console.log('')
    const filesLinks = await getFilesIdByItem(product.sku, variant?.option2);

    return {
      sku: variant.sku,
      dimona_sku_id: '10524110108',
      name: product.name,
      qty: product.fulfillable_quantity,
      ...filesLinks
    } as DimonaOrderItem
  }))


  const street = result.shipping_address.address1.split(',')[0].trim();
  const number = result.shipping_address.address1.split(',')[1].trim();

  const dimonaOrder: DimonaOrderCreation = {
    order_id: `${result.id}`,
    customer_name: [result.customer.first_name, result.customer.last_name].join(' '),
    customer_email: result.customer.email,
    customer_document: result.billing_address.company,
    address: {
      city: result.shipping_address.city,
      zipcode: result.shipping_address.zip,
      state: result.shipping_address.province,
      neightborhood: result.shipping_address.address2,
      street,
      number
    },
    items
  }

  console.log('💙 Sending Dimona order:', dimonaOrder);

  const dimonaResult = await fetch('https://camisadimona.com.br/api/v2/order', {
    method: 'POST',
    headers: {
      'api-key': '0c1189802e7145d9ac3ddae2dc357b19',
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dimonaOrder)
  })

  res.json(await dimonaResult.json())
})

app.listen(port, () =>
  console.log(`🚀 Server ready at: http://localhost:${port}`),
)