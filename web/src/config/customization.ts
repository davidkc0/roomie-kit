import { roomieCustomization } from '../generated/roomie-customization.generated';
import { resolveAssetUrl } from './r2';

export type RoomieThemeTemplate = 'roomie-neon' | 'stream-dark' | 'startup-blue' | 'creator-pink' | 'minimal-dark';

type ColorToken =
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'bgBase'
    | 'bgSurface'
    | 'bgElevated'
    | 'border'
    | 'borderSubtle'
    | 'textPrimary'
    | 'textSecondary'
    | 'textTertiary'
    | 'textDisabled'
    | 'success'
    | 'warning'
    | 'error'
    | 'info';

type ThemeColors = Record<ColorToken, string>;

type BrandAssetAlias =
    | 'logo'
    | 'logoWordmark'
    | 'favicon'
    | 'appIcon'
    | 'coinIcon'
    | 'chessLogo'
    | 'snakeLogo'
    | 'hexArenaLogo'
    | 'lobbyCards.lounge'
    | 'lobbyCards.theater'
    | 'lobbyCards.hexArena';

export const themeTemplates: Record<RoomieThemeTemplate, ThemeColors> = {
    'roomie-neon': {
        primary: '#7B2FFF',
        secondary: '#00C9FF',
        accent: '#FF2E9F',
        bgBase: '#13141C',
        bgSurface: '#1C1D27',
        bgElevated: '#252631',
        border: '#363742',
        borderSubtle: '#2A2B36',
        textPrimary: '#FFFFFF',
        textSecondary: '#B8B8C8',
        textTertiary: '#78788C',
        textDisabled: '#4E4E5C',
        success: '#00FF9C',
        warning: '#FFB800',
        error: '#FF3D5C',
        info: '#00A8E8',
    },
    'stream-dark': {
        primary: '#14F195',
        secondary: '#00B8D9',
        accent: '#F43F5E',
        bgBase: '#080A0F',
        bgSurface: '#10141C',
        bgElevated: '#171C26',
        border: '#2A3241',
        borderSubtle: '#1F2632',
        textPrimary: '#F8FAFC',
        textSecondary: '#CBD5E1',
        textTertiary: '#94A3B8',
        textDisabled: '#475569',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#38BDF8',
    },
    'startup-blue': {
        primary: '#2563EB',
        secondary: '#06B6D4',
        accent: '#8B5CF6',
        bgBase: '#0B1020',
        bgSurface: '#111827',
        bgElevated: '#172033',
        border: '#334155',
        borderSubtle: '#243044',
        textPrimary: '#FFFFFF',
        textSecondary: '#CBD5E1',
        textTertiary: '#94A3B8',
        textDisabled: '#64748B',
        success: '#10B981',
        warning: '#F59E0B',
        error: '#F43F5E',
        info: '#0EA5E9',
    },
    'creator-pink': {
        primary: '#EC4899',
        secondary: '#A855F7',
        accent: '#F97316',
        bgBase: '#160B18',
        bgSurface: '#231226',
        bgElevated: '#301833',
        border: '#4A244F',
        borderSubtle: '#3A1C3E',
        textPrimary: '#FFF7FB',
        textSecondary: '#F0CFE1',
        textTertiary: '#C690B0',
        textDisabled: '#7C4B65',
        success: '#34D399',
        warning: '#FDBA74',
        error: '#FB7185',
        info: '#67E8F9',
    },
    'minimal-dark': {
        primary: '#F8FAFC',
        secondary: '#94A3B8',
        accent: '#22D3EE',
        bgBase: '#09090B',
        bgSurface: '#18181B',
        bgElevated: '#27272A',
        border: '#3F3F46',
        borderSubtle: '#2D2D32',
        textPrimary: '#FAFAFA',
        textSecondary: '#D4D4D8',
        textTertiary: '#A1A1AA',
        textDisabled: '#52525B',
        success: '#22C55E',
        warning: '#EAB308',
        error: '#EF4444',
        info: '#38BDF8',
    },
};

const defaultBrandAssetKeys: Record<BrandAssetAlias, string> = {
    logo: 'branding/logo.svg',
    logoWordmark: 'branding/logo-wordmark.svg',
    favicon: 'branding/favicon.svg',
    appIcon: 'branding/app-icon.png',
    coinIcon: 'branding/icons/coin.png',
    chessLogo: 'branding/icons/chess-logo.png',
    snakeLogo: 'branding/icons/snake-logo.png',
    hexArenaLogo: 'branding/icons/hex-arena-logo.png',
    'lobbyCards.lounge': 'branding/cards/lounge.png',
    'lobbyCards.theater': 'branding/cards/theater.png',
    'lobbyCards.hexArena': 'branding/cards/hex-arena.jpg',
};

const cssVariableNames: Record<ColorToken, string> = {
    primary: 'primary',
    secondary: 'secondary',
    accent: 'accent',
    bgBase: 'bg-base',
    bgSurface: 'bg-surface',
    bgElevated: 'bg-elevated',
    border: 'border',
    borderSubtle: 'border-subtle',
    textPrimary: 'text-primary',
    textSecondary: 'text-secondary',
    textTertiary: 'text-tertiary',
    textDisabled: 'text-disabled',
    success: 'success',
    warning: 'warning',
    error: 'error',
    info: 'info',
};

export const roomieAppName = roomieCustomization.appName || 'Roomie';

export const brandAssetUrls = {
    logo: getBrandAssetUrl('logo', '/assets/roomie_kit_logo.png'),
    logoWordmark: getBrandAssetUrl('logoWordmark', '/logo_with_wordmark.svg'),
    favicon: getBrandAssetUrl('favicon', '/vite.svg'),
    appIcon: getBrandAssetUrl('appIcon', '/assets/roomie_kit_logo.png'),
    coinIcon: getBrandAssetUrl('coinIcon', '/coin.png'),
    chessLogo: getBrandAssetUrl('chessLogo', '/chess_logo.png'),
    snakeLogo: getBrandAssetUrl('snakeLogo', '/snake_logo.png'),
    hexArenaLogo: getBrandAssetUrl('hexArenaLogo', '/hex_arena_logo.png'),
} as const;

export function applyRoomieTheme(): void {
    if (typeof document === 'undefined') return;

    const templateName = isThemeTemplate(roomieCustomization.themeTemplate)
        ? roomieCustomization.themeTemplate
        : 'roomie-neon';
    const colors = {
        ...themeTemplates[templateName],
        ...roomieCustomization.colors,
    };
    const root = document.documentElement;

    for (const [token, value] of Object.entries(colors) as Array<[ColorToken, string]>) {
        const rgb = hexToRgb(value);
        if (!rgb) continue;
        root.style.setProperty(`--color-${cssVariableNames[token]}`, rgb.space);
        root.style.setProperty(`--${cssVariableNames[token]}`, `rgb(${rgb.space})`);
    }

    root.style.setProperty('--brand-primary-rgb', hexToRgb(colors.primary)?.comma || '123, 47, 255');
    root.style.setProperty('--color-brand-accent', `rgb(${hexToRgb(colors.accent)?.space || '255 46 159'})`);
    root.style.setProperty('--status-online', `rgb(${hexToRgb(colors.success)?.space || '0 255 156'})`);
    root.style.setProperty('--status-away', `rgb(${hexToRgb(colors.warning)?.space || '255 184 0'})`);
    root.style.setProperty('--status-busy', `rgb(${hexToRgb(colors.error)?.space || '255 61 92'})`);
    root.style.setProperty('--status-offline', `rgb(${hexToRgb(colors.textDisabled)?.space || '78 78 92'})`);
    root.style.setProperty('--gradient-icon', `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`);
    root.style.setProperty('--gradient-header', `linear-gradient(180deg, ${colors.primary} 0%, ${colors.secondary} 100%)`);
    root.style.setProperty('--gradient-card', `linear-gradient(135deg, ${hexToRgba(colors.primary, 0.1)} 0%, ${hexToRgba(colors.secondary, 0.1)} 100%)`);

    const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (favicon) {
        favicon.href = brandAssetUrls.favicon;
    }
}

export function getBrandAssetUrl(alias: BrandAssetAlias, fallbackUrl: string): string {
    const configuredKey = getConfiguredBrandAssetKey(alias);
    const defaultKey = defaultBrandAssetKeys[alias];
    if (configuredKey) {
        if (configuredKey.startsWith('/') || /^https?:\/\//i.test(configuredKey)) {
            return configuredKey;
        }
        const configuredLocalOverride = getLocalAssetUrl(configuredKey);
        if (configuredLocalOverride) {
            return configuredLocalOverride;
        }
        return resolveAssetUrl(configuredKey);
    }

    const localOverride = getLocalAssetUrl(defaultKey);
    return localOverride || fallbackUrl;
}

export function getLobbyCardUrl(card: 'lounge' | 'theater' | 'hexArena', fallbackUrl: string): string {
    return getBrandAssetUrl(`lobbyCards.${card}`, fallbackUrl);
}

export function getLocalAssetUrl(key: string): string | null {
    const normalizedKey = normalizeAssetKey(key);
    const localAssets = roomieCustomization.localAssets as Record<string, string>;
    return localAssets[normalizedKey] || null;
}

export function normalizeAssetKey(value: string): string {
    return value.trim().replace(/^\/+/, '').replace(/^roomie-local\//, '');
}

function getConfiguredBrandAssetKey(alias: BrandAssetAlias): string | null {
    const assets = roomieCustomization.assets as Record<string, unknown>;
    const segments = alias.split('.');
    let current: unknown = assets;

    for (const segment of segments) {
        if (!current || typeof current !== 'object' || !(segment in current)) {
            return null;
        }
        current = (current as Record<string, unknown>)[segment];
    }

    return typeof current === 'string' && current.trim() ? current.trim() : null;
}

function isThemeTemplate(value: string): value is RoomieThemeTemplate {
    return value in themeTemplates;
}

function hexToRgb(value: string): { space: string; comma: string } | null {
    const normalized = value.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    return {
        space: `${red} ${green} ${blue}`,
        comma: `${red}, ${green}, ${blue}`,
    };
}

function hexToRgba(value: string, alpha: number): string {
    const rgb = hexToRgb(value);
    return rgb ? `rgba(${rgb.comma}, ${alpha})` : `rgba(123, 47, 255, ${alpha})`;
}
