/**
 * Hex Arena Component
 * Generates the multi-floor grid of hexagonal platforms.
 * Uses a SINGLE GLB load + cloned meshes for efficient rendering.
 *
 * Hex destruction is handled IMPERATIVELY via Zustand subscribe() —
 * no React re-renders triggered when hexes are destroyed.
 */

import { useMemo, useEffect, useRef, useCallback } from 'react';
import {
    Vector3,
    Color3,
    SceneLoader,
    AbstractMesh,
    StandardMaterial,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {
    HEX_X_SPACING,
    HEX_Z_SPACING,
    NB_ROWS,
    NB_COLUMNS,
    FLOOR_HEIGHT,
    FLOORS,
    HEX_FADE_DELAY,
} from './hexConfig';
import { useHexGameStore } from './hexGameStore';
import { registerRpc } from '../../multiplayer/playroom';
import { useScene } from '../../world/scene';
import { resolveAssetUrl } from '../../config/r2';
import { useHexAudioManager } from './useHexAudioManager';

const HEXAGON_GLB_URL = resolveAssetUrl('hexagon.glb');

// Reusable orange color for fade lerp — single allocation
const FADE_TARGET_COLOR = new Color3(1, 0.5, 0);

interface HexArenaProps {
    visible: boolean;
    practiceMode?: boolean;
}

function hexToColor3(hex: string): Color3 {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return new Color3(r, g, b);
}

function randomizeColor(baseColor: Color3): Color3 {
    const factor = 0.5 + Math.random() * 0.7;
    return new Color3(
        Math.min(1, baseColor.r * factor),
        Math.min(1, baseColor.g * factor),
        Math.min(1, baseColor.b * factor),
    );
}

interface HexInstance {
    key: string;
    position: Vector3;
    color: string;
    meshes: AbstractMesh[];
    material: StandardMaterial;
    disposed: boolean;
}

export function HexArena({ visible, practiceMode = false }: HexArenaProps) {
    const { scene } = useScene();
    const { playAudio } = useHexAudioManager();
    const destroyHex = useHexGameStore((state) => state.destroyHex);
    const rpcRegisteredRef = useRef(false);
    const instancesRef = useRef<Map<string, HexInstance>>(new Map());
    const sourceMeshesRef = useRef<AbstractMesh[]>([]);
    const loadedRef = useRef(false);
    const fadeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const fadeObserverRef = useRef<any>(null);
    const fadingHexesRef = useRef<Map<string, number>>(new Map());
    const playAudioRef = useRef(playAudio);

    // Keep playAudio ref up to date without triggering effects
    useEffect(() => { playAudioRef.current = playAudio; }, [playAudio]);

    // Generate all hexagon positions (pure data — stable)
    const hexPositions = useMemo(() => {
        const result: Array<{ key: string; position: Vector3; color: string }> = [];
        const offsetX = -((NB_COLUMNS - 1) / 2) * HEX_X_SPACING;
        const offsetZ = -((NB_ROWS - 1) / 2) * HEX_Z_SPACING;

        FLOORS.forEach((floor, floorIndex) => {
            const floorY = (FLOORS.length - 1 - floorIndex) * FLOOR_HEIGHT;
            for (let row = 0; row < NB_ROWS; row++) {
                const rowXOffset = row % 2 ? HEX_X_SPACING / 2 : 0;
                const rowZ = offsetZ + row * HEX_Z_SPACING;
                for (let col = 0; col < NB_COLUMNS; col++) {
                    const hexKey = `${floorIndex}-${row}-${col}`;
                    const position = new Vector3(
                        offsetX + col * HEX_X_SPACING + rowXOffset,
                        floorY,
                        rowZ,
                    );
                    result.push({ key: hexKey, position, color: floor.color });
                }
            }
        });
        return result;
    }, []);

    // Register RPC handlers
    useEffect(() => {
        if (practiceMode || rpcRegisteredRef.current) return;
        registerRpc('hexagonHit', (data: { hexagonKey: string }) => {
            console.log('[HexArena] Received hexagonHit RPC:', data.hexagonKey);
            destroyHex(data.hexagonKey);
        });
        rpcRegisteredRef.current = true;
    }, [destroyHex, practiceMode]);

    // Helper: dispose all current instances (but keep source meshes for re-cloning)
    const disposeAllInstances = useCallback(() => {
        fadeTimersRef.current.forEach(t => clearTimeout(t));
        fadeTimersRef.current.clear();
        fadingHexesRef.current.clear();

        instancesRef.current.forEach(inst => {
            if (!inst.disposed) {
                inst.meshes.forEach(m => {
                    if (m && !m.isDisposed()) m.dispose();
                });
                inst.material.dispose();
                inst.disposed = true;
            }
        });
        instancesRef.current.clear();
    }, []);

    // Helper: build all hex clones from source meshes
    const buildClones = useCallback(() => {
        const sourceMeshes = sourceMeshesRef.current;
        if (sourceMeshes.length === 0 || !scene || scene.isDisposed) return;

        const instances = new Map<string, HexInstance>();

        for (const { key, position, color } of hexPositions) {
            const baseColor = hexToColor3(color);
            const mat = new StandardMaterial(`hex_mat_${key}`, scene);
            mat.diffuseColor = randomizeColor(baseColor);
            mat.specularColor = new Color3(0.2, 0.2, 0.2);
            mat.alpha = 1;

            const clonedMeshes: AbstractMesh[] = [];
            const rootMesh = sourceMeshes[0];

            const clonedRoot = rootMesh.clone(`hex_${key}`, null);
            if (clonedRoot) {
                clonedRoot.setEnabled(true);
                clonedRoot.position = position.clone();
                clonedMeshes.push(clonedRoot);
            }

            for (let i = 1; i < sourceMeshes.length; i++) {
                const cloned = sourceMeshes[i].clone(`hex_${key}_${i}`, clonedRoot);
                if (cloned) {
                    cloned.setEnabled(true);
                    cloned.material = mat;
                    cloned.checkCollisions = true;
                    cloned.isPickable = true;
                    clonedMeshes.push(cloned);
                }
            }

            instances.set(key, {
                key, position, color,
                meshes: clonedMeshes,
                material: mat,
                disposed: false,
            });
        }

        instancesRef.current = instances;
        console.log(`[HexArena] Built ${instances.size} hexagon clones`);
    }, [scene, hexPositions]);

    // Single function to handle a hex being destroyed — called imperatively, no React
    const handleHexDestroyed = useCallback((hexKey: string) => {
        const inst = instancesRef.current.get(hexKey);
        if (!inst || inst.disposed) return;
        if (fadingHexesRef.current.has(hexKey)) return;

        // Start fade
        fadingHexesRef.current.set(hexKey, Date.now());

        // Play pop sound
        const popVariant = Math.floor(Math.random() * 5) + 1;
        playAudioRef.current(`Pop${popVariant}`);

        // After delay, dispose
        const timer = setTimeout(() => {
            const instance = instancesRef.current.get(hexKey);
            if (instance && !instance.disposed) {
                instance.meshes.forEach(m => {
                    if (m && !m.isDisposed()) m.dispose();
                });
                instance.material.dispose();
                instance.disposed = true;
                instance.meshes = [];
            }
            fadingHexesRef.current.delete(hexKey);
            fadeTimersRef.current.delete(hexKey);
        }, HEX_FADE_DELAY);

        fadeTimersRef.current.set(hexKey, timer);
    }, []);

    // Load source GLB once, then build clones
    useEffect(() => {
        if (!scene || !visible || loadedRef.current) return;

        let cancelled = false;

        const loadArena = async () => {
            try {
                const result = await SceneLoader.ImportMeshAsync('', HEXAGON_GLB_URL, '', scene);
                if (cancelled || scene.isDisposed) return;

                const sourceMeshes = result.meshes;
                sourceMeshesRef.current = sourceMeshes;
                sourceMeshes.forEach(m => {
                    m.setEnabled(false);
                    m.isPickable = false;
                });

                loadedRef.current = true;
                buildClones();
                // Signal that arena meshes are ready for physics
                useHexGameStore.getState().setArenaReady(true);
            } catch (error) {
                console.error('[HexArena] Failed to load hexagon GLB:', error);
            }
        };

        loadArena();
        return () => { cancelled = true; };
    }, [scene, visible, hexPositions, buildClones]);

    // IMPERATIVE subscription to destroyedHexes — bypasses React render cycle entirely.
    // Fires only for the DIFF (newly added hex), not the entire set.
    // Also watches arenaReady to detect startGame() resetting it to false.
    useEffect(() => {
        let prevKeys = new Set(useHexGameStore.getState().destroyedHexes);
        let prevArenaReady = useHexGameStore.getState().arenaReady;
        let isRebuilding = false;

        const unsubscribe = useHexGameStore.subscribe((state) => {
            const currentKeys = state.destroyedHexes;

            if (isRebuilding) return;

            // Detect arena rebuild needed:
            // 1. destroyedHexes went from non-empty to empty (game reset), OR
            // 2. arenaReady went from true to false (startGame() called — need fresh rebuild)
            const hexesCleared = prevKeys.size > 0 && currentKeys.size === 0;
            const arenaReadyReset = prevArenaReady && !state.arenaReady;

            if ((hexesCleared || arenaReadyReset) && loadedRef.current) {
                console.log('[HexArena] Arena rebuild triggered —', hexesCleared ? 'hexes cleared' : 'arenaReady reset');
                isRebuilding = true;
                prevKeys = new Set();
                prevArenaReady = true; // Will be set true after rebuild
                disposeAllInstances();
                buildClones();
                useHexGameStore.getState().setArenaReady(true);
                isRebuilding = false;
                return;
            }

            prevArenaReady = state.arenaReady;

            // Process only NEWLY destroyed hexes
            currentKeys.forEach(key => {
                if (!prevKeys.has(key)) {
                    handleHexDestroyed(key);
                }
            });

            prevKeys = new Set(currentKeys);
        });

        return unsubscribe;
    }, [handleHexDestroyed, disposeAllInstances, buildClones]);

    // Single fade observer
    useEffect(() => {
        if (!scene || !visible) return;

        const observer = scene.onBeforeRenderObservable.add(() => {
            const fading = fadingHexesRef.current;
            if (fading.size === 0) return;

            const toRemove: string[] = [];
            fading.forEach((_startTime, key) => {
                const inst = instancesRef.current.get(key);
                if (!inst || inst.disposed) {
                    toRemove.push(key);
                    return;
                }
                inst.material.alpha *= 0.92;
                const dc = inst.material.diffuseColor;
                dc.r += (FADE_TARGET_COLOR.r - dc.r) * 0.1;
                dc.g += (FADE_TARGET_COLOR.g - dc.g) * 0.1;
                dc.b += (FADE_TARGET_COLOR.b - dc.b) * 0.1;
            });
            toRemove.forEach(k => fading.delete(k));
        });
        fadeObserverRef.current = observer;

        return () => {
            if (scene && !scene.isDisposed) {
                scene.onBeforeRenderObservable.remove(observer);
            }
            fadeObserverRef.current = null;
        };
    }, [scene, visible]);

    // Cleanup when arena becomes invisible
    useEffect(() => {
        if (!visible && loadedRef.current) {
            disposeAllInstances();
            sourceMeshesRef.current.forEach(m => {
                if (m && !m.isDisposed()) m.dispose();
            });
            sourceMeshesRef.current = [];
            loadedRef.current = false;
            useHexGameStore.getState().setArenaReady(false);
        }
    }, [visible, disposeAllInstances]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disposeAllInstances();
            sourceMeshesRef.current.forEach(m => {
                if (m && !m.isDisposed()) m.dispose();
            });
            sourceMeshesRef.current = [];
            loadedRef.current = false;
            useHexGameStore.getState().setArenaReady(false);
        };
    }, [disposeAllInstances]);

    return null;
}

/**
 * Get spawn position for a player on the top floor
 */
export function getSpawnPosition(): Vector3 {
    const topFloorY = (FLOORS.length - 1) * FLOOR_HEIGHT + 3;
    const randomX = (Math.random() - 0.5) * (NB_COLUMNS - 2) * HEX_X_SPACING;
    const randomZ = (Math.random() - 0.5) * (NB_ROWS - 2) * HEX_Z_SPACING;
    return new Vector3(randomX, topFloorY, randomZ);
}
