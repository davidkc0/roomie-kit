import { useEffect, useRef, useState } from 'react';
import { useScene } from '../scene';
import { SceneLoader, AbstractMesh, Vector3, PointerEventTypes, Matrix, Quaternion } from '@babylonjs/core';
import { supabase } from '../../lib/supabase';
import { R2_PATHS } from '../../config/r2';
// Room boundary: walls at ±7.5 (ROOM_SIZE=15), with 2m inset so large items don't clip through
const HALF_ROOM = 7.5;
const WALL_INSET = 1.0;
const clampToRoom = (v: number) => Math.max(-HALF_ROOM + WALL_INSET, Math.min(HALF_ROOM - WALL_INSET, v));

type PlacementGhostProps = {
    selectedItemId: string | null;
    isEditMode: boolean;
    pendingPlacement: { position: Vector3, rotation: Vector3, isLocked: boolean } | null;
    onUpdate: (position: Vector3, rotation: Vector3, isLocked: boolean) => void;
};

export function PlacementGhost({ selectedItemId, isEditMode, pendingPlacement, onUpdate }: PlacementGhostProps) {
    const { scene } = useScene();
    const ghostMeshRef = useRef<AbstractMesh | null>(null);
    const nativeQuatRef = useRef<Quaternion>(Quaternion.Identity());
    const loadedItemIdRef = useRef<string | null>(null);
    const [modelUrl, setModelUrl] = useState<string | null>(null);

    // Fetch model_url from Supabase when selectedItemId changes
    useEffect(() => {
        if (!selectedItemId) {
            setModelUrl(null);
            return;
        }

        async function fetchItemModel() {
            const { data, error } = await supabase
                .from('items')
                .select('model_url')
                .eq('id', selectedItemId)
                .single();

            if (error || !data) {
                console.error('[PlacementGhost] Could not fetch item:', error);
                setModelUrl(null);
                return;
            }

            setModelUrl(data.model_url);
        }

        fetchItemModel();
    }, [selectedItemId]);

    // Load Ghost Model
    useEffect(() => {
        if (!scene || !selectedItemId || !modelUrl) {
            if (ghostMeshRef.current) {
                ghostMeshRef.current.dispose();
                ghostMeshRef.current = null;
                loadedItemIdRef.current = null;
            }
            return;
        }

        // If already loaded for this item, don't reload
        if (loadedItemIdRef.current === selectedItemId && ghostMeshRef.current) {
            return;
        }

        // Clean up previous
        if (ghostMeshRef.current) {
            ghostMeshRef.current.dispose();
            ghostMeshRef.current = null;
        }

        loadedItemIdRef.current = selectedItemId;

        SceneLoader.ImportMeshAsync('', `${R2_PATHS.furniture}/${modelUrl}?v=${Date.now()}`, undefined, scene)
            .then((result) => {
                const root = result.meshes[0];
                if (!root) return;

                // Configure ghost appearance
                root.name = 'placement_ghost';
                root.isPickable = false;

                // Capture native rotation from GLB loader (coordinate system conversion)
                const nativeQuat = root.rotationQuaternion
                    ? root.rotationQuaternion.clone()
                    : Quaternion.FromEulerAngles(root.rotation.x, root.rotation.y, root.rotation.z);
                nativeQuatRef.current = nativeQuat;

                // Apply transparency to all sub-meshes
                result.meshes.forEach(mesh => {
                    mesh.isPickable = false;
                    mesh.checkCollisions = false;
                    mesh.visibility = 0.5; // Transparent
                });

                ghostMeshRef.current = root;

                // Initial hide until position is set
                root.isVisible = false;
                root.setEnabled(false); // Disable until we have a position
            })
            .catch(err => console.error("Ghost load error:", err));

        return () => {
            // Cleanup handled by next effect or unmount check, but mostly reliance on ref check above
        };
    }, [selectedItemId, scene, modelUrl]);

    // Update Ghost Transform from Props
    useEffect(() => {
        const ghost = ghostMeshRef.current;
        if (!ghost) return;

        if (isEditMode && pendingPlacement) {
            ghost.setEnabled(true);
            ghost.isVisible = true;
            ghost.position.copyFrom(pendingPlacement.position);
            // Compose user rotation with native GLB rotation (matches Furniture.tsx)
            const userQuat = Quaternion.FromEulerAngles(
                pendingPlacement.rotation.x,
                pendingPlacement.rotation.y,
                pendingPlacement.rotation.z
            );
            ghost.rotationQuaternion = userQuat.multiply(nativeQuatRef.current);

            // Sub-meshes need visibility reset in case logic changed? (Already set 0.5 on load)
        } else {
            ghost.setEnabled(false);
            ghost.isVisible = false;
        }
    }, [isEditMode, pendingPlacement]); // Run when parent updates props (pos/rot)

    // Track if we've auto-spawned for the current selection to prevent re-spawn
    const hasAutoSpawnedRef = useRef<string | null>(null);

    // Initial Auto-Spawn (Center of Screen) - ONLY ONCE per item selection
    useEffect(() => {
        if (!scene || !selectedItemId) {
            // Reset when selection clears
            hasAutoSpawnedRef.current = null;
            return;
        }

        // Don't spawn if we already spawned for this item
        if (hasAutoSpawnedRef.current === selectedItemId) return;

        // Don't spawn if we already have a placement
        if (pendingPlacement) return;

        // Wait for ghost mesh to be loaded
        if (!ghostMeshRef.current) return;

        // Mark as spawned for this item
        hasAutoSpawnedRef.current = selectedItemId;

        // Try to place it in front of the camera
        const ray = scene.createPickingRay(scene.getEngine().getRenderWidth() / 2, scene.getEngine().getRenderHeight() / 2, Matrix.Identity(), scene.activeCamera);
        const pickResult = scene.pickWithRay(ray, (mesh) => mesh.name === 'ground' || mesh.name === 'floor');

        if (pickResult && pickResult.hit && pickResult.pickedPoint) {
            const x = Math.round(clampToRoom(pickResult.pickedPoint.x));
            const z = Math.round(clampToRoom(pickResult.pickedPoint.z));
            const newPos = new Vector3(x, 0, z);
            onUpdate(newPos, new Vector3(0, 0, 0), false);
            console.log('[PlacementGhost] Auto-spawned at center:', newPos);
        } else {
            console.log('[PlacementGhost] Auto-spawn fallback to 0,0,0');
            onUpdate(new Vector3(0, 0, 0), new Vector3(0, 0, 0), false);
        }

    }, [scene, selectedItemId, pendingPlacement, onUpdate]);

    // Keep a ref to the latest PendingPlacement to access it inside the event listener
    // without triggering a re-run of the useEffect
    const pendingPlacementRef = useRef(pendingPlacement);
    useEffect(() => {
        pendingPlacementRef.current = pendingPlacement;
    }, [pendingPlacement]);

    // Input Handling (Raycast)
    useEffect(() => {
        if (!scene || !isEditMode || !selectedItemId) return;

        const observer = scene.onPointerObservable.add((pointerInfo) => {
            // Access current state via Ref
            const currentPlacement = pendingPlacementRef.current;

            // Handle Hover (Move) & Click (Lock)
            if (pointerInfo.type === PointerEventTypes.POINTERMOVE || pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) => {
                    return mesh.name === 'ground' || mesh.name === 'floor';
                });

                if (pickResult && pickResult.hit && pickResult.pickedPoint) {
                    const x = Math.round(clampToRoom(pickResult.pickedPoint.x));
                    const z = Math.round(clampToRoom(pickResult.pickedPoint.z));
                    const y = 0;

                    const newPos = new Vector3(x, y, z);
                    const currentRot = currentPlacement?.rotation || new Vector3(0, 0, 0);

                    // If "Locked", we update the position but KEEP it locked (remain in confirmation mode)
                    const shouldBeLocked = currentPlacement?.isLocked || (pointerInfo.type === PointerEventTypes.POINTERDOWN);

                    // POINTERMOVE: Update pos if we are dragging OR if we are just hovering
                    if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
                        // Only update if position actually changed to avoid spam
                        if (!currentPlacement || !currentPlacement.position.equals(newPos)) {
                            onUpdate(newPos, currentRot, !!shouldBeLocked);
                        }
                    }

                    // POINTERDOWN: Update pos and Ensure Locked
                    if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                        console.log('[PlacementGhost] 🔒 Relocated/Locked at', newPos);
                        onUpdate(newPos, currentRot, true);
                    }
                }
            }
        });

        return () => {
            scene.onPointerObservable.remove(observer);
        };
    }, [scene, isEditMode, selectedItemId, onUpdate]); // Removed pendingPlacement from deps!

    return null;
}
