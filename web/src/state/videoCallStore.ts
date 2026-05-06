import { create } from 'zustand';

export type CallStatus = 'idle' | 'calling' | 'incoming' | 'connected';

export type RemoteUser = {
    id: string;
    username?: string;
    avatarUrl?: string;
};

type VideoCallStore = {
    status: CallStatus;
    roomId: string | null;
    remoteUser: RemoteUser | null;
    isCaller: boolean; // true if I initiated the call

    // Actions
    startCall: (roomId: string, remoteUser: RemoteUser) => void;
    receiveCall: (roomId: string, remoteUser: RemoteUser) => void;
    acceptCall: () => void;
    declineCall: () => void;
    endCall: () => void;
    setConnected: () => void;
};

export const useVideoCallStore = create<VideoCallStore>((set) => ({
    status: 'idle',
    roomId: null,
    remoteUser: null,
    isCaller: false,

    startCall: (roomId, remoteUser) => set({
        status: 'calling',
        roomId,
        remoteUser,
        isCaller: true
    }),

    receiveCall: (roomId, remoteUser) => set({
        status: 'incoming',
        roomId,
        remoteUser,
        isCaller: false
    }),

    acceptCall: () => set((state) => {
        console.log('[VideoCallStore] acceptCall() called. Current state:', state.status, 'roomId:', state.roomId);
        // Set to 'connected' to show the overlay
        return { status: 'connected' };
    }),

    declineCall: () => set({
        status: 'idle',
        roomId: null,
        remoteUser: null,
        isCaller: false
    }),

    endCall: () => set({
        status: 'idle',
        roomId: null,
        remoteUser: null,
        isCaller: false
    }),

    setConnected: () => set({ status: 'connected' })
}));
