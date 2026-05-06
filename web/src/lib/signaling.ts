
import { supabase } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

// Event Types - Video Call + Chess
export type SignalType =
    | 'request' | 'accept' | 'decline' | 'end'  // Video call
    | 'chess_request' | 'chess_accept' | 'chess_decline' | 'chess_move' | 'chess_resign';  // Chess

export type SignalPayload = {
    type: SignalType;
    fromId: string;
    fromName?: string;
    fromAvatar?: string;
    toId: string;
    roomId: string; // The Agora channel ID or game session ID

    // Chess-specific fields (optional)
    move?: { from: string; to: string };
    playerColor?: 'w' | 'b';
    fen?: string; // Current board state for sync
};

type SignalCallback = (payload: SignalPayload) => void;

let channel: RealtimeChannel | null = null;
const listeners: Set<SignalCallback> = new Set();
const CHANNEL_NAME = 'global-signaling';

// Initialize the signaling channel
export function initSignaling(userId: string) {
    if (channel) return;

    console.log('[Signaling] Initializing channel:', CHANNEL_NAME);

    channel = supabase.channel(CHANNEL_NAME)
        .on(
            'broadcast',
            { event: 'signal' },
            (payload) => {
                const signal = payload.payload as SignalPayload;
                // console.log('[Signaling] Received signal:', signal);

                // Filter messages meant for us
                if (signal.toId === userId) {
                    console.log('[Signaling] Signal matched local user:', signal.type);
                    listeners.forEach((cb) => cb(signal));
                }
            }
        )
        .subscribe((status) => {
            console.log('[Signaling] Channel status:', status);
        });
}

export function cleanupSignaling() {
    if (channel) {
        supabase.removeChannel(channel);
        channel = null;
    }
    listeners.clear();
}

export function subscribeToSignals(callback: SignalCallback) {
    listeners.add(callback);
    return () => {
        listeners.delete(callback);
    };
}

// Send methods
export async function sendSignal(payload: SignalPayload) {
    if (!channel) {
        console.warn('[Signaling] Cannot send, channel not initialized');
        return;
    }

    await channel.send({
        type: 'broadcast',
        event: 'signal',
        payload
    });
    console.log('[Signaling] Sent signal:', payload.type, 'to:', payload.toId);
}
