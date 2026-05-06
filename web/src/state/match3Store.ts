import { create } from 'zustand';

type Match3Store = {
    isModalOpen: boolean;
    openMatch3Modal: () => void;
    closeMatch3Modal: () => void;
};

export const useMatch3Store = create<Match3Store>((set) => ({
    isModalOpen: false,
    openMatch3Modal: () => set({ isModalOpen: true }),
    closeMatch3Modal: () => set({ isModalOpen: false }),
}));
