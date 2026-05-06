import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type JoystickMode = 'dynamic' | 'fixed';

interface ControlsPrefsState {
    /** 'dynamic' = Roblox-style invisible joystick, 'fixed' = always-visible classic joystick */
    joystickMode: JoystickMode;
    /** Whether the user has seen the first-time controls tutorial */
    hasSeenControlsTutorial: boolean;
    setJoystickMode: (mode: JoystickMode) => void;
    markTutorialSeen: () => void;
}

export const useControlsPrefsStore = create<ControlsPrefsState>()(
    persist(
        (set) => ({
            joystickMode: 'dynamic',
            hasSeenControlsTutorial: false,
            setJoystickMode: (mode) => set({ joystickMode: mode }),
            markTutorialSeen: () => set({ hasSeenControlsTutorial: true }),
        }),
        {
            name: 'controls-prefs',
        }
    )
);
