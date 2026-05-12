/**
 * Hexagon Component
 * Renders a single hexagonal platform tile using GLB model from R2.
 * Handles hit detection (fade out and disable) when stepped on.
 * Ported from wawa-guys-final/Hexagon.jsx to Babylon.js
 */

import { useEffect, useRef, useState } from 'react';
import {
    Vector3,
    StandardMaterial,
    Color3,
    SceneLoader,
    AbstractMesh,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { useScene } from '../../world/scene';
import { HEX_FADE_DELAY } from './hexConfig';
import { resolveAssetUrl } from '../../config/r2';
import { useHexAudioManager } from './useHexAudioManager';

interface HexagonProps {
    /** Unique key for this hex (floor-row-col) */
    hexKey: string;
    /** World position */
    position: Vector3;
    /** Base color (hex string like #ff4444) */
    color: string;
    /** Whether this hex has been hit/destroyed */
    isHit: boolean;
    /** Callback when player steps on this hex */
    onHit: () => void;
}

// GLB URL from R2
const HEXAGON_GLB_URL = resolveAssetUrl('hexagon.glb');

/**
 * Convert hex color string to Color3
 */
function hexToColor3(hex: string): Color3 {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return new Color3(r, g, b);
}

/**
 * Randomize color slightly for visual variety
 */
function randomizeColor(baseColor: Color3): Color3 {
    const factor = 0.5 + Math.random() * 0.7; // 0.5 to 1.2
    return new Color3(
        Math.min(1, baseColor.r * factor),
        Math.min(1, baseColor.g * factor),
        Math.min(1, baseColor.b * factor)
    );
}

export function Hexagon({ hexKey, position, color, isHit, onHit: _onHit }: HexagonProps) {
    const { scene } = useScene();
    const { playAudio } = useHexAudioManager();
    const rootMeshRef = useRef<AbstractMesh | null>(null);
    const meshesRef = useRef<AbstractMesh[]>([]);
    const materialRef = useRef<StandardMaterial | null>(null);
    const [isDisabled, setIsDisabled] = useState(false);
    const fadeObserverRef = useRef<any>(null);
    const loadedRef = useRef(false);

    // Load the GLB model
    useEffect(() => {
        if (!scene || loadedRef.current) return;

        const loadModel = async () => {
            try {
                const result = await SceneLoader.ImportMeshAsync(
                    '',
                    HEXAGON_GLB_URL,
                    '',
                    scene
                );

                if (!scene || scene.isDisposed) return;

                loadedRef.current = true;

                // Get all meshes
                const meshes = result.meshes;
                meshesRef.current = meshes;

                // Create a root transform node to position everything
                const rootMesh = meshes[0];
                rootMeshRef.current = rootMesh;

                // Position the root at the specified location
                rootMesh.position = position.clone();

                // Create material with randomized color
                const baseColor = hexToColor3(color);
                const mat = new StandardMaterial(`hex_mat_${hexKey}`, scene);
                mat.diffuseColor = randomizeColor(baseColor);
                mat.specularColor = new Color3(0.2, 0.2, 0.2);
                mat.alpha = 1;
                materialRef.current = mat;

                // Apply material and enable collisions on all meshes
                meshes.forEach((mesh, index) => {
                    if (mesh.name !== '__root__') {
                        mesh.material = mat;
                        mesh.checkCollisions = true;
                        mesh.isPickable = true;
                        // Rename mesh for collision detection
                        mesh.name = `hex_${hexKey}_${index}`;
                    }
                });

                // Also rename root for potential lookups
                rootMesh.name = `hex_${hexKey}`;

            } catch (error) {
                console.error(`[Hexagon] Failed to load GLB for ${hexKey}:`, error);
            }
        };

        loadModel();

        return () => {
            // Cleanup
            if (fadeObserverRef.current && scene && !scene.isDisposed) {
                scene.onBeforeRenderObservable.remove(fadeObserverRef.current);
                fadeObserverRef.current = null;
            }

            meshesRef.current.forEach(mesh => {
                if (mesh && !mesh.isDisposed()) {
                    mesh.dispose();
                }
            });
            meshesRef.current = [];
            rootMeshRef.current = null;

            if (materialRef.current) {
                materialRef.current.dispose();
                materialRef.current = null;
            }

            loadedRef.current = false;
        };
    }, [scene, hexKey, position, color]);

    // Handle hit state - fade out and disable
    useEffect(() => {
        if (!isHit || isDisabled || !scene || !materialRef.current) return;

        const mat = materialRef.current;

        // Start fading
        fadeObserverRef.current = scene.onBeforeRenderObservable.add(() => {
            if (!mat) return;

            // Lerp alpha toward 0
            mat.alpha = mat.alpha * 0.92;

            // Also change color to orange when hit
            mat.diffuseColor = Color3.Lerp(mat.diffuseColor, new Color3(1, 0.5, 0), 0.1);
        });

        // Play random pop sound immediately when hit
        const popVariant = Math.floor(Math.random() * 5) + 1; // 1-5
        playAudio(`Pop${popVariant}`);

        // After delay, disable the hexagon completely
        const timeout = setTimeout(() => {
            setIsDisabled(true);

            // Stop fade observer
            if (fadeObserverRef.current && scene && !scene.isDisposed) {
                scene.onBeforeRenderObservable.remove(fadeObserverRef.current);
                fadeObserverRef.current = null;
            }

            // Dispose meshes
            meshesRef.current.forEach(mesh => {
                if (mesh && !mesh.isDisposed()) {
                    mesh.dispose();
                }
            });
            meshesRef.current = [];
            rootMeshRef.current = null;

            if (materialRef.current) {
                materialRef.current.dispose();
                materialRef.current = null;
            }
        }, HEX_FADE_DELAY);

        return () => {
            clearTimeout(timeout);
            if (fadeObserverRef.current && scene && !scene.isDisposed) {
                scene.onBeforeRenderObservable.remove(fadeObserverRef.current);
                fadeObserverRef.current = null;
            }
        };
    }, [isHit, isDisabled, scene]);

    // Don't render anything if disabled
    if (isDisabled) {
        return null;
    }

    return null; // GLB is loaded imperatively, no React children needed
}
