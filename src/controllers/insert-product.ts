import { insertProduct } from "../services/shopify.service";

export const insertProductEndpoint = async (req, res) => {
    // Build product object
    const product = {
        ...req.body,
        draft: !!req.body.draft,
        designFront: req.files.designFront?.[0],
        designBack: req.files.designBack?.[0],
    };

    console.log('Product:', product);

    // Create product on Shopify
    const response = await insertProduct(product)

    res.send(response);
}