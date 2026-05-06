import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Hook to get real-time user count for a room via Supabase Presence
 * @param roomSlug - The room slug to track (e.g., 'lounge', 'theater')
 * @returns The number of users currently in the room
 */
export function useRoomPresence(roomSlug: string): number {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!roomSlug) return;

        const channel: RealtimeChannel = supabase.channel(`room-presence:${roomSlug}`, {
            config: {
                presence: {
                    key: 'users',
                },
            },
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                // Count all users across all keys
                const totalCount = Object.values(state).reduce(
                    (acc, presences) => acc + (presences as any[]).length,
                    0
                );
                setCount(totalCount);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [roomSlug]);

    return count;
}

/**
 * Track presence in a room (call when joining)
 * @param roomSlug - The room slug
 * @param userId - The user's ID
 * @returns Cleanup function to call when leaving
 */
export function trackRoomPresence(
    roomSlug: string,
    userId: string
): { channel: RealtimeChannel; untrack: () => Promise<void> } {
    const channel = supabase.channel(`room-presence:${roomSlug}`, {
        config: {
            presence: {
                key: userId,
            },
        },
    });

    channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await channel.track({ user_id: userId, online_at: new Date().toISOString() });
            console.log(`[Presence] Tracking user ${userId} in room ${roomSlug}`);
        }
    });

    return {
        channel,
        untrack: async () => {
            await channel.untrack();
            supabase.removeChannel(channel);
            console.log(`[Presence] Untracked user ${userId} from room ${roomSlug}`);
        },
    };
}

/**
 * Get the current user count for a room (one-shot, not reactive)
 * Useful for pre-join validation
 * @param roomSlug - The room slug
 * @returns Promise resolving to current user count
 */
export async function getRoomUserCount(roomSlug: string): Promise<number> {
    return new Promise((resolve) => {
        const channel = supabase.channel(`room-presence-check:${roomSlug}`, {
            config: {
                presence: {
                    key: 'check',
                },
            },
        });

        const timeout = setTimeout(() => {
            supabase.removeChannel(channel);
            resolve(0); // Default to 0 if timeout
        }, 3000);

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const totalCount = Object.values(state).reduce(
                    (acc, presences) => acc + (presences as any[]).length,
                    0
                );
                clearTimeout(timeout);
                supabase.removeChannel(channel);
                resolve(totalCount);
            })
            .subscribe();
    });
}
