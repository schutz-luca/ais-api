const { imageSize } = require('image-size');

export async function getImageDimensions(file) {
    try {
        const dimensions = imageSize(file);
        return { width: dimensions.width, height: dimensions.height }
    } catch (error) {
        console.log('Error on getImageDimensions:', error);
    }
}