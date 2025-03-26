import { File } from "buffer";

export const extractFormDataTexts = (formData: FormData) => {
    const fields = {}; // Object to store text fields dynamically

    for (const [key, value] of formData.entries()) {
        if (!(value instanceof File)) fields[key] = value; // Store text fields dynamically
    }

    return fields;
}