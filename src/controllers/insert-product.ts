export const insertProductEndpoint = async (req, res) => {
    console.log({ ...req.body, file: req.file });
    res.send({});
}