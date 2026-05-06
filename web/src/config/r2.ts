import { appConfig } from './app';

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
    emotes: `${R2_BASE_URL}/emotes`,
    furniture: `${R2_BASE_URL}/furniture`,
    rooms: `${R2_BASE_URL}/rooms`,
    floor: `${R2_BASE_URL}/floor`,
    wall: `${R2_BASE_URL}/wall`,
    avatars: `${R2_BASE_URL}/avatars`,
} as const;

/**
 * Get a full URL/path for an asset.
 */
export function getR2AssetUrl(category: keyof typeof R2_PATHS, filename: string): string {
    return `${R2_PATHS[category]}/${filename}`;
}
