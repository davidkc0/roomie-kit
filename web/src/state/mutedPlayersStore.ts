import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MutedPlayersState {
    mutedPlayerIds: string[];
    mutePlayer: (playerId: string) => void;
    unmutePlayer: (playerId: string) => void;
    isPlayerMuted: (playerId: string) => boolean;
    toggleMute: (playerId: string) => void;
}

export const useMutedPlayersStore = create<MutedPlayersState>()(
    persist(
        (set, get) => ({
            mutedPlayerIds: [],

            mutePlayer: (playerId: string) => {
                set((state) => ({
                    mutedPlayerIds: state.mutedPlayerIds.includes(playerId)
                        ? state.mutedPlayerIds
                        : [...state.mutedPlayerIds, playerId]
                }));
            },

            unmutePlayer: (playerId: string) => {
                set((state) => ({
                    mutedPlayerIds: state.mutedPlayerIds.filter(id => id !== playerId)
                }));
            },

            isPlayerMuted: (playerId: string) => {
                return get().mutedPlayerIds.includes(playerId);
            },

            toggleMute: (playerId: string) => {
                const { isPlayerMuted, mutePlayer, unmutePlayer } = get();
                if (isPlayerMuted(playerId)) {
                    unmutePlayer(playerId);
                } else {
                    mutePlayer(playerId);
                }
            },
        }),
        {
            name: 'muted-players-storage',
        }
    )
);
