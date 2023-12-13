import { DriveFile } from "../model/drive.model";

const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');

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


export async function getDesignInDrive(sku: string) {
    const authClient = await authorize();
    const authConfig = { version: 'v3', auth: authClient }

    const drive = google.drive(authConfig);

    let designs: string[] = [];

    // Remove variant field from SKU
    const handledSku = sku.split('-').slice(0, -1).join('-');

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