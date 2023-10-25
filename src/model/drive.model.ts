export interface DriveFile {
    kind: string;
    fileExtension: string;
    copyRequiresWriterPermission: boolean;
    md5Checksum: string;
    writersCanShare: boolean;
    viewedByMe: boolean;
    mimeType: string;
    parents: string[];
    thumbnailLink: string;
    iconLink: string;
    shared: boolean;
    lastModifyingUser: LastModifyingUser;
    owners: LastModifyingUser[];
    headRevisionId: string;
    webViewLink: string;
    webContentLink: string;
    size: string;
    viewersCanCopyContent: boolean;
    permissions: Permission[];
    hasThumbnail: boolean;
    spaces: string[];
    id: string;
    name: string;
    starred: boolean;
    trashed: boolean;
    explicitlyTrashed: boolean;
    createdTime: Date;
    modifiedTime: Date;
    modifiedByMeTime: Date;
    viewedByMeTime: Date;
    quotaBytesUsed: string;
    version: string;
    originalFilename: string;
    ownedByMe: boolean;
    fullFileExtension: string;
    isAppAuthorized: boolean;
    capabilities: { [key: string]: boolean };
    thumbnailVersion: string;
    modifiedByMe: boolean;
    permissionIds: string[];
    imageMediaMetadata: ImageMediaMetadata;
    linkShareMetadata: LinkShareMetadata;
    sha1Checksum: string;
    sha256Checksum: string;
}

export interface ImageMediaMetadata {
    width: number;
    height: number;
    rotation: number;
}

export interface LastModifyingUser {
    displayName: string;
    kind: string;
    me: boolean;
    permissionId: string;
    emailAddress: string;
    photoLink: string;
}

export interface LinkShareMetadata {
    securityUpdateEligible: boolean;
    securityUpdateEnabled: boolean;
}

export interface Permission {
    id: string;
    displayName: string;
    type: string;
    kind: string;
    photoLink: string;
    emailAddress: string;
    role: string;
    deleted: boolean;
    pendingOwner: boolean;
}