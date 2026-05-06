import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

export type MovementInput = {
  forward: number;
  right: number;
};

const SPEED = 0.07; // Default speed for all games
const ROTATION_SPEED = 0.03;

export function useKeyboardMovement(): MovementInput {
  const [input, setInput] = useState<MovementInput>({ forward: 0, right: 0 });
  const keysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
      updateInput();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
      updateInput();
    };

    const updateInput = () => {
      const keys = keysRef.current;
      let forward = 0;
      let right = 0;

      if (keys.has('w') || keys.has('arrowup')) {
        forward += 1;
      }
      if (keys.has('s') || keys.has('arrowdown')) {
        forward -= 1;
      }
      if (keys.has('a') || keys.has('arrowleft')) {
        right -= 1;
      }
      if (keys.has('d') || keys.has('arrowright')) {
        right += 1;
      }

      setInput({ forward, right });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return input;
}

type JoystickStore = {
  input: MovementInput;
  setInput: (input: MovementInput) => void;
};

const useJoystickStore = create<JoystickStore>((set) => ({
  input: { forward: 0, right: 0 },
  setInput: (input: MovementInput) => set({ input }),
}));

export function useJoystickMovement(): [
  MovementInput,
  (input: MovementInput) => void,
] {
  const input = useJoystickStore((state) => state.input);
  const setInput = useJoystickStore((state) => state.setInput);
  return [input, setInput];
}

export function calculateVelocity(
  input: MovementInput,
  deltaTime: number,
  cameraAlpha: number,
  speedOverride?: number
): { moveX: number; moveZ: number; rotY: number; hasInput: boolean } {
  const hasInput = input.forward !== 0 || input.right !== 0;

  if (!hasInput) {
    return { moveX: 0, moveZ: 0, rotY: 0, hasInput: false };
  }

  const inputAngle = Math.atan2(input.right, input.forward);
  const targetRotY = -cameraAlpha + inputAngle - Math.PI / 2;
  const newRotY = targetRotY;

  const moveSpeed = (speedOverride ?? SPEED) * deltaTime * 60;
  const inputMag = Math.min(1, Math.sqrt(input.forward ** 2 + input.right ** 2));
  const finalSpeed = moveSpeed * inputMag;

  const moveX = Math.sin(newRotY) * finalSpeed;
  const moveZ = Math.cos(newRotY) * finalSpeed;

  return { moveX, moveZ, rotY: newRotY, hasInput: true };
}

// Keeping updatePosition for backward compatibility or simple rooms if needed,
// but relying on calculateVelocity internally could be cleaner.
// For now, leaving it as is to minimize breakage risk during migration.
export function updatePosition(
  current: { x: number; y: number; z: number },
  rotY: number,
  input: MovementInput,
  deltaTime: number,
  cameraAlpha: number,
  roomHalfSize: number = 10
): { pos: { x: number; y: number; z: number }; rotY: number; anim: 'idle' | 'walk' } {
  // Legacy implementation...
  const velocity = calculateVelocity(input, deltaTime, cameraAlpha);

  if (!velocity.hasInput) {
    return { pos: current, rotY, anim: 'idle' };
  }

  const ROOM_HALF = roomHalfSize;
  const PLAYER_RADIUS = 0.5;
  const MIN_X = -ROOM_HALF + PLAYER_RADIUS;
  const MAX_X = ROOM_HALF - PLAYER_RADIUS;
  const MIN_Z = -ROOM_HALF + PLAYER_RADIUS;
  const MAX_Z = ROOM_HALF - PLAYER_RADIUS;

  let newX = current.x + velocity.moveX;
  let newZ = current.z + velocity.moveZ;

  newX = Math.max(MIN_X, Math.min(MAX_X, newX));
  newZ = Math.max(MIN_Z, Math.min(MAX_Z, newZ));

  return {
    pos: { x: newX, y: current.y, z: newZ },
    rotY: velocity.rotY,
    anim: 'walk',
  };
}

