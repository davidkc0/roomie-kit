import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Stores user's camera preference for avatar rooms (TV head display).
 * This is ONLY for avatar room camera, NOT for video calls or streams.
 */
interface CameraPrefsState {
    cameraOn: boolean;
    setCameraOn: (on: boolean) => void;
    toggleCamera: () => void;
}

export const useCameraPrefsStore = create<CameraPrefsState>()(
    persist(
        (set, get) => ({
            cameraOn: true, // Default: camera on (matches original behavior)

            setCameraOn: (on) => set({ cameraOn: on }),
            toggleCamera: () => set({ cameraOn: !get().cameraOn }),
        }),
        {
            name: 'camera-prefs', // localStorage key
        }
    )
);
