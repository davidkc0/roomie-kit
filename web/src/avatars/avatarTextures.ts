/**
 * Avatar Texture Utilities
 * Applies textures to the base avatar GLB based on user config.
 * 
 * DOES NOT touch avatar loading, movement, animations, or TV head.
 * Only handles runtime texture swapping after avatar is already loaded.
 */

import { AbstractMesh, Texture, PBRMaterial, Scene } from '@babylonjs/core';
import { R2_PATHS } from '../config/r2';

// Max texture resolution on mobile (iOS/Android).
// 4096×4096 RGBA = 64MB GPU memory per texture.
// 1024×1024 RGBA = 4MB GPU memory per texture.
// 3 textures per player: 192MB → 12MB. 16× reduction.
const MOBILE_MAX_TEXTURE_SIZE = 1024;

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export type AvatarConfig = {
    gender: 'male' | 'female';
    skinTone: string;   // "1", "2", "3"
    outfit: string;     // "1", "2", "3", "4"
    feet: string;       // "1", "2", "3", "4"
    hairColor: string;  // "1", "2", "3"
    hair: string;       // "1", "2", "3", "4"
    costume?: string;   // undefined = none, "ninja" | "bear" etc = active costume
};

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
    gender: 'male',
    skinTone: '1',
    outfit: '1',
    feet: '1',
    hairColor: '1',
    hair: '1',
};

/**
 * Get texture URLs for an avatar config.
 * When a costume is active, all 3 slots return costume-specific textures.
 */
export function getAvatarTextureUrls(config: AvatarConfig) {
    // Costume override — replaces all slots
    if (config.costume) {
        const base = `${R2_PATHS.avatars}/Costumes`;
        return {
            head: `${base}/${config.costume}_head.jpg`,
            body: `${base}/${config.costume}_body.jpg`,
            feet: `${base}/${config.costume}_feet.jpg`,
        };
    }

    // Default to '1' if hair fields are missing (old configs from DB)
    const hairColor = config.hairColor || '1';
    const hair = config.hair || '1';

    // Sandals (female 5 & 6) include skin tone in the filename
    const isSandal = config.gender === 'female' && (config.feet === '5' || config.feet === '6');
    const feetUrl = isSandal
        ? `${R2_PATHS.avatars}/Feet/feet_${config.gender}${config.feet}_skinTone${config.skinTone}.jpg`
        : `${R2_PATHS.avatars}/Feet/feet_${config.gender}${config.feet}.jpg`;

    return {
        head: `${R2_PATHS.avatars}/Head/head_${config.gender}_skinTone${config.skinTone}_hairColor${hairColor}_hairstyle${hair}.jpg`,
        body: `${R2_PATHS.avatars}/Body/body_${config.gender}_outfit${config.outfit}_skinTone${config.skinTone}.jpg`,
        feet: feetUrl,
    };
}

/**
 * Create a Babylon Texture with mobile resolution capping.
 * On mobile: loads JPG → draws to offscreen canvas at max 1024×1024 → creates texture from canvas.
 * On desktop: creates texture directly from URL (full 4K resolution).
 */
function createCappedTexture(url: string, scene: Scene, flipV: boolean = true): Texture {
    if (!isMobile) {
        // Desktop: full resolution, no capping needed
        const tex = new Texture(url, scene);
        if (flipV) tex.vScale = -1;
        return tex;
    }

    // Mobile: load image, downscale on canvas, create texture from canvas data
    // This prevents the GPU from ever allocating 4096×4096 RGBA buffers
    const placeholder = new Texture(null, scene);
    if (flipV) placeholder.vScale = -1;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        const maxSize = MOBILE_MAX_TEXTURE_SIZE;
        let w = img.width;
        let h = img.height;

        // Only downscale if larger than max
        if (w > maxSize || h > maxSize) {
            const scale = maxSize / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, w, h);

        // Create texture from the downscaled canvas
        const downscaled = new Texture(
            'data:' + url, // unique name based on original URL
            scene,
            undefined, // noMipmapOrOptions
            undefined, // invertY
            undefined, // samplingMode
            undefined, // onLoad
            undefined, // onError
            canvas.toDataURL('image/jpeg', 0.85), // buffer
        );
        if (flipV) downscaled.vScale = -1;

        // Copy the downscaled texture to the placeholder's internal texture
        placeholder._texture = downscaled._texture;
        placeholder.getScene()?.markAllMaterialsAsDirty(1); // MATERIAL_TextureDirtyFlag
    };
    img.src = url;

    return placeholder;
}

/**
 * Apply textures to an already-loaded avatar based on config.
 * Call this AFTER the avatar is loaded via existing avatar system.
 * 
 * @param meshes - Child meshes from avatar.root.getChildMeshes()
 * @param config - User's avatar configuration
 * @param scene - Babylon scene
 */
export function applyAvatarTextures(
    meshes: AbstractMesh[],
    config: AvatarConfig,
    scene: Scene
): void {
    const urls = getAvatarTextureUrls(config);

    console.log('[AvatarTextures] Applying textures:', urls);

    meshes.forEach(mesh => {
        const name = mesh.name.toLowerCase();
        const mat = mesh.material;

        if (!mat || !(mat instanceof PBRMaterial)) return;

        if (name.includes('head') && !name.includes('headphones')) {
            mat.albedoTexture?.dispose();
            // Cache-bust to prevent stale textures when switching hair styles/colors
            const tex = createCappedTexture(urls.head + '?t=' + Date.now(), scene);
            mat.albedoTexture = tex;
            console.log('[AvatarTextures] Applied head texture to:', mesh.name);
        } else if (name.includes('body') || name.includes('torso') || name.includes('shirt') || name.includes('top')) {
            mat.albedoTexture?.dispose();
            const tex = createCappedTexture(urls.body, scene);
            mat.albedoTexture = tex;
            console.log('[AvatarTextures] Applied body texture to:', mesh.name);
        } else if (name.includes('feet') || name.includes('shoe') || name.includes('foot')) {
            mat.albedoTexture?.dispose();
            const tex = createCappedTexture(urls.feet, scene);
            mat.albedoTexture = tex;
            console.log('[AvatarTextures] Applied feet texture to:', mesh.name);
        }
    });
}
