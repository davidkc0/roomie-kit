import { useEffect, useRef } from 'react';
import { SceneLoader } from '@babylonjs/core/Loading';
import { Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders';
import { useScene } from './scene';
import { resolveAssetUrl } from '../config/r2';

type LoungeEnvironmentProps = {
    onSpawnPointFound?: (position: Vector3) => void;
};

export function LoungeEnvironment({ onSpawnPointFound }: LoungeEnvironmentProps) {
    const { scene, camera } = useScene();
    const loadedRef = useRef(false);
    const disposedMeshesRef = useRef<string[]>([]);

    useEffect(() => {
        if (loadedRef.current) return;
        loadedRef.current = true;

        // DISPOSE default scene elements (ground and reference boxes from scene.tsx)
        const defaultMeshNames = ['ground', 'box1', 'box2', 'box3'];
        defaultMeshNames.forEach(name => {
            const mesh = scene.getMeshByName(name);
            if (mesh) {
                mesh.dispose();
                disposedMeshesRef.current.push(name);
                console.log(`[LoungeEnvironment] Disposed default mesh: ${name}`);
            }
        });

        // Camera settings are handled by CameraFollow in Room.tsx

        const loadLounge = async () => {
            try {
                const loungeUrl = resolveAssetUrl('lounge5.glb', 'rooms');
                console.log('[LoungeEnvironment] Loading lounge from:', loungeUrl);

                const result = await SceneLoader.ImportMeshAsync('', '', resolveAssetUrl('lounge5.glb', 'rooms'), scene);

                // Log ALL mesh names explicitly
                console.log('[LoungeEnvironment] All mesh names:');
                result.meshes.forEach((m, i) => {
                    console.log(`  [${i}] name="${m.name}"`);
                });

                // Scale up the entire lounge
                const rootMesh = result.meshes[0];
                const scale = 11;
                if (rootMesh) {
                    rootMesh.scaling = new Vector3(scale, scale, scale);
                    console.log(`[LoungeEnvironment] Scaled lounge by ${scale}x`);
                }

                // Find spawn point mesh - use exact name
                const spawnPointMesh = result.meshes.find(m => m.name === 'spawn_point');

                console.log('[LoungeEnvironment] Found spawn point mesh:', spawnPointMesh ? 'YES' : 'NO');

                if (spawnPointMesh) {
                    // Update matrix to ensure scaling is applied
                    spawnPointMesh.computeWorldMatrix(true);
                    const spawnPos = spawnPointMesh.getAbsolutePosition();
                    console.log('[LoungeEnvironment] SPAWN POSITION:', spawnPos.x, spawnPos.y, spawnPos.z);

                    // Hide the marker mesh
                    spawnPointMesh.isVisible = false;

                    // Notify parent of spawn position (with offset to avoid floor clipping)
                    onSpawnPointFound?.(new Vector3(spawnPos.x, spawnPos.y + 0.5, spawnPos.z));
                } else {
                    console.warn('[LoungeEnvironment] WARNING: No spawn_point mesh found! Spawning at origin.');
                    onSpawnPointFound?.(new Vector3(0, 0, 0));
                }

                console.log('[LoungeEnvironment] Lounge loaded successfully');
            } catch (err) {
                console.error('[LoungeEnvironment] Failed to load lounge:', err);
                onSpawnPointFound?.(new Vector3(0, 0, 0));
            }
        };

        loadLounge();

        return () => {
            console.log('[LoungeEnvironment] Cleanup - disposed meshes:', disposedMeshesRef.current);
        };
    }, [scene, camera, onSpawnPointFound]);

    return null;
}

