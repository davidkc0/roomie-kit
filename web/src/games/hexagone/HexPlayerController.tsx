/**
 * HexPlayerController
 * Handles player movement specific to Hex Arena:
 *  - Horizontal movement with joystick/keyboard
 *  - Gravity + Jump mechanics
 *  - Hex collision detection (triggers tile destruction)
 *
 * Mounts during COUNTDOWN to pre-create agent mesh at spawn position.
 * Movement only starts when stage === 'game'.
 */

import { useRef, useEffect } from 'react';
import { useScene } from '../../world/scene';
import { calculateVelocity } from '../../state/movement';
import type { PlayerState } from '../../multiplayer/playroom';
import { MeshBuilder, Vector3, Mesh, Ray, AbstractMesh } from '@babylonjs/core';
import { useJumpStore, JUMP_FORCE, GRAVITY } from './jumpStore';
import { HEX_MOVE_SPEED, HEX_GRACE_PERIOD_MS } from './hexConfig';
import { useHexGameStore } from './hexGameStore';
import { getSpawnPosition } from './HexArena';

interface HexPlayerControllerProps {
    myId: string;
    movementInput: { forward: number; right: number };
    localPlayerStateRef: React.MutableRefObject<PlayerState | null>;
    createFallbackPlayer: () => PlayerState;
    onHexHit: (hexKey: string) => void;
    /** When true, movement is locked (countdown). When false, full movement (game). */
    frozen: boolean;
}

// Reusable vectors — allocated once, never GC'd
const _moveVec = new Vector3();
const _groundRayOrigin = new Vector3();
const _targetCameraPos = new Vector3();

export function HexPlayerController({
    myId,
    movementInput,
    localPlayerStateRef,
    createFallbackPlayer,
    onHexHit,
    frozen,
}: HexPlayerControllerProps) {
    const { scene, camera } = useScene();
    const agentMeshRef = useRef<Mesh | null>(null);
    const verticalVelocityRef = useRef(0);
    const isGroundedRef = useRef(false);
    const lastHexKeyRef = useRef<string | null>(null);
    const gameStartTimeRef = useRef<number | null>(null);
    const agentCreatedRef = useRef(false);
    // Camera follow refs
    const cameraLookAtRef = useRef<Vector3 | null>(null);
    const cameraPositionRef = useRef<Vector3 | null>(null);
    // Camera offset — zoomed out for arena visibility
    const CAMERA_OFFSET_Y = 12;
    const CAMERA_OFFSET_BACK = 30;

    // Store volatile props in refs to avoid effect re-runs
    const movementInputRef = useRef(movementInput);
    const onHexHitRef = useRef(onHexHit);
    const createFallbackPlayerRef = useRef(createFallbackPlayer);
    const frozenRef = useRef(frozen);

    // Update refs when props change (no effect re-runs)
    useEffect(() => { movementInputRef.current = movementInput; }, [movementInput]);
    useEffect(() => { onHexHitRef.current = onHexHit; }, [onHexHit]);
    useEffect(() => { createFallbackPlayerRef.current = createFallbackPlayer; }, [createFallbackPlayer]);
    useEffect(() => {
        // Track when game starts (frozen goes from true to false)
        if (frozenRef.current && !frozen) {
            gameStartTimeRef.current = performance.now();
            console.log('[HexPlayerController] Game started — grace period active for', HEX_GRACE_PERIOD_MS, 'ms');
        }
        frozenRef.current = frozen;
    }, [frozen]);

    // Keyboard jump listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                useJumpStore.getState().requestJump();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Create agent mesh — runs once on mount (during countdown)
    useEffect(() => {
        if (myId === 'none' || !scene || agentCreatedRef.current) return;

        // Always use a fresh spawn position — localPlayerStateRef may still hold
        // the death position from the previous game (e.g. y=-55)
        const spawn = getSpawnPosition();
        console.log('[HexPlayerController] Creating agent at:', spawn);

        const agent = MeshBuilder.CreateCapsule("hexPlayerAgent", { radius: 0.3, height: 2 }, scene);
        agent.visibility = 0;
        agent.checkCollisions = true;
        agent.ellipsoid = new Vector3(0.3, 1.0, 0.3);
        agent.ellipsoidOffset = new Vector3(0, 1.0, 0);
        agent.position.set(spawn.x, spawn.y, spawn.z);
        agentMeshRef.current = agent;
        agentCreatedRef.current = true;

        // Update state to match
        if (localPlayerStateRef.current) {
            localPlayerStateRef.current.pos = { x: spawn.x, y: spawn.y, z: spawn.z };
        }

        return () => {
            if (agentMeshRef.current && !agentMeshRef.current.isDisposed()) {
                agentMeshRef.current.dispose();
                agentMeshRef.current = null;
            }
            agentCreatedRef.current = false;
        };
    }, [scene, myId]); // Stable deps only

    // Movement loop — single observer, checks frozen flag per frame
    useEffect(() => {
        if (myId === 'none' || !scene || !camera) return;

        // Reusable ground ray — allocated once per effect
        const groundRay = new Ray(Vector3.Zero(), Vector3.Down(), 0.5);
        // Throttle raycast for hex detection — every N frames
        const HEX_RAY_INTERVAL = 6;
        let frameCount = 0;
        // Hex key regex — cached
        const hexKeyRegex = /^hex_(\d+-\d+-\d+)/;

        const observer = scene.onBeforeRenderObservable.add(() => {
            const agent = agentMeshRef.current;
            if (!agent) return;

            const deltaTime = scene.getEngine().getDeltaTime() / 1000;
            const dt = Math.min(deltaTime, 0.1);
            const isFrozen = frozenRef.current;

            const currentState = localPlayerStateRef.current ?? createFallbackPlayerRef.current();
            const input = movementInputRef.current;

            // --- Movement (only when not frozen) ---
            let velocityResult = { moveX: 0, moveZ: 0, rotY: currentState.rotY, hasInput: false };
            if (!isFrozen) {
                const cameraAlpha = camera.alpha;
                velocityResult = calculateVelocity(input, dt, cameraAlpha, HEX_MOVE_SPEED);
            }

            // --- Ground check (only when falling/landing) ---
            const wasGrounded = isGroundedRef.current;
            if (verticalVelocityRef.current <= 0) {
                _groundRayOrigin.set(agent.position.x, agent.position.y + 0.1, agent.position.z);
                groundRay.origin = _groundRayOrigin;
                const groundHit = scene.pickWithRay(groundRay, (mesh: AbstractMesh) =>
                    mesh.checkCollisions &&
                    mesh !== agent &&
                    mesh.name.startsWith('hex_')
                );
                isGroundedRef.current = !!(groundHit && groundHit.hit);
            }

            // --- Hex collision detection (throttled raycast, only when not frozen) ---
            // Check if still in grace period
            const inGracePeriod = gameStartTimeRef.current !== null &&
                (performance.now() - gameStartTimeRef.current) < HEX_GRACE_PERIOD_MS;

            frameCount++;
            if (!isFrozen && !inGracePeriod && isGroundedRef.current && (frameCount % HEX_RAY_INTERVAL === 0)) {
                _groundRayOrigin.set(agent.position.x, agent.position.y + 0.1, agent.position.z);
                groundRay.origin = _groundRayOrigin;
                const hexHit = scene.pickWithRay(groundRay, (mesh: AbstractMesh) =>
                    mesh.checkCollisions &&
                    mesh !== agent &&
                    mesh.name.startsWith('hex_')
                );

                const destroyedHexes = useHexGameStore.getState().destroyedHexes;
                if (hexHit?.hit && hexHit.pickedMesh) {
                    const hexName = hexHit.pickedMesh.name;
                    const match = hexName.match(hexKeyRegex);
                    const hexKey = match ? match[1] : hexName.replace('hex_', '').split('_')[0];

                    if (hexKey !== lastHexKeyRef.current && !destroyedHexes.has(hexKey)) {
                        lastHexKeyRef.current = hexKey;
                        onHexHitRef.current(hexKey);
                    }
                } else {
                    lastHexKeyRef.current = null;
                }
            }

            // --- Jump (only when not frozen) ---
            if (!isFrozen) {
                const jumpStore = useJumpStore.getState();
                if (jumpStore.jumpRequested && isGroundedRef.current) {
                    verticalVelocityRef.current = JUMP_FORCE;
                    isGroundedRef.current = false;
                    jumpStore.consumeJump();
                } else if (jumpStore.jumpRequested) {
                    jumpStore.consumeJump();
                }
            }

            // --- Gravity (always applies) ---
            if (!isGroundedRef.current) {
                verticalVelocityRef.current += GRAVITY * dt;
            } else if (wasGrounded) {
                verticalVelocityRef.current = Math.max(0, verticalVelocityRef.current);
            }

            // --- Apply movement (reuse vector) ---
            _moveVec.set(
                velocityResult.moveX,
                verticalVelocityRef.current * dt,
                velocityResult.moveZ,
            );
            agent.moveWithCollisions(_moveVec);
            agent.computeWorldMatrix(true);

            if (isGroundedRef.current && verticalVelocityRef.current < 0) {
                verticalVelocityRef.current = 0;
            }

            // --- Camera follow (reuse vectors) ---
            const px = agent.position.x;
            const py = agent.position.y;
            const pz = agent.position.z;

            _targetCameraPos.set(px, py + CAMERA_OFFSET_Y, pz - CAMERA_OFFSET_BACK);

            if (!cameraLookAtRef.current) {
                cameraLookAtRef.current = new Vector3(px, py, pz);
            }
            if (!cameraPositionRef.current) {
                cameraPositionRef.current = _targetCameraPos.clone();
            }

            // Lerp in-place (no allocations)
            const lookAt = cameraLookAtRef.current;
            lookAt.x += (px - lookAt.x) * 0.12;
            lookAt.y += (py - lookAt.y) * 0.12;
            lookAt.z += (pz - lookAt.z) * 0.12;

            const camPos = cameraPositionRef.current;
            camPos.x += (_targetCameraPos.x - camPos.x) * 0.1;
            camPos.y += (_targetCameraPos.y - camPos.y) * 0.1;
            camPos.z += (_targetCameraPos.z - camPos.z) * 0.1;

            // Apply to camera
            camera.target.copyFrom(lookAt);
            camera.radius = CAMERA_OFFSET_BACK;
            camera.alpha = 0;
            camera.beta = Math.atan2(CAMERA_OFFSET_BACK, CAMERA_OFFSET_Y);

            // --- Update local state ---
            const newRotY = velocityResult.hasInput ? velocityResult.rotY : currentState.rotY;

            let anim: 'idle' | 'walk' | 'jump' | 'fall' = 'idle';
            if (!isGroundedRef.current) {
                anim = verticalVelocityRef.current > 2 ? 'jump' : 'fall';
            } else if (velocityResult.hasInput) {
                anim = 'walk';
            }

            const newState: PlayerState = {
                ...currentState,
                pos: { x: px, y: py, z: pz },
                rotY: newRotY,
                anim: anim === 'jump' || anim === 'fall' ? 'walk' : anim,
            };
            localPlayerStateRef.current = newState;
        });

        return () => {
            scene.onBeforeRenderObservable.remove(observer);
        };
    }, [scene, camera, myId]); // Stable deps only

    return null;
}
