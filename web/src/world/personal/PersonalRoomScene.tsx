import { useEffect, useMemo } from 'react';
import { useScene } from '../scene';
import { Vector3, Color3, StandardMaterial, Texture, MeshBuilder } from '@babylonjs/core';
import { Furniture } from '../Furniture';
import { PlacementGhost } from './PlacementGhost';
import { R2_PATHS } from '../../config/r2';

type PersonalRoomSceneProps = {
    roomData: any; // Type strictly later
    onWhiteboardCreated?: (mesh: any) => void;
    isEditMode: boolean;
    selectedItemId: string | null;
    pendingPlacement: { position: Vector3, rotation: Vector3, isLocked: boolean } | null;
    onPendingPlacementUpdate: (pos: Vector3, rot: Vector3, isLocked: boolean) => void;
    editingInstanceId: string | null;
    onSelectItem: (instanceId: string) => void;
};

// Grid size constant
const ROOM_SIZE = 15; // 15x15m

export function PersonalRoomScene({
    roomData,
    onWhiteboardCreated,
    isEditMode,
    selectedItemId,
    pendingPlacement,
    onPendingPlacementUpdate,
    editingInstanceId,
    onSelectItem
}: PersonalRoomSceneProps) {
    const { scene, camera } = useScene();

    // Create floor and walls
    useEffect(() => {
        if (!scene) return;

        console.log('[PersonalRoomScene] Initializing room:', roomData.name);

        // Helper to load texture via fetch (bypassing img tag CORS issues)
        const loadTexture = (url: string, material: StandardMaterial, isWall: boolean) => {
            // Add cache buster to avoid poisoned cache from preview images
            const cacheBustedUrl = url + '?v=1';
            console.log(`[PersonalRoomScene] Fetching texture: ${cacheBustedUrl}`);

            fetch(cacheBustedUrl)
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    return response.blob();
                })
                .then(blob => {
                    const blobUrl = URL.createObjectURL(blob);
                    const texture = new Texture(blobUrl, scene, undefined, undefined, undefined, () => {
                        // Revoke blob URL after load to free memory
                        URL.revokeObjectURL(blobUrl);
                        console.log(`[PersonalRoomScene] ✅ Texture loaded via Blob: ${url}`);
                    }, (msg, ex) => {
                        console.error(`[PersonalRoomScene] ❌ Texture Blob load failed:`, msg, ex);
                    });

                    if (isWall) {
                        texture.uScale = 2; texture.vScale = 1;
                    } else {
                        texture.uScale = 4; texture.vScale = 4;
                    }

                    // Dispose old texture if exists
                    if (material.diffuseTexture) {
                        material.diffuseTexture.dispose();
                    }

                    material.diffuseTexture = texture;
                })
                .catch(err => {
                    console.error(`[PersonalRoomScene] ❌ Fetch failed for ${url}:`, err);
                });
        };

        // 1. Floor
        const ground = scene.getMeshByName('ground');
        if (ground) {
            ground.scaling = new Vector3(ROOM_SIZE / 20, 1, ROOM_SIZE / 20);

            const material = ground.material as StandardMaterial;
            if (material) {
                // Remove specular to prevent glare in edit mode
                material.specularColor = new Color3(0, 0, 0);
                if (roomData.floor_texture_url) {
                    const texUrl = roomData.floor_texture_url.startsWith('http')
                        ? roomData.floor_texture_url
                        : `${R2_PATHS.floor}/${roomData.floor_texture_url}`;

                    // Use standard texture load for local/data/blob, fetch for R2
                    if (texUrl.includes('r2.dev')) {
                        loadTexture(texUrl, material, false);
                    } else {
                        // Fallback for local files (like default if not using R2 URL) or if default is just filename
                        // If it's just a filename and not http, we constructed R2 path above.
                        // But wait, default might be '/wood...'. 
                        // Let's fallback to standard load if it fails?
                        // Actually, just use loadTexture if it's http
                        loadTexture(texUrl, material, false);
                    }
                }
            }
        }

        // 2. Walls
        const wallHeight = 4;
        const wallOffset = ROOM_SIZE / 2;

        const walls = [
            { name: 'wall_left', pos: new Vector3(-wallOffset, wallHeight / 2, 0), rot: Math.PI / 2 },
            { name: 'wall_right', pos: new Vector3(wallOffset, wallHeight / 2, 0), rot: Math.PI / 2 },
            { name: 'wall_front', pos: new Vector3(0, wallHeight / 2, -wallOffset), rot: 0 },
        ];

        const createdWalls: any[] = [];

        // Back wall (Whiteboard)
        const backWall = MeshBuilder.CreateBox('wall_back', { width: ROOM_SIZE, height: wallHeight, depth: 0.2 }, scene);
        backWall.position = new Vector3(0, wallHeight / 2, wallOffset);
        backWall.checkCollisions = true;

        const backWallMat = new StandardMaterial('wall_back_mat', scene);
        const beigeR = 245 / 255; const beigeG = 245 / 255; const beigeB = 240 / 255;
        backWallMat.diffuseColor = new Color3(beigeR, beigeG, beigeB);
        backWallMat.emissiveColor = new Color3(beigeR, beigeG, beigeB);
        backWallMat.backFaceCulling = false;
        backWallMat.disableLighting = true;
        backWall.material = backWallMat;
        createdWalls.push(backWall);

        if (onWhiteboardCreated) {
            onWhiteboardCreated(backWall);
        }

        // Other walls
        walls.forEach(w => {
            const wall = MeshBuilder.CreateBox(w.name, { width: ROOM_SIZE, height: wallHeight, depth: 0.2 }, scene);
            wall.position = w.pos;
            wall.rotation.y = w.rot;
            wall.checkCollisions = true;

            const wallMat = new StandardMaterial(`${w.name}_mat`, scene);
            wallMat.specularColor = new Color3(0, 0, 0); // No glare

            if (roomData.wall_texture_url) {
                const wallTexUrl = roomData.wall_texture_url.startsWith('http')
                    ? roomData.wall_texture_url
                    : `${R2_PATHS.wall}/${roomData.wall_texture_url}`;

                loadTexture(wallTexUrl, wallMat, true);
            } else {
                wallMat.diffuseColor = Color3.FromHexString(roomData.wall_color || '#FFFFFF');
            }

            wall.material = wallMat;
            createdWalls.push(wall);
        });

        // Cleanup
        return () => {
            createdWalls.forEach(w => w.dispose());
        };

    }, [scene, roomData]);

    // Camera control for Edit Mode
    useEffect(() => {
        if (!camera) return;

        if (isEditMode) {
            const originalAlpha = camera.alpha;
            const originalBeta = camera.beta;
            const originalRadius = camera.radius;
            const originalTarget = camera.target.clone();

            camera.lowerBetaLimit = null; camera.upperBetaLimit = null;
            camera.lowerRadiusLimit = null; camera.upperRadiusLimit = null;
            camera.lowerAlphaLimit = null; camera.upperAlphaLimit = null;

            camera.alpha = -Math.PI / 2;
            camera.beta = 0.01;
            camera.radius = 45;
            camera.target = new Vector3(0, 0, 0);

            camera.detachControl();

            camera.lowerRadiusLimit = 45; camera.upperRadiusLimit = 45;
            camera.lowerBetaLimit = 0.01; camera.upperBetaLimit = 0.01;
            camera.lowerAlphaLimit = -Math.PI / 2; camera.upperAlphaLimit = -Math.PI / 2;

            return () => {
                camera.lowerBetaLimit = null; camera.upperBetaLimit = null;
                camera.lowerRadiusLimit = null; camera.upperRadiusLimit = null;
                camera.lowerAlphaLimit = null; camera.upperAlphaLimit = null;

                camera.alpha = originalAlpha;
                camera.beta = originalBeta;
                camera.radius = originalRadius;
                camera.target = originalTarget;

                camera.lowerBetaLimit = 0.1;
                camera.upperBetaLimit = Math.PI / 2;
                camera.lowerRadiusLimit = 2;
                camera.upperRadiusLimit = 12;

                camera.attachControl(camera.getScene().getEngine().getRenderingCanvas()!, true);
            };
        }
    }, [camera, isEditMode]);

    // Items
    const items = useMemo(() => {
        const rawItems = roomData.items || [];
        return rawItems.filter((item: any) => item.item_id !== 'arcade_machine.glb');
    }, [roomData]);

    return (
        <>
            {items.map((item: any) => {
                if (editingInstanceId === item.instance_id) return null;
                const pos = item.position;
                return (
                    <Furniture
                        key={item.instance_id}
                        modelPath={`${R2_PATHS.furniture}/${item.model_url}?v=5`}
                        modelName={item.item_id}
                        position={new Vector3(pos.x, pos.y, pos.z)}
                        rotation={new Vector3(0, item.rotation?.y || 0, 0)}
                        scale={new Vector3(item.scale?.x || 1, item.scale?.y || 1, item.scale?.z || 1)}
                        isEditable={isEditMode}
                        onSelect={() => onSelectItem(item.instance_id)}
                    />
                );
            })}
            <PlacementGhost
                isEditMode={isEditMode}
                selectedItemId={selectedItemId}
                pendingPlacement={pendingPlacement}
                onUpdate={onPendingPlacementUpdate}
            />
        </>
    );
}
