import { uploadDesigns } from "../services/drive.service";
import { printfulApi } from "../services/printful.service";

export const insertProductEndpoint = async (req, res) => {
    const product = { ...req.body, designFront: req.files.designFront?.[0], designBack: req.files.designBack?.[0] };
    const designUrls = await uploadDesigns(product.sku, product.designFront, product.designBack);
    const tasks = await printfulApi.createMockups(designUrls.designFront, designUrls.designBack);
    await printfulApi.getTask(tasks.map(task => task.id), !!product.designBack);
    res.send(designUrls);
}