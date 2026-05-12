import { Capacitor } from '@capacitor/core';

const env = import.meta.env;

function trimTrailingSlash(value: string): string {
    return value.trim().replace(/\/+$/, '');
}

function browserOrigin(): string {
    if (typeof window === 'undefined') return 'http://localhost:5173';
    return window.location.origin;
}

function envFlag(name: string): boolean {
    return String(env[name] || '').toLowerCase() === 'true';
}

export const appConfig = {
    appName: env.VITE_APP_NAME || 'Roomie',
    publicAppUrl: trimTrailingSlash(env.VITE_PUBLIC_APP_URL || browserOrigin()),
    deepLinkScheme: env.VITE_DEEP_LINK_SCHEME || 'roomie',
    capacitorAppId: env.VITE_CAPACITOR_APP_ID || 'app.roomie.starter',
    appleClientId: env.VITE_APPLE_CLIENT_ID || env.VITE_CAPACITOR_APP_ID || 'app.roomie.starter',
    appleRedirectUri: env.VITE_APPLE_REDIRECT_URI || `${env.VITE_SUPABASE_URL || ''}/auth/v1/callback`,
    agoraAppId: env.VITE_AGORA_APP_ID || '',
    assetBaseUrl: trimTrailingSlash(env.VITE_ASSET_BASE_URL || env.VITE_R2_BASE_URL || '/'),
    termsUrl: env.VITE_TERMS_URL || '',
    privacyUrl: env.VITE_PRIVACY_URL || '',
    supportEmail: env.VITE_SUPPORT_EMAIL || 'support@example.com',
    communityUrl: env.VITE_COMMUNITY_URL || '',
    inviteShareUrl: trimTrailingSlash(env.VITE_INVITE_SHARE_URL || env.VITE_PUBLIC_APP_URL || browserOrigin()),
    oneSignalAppId: env.VITE_ONESIGNAL_APP_ID || '',
    revenueCatIosApiKey: env.VITE_REVENUECAT_IOS_API_KEY || '',
    features: {
        waitlist: envFlag('VITE_ENABLE_WAITLIST'),
        invites: envFlag('VITE_ENABLE_INVITES'),
        economy: envFlag('VITE_ENABLE_ECONOMY'),
        gifts: envFlag('VITE_ENABLE_GIFTS'),
        dailyRewards: envFlag('VITE_ENABLE_DAILY_REWARDS'),
        push: envFlag('VITE_ENABLE_PUSH'),
        payments: envFlag('VITE_ENABLE_PAYMENTS'),
    },
} as const;

export function appUrl(path = '/'): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${appConfig.publicAppUrl}${normalizedPath}`;
}

export function deepLinkUrl(path = 'login-callback'): string {
    return `${appConfig.deepLinkScheme}://${path.replace(/^\/+/, '')}`;
}

export function authRedirectUrl(path: string): string {
    return Capacitor.isNativePlatform() ? deepLinkUrl(path) : appUrl(path);
}

export const defaultAvatarUrl = `${appConfig.assetBaseUrl}/avatars/body3.glb`;
