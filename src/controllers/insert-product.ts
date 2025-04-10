import { insertProduct } from "../services/shopify.service";

export const insertProductEndpoint = async (req, res) => {
    // Build product object
    const product = {
        ...req.body,
        draft: !!req.body.draft,
        designFrontMale: req.files.designFrontMale?.[0],
        designBackMale: req.files.designBackMale?.[0],
        designFrontFemale: req.files.designFrontFemale?.[0],
        designBackFemale: req.files.designBackFemale?.[0],
    };

    console.log('Product:', product);

    // Create product on Shopify
    const response = await insertProduct(product)

    res.send(response);
}