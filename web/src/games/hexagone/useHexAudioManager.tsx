import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { resolveAssetUrl } from '../../config/r2';

type AudioManagerContextType = {
    playAudio: (file: string, force?: boolean) => void;
    audioEnabled: boolean;
    setAudioEnabled: (enabled: boolean) => void;
};

const AudioManagerContext = createContext<AudioManagerContextType | null>(null);

// Audio pool — all sounds must use these gesture-unlocked elements on iOS
const POOL_SIZE = 8;

// Smallest valid silent MP3 — used to "unlock" each Audio element on iOS via user gesture
const SILENT_MP3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAABhkVLaRcAAAAAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAABhkVLaRcAAAAAAAAAAAAAAAAAAAAA';

export function AudioManagerProvider({ children }: { children: React.ReactNode }) {
    const lastAudioPlayed = useRef(performance.now());
    const bgAudio = useRef<HTMLAudioElement | null>(null);
    const [audioEnabled, setAudioEnabled] = useState(true);
    const audioUnlockedRef = useRef(false);
    const audioPoolRef = useRef<HTMLAudioElement[]>([]);
    const poolIndexRef = useRef(0);



    // Create audio pool
    useEffect(() => {
        const pool: HTMLAudioElement[] = [];
        for (let i = 0; i < POOL_SIZE; i++) {
            pool.push(new Audio());
        }
        audioPoolRef.current = pool;

        return () => {
            pool.forEach(a => {
                a.pause();
                a.src = '';
            });
            audioPoolRef.current = [];
        };
    }, []);

    // Initialize background music
    useEffect(() => {
        bgAudio.current = new Audio(resolveAssetUrl('bg.mp3', 'sfx'));
        bgAudio.current.loop = true;
        bgAudio.current.volume = 0.3;

        return () => {
            if (bgAudio.current) {
                bgAudio.current.pause();
                bgAudio.current = null;
            }
        };
    }, []);

    // Unlock audio on user interaction
    // iOS WebView requires .play() on EACH HTMLAudioElement during a user gesture.
    // We iterate all pool elements + bgAudio and play a silent buffer through each.
    useEffect(() => {
        const unlock = () => {
            if (audioUnlockedRef.current) return;
            audioUnlockedRef.current = true;

            // Unlock EVERY pool element by playing silence through it
            // Skip elements currently playing real audio — they're already unlocked
            const pool = audioPoolRef.current;
            for (const audio of pool) {
                if (!audio.paused && audio.src && !audio.src.startsWith('data:')) continue;
                audio.src = SILENT_MP3;
                audio.volume = 0;
                audio.play().then(() => {
                    audio.pause();
                    audio.currentTime = 0;
                    audio.volume = 0.5;
                }).catch(() => { });
            }

            // Unlock background music element too
            if (bgAudio.current) {
                const bg = bgAudio.current;
                const origSrc = bg.src;
                bg.src = SILENT_MP3;
                bg.volume = 0;
                bg.play().then(() => {
                    bg.pause();
                    bg.currentTime = 0;
                    bg.src = origSrc;
                    bg.volume = 0.3;
                    // Now try to actually play bg music if enabled
                    if (audioEnabled) {
                        bg.play().catch(() => { });
                    }
                }).catch(() => { });
            }

            // Resume AudioContext
            try {
                const ctx = new AudioContext();
                if (ctx.state === 'suspended') {
                    ctx.resume().then(() => ctx.close());
                } else {
                    ctx.close();
                }
            } catch (_) { }

            console.log('[Audio] Unlocked audio playback via user gesture (all pool elements)');
        };

        // Always re-register on mount (handles WebView crash recovery)
        audioUnlockedRef.current = false;

        document.addEventListener('touchstart', unlock, { once: true });
        document.addEventListener('click', unlock, { once: true });

        return () => {
            document.removeEventListener('touchstart', unlock);
            document.removeEventListener('click', unlock);
        };
    }, []);

    // Handle background music play/pause
    useEffect(() => {
        if (!bgAudio.current || !audioUnlockedRef.current) return;

        if (audioEnabled) {
            bgAudio.current.play().catch(err => {
                console.warn('[Audio] Failed to play background music:', err);
            });
        } else {
            bgAudio.current.pause();
        }
    }, [audioEnabled]);

    // STABLE playAudio — all sounds use gesture-unlocked pool elements
    const playAudio = useCallback((file: string, force = false) => {
        if (!audioEnabled) return;

        const now = performance.now();

        // Throttle non-forced sounds (100ms)
        if (!force && now - lastAudioPlayed.current < 100) return;

        lastAudioPlayed.current = now;

        const pool = audioPoolRef.current;
        if (pool.length === 0) return;

        const audio = pool[poolIndexRef.current % pool.length];
        poolIndexRef.current++;

        audio.src = resolveAssetUrl(`${file}.mp3`, 'sfx');
        audio.volume = 0.5;
        audio.currentTime = 0;
        audio.play().catch(err => {
            console.warn(`[Audio] Failed to play ${file}:`, err);
        });
    }, [audioEnabled]);

    const contextValue = useMemo(() => ({
        playAudio,
        audioEnabled,
        setAudioEnabled,
    }), [playAudio, audioEnabled]);

    return (
        <AudioManagerContext.Provider value={contextValue}>
            {children}
        </AudioManagerContext.Provider>
    );
}

export function useHexAudioManager() {
    const audioManager = useContext(AudioManagerContext);
    if (!audioManager) {
        throw new Error('useHexAudioManager must be used within an AudioManagerProvider');
    }
    return audioManager;
}
