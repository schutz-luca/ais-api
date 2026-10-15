export const CANONICAL_BLING_API_BASE = 'https://api.bling.com.br/Api/v3';

export function getBlingApiBase(): string {
    const configured = process.env.BLING_API_BASE?.replace(/\/$/, '');
    if (configured !== CANONICAL_BLING_API_BASE)
        throw new Error(`BLING_API_BASE deve ser configurada como ${CANONICAL_BLING_API_BASE}`);
    return configured;
}
