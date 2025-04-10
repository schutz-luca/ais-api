import { DriveFile } from "../model/drive.model";
import { retryWithBackoff } from "../utils/retryWithBackoff";

const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');
const streamifier = require('streamifier');

const SCOPES = [
    'https://www.googleapis.com/auth/docs',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/drive.metadata',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.scripts',
    'https://www.googleapis.com/auth/analytics'
];

// This file is the credentials export from Google Cloud service account
const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), '/src/ignore/google-service-account.json');

async function authorize() {
    const content = await fs.readFile(SERVICE_ACCOUNT_PATH);
    const key = JSON.parse(content);

    return new google.auth.JWT(
        key.client_email,
        null,
        key.private_key,
        SCOPES,
        null
    );
}

function handleDesignLinks(fileName: string, file: DriveFile, designs: string[]) {
    let fileWebLink = file.webContentLink;

    if (fileName.includes('df') || fileName.includes('design'))
        designs[0] = fileWebLink
    else if (fileName.includes('db'))
        designs[1] = fileWebLink
}

const getDriveSdk = async () => {
    const authClient = await authorize();
    const authConfig = { version: 'v3', auth: authClient }
    return google.drive(authConfig);
}

const allowFile = async (drive, fileId) => {
    await drive.permissions.create({
        fileId: fileId,
        resource: { 'type': 'anyone', 'role': 'reader' },
        sendNotificationEmail: false,
        supportsAllDrives: true
    })
}


export async function getDesignInDrive(sku: string) {
    const drive = await getDriveSdk();

    let designs: string[] = [];

    // Fragment the sku with parts separated per "-"
    let skuArray = sku.split('-')

    // If it has a 'P' (Plus Size) gender, replace it to 'M' to find the design into drive files
    skuArray[1].replace('P', 'M');

    // Remove variant fragment and join all parts
    const handledSku = skuArray.slice(0, -1).join('-');


    const res = await drive.files.list({
        q: `name contains '${handledSku}'`,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        fields: 'files(id,webContentLink,name)',
    });
    const files: any[] = res.data.files;

    await Promise.all(files.map(async (file: any) => {
        const fileName = (file.name as string).toLowerCase();

        // Add anyone viewer permission 
        await drive.permissions.create({
            fileId: file.id,
            resource: { 'type': 'anyone', 'role': 'reader' },
            sendNotificationEmail: false,
            supportsAllDrives: true
        })

        handleDesignLinks(fileName, file, designs)
    }))

    // Delete images if they don't exist, forcing to add images manually
    if (designs.length === 0) return undefined

    return designs
}

export const uploadFile = async (file, drive) => {
    try {
        const fileMetadata = {
            name: file.originalname,
            parents: [process.env.DRIVE_FOLDER_ID]
        };

        const payload = {
            resource: fileMetadata,
            media: {
                mimeType: file.mimetype,
                body: streamifier.createReadStream(file.buffer),
            },
            fields: 'id'
        }
        let fileUrl = '';

        const driveFile = await drive.files.create(payload);

        const fileId = driveFile.data.id;
        console.log('File uploaded successfully with ID:', fileId);

        await allowFile(drive, fileId);

        // Retrieve the file's metadata to get the web URL
        const fileData = await drive.files.get({
            fileId: fileId,
            fields: 'webViewLink, webContentLink',  // Request the URL fields
        })

        fileUrl = fileData.data.webContentLink;
        console.log('File URL:', fileUrl);
        return fileUrl
    }
    catch (error) {
        console.error('Error on upload file:', error);
    }
}

export const uploadToGoogleDrive = async (file) => {
    try {
        const drive = await getDriveSdk();
        return await retryWithBackoff(() => uploadFile(file, drive));
    }
    catch (error) {
        console.error('Error uploading to Google Drive:', error.message);
        throw { message: 'Error uploading to Google Drive: ' + error.message };
    }
}

export const uploadDesigns = async (sku, frontMale, backMale, frontFemale, backFemale) => {
    const urls: any = {};

    if (frontMale) {
        frontMale.originalname = `C-M-${sku}-DF`;
        const url = await uploadToGoogleDrive(frontMale);
        urls.designFrontMale = url;

    }
    if (backMale) {
        backMale.originalname = `C-M-${sku}-DB`;
        const url = await uploadToGoogleDrive(backMale);
        urls.designBackMale = url;
    }
    if (frontFemale) {
        frontFemale.originalname = `C-F-${sku}-DF`;
        const url = await uploadToGoogleDrive(frontFemale);
        urls.designFrontFemale = url;

    }
    if (backFemale) {
        backFemale.originalname = `C-F-${sku}-DB`;
        const url = await uploadToGoogleDrive(backFemale);
        urls.designBackFemale = url;
    }

    return urls;
}