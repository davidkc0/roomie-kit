import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface VoiceChatState {
    micOn: boolean;
    speakerOn: boolean;
    micAllowed: boolean;
    joined: boolean; // True when Agora channel is joined (runtime only, not persisted)

    setMicOn: (on: boolean) => void;
    setSpeakerOn: (on: boolean) => void;
    setMicAllowed: (allowed: boolean) => void;
    setJoined: (joined: boolean) => void;
    toggleMic: () => void;
    toggleSpeaker: () => void;
}

export const useVoiceChatStore = create<VoiceChatState>()(
    persist(
        (set, get) => ({
            micOn: false, // Default: mic off
            speakerOn: true,
            micAllowed: false,
            joined: false,

            setMicOn: (on) => set({ micOn: on }),
            setSpeakerOn: (on) => set({ speakerOn: on }),
            setMicAllowed: (allowed) => set({ micAllowed: allowed }),
            setJoined: (joined) => set({ joined }),
            toggleMic: () => {
                const { micAllowed, micOn } = get();
                if (micAllowed) {
                    set({ micOn: !micOn });
                }
            },
            toggleSpeaker: () => set((state) => ({ speakerOn: !state.speakerOn })),
        }),
        {
            name: 'voice-chat-prefs', // localStorage key
            partialize: (state) => ({
                micOn: state.micOn, // Only persist mic preference
                speakerOn: state.speakerOn
            }),
        }
    )
);
