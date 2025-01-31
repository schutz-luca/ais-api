import { uploadDesigns } from "../services/drive.service";

export const insertProductEndpoint = async (req, res) => {
    const product = { ...req.body, designFront: req.files.designFront?.[0], designBack: req.files.designBack?.[0] };
    const designUrls = await uploadDesigns(product.sku, product.designFront, product.designBack);
    res.send(designUrls);
}