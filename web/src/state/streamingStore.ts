import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { writeMyState, registerRpc, callRpc, getMyId } from '../multiplayer/playroom';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useEconomyStore } from './economyStore';

// ============================================
// TIMING CONSTANTS
// ============================================
export const STREAM_DURATION = 5 * 60 * 1000;  // 5 minutes
export const VOTING_DURATION = 1 * 60 * 1000;  // 1 minute
export const ACCEPT_TIMEOUT = 10 * 1000;       // 10 seconds

// ============================================
// TYPES
// ============================================
export type StreamStatus =
    | 'empty'           // No one opted in
    | 'solo_streaming'  // 1 person, streaming immediately
    | 'active_stream'   // Actively streaming to audience
    | 'voting'          // Voting period (1 min)
    | 'winner_accepting'; // Winner has 10s to accept

export type StreamCandidate = {
    id: string;
    name: string;
    avatarUrl?: string;
    votes: number;
    optInTime: number;
};

export type Gift = {
    id: string;
    name: string;
    cost: number;
    gem_value: number;
    icon_url: string | null;
    animation_type: string;
};

export type GiftEvent = {
    id: string;
    senderName: string;
    giftName: string;
    timestamp: number;
    combo: number;      // Combo count (1 = first, 2+ = rapid succession)
    expiresAt: number;  // Timestamp when this item should auto-dismiss
};

type StreamingState = {
    // Room context
    roomSlug: string | null;
    isTheater: boolean;

    // Personal Room Stream Mode (owner-controlled)
    personalRoomMode: '3d' | 'stream';
    personalRoomOwnerId: string | null;  // ID of owner who can control mode

    // Stream status
    status: StreamStatus;
    currentStreamerId: string | null;
    currentStreamerSbaId: string | null; // Supabase auth UUID for gifts
    currentStreamerName: string | null;
    currentStreamerImage: string | null; // Profile image URL
    streamEndTime: number | null;

    // Voting
    candidates: StreamCandidate[];
    votingEndTime: number | null;
    myVote: string | null;

    // Winner acceptance
    winnerId: string | null;
    acceptDeadline: number | null;

    // Opt-in queue
    queue: StreamCandidate[];
    hasOptedIn: boolean;

    // Gifts
    gifts: Gift[];
    recentGifts: GiftEvent[];
    lastGiftEvent: { giftName: string; senderName: string; combo: number } | null; // Ephemeral for animations
    _giftSubscription: RealtimeChannel | null;

    // Local Combo Tracking (Internal)
    localComboCount: number;
    lastGiftSentTime: number;

    // Camera
    facingMode: 'user' | 'environment';
};

type StreamingActions = {
    // Initialization
    initForRoom: (roomSlug: string) => void;
    reset: () => void;

    // Personal Room Mode (owner-controlled)
    setPersonalRoomMode: (mode: '3d' | 'stream', ownerId: string) => void;
    initPersonalRoomOwner: (ownerId: string) => void;

    // Opt-in
    optIn: (userId: string, userName: string, avatarUrl?: string) => void;
    optOut: (userId: string) => void;

    // Streaming
    startStream: (streamerId: string, streamerName: string, streamerSbaId?: string, streamerImage?: string) => void;
    endStream: () => void;

    // Voting
    startVoting: () => void;
    castVote: (candidateId: string) => void;
    endVoting: () => void;

    // Winner acceptance
    acceptStream: () => void;
    declineStream: () => void;

    // Gifts
    fetchGifts: () => Promise<void>;
    sendGift: (senderId: string, recipientId: string, giftId: string, giftName: string, senderName: string) => Promise<boolean>;
    addGiftEvent: (senderName: string, giftName: string) => void;
    cleanupExpiredGifts: () => void;
    subscribeToGifts: (roomSlug: string) => void;
    unsubscribeFromGifts: () => void;
    initGiftsForRoom: (roomSlug: string) => void;
    cleanupGifts: () => void;

    // Camera
    toggleCamera: () => void;

    // Sync from player state detection (called by Room.tsx)
    syncFromPlayerState: (streamerId: string | null, streamerName: string | null, streamerSbaId?: string | null, streamerImage?: string | null) => void;
};

const initialState: StreamingState = {
    roomSlug: null,
    isTheater: false,
    personalRoomMode: '3d',
    personalRoomOwnerId: null,
    status: 'empty',
    currentStreamerId: null,
    currentStreamerSbaId: null,
    currentStreamerName: null,
    currentStreamerImage: null,
    streamEndTime: null,
    candidates: [],
    votingEndTime: null,
    myVote: null,
    winnerId: null,
    acceptDeadline: null,
    queue: [],
    hasOptedIn: false,
    gifts: [],
    recentGifts: [],
    lastGiftEvent: null,
    _giftSubscription: null,
    localComboCount: 0,
    lastGiftSentTime: 0,
    facingMode: 'user',
};

export const useStreamingStore = create<StreamingState & StreamingActions>((set, get) => ({
    ...initialState,

    // ============================================
    // INITIALIZATION
    // ============================================
    initForRoom: (roomSlug: string) => {
        const isTheater = roomSlug === 'theater' || roomSlug === 'theater2';
        set({
            roomSlug,
            isTheater,
            status: 'empty',
            currentStreamerId: null,
            currentStreamerName: null,
            candidates: [],
            queue: [],
            hasOptedIn: false,
        });

        if (isTheater) {
            get().fetchGifts();
            get().subscribeToGifts(roomSlug);

            // Register RPCs for Distributed Queue Management
            registerRpc('OPT_IN', (data) => {
                const { queue } = get();
                if (queue.some(c => c.id === data.id)) return;
                set({
                    queue: [...queue, { ...data, votes: 0, optInTime: Date.now() }],
                    candidates: [...get().candidates, { ...data, votes: 0, optInTime: Date.now() }]
                });
            });

            registerRpc('OPT_OUT', (data) => {
                const { queue } = get();
                set({
                    queue: queue.filter(c => c.id !== data.id),
                    candidates: get().candidates.filter(c => c.id !== data.id)
                });
            });

            registerRpc('NEXT_TURN', (data) => {
                const myId = getMyId();
                console.log('[StreamingStore] Received NEXT_TURN signal for:', data.nextId);

                // If I am the chosen one, start streaming!
                if (data.nextId === myId) {
                    console.log('[StreamingStore] It is my turn! Starting stream.');
                    get().startStream(data.nextId, data.nextName);
                }
            });

            // Add Voting RPCs later if needed, but Queue+NextTurn covers the core flow
        }

        // Register Personal Room Mode RPC (for all rooms, not just theater)
        registerRpc('PERSONAL_ROOM_MODE', (data: { mode: '3d' | 'stream' }) => {
            console.log('[StreamingStore] Received PERSONAL_ROOM_MODE:', data.mode);
            set({ personalRoomMode: data.mode });
        });
    },

    reset: () => set(initialState),

    // ============================================
    // PERSONAL ROOM MODE (Owner-controlled)
    // ============================================
    initPersonalRoomOwner: (ownerId: string) => {
        set({ personalRoomOwnerId: ownerId });
    },

    setPersonalRoomMode: (mode: '3d' | 'stream', ownerId: string) => {
        const { personalRoomOwnerId } = get();
        // Only the owner can change the mode
        if (personalRoomOwnerId !== ownerId) {
            console.warn('[StreamingStore] setPersonalRoomMode: Only owner can change mode');
            return;
        }
        console.log('[StreamingStore] Setting personal room mode:', mode);
        set({ personalRoomMode: mode });

        // Persist to owner's player state so new users joining can detect active call
        writeMyState({ personalRoomStreamActive: mode === 'stream' }).catch((err: any) =>
            console.error('[StreamingStore] Failed to write personalRoomStreamActive:', err)
        );

        // Broadcast mode change to all users already in room via RPC
        callRpc('PERSONAL_ROOM_MODE', { mode });
    },

    // ============================================
    // OPT-IN / OPT-OUT
    // ============================================
    optIn: (userId, userName, avatarUrl) => {
        const { queue } = get();
        if (queue.some(c => c.id === userId)) return;

        // Broadcast intent
        callRpc('OPT_IN', { id: userId, name: userName, avatarUrl });

        // Update local immediately
        const newCandidate: StreamCandidate = {
            id: userId,
            name: userName,
            avatarUrl,
            votes: 0,
            optInTime: Date.now(),
        };

        set({
            queue: [...queue, newCandidate],
            candidates: [...get().candidates, newCandidate],
            hasOptedIn: true,
        });
    },

    optOut: (userId) => {
        // Broadcast intent
        callRpc('OPT_OUT', { id: userId });

        // Update local immediately
        const { queue, candidates } = get();
        set({
            queue: queue.filter(c => c.id !== userId),
            candidates: candidates.filter(c => c.id !== userId),
            hasOptedIn: false,
        });
    },

    // ============================================
    // STREAMING (Player-State Based)
    // ============================================
    startStream: (streamerId, streamerName, streamerSbaId, streamerImage) => {
        const endTime = Date.now() + STREAM_DURATION;
        console.log('[StreamingStore] startStream:', { streamerId, streamerName, streamerSbaId, streamerImage });

        // Broadcast OPT_OUT to ensure everyone removes me from their queue
        // (Even if I'm not in my own queue, ensure network knows I'm busy)
        callRpc('OPT_OUT', { id: streamerId });

        // CONSUME QUEUE ENTRY LOCALLY (Double check)
        const { queue, candidates } = get();
        set({
            queue: queue.filter(c => c.id !== streamerId),
            candidates: candidates.filter(c => c.id !== streamerId),
            hasOptedIn: false,
        });

        // Write to player state - this is the SOURCE OF TRUTH for STATUS
        writeMyState({ isStreaming: true }).catch((err: any) =>
            console.error('[StreamingStore] Failed to write isStreaming:', err)
        );

        // Update local state
        set({
            status: 'active_stream',
            currentStreamerId: streamerId,
            currentStreamerSbaId: streamerSbaId || null, // Store Supabase UUID for gifts
            currentStreamerName: streamerName,
            currentStreamerImage: streamerImage || null,
            streamEndTime: endTime,
            votingEndTime: null,
            winnerId: null,
            acceptDeadline: null,
        });
    },

    endStream: () => {
        const { queue, currentStreamerId } = get();
        console.log('[StreamingStore] endStream called. Streamer:', currentStreamerId);

        // Clear player state
        writeMyState({ isStreaming: false }).catch((err: any) =>
            console.error('[StreamingStore] Failed to clear isStreaming:', err)
        );

        // Clear local state
        set({
            status: 'empty',
            currentStreamerId: null,
            currentStreamerName: null,
            streamEndTime: null,
        });

        // Handoff Logic
        // Filter out self just in case (though startStream should have removed us)
        const validQueue = queue.filter(c => c.id !== currentStreamerId);

        // FIFO - pick the next person
        if (validQueue.length >= 1) {
            // Pick first in line
            const next = validQueue[0];
            console.log('[StreamingStore] Handoff: Signaling next player:', next.id);

            // Send signal to that specific player
            callRpc('NEXT_TURN', { nextId: next.id, nextName: next.name });

            // Note: We don't call startStream() locally for them.
            // They will receive the RPC and call it themselves.
            // This ensures they become the authority for their own stream.
        }

        // Refresh balances to capture all earned gems from this stream session
        useEconomyStore.getState().fetchBalances().catch(err =>
            console.error('[StreamingStore] Failed to refresh balances after stream:', err)
        );

        // TODO: Re-integrate Voting if desired, but FIFO is simpler/ safer for now.
    },

    // Called by Room.tsx when it detects a remote player's isStreaming state changed
    syncFromPlayerState: (streamerId: string | null, streamerName: string | null, streamerSbaId?: string | null, streamerImage?: string | null) => {
        const { currentStreamerId, currentStreamerSbaId, currentStreamerName } = get();

        // If ID matches, check if we need to UPDATE metadata (late profile load)
        if (currentStreamerId === streamerId) {
            // If we're missing SbaId but now have it, update
            const needsUpdate = (!currentStreamerSbaId && streamerSbaId) ||
                (currentStreamerName === 'Streamer' && streamerName && streamerName !== 'Streamer');
            if (needsUpdate) {
                console.log('[StreamingStore] Updating streamer metadata:', { streamerName, streamerSbaId });
                set({
                    currentStreamerSbaId: streamerSbaId || currentStreamerSbaId,
                    currentStreamerName: streamerName || currentStreamerName,
                    currentStreamerImage: streamerImage || get().currentStreamerImage,
                });
            }
            return;
        }

        if (streamerId) {
            console.log('[StreamingStore] Syncing from remote player state:', { streamerId, streamerName, streamerSbaId, streamerImage });
            set({
                status: 'active_stream',
                currentStreamerId: streamerId,
                currentStreamerSbaId: streamerSbaId || null, // Capture remote UUID
                currentStreamerName: streamerName,
                currentStreamerImage: streamerImage || null,
                // We don't know the exact end time from just "isStreaming: true",
                // but we can assume it's valid or relying on other signals.
                // For now, allow it.
            });

            // Note: We don't call startStream() locally for them.
            // But we do need to update candidates/queue visually
            const { queue, candidates } = get();
            if (queue.some(c => c.id === streamerId)) {
                set({
                    queue: queue.filter(c => c.id !== streamerId),
                    candidates: candidates.filter(c => c.id !== streamerId)
                });
            }
        } else {
            console.log('[StreamingStore] syncFromPlayerState - stream ended');
            set({
                status: 'empty',
                currentStreamerId: null,
                currentStreamerName: null,
                streamEndTime: null,
            });
        }
    },

    // ============================================
    // VOTING (Stubbed for now to focus on reliable FIFO)
    // ============================================
    startVoting: () => {
        console.warn('[StreamingStore] Voting temporarily disabled for robust FIFO');
    },

    castVote: (candidateId) => {
        // ...
    },

    endVoting: () => {
        // ...
    },

    // ============================================
    // WINNER ACCEPTANCE
    // ============================================
    acceptStream: () => {
        // ...
    },

    declineStream: () => {
        // ...
    },

    // ============================================
    // GIFTS
    // ============================================
    fetchGifts: async () => {
        try {
            const { data, error } = await supabase
                .from('gifts')
                .select('*')
                .order('sort_order', { ascending: true });

            if (error) throw error;
            set({ gifts: data || [] });
        } catch (err) {
            console.error('[StreamingStore] Failed to fetch gifts:', err);
        }
    },

    sendGift: async (senderId, recipientId, giftId, giftName, senderName) => {
        console.log('[StreamingStore] sendGift START:', { senderId, recipientId, giftName });
        try {
            // 0. Diagnostic Check: Does the gifts table exist?
            console.log('[StreamingStore] Diagnostic: Checking gifts table...');
            const { error: tableError } = await supabase.from('gifts').select('count').limit(1).single();
            if (tableError) {
                console.error('[StreamingStore] ❌ GIFTS TABLE MISSING or NOT ACCESSIBLE. You likely need to run the migration `20241228_gifting_system.sql`. Error:', tableError);
                return false;
            }
            console.log('[StreamingStore] ✅ Gifts table exists.');

            // 1. Transaction (DB) with Timeout
            // =========================================================================
            // CRITICAL: DATABSE SCHEMA DEPENDENCY
            // =========================================================================
            // This RPC call (`send_gift`) depends on the `user_coins` and `user_gems` tables.
            // DO NOT change the RPC signature or table names without updating the migration `20260103_optimize_send_gift.sql`.
            // The `profiles` table does NOT contain coin/gem balances directly.
            console.log('[StreamingStore] Calling supabase.rpc send_gift...');

            // Create a timeout promise (Reduced to 3s)
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('RPC_TIMEOUT_3S')), 3000));

            const rpcCall = supabase.rpc('send_gift', {
                p_sender_id: senderId,
                p_recipient_id: recipientId,
                p_gift_id: giftId,
                p_room_slug: get().roomSlug,
            });

            // Race RPC against 3s timeout
            let result;
            try {
                result = await Promise.race([rpcCall, timeout]) as any;
            } catch (raceErr) {
                console.warn('[StreamingStore] ⚠️ RPC TIMEOUT or Network Error:', raceErr);
                return false; // Fail gracefully
            }

            const { data, error } = result;

            if (error) {
                // If the error confirms the table is missing valid columns or function signature mismatch
                console.warn('[StreamingStore] ⚠️ DB Error in send_gift:', error);

                // Fallback: This confirms we CANNOT run this purely client side due to RLS.
                // We MUST rely on the RPC being fixed.
                return false;
            }
            console.log('[StreamingStore] DB Success. Data:', data);

            // 1b. REFRESH ECONOMY (CRITICAL)
            // We just spent coins, so we must update the local balance immediately.
            useEconomyStore.getState().fetchBalances().catch(err =>
                console.error('[StreamingStore] Failed to refresh balances after gift:', err)
            );

            // 2. Broadcast (Realtime Animation)
            const channel = get()._giftSubscription;
            console.log('[StreamingStore] Attempting broadcast. Channel exists?', !!channel);

            if (channel) {
                const status = channel.state;
                console.log('[StreamingStore] Channel state:', status);

                // Calculate Combo
                const now = Date.now();
                const { localComboCount, lastGiftSentTime } = get();
                // A combo expires if > 3 seconds between gifts
                let newCombo = 1;
                if (now - lastGiftSentTime < 3000) {
                    newCombo = localComboCount + 1;
                }

                // Update local state for next time
                set({ localComboCount: newCombo, lastGiftSentTime: now });

                const sendResult = await channel.send({
                    type: 'broadcast',
                    event: 'gift',
                    payload: {
                        id: crypto.randomUUID(),
                        senderName,
                        giftName,
                        combo: newCombo
                    }
                });
                console.log('[StreamingStore] Broadcast send result:', sendResult);

                // ALSO update local state so the SENDER sees the animation and feed entry
                // (Supabase broadcasts don't go back to the sender)
                get().addGiftEvent(senderName, giftName);
                set({
                    lastGiftEvent: {
                        giftName,
                        senderName,
                        combo: newCombo
                    }
                });
                console.log('[StreamingStore] Updated local state for sender visibility');
            } else {
                console.warn('[StreamingStore] Cannot broadcast: No active channel subscription!');
            }

            return true;
        } catch (err: any) {
            console.error('[StreamingStore] Failed to send gift:', err.message);
            return false;
        }
    },

    subscribeToGifts: (roomSlug: string) => {
        const currentSub = get()._giftSubscription;
        if (currentSub) {
            console.log('[StreamingStore] Already subscribed to gifts.');
            return;
        }

        console.log('[StreamingStore] Subscribing to gift channel:', `room-gifts:${roomSlug}`);
        const channel = supabase.channel(`room-gifts:${roomSlug}`)
            .on('broadcast', { event: 'gift' }, (payload) => {
                console.log('[StreamingStore] 🎁 RECEIVED BROADCAST EVENT:', payload);
                const event = payload.payload;

                // Update log with combo detection
                get().addGiftEvent(event.senderName, event.giftName);

                // Trigger animation state (ephemeral)
                console.log('[StreamingStore] Setting lastGiftEvent state for UI...');
                set({
                    lastGiftEvent: {
                        giftName: event.giftName,
                        senderName: event.senderName,
                        combo: event.combo
                    }
                });
            })
            .subscribe((status) => {
                console.log('[StreamingStore] Subscription status change:', status);
            });

        console.log('[StreamingStore] Channel created and set to state.');
        set({ _giftSubscription: channel });
    },

    unsubscribeFromGifts: () => {
        const sub = get()._giftSubscription;
        if (sub) {
            supabase.removeChannel(sub);
            set({ _giftSubscription: null });
        }
    },

    // Lightweight init for non-theater rooms (e.g. Hex Arena) — gifts only, no queue RPCs
    initGiftsForRoom: (roomSlug: string) => {
        set({ roomSlug });
        get().fetchGifts();
        get().subscribeToGifts(roomSlug);
    },

    cleanupGifts: () => {
        get().unsubscribeFromGifts();
        set({ recentGifts: [], gifts: [], lastGiftEvent: null });
    },

    addGiftEvent: (senderName: string, giftName: string) => {
        const { recentGifts } = get();
        const now = Date.now();
        const COMBO_WINDOW_MS = 3000;  // 3 seconds to count as combo
        const DISPLAY_DURATION_MS = 7000; // 7 seconds before auto-dismiss

        // Check if there's a recent gift from same sender with same gift type
        const existingIndex = recentGifts.findIndex(
            g => g.senderName === senderName &&
                g.giftName === giftName &&
                (now - g.timestamp) < COMBO_WINDOW_MS
        );

        let updated: GiftEvent[];

        if (existingIndex >= 0) {
            // COMBO: Update existing entry
            updated = [...recentGifts];
            updated[existingIndex] = {
                ...updated[existingIndex],
                combo: updated[existingIndex].combo + 1,
                timestamp: now,
                expiresAt: now + DISPLAY_DURATION_MS, // Extend display time
            };
            console.log('[StreamingStore] 🔥 COMBO x' + updated[existingIndex].combo, senderName, giftName);
        } else {
            // NEW: Add new entry
            const newEvent: GiftEvent = {
                id: crypto.randomUUID(),
                senderName,
                giftName,
                timestamp: now,
                combo: 1,
                expiresAt: now + DISPLAY_DURATION_MS,
            };
            updated = [newEvent, ...recentGifts].slice(0, 10);
            console.log('[StreamingStore] 🎁 New gift:', senderName, giftName);
        }

        set({ recentGifts: updated });
    },

    cleanupExpiredGifts: () => {
        const { recentGifts } = get();
        const now = Date.now();
        const filtered = recentGifts.filter(g => g.expiresAt > now);
        if (filtered.length !== recentGifts.length) {
            console.log('[StreamingStore] 🧹 Cleaned up', recentGifts.length - filtered.length, 'expired gifts');
            set({ recentGifts: filtered });
        }
    },

    // ============================================
    // CAMERA
    // ============================================
    toggleCamera: () => {
        const { facingMode } = get();
        set({ facingMode: facingMode === 'user' ? 'environment' : 'user' });
    },
}));
