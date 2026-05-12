

import { resolveAssetUrl } from './r2';

export type RoomType = 'default' | 'custom-glb' | 'game-arena';

export interface RoomDefinition {
    id: string; // matches slug
    type: RoomType;

    // Custom GLB specific
    glbUrl?: string;
    spawnPointName?: string;
    envScale?: number;

    // Physics/Movement
    roomHalfSize: number; // Bounds for movement clamping

    // UI/Metadata
    name: string;
    description?: string;
}

export const DEFAULT_ROOM: RoomDefinition = {
    id: 'default',
    type: 'default',
    roomHalfSize: 10,
    name: 'Standard Room',
    description: 'A cozy space with arcade games and a whiteboard.'
};

export const LOUNGE_ROOM: RoomDefinition = {
    id: 'lounge',
    type: 'custom-glb',
    glbUrl: resolveAssetUrl('lounge6.glb', 'rooms'),
    spawnPointName: 'spawn_point',
    envScale: 3.0,
    roomHalfSize: 30,
    name: 'The Lounge',
    description: 'A large open space to hang out.'
};

export const THEATER_ROOM: RoomDefinition = {
    id: 'theater',
    type: 'custom-glb',
    glbUrl: resolveAssetUrl('theater2.glb', 'rooms'),
    spawnPointName: 'spawn_point',
    envScale: 1.0,
    roomHalfSize: 40,
    name: 'The Theater',
    description: 'A cinema theater for watching content together.'
};

export const HEX_ROOM: RoomDefinition = {
    id: 'hex',
    type: 'game-arena',
    roomHalfSize: 50,
    name: 'Hex Arena',
    description: 'Battle royale on disappearing platforms!'
};

// Registry of known rooms
export const ROOM_REGISTRY: Record<string, RoomDefinition> = {
    'lounge': LOUNGE_ROOM,
    'theater': THEATER_ROOM,
    'hex': HEX_ROOM,
};

export function getRoomDefinition(slug?: string): RoomDefinition {
    if (!slug) return DEFAULT_ROOM;
    return ROOM_REGISTRY[slug] || DEFAULT_ROOM;
}
