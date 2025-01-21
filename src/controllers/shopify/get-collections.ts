import { getCollections } from "../../services/shopify.service";

export const getCollectionsEndpoint = async (_, res) => {
    const collections = await getCollections();
    res.send(collections);
}