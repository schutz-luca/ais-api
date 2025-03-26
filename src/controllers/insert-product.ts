import { uploadDesigns } from "../services/drive.service";
import { createPrintfulMockups } from "../services/printful.service";
import { createProduct } from "../services/shopify.service";

export const insertProductEndpoint = async (req, res) => {
    // Build product object
    const product = {
        ...req.body,
        draft: !!req.body.draft,
        designFront: req.files.designFront?.[0],
        designBack: req.files.designBack?.[0],
    };
    
    // Upload designs to Drive
    const designUrls = await uploadDesigns(product.sku, product.designFront, product.designBack);

    // Create mockups on Printful
    const mockups = await createPrintfulMockups(product, designUrls);

    // Create product on Shopify
    const response = await createProduct(product, mockups);

    res.send(response);
}