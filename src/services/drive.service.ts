import { FilesLinks } from "../model/dimona.model";
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
const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'google-service-account.json');

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

function handleImageLinks(fileName: string, file: DriveFile, fileLinks: FilesLinks) {
    let fileWebLink = file.webContentLink;

    if (!fileLinks.designs || !fileLinks.mocks)
        return

    if (fileName.includes('df') || fileName.includes('design'))
        fileLinks.designs[0] = fileWebLink
    else if (fileName.includes('db'))
        fileLinks.designs[1] = fileWebLink
    else if (fileName.includes('mf') || fileName.includes('mock'))
        fileLinks.mocks[0] = fileWebLink
    else if (fileName.includes('mb'))
        fileLinks.mocks[1] = fileWebLink
}


export async function getFilesIdByItem(sku: string, color: string | null | undefined) {
    const authClient = await authorize();
    const authConfig = { version: 'v3', auth: authClient }

    const drive = google.drive(authConfig);

    let fileLinks: FilesLinks = { designs: [], mocks: [] };

    // If color is null, send empty images array to backoffice admin insert them manually
    if (!color)
        return fileLinks

    // Remove variant field from SKU
    const handledSku = sku.split('-').slice(0, -1).join('-');
    
    const res = await drive.files.list({
        q: `name contains '${handledSku}' and name contains '${color}'`,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        fields: 'files(*)',
    });
    const files: any[] = res.data.files;

    await Promise.all(files.map(async (file: any) => {
        const fileName = (file.name as string).toLowerCase();

        // Add anyone viewer permission 
        if (!file.shared)
            await drive.permissions.create({
                fileId: file.id,
                resource: { 'type': 'anyone', 'role': 'reader' },
                sendNotificationEmail: false,
                supportsAllDrives: true
            })

        handleImageLinks(fileName, file, fileLinks)

    }))

    // Delete images if they don't exist, forcing to add images manually
    if (fileLinks.designs?.length === 0) delete fileLinks.designs
    if (fileLinks.mocks?.length === 0) delete fileLinks.mocks

    return fileLinks
}