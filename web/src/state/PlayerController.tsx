import { useRef, useEffect } from 'react';
import { useScene } from '../world/scene';
import { calculateVelocity } from './movement';
import type { MovementInput } from './movement';
import type { PlayerState } from '../multiplayer/playroom';
import { MeshBuilder, Vector3, Mesh } from '@babylonjs/core';

type Props = {
  myId: string;
  movementInput: MovementInput;
  localPlayerStateRef: React.MutableRefObject<PlayerState | null>;
  createFallbackPlayer: () => PlayerState;
  videoElement: HTMLVideoElement | null;
  spawnPosition?: { x: number; y: number; z: number }; // Direct spawn position
};

export function PlayerController({
  myId,
  movementInput,
  localPlayerStateRef,
  createFallbackPlayer,
  spawnPosition,
}: Props) {
  const { scene, camera } = useScene();
  const agentMeshRef = useRef<Mesh | null>(null);
  const lastWalkTimeRef = useRef(0);
  const smoothedPosRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const stuckTimeRef = useRef(0);
  const prevPosRef = useRef<Vector3 | null>(null);

  // Dispose agent on unmount
  useEffect(() => {
    return () => {
      if (agentMeshRef.current) {
        agentMeshRef.current.dispose();
        agentMeshRef.current = null;
      }
    };
  }, []);

  // Movement Effect
  useEffect(() => {
    if (myId === 'none' || !scene) {
      return;
    }

    const observer = scene.onBeforeRenderObservable.add(() => {
      const deltaTime = scene.getEngine().getDeltaTime() / 1000;
      // Cap at 100ms to prevent huge jumps if tab inactive
      const dt = Math.min(deltaTime, 0.1);

      const currentState = localPlayerStateRef.current ?? createFallbackPlayer();

      // Ensure agent mesh exists
      if (!agentMeshRef.current && scene) {
        // =====================================================================
        // CRITICAL: SPAWN POSITION FIX - DO NOT CHANGE THIS LOGIC
        // =====================================================================
        // The spawnPosition prop is passed DIRECTLY from Room.tsx and contains
        // the exact coordinates of the spawn_point mesh detected in the GLB.
        // 
        // We use this prop directly instead of relying on localPlayerStateRef
        // because the ref chain has timing issues where the position gets
        // overwritten before the agent is created.
        //
        // If you change this, the avatar will spawn at (0,0,0) instead of
        // at the designated spawn point in custom rooms.
        // =====================================================================
        const startPos = spawnPosition || currentState.pos;
        console.log('[PlayerController] Creating agent at position:', startPos, spawnPosition ? '(from spawn prop)' : '(from state)');
        const agent = MeshBuilder.CreateCapsule("playerAgent", { radius: 0.3, height: 2 }, scene);
        agent.visibility = 0; // Invisible
        agent.checkCollisions = true;
        agent.ellipsoid = new Vector3(0.3, 1.0, 0.3);
        agent.ellipsoidOffset = new Vector3(0, 1.0, 0);
        agent.position.set(startPos.x, startPos.y, startPos.z);
        agentMeshRef.current = agent;

        // Also update localPlayerStateRef to match so Avatar renders correctly
        if (localPlayerStateRef.current) {
          localPlayerStateRef.current.pos = { x: startPos.x, y: startPos.y, z: startPos.z };
        }
      }

      const agent = agentMeshRef.current;
      if (!agent) {
        return;
      }

      // Check for external teleport (e.g. spawn point found)
      // If state pos differs from agent pos by more than 0.5 units, snap agent to state
      // This ensures spawn point updates are immediately applied
      const statePosVec = new Vector3(currentState.pos.x, currentState.pos.y, currentState.pos.z);
      const dist = Vector3.Distance(agent.position, statePosVec);
      if (dist > 0.5) {
        console.log('[PlayerController] Teleport detected (dist=' + dist.toFixed(2) + '), syncing agent to state', currentState.pos);
        agent.position.copyFrom(statePosVec);
      }

      // Calculate desired velocity from input
      const cameraAlpha = camera ? camera.alpha : -Math.PI / 2;
      const velocity = calculateVelocity(movementInput, dt, cameraAlpha);

      // Vertical velocity — constant gravity, no climbing/auto-step
      const verticalSpeed = -9.81;

      // Create movement vector with gravity
      const moveVec = new Vector3(velocity.moveX, verticalSpeed * dt, velocity.moveZ);

      // Apply collision movement
      agent.moveWithCollisions(moveVec);

      // CRITICAL: Force world matrix update after collision movement
      // This is essential for stable collision detection on subsequent frames
      // Without this, the physics can become out-of-sync causing jitter
      agent.computeWorldMatrix(true);

      // Stuck detection: if player hasn't moved despite input for 0.75s, auto-escape
      if (velocity.hasInput && prevPosRef.current) {
        const movedDistance = Vector3.Distance(prevPosRef.current, agent.position);
        if (movedDistance < 0.01) {
          stuckTimeRef.current += dt;
          if (stuckTimeRef.current > 0.75) {
            console.log('[PlayerController] Player stuck! Pushing backward to escape.');
            // Push backward (opposite of movement direction) instead of up
            // This prevents floating on top of objects
            const escapeDir = new Vector3(
              -Math.sin(velocity.rotY) * 1.5,
              0,
              -Math.cos(velocity.rotY) * 1.5
            );
            agent.position.addInPlace(escapeDir);
            stuckTimeRef.current = 0;
          }
        } else {
          stuckTimeRef.current = 0;
        }
      } else {
        stuckTimeRef.current = 0;
      }
      prevPosRef.current = agent.position.clone();

      // Kill Z - Respawn if fallen off world
      if (agent.position.y < -20) {
        // Respawn from sky at current X/Z location
        agent.position.set(currentState.pos.x, 20, currentState.pos.z);
      }

      // Update Local State directly from Agent Position
      // IMPORTANT: Keep previous rotY when not moving to prevent snap-to-camera bug
      const newRotY = velocity.hasInput ? velocity.rotY : currentState.rotY;

      // Determine Animation State with Debounce (Hysteresis)
      // Prevents "Idle" flickering during physics jitters or micro-pauses in input
      const now = performance.now();
      let newAnim = currentState.anim;

      if (velocity.hasInput) {
        newAnim = 'walk';
        lastWalkTimeRef.current = now;
      } else if (currentState.anim === 'walk') {
        // If we were walking, hold the state for 150ms before sleeping
        if (now - lastWalkTimeRef.current < 150) {
          newAnim = 'walk';
        } else {
          newAnim = 'idle';
        }
      }

      // Smooth visual position to dampen physics micro-jitter
      // Lerp factor 0.5 = responsive but smooth (higher = snappier, lower = smoother)
      const physicsPos = { x: agent.position.x, y: agent.position.y, z: agent.position.z };

      if (!smoothedPosRef.current) {
        // Initialize on first frame
        smoothedPosRef.current = { ...physicsPos };
      } else {
        // Lerp towards physics position
        const lerpFactor = 0.5;
        smoothedPosRef.current.x += (physicsPos.x - smoothedPosRef.current.x) * lerpFactor;
        smoothedPosRef.current.y += (physicsPos.y - smoothedPosRef.current.y) * lerpFactor;
        smoothedPosRef.current.z += (physicsPos.z - smoothedPosRef.current.z) * lerpFactor;
      }

      const newState = {
        ...currentState,
        pos: { ...smoothedPosRef.current },
        rotY: newRotY,
        anim: newAnim,
        // CRITICAL: Explicitly preserve extra state fields
        tvHeadEnabled: currentState.tvHeadEnabled,
        agoraVideoUid: currentState.agoraVideoUid,
      };

      localPlayerStateRef.current = newState;
    });

    return () => {
      scene.onBeforeRenderObservable.remove(observer);
    };
  }, [myId, movementInput, camera, localPlayerStateRef, createFallbackPlayer, scene]);

  return null;
}
