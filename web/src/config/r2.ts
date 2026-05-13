import { appConfig } from './app';
import { roomieCustomization } from '../generated/roomie-customization.generated';

// Local, Cloudflare R2, or CDN asset hosting configuration.

/**
 * Base URL for Roomie assets. Defaults to web/public via VITE_ASSET_BASE_URL=/.
 * VITE_R2_BASE_URL is still supported for existing deployments.
 */
export const R2_BASE_URL = appConfig.assetBaseUrl;

/**
 * Asset path helpers
 */
export const R2_PATHS = {
    animations: `${R2_BASE_URL}/animations`,
    assets: `${R2_BASE_URL}/assets`,
    emotes: `${R2_BASE_URL}/emotes`,
    furniture: `${R2_BASE_URL}/furniture`,
    rooms: `${R2_BASE_URL}/rooms`,
    floor: `${R2_BASE_URL}/floor`,
    sfx: `${R2_BASE_URL}/sfx`,
    wall: `${R2_BASE_URL}/wall`,
    avatars: `${R2_BASE_URL}/avatars`,
} as const;

type AssetCategory = keyof typeof R2_PATHS;

const ASSET_PATH_MARKERS = ['/roomme-assets/', '/roomie-assets/'];
const ASSET_ROOTS = new Set([
    'animations',
    'assets',
    'avatars',
    'emotes',
    'furniture',
    'rooms',
    'floor',
    'sfx',
    'wall',
    'mediapipe',
    'roomie-local',
]);
const localAssets = roomieCustomization.localAssets as Record<string, string>;

function normalizeRelativeAssetPath(path: string): string {
    const cleanPath = path.trim().replace(/^\/+/, '');
    const filename = cleanPath.split('/').pop() || cleanPath;

    if (filename.startsWith('thumb_') && !cleanPath.includes('/')) {
        return `avatars/thumbnails/${filename}`;
    }

    return cleanPath;
}

function localOverrideForPath(path: string): string | null {
    const cleanPath = normalizeRelativeAssetPath(path);
    return localAssets[cleanPath] || null;
}

function joinAssetPath(path: string): string {
    const cleanPath = normalizeRelativeAssetPath(path);
    const localOverride = localOverrideForPath(cleanPath);
    if (localOverride) return localOverride;
    return `${R2_BASE_URL}/${cleanPath}`;
}

function pathStartsWithAssetRoot(path: string): boolean {
    const firstSegment = normalizeRelativeAssetPath(path).split('/')[0];
    return ASSET_ROOTS.has(firstSegment);
}

function pathWithCategory(path: string, category?: AssetCategory): string {
    const cleanPath = normalizeRelativeAssetPath(path);
    if (!category || pathStartsWithAssetRoot(cleanPath)) return cleanPath;
    return `${category}/${cleanPath}`;
}

/**
 * Normalize local filenames, starter placeholder URLs, and old private R2 S3 URLs
 * into the currently configured public asset base.
 */
export function resolveAssetUrl(value: string | null | undefined, category?: AssetCategory): string {
    const raw = String(value || '').trim();
    if (!raw) return category ? R2_PATHS[category] : R2_BASE_URL;

    try {
        const parsed = new URL(raw);
        const marker = ASSET_PATH_MARKERS.find((candidate) => parsed.pathname.includes(candidate));
        if (marker) {
            const [, suffix = ''] = parsed.pathname.split(marker);
            return `${joinAssetPath(suffix)}${parsed.search}${parsed.hash}`;
        }
        return raw;
    } catch {
        // Not an absolute URL; fall through to local/CDN asset handling.
    }

    if (raw.startsWith('/roomie-local/')) return raw;
    if (raw.startsWith('/')) return joinAssetPath(pathWithCategory(raw, category));
    return joinAssetPath(pathWithCategory(raw, category));
}

/**
 * Get a full URL/path for an asset.
 */
export function getR2AssetUrl(category: keyof typeof R2_PATHS, filename: string): string {
    return resolveAssetUrl(filename, category);
}

export const DEFAULT_PROFILE_IMAGE_URL = resolveAssetUrl(
    'avatars/Head/head_male_skinTone1_hairColor1_hairstyle1.jpg'
);
