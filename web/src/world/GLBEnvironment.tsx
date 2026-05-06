import { useEffect, useRef } from 'react';
import { SceneLoader } from '@babylonjs/core/Loading';
import { Vector3, Mesh, MeshBuilder } from '@babylonjs/core';
import '@babylonjs/loaders';
import { useScene } from './scene';

type GLBEnvironmentProps = {
    modelUrl: string;
    spawnPointName?: string;
    scale?: number;
    onSpawnPointFound?: (position: Vector3) => void;
};

export function GLBEnvironment({ modelUrl, spawnPointName = 'spawn_point', scale = 1, onSpawnPointFound }: GLBEnvironmentProps) {
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
                console.log(`[GLBEnvironment] Disposed default mesh: ${name}`);
            }
        });

        // Camera settings are handled by CameraFollow in Room.tsx

        const loadEnvironment = async () => {
            try {
                // Split url into path and filename
                const lastSlash = modelUrl.lastIndexOf('/');
                const root = modelUrl.substring(0, lastSlash + 1);
                const file = modelUrl.substring(lastSlash + 1);

                console.log(`[GLBEnvironment] Loading ${file} from ${root}...`);

                const result = await SceneLoader.ImportMeshAsync('', root, file, scene);

                // Scale up the entire environment
                const rootMesh = result.meshes[0];
                if (rootMesh) {
                    rootMesh.scaling = new Vector3(scale, scale, scale);
                    console.log(`[GLBEnvironment] Scaled environment by ${scale}x`);
                }

                // DEBUG: Dump all mesh→material mappings to help identify naming
                console.log('[GLBEnvironment] Mesh→Material mapping:',
                    result.meshes.map(m => `${m.name} → mat:"${(m.material as any)?.name || 'NONE'}"`).join(' | ')
                );

                // Enable collisions on most meshes, but handle special cases
                result.meshes.forEach(mesh => {
                    // Skip collision check for spawn point to prevent getting stuck inside it if it's a volume
                    if (spawnPointName && mesh.name.toLowerCase().includes(spawnPointName.toLowerCase())) return;

                    const meshNameLower = mesh.name.toLowerCase();

                    // COLLISION BOXES from Blender: invisible but collision-enabled
                    if (meshNameLower.includes('collisionbox')) {
                        mesh.isVisible = false;
                        mesh.isPickable = false;
                        mesh.checkCollisions = true;
                        console.log(`[GLBEnvironment] Collision box (invisible): ${mesh.name}`);
                        return;
                    }

                    // COLLISION FILTER: Disable collision on decorative meshes that trap players.
                    // 1. '_col' marker from Blender (if GLB export preserves it)
                    // 2. 'fichte' = spruce/pine plant meshes (Blender renames materials on export)
                    const matName = (mesh.material as any)?.name?.toLowerCase() || '';
                    const isDecor = meshNameLower.includes('_col') || matName.includes('_col')
                        || matName.includes('fichte');
                    if (isDecor) {
                        mesh.checkCollisions = false;
                        console.log(`[GLBEnvironment] Collision DISABLED (decor): mesh="${mesh.name}" mat="${matName}"`);
                        return;
                    }

                    // SPECIAL HANDLING for arcade meshes:
                    // Complex arcade geometry traps players inside, so we:
                    // 1. Disable collision on the arcade mesh itself
                    // 2. Create a simple invisible box at its position for collision
                    if (meshNameLower.includes('arcade')) {
                        console.log(`[GLBEnvironment] Found arcade mesh: ${mesh.name}, creating collision box...`);
                        mesh.checkCollisions = false;

                        // Create a simple collision box at the arcade's position
                        mesh.computeWorldMatrix(true);
                        const arcadePos = mesh.getAbsolutePosition();
                        const collisionBox = MeshBuilder.CreateBox(
                            `${mesh.name}_collision`,
                            { width: 1.5, height: 2.5, depth: 1.5 },
                            scene
                        );
                        collisionBox.position = arcadePos.clone();
                        collisionBox.position.y = arcadePos.y + 1.25; // Center the box vertically
                        collisionBox.checkCollisions = true;
                        collisionBox.isVisible = false; // Invisible
                        collisionBox.isPickable = false;
                        console.log(`[GLBEnvironment] Created collision box for ${mesh.name} at`, collisionBox.position);
                        return;
                    }

                    mesh.checkCollisions = true;

                    // Dubug: Check for geometry
                    if (mesh.getTotalVertices() === 0) {
                        console.warn(`[GLBEnvironment] Warning: Mesh "${mesh.name}" has 0 vertices! Collisions will fail.`);
                    }

                    // Special handling for the "floor", "wall", and "beanbag" meshes to fix direction issues
                    if (mesh.name.toLowerCase().includes('floor') || mesh.name.toLowerCase().includes('wall') || mesh.name.toLowerCase().includes('beanbag')) {
                        console.log(`[GLBEnvironment] Found Floor Mesh: ${mesh.name}. Applying double-sided collision fix.`);

                        // Create a back-face collider by cloning and flipping
                        const backFaceParam = mesh.clone(`${mesh.name}_backface`, null);
                        if (backFaceParam) {
                            (backFaceParam as Mesh).flipFaces(true);
                            backFaceParam.checkCollisions = true;
                            backFaceParam.isVisible = false;
                            // Ensure it's not pickable to avoid interfering with clicks
                            backFaceParam.isPickable = false;
                            console.log(`[GLBEnvironment] Created backface collider for ${mesh.name}`);
                        }
                    }
                });

                // Find spawn point mesh if name provided
                if (spawnPointName) {
                    // Log all mesh names to help debug
                    console.log('[GLBEnvironment] Available meshes:', result.meshes.map(m => m.name).join(', '));

                    // Use case-insensitive substring match to be robust against Blender naming (e.g. "spawn_point.001")
                    const searchName = spawnPointName.toLowerCase();
                    const spawnPointMesh = result.meshes.find(m => m.name.toLowerCase().includes(searchName));

                    console.log(`[GLBEnvironment] Searching for "${searchName}"... Found:`, spawnPointMesh ? `YES (${spawnPointMesh.name})` : 'NO');

                    if (spawnPointMesh) {
                        // Update matrix to ensure scaling is applied
                        spawnPointMesh.computeWorldMatrix(true);
                        const spawnPos = spawnPointMesh.getAbsolutePosition();
                        console.log('[GLBEnvironment] SPAWN POSITION MATCHED:', spawnPos.x, spawnPos.y, spawnPos.z);

                        // Hide the marker mesh
                        spawnPointMesh.isVisible = false;

                        // Notify parent of spawn position
                        // Notify parent of spawn position
                        // +1.0 Y offset: Safe spawn above floor
                        const finalSpawnPos = new Vector3(spawnPos.x, spawnPos.y + 1.0, spawnPos.z);

                        // Camera will follow via CameraFollow in Room.tsx
                        onSpawnPointFound?.(finalSpawnPos);
                    } else {
                        console.warn(`[GLBEnvironment] WARNING: No "${spawnPointName}" mesh found! Spawning at origin.`);
                        onSpawnPointFound?.(new Vector3(0, 0, 0));
                    }
                } else {
                    onSpawnPointFound?.(new Vector3(0, 0, 0));
                }

                console.log('[GLBEnvironment] Environment loaded successfully');
            } catch (err) {
                console.error('[GLBEnvironment] Failed to load environment:', err);
                onSpawnPointFound?.(new Vector3(0, 0, 0));
            }
        };

        loadEnvironment();

        return () => {
            console.log('[GLBEnvironment] Cleanup - disposed meshes:', disposedMeshesRef.current);
        };
    }, [scene, camera, onSpawnPointFound, modelUrl, scale, spawnPointName]);

    return null;
}
