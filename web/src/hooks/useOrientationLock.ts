import { useEffect } from 'react';
import { ScreenOrientation } from '@capacitor/screen-orientation';

/**
 * Hook to control screen orientation lock per-screen.
 * 
 * @param lockToPortrait - If true, locks to portrait. If false, allows landscape.
 * 
 * Usage:
 * - Room.tsx: useOrientationLock(false) // allows landscape
 * - Lobby/Profile/etc: useOrientationLock(true) // portrait only
 */
export function useOrientationLock(lockToPortrait: boolean) {
    useEffect(() => {
        const setOrientation = async () => {
            try {
                if (lockToPortrait) {
                    await ScreenOrientation.lock({ orientation: 'portrait' });
                    console.log('[Orientation] Locked to portrait');
                } else {
                    await ScreenOrientation.unlock();
                    console.log('[Orientation] Unlocked (landscape allowed)');
                }
            } catch (error) {
                // Web fallback - orientation lock may not be supported
                console.log('[Orientation] Not supported on this platform:', error);
            }
        };

        setOrientation();

        // Cleanup: re-lock to portrait when leaving a page that allowed landscape
        return () => {
            if (!lockToPortrait) {
                ScreenOrientation.lock({ orientation: 'portrait' }).catch(() => {
                    // Ignore errors on cleanup
                });
            }
        };
    }, [lockToPortrait]);
}
