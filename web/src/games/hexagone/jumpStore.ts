/**
 * Jump State Store
 * Manages jump state for the Hex Arena game.
 * Can be triggered by spacebar (keyboard) or ActionButton (mobile).
 */

import { create } from 'zustand';

interface JumpState {
    /** Whether jump is requested this frame */
    jumpRequested: boolean;
    /** Whether player is currently in the air */
    isInAir: boolean;
    /** Vertical velocity */
    verticalVelocity: number;
    /** Whether player has landed since last jump */
    hasLanded: boolean;

    // Actions
    requestJump: () => void;
    consumeJump: () => void;
    setInAir: (inAir: boolean) => void;
    setVerticalVelocity: (v: number) => void;
    land: () => void;
    reset: () => void;
}

export const useJumpStore = create<JumpState>((set) => ({
    jumpRequested: false,
    isInAir: false,
    verticalVelocity: 0,
    hasLanded: true,

    requestJump: () => set({ jumpRequested: true }),
    consumeJump: () => set({ jumpRequested: false }),
    setInAir: (inAir) => set({ isInAir: inAir }),
    setVerticalVelocity: (v) => set({ verticalVelocity: v }),
    land: () => set({ isInAir: false, hasLanded: true, verticalVelocity: 0 }),
    reset: () => set({ jumpRequested: false, isInAir: false, verticalVelocity: 0, hasLanded: true }),
}));

// Physics constants - matched to wawa-guys reference
// Reference: JUMP_FORCE=8, gravityScale=2.5 (effective gravity ~-24.5)
// This gives ~1.3 unit max jump height
export const JUMP_FORCE = 8;    // Initial upward velocity (was 12)
export const GRAVITY = -25;     // Gravity acceleration (was -30)
