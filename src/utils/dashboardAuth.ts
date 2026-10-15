import { createHmac, timingSafeEqual } from 'crypto';

export const DASHBOARD_COOKIE_NAME = 'ais_dashboard_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 12;

function getDashboardPassword(): string | undefined {
    const password = process.env.DASHBOARD_PASSWORD?.trim();
    return password || undefined;
}

function getSigningKey(): string | undefined {
    // The password is required to be randomly generated and stored only server-side.
    return getDashboardPassword();
}

function signature(payload: string, key: string): string {
    return createHmac('sha256', key).update(payload).digest('base64url');
}

export function isDashboardPasswordConfigured(): boolean {
    return Boolean(getDashboardPassword());
}

export function verifyDashboardPassword(input: unknown): boolean {
    const expected = getDashboardPassword();
    if (!expected || typeof input !== 'string') return false;

    const actualBuffer = Buffer.from(input);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createDashboardSession(): string | undefined {
    const key = getSigningKey();
    if (!key) return undefined;

    const payload = Buffer.from(JSON.stringify({
        expiresAt: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
    })).toString('base64url');

    return `${payload}.${signature(payload, key)}`;
}

export function isDashboardSessionValid(cookieHeader?: string): boolean {
    const token = cookieHeader
        ?.split(';')
        .map(cookie => cookie.trim())
        .find(cookie => cookie.startsWith(`${DASHBOARD_COOKIE_NAME}=`))
        ?.slice(DASHBOARD_COOKIE_NAME.length + 1);
    const key = getSigningKey();
    if (!token || !key) return false;

    const [payload, suppliedSignature] = token.split('.');
    if (!payload || !suppliedSignature) return false;

    const expectedSignature = signature(payload, key);
    const suppliedBuffer = Buffer.from(suppliedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return false;

    try {
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return Number.isFinite(decoded.expiresAt) && decoded.expiresAt > Math.floor(Date.now() / 1000);
    } catch {
        return false;
    }
}

export function dashboardCookieOptions(): string {
    const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.WEBSITE_INSTANCE_ID);
    const sameSite = secure ? 'None' : 'Lax';
    return `Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${SESSION_DURATION_SECONDS}${secure ? '; Secure' : ''}`;
}

export function clearDashboardCookieOptions(): string {
    const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.WEBSITE_INSTANCE_ID);
    const sameSite = secure ? 'None' : 'Lax';
    return `Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function dashboardCorsHeaders(origin?: string): Record<string, string> {
    const allowedOrigins = getDashboardOrigins();
    const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Vary': 'Origin',
    };
}

function getDashboardOrigins(): string[] {
    return (process.env.DASHBOARD_ORIGIN || 'http://localhost:5173')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
}

export function isDashboardOriginAllowed(origin?: string | null): boolean {
    return Boolean(origin && getDashboardOrigins().includes(origin));
}
