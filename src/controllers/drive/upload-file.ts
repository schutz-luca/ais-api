import { uploadToGoogleDrive } from "../../services/drive.service";

export const uploadFileEndpoint = async (req, res) => {
    // const upload = multer({ storage: multer.memoryStorage() });
    const file = req.file;

    if (!file) return res.status(400).send('No file uploaded.');

    try {
        // Upload to Google Drive
        const uploadedFile = await uploadToGoogleDrive(file);
        res.status(200).send(uploadedFile);
    }
    catch (error) {
        console.log(error);
        res.status(500).send('Error uploading file to Google Drive.');
    }
}