export const getFrontMockupQuery = (productId) => `
            query {
        product(id:"gid://shopify/Product/${productId}") {
        title
        media(first:100) {
        edges {
        node {
          ... fieldsForMediaTypes
        }
        }
        }
        }
        }
        fragment fieldsForMediaTypes on Media {
        alt
        mediaContentType
        preview {
        image {
        id
        altText
        url
        }
        }
        status
        ... on Video {
        id
        sources {
        format
        height
        mimeType
        url
        width
        }
        originalSource {
        format
        height
        mimeType
        url
        width
        }
        }
        ... on ExternalVideo {
        id
        host
        embeddedUrl
        }
        ... on Model3d {
        sources {
        format
        mimeType
        url
        }
        originalSource {
        format
        mimeType
        url
        }
        }
        ... on MediaImage {
        id
        image {
        altText
        url
        }
        }
        }
    `