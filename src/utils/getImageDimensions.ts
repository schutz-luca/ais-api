import sharp from "sharp";

export async function getImageDimensions(filePath: string) {
    try {
        const metadata = await sharp(filePath).metadata();
        return { width: metadata.width, height: metadata.height }
    } catch (error) {
        console.log('Error on getImageDimensions:', error);
    }
}