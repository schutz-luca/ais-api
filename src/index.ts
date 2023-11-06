import express from 'express'
import Shopify from 'shopify-api-node';
import { DimonaOrderCreation, DimonaOrderItem } from './model/dimona.model';
import { ShopifyOrder } from './model/shopify.model';
import { correlateProduct } from './services/dimona.service';
import { getFilesIdByItem } from './services/drive.service';

require('dotenv').config()

// Use orderExample to simulate Shopify webhook trigger
// import { orderExample } from './examples/order.example';
// const result = orderExample

const port = process.env.PORT || '8080';
const app = express()

app.use(express.json())
const shopify = new Shopify({
  shopName: 'store.myshopify.com',
  accessToken: 'access_token'
});

app.post(`/order-paid`, async (req, res) => {
  try {
    const result: ShopifyOrder = req.body

    // Get Shopify order items
    const items: DimonaOrderItem[] = await Promise.all(result.line_items.map(async (product) => {
      const variant = await shopify.productVariant.get(product.variant_id);

      // Get mock and design files using product SKU and variant COLOR
      const filesLinks = await getFilesIdByItem(product.sku, variant?.option2);

      // Get Dimona product using variants data
      const dimonaSkuId = await correlateProduct(variant.option1, variant.sku, variant.option3, variant.option2)

      return {
        sku: variant.sku,
        dimona_sku_id: dimonaSkuId,
        name: product.name,
        qty: product.fulfillable_quantity,
        ...filesLinks
      } as DimonaOrderItem
    }))
    console.log(result)

    // Normalize address from Shopify format to Dimona format
    const street = result.shipping_address.address1.split(',')[0]?.trim();
    const number = result.shipping_address.address1.split(',')[1]?.trim();

    // Create Dimona order object
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

    console.log('💙 Sending Dimona Order...', dimonaOrder);

    const dimonaResult = await fetch('https://camisadimona.com.br/api/v2/order', {
      method: 'POST',
      headers: {
        'api-key': 'api_key',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(dimonaOrder)
    })

    console.log('💙 Dimona Order creation response:', dimonaResult.status);

    res.json(await dimonaResult.json())
  }
  catch (error: any) {
    console.log(error);
    res
      .status(error?.status || 500)
      .send(error?.message)
  }
})

app.listen(port, () =>
  console.log(`🚀 Server ready at: http://localhost:${port}`),
)