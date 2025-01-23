export const retryWithBackoff = async (fn, retries = 3, delay = 60000) => {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (error.response && [403, 429, 500, 503].includes(error.response.status)) {
                console.log(`Retrying after ${delay} ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error; // For non-quota errors, rethrow the error
            }
        }
    }
    throw new Error("Max retries reached.");
}