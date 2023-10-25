import { FilesLinks } from "../model/dimona.model";
import { DriveFile } from "../model/drive.model";

const fs = require('fs').promises;
const path = require('path');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = [
    'https://www.googleapis.com/auth/docs',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/drive.metadata',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.scripts',
    'https://www.googleapis.com/auth/analytics'
];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
    try {
        const content = await fs.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client: any) {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
}

async function authorize() {
    let client = await loadSavedCredentialsIfExist();
    if (client) {
        return client;
    }
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
        await saveCredentials(client);
    }
    return client;
}

function handleImageLinks(fileName: string, file: DriveFile, fileLinks: FilesLinks) {
    let fileWebLink = file.webContentLink;

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

    const res = await drive.files.list({
        q: `name contains '${sku}' and name contains '${color}'`,
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

    return fileLinks
}