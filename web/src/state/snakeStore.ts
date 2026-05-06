import { create } from 'zustand';

interface SnakeStore {
    isModalOpen: boolean;
    openSnakeModal: () => void;
    closeSnakeModal: () => void;
}

export const useSnakeStore = create<SnakeStore>((set) => ({
    isModalOpen: false,
    openSnakeModal: () => set({ isModalOpen: true }),
    closeSnakeModal: () => set({ isModalOpen: false }),
}));
