import { useRef, useState, useEffect, useCallback } from 'react';
import type { WorldState } from '../multiplayer/playroom';

export interface PlayerActivityEvent {
    id: string;
    playerName: string;
    type: 'join' | 'leave';
    timestamp: number;
}

const ACTIVITY_TTL_MS = 4000; // Auto-dismiss after 4 seconds
const WARMUP_MS = 3000; // Ignore events during first 3 seconds (existing players loading in)
const JOIN_DEDUP_MS = 10000; // Suppress duplicate join notifications within 10 seconds
const SFX_URL = '/sfx/pop.mp3';

/**
 * Detects player join/leave events.
 *
 * JOIN: Announced when a player's `isLoading` transitions to false (avatar loaded).
 * LEAVE: Announced when a player ID disappears from worldPlayers entirely.
 *        Uses a separate `knownPlayersRef` that tracks ALL present player IDs
 *        (regardless of isLoading) so that two-phase Playroom removals
 *        (isLoading → true, then key removed) don't silently swallow leave events.
 */
export function usePlayerActivity(
    worldPlayers: WorldState['players'],
    myPlayroomId: string | null
) {
    // Track which players are currently "visible" (isLoading === false) — used for JOIN detection only
    const visiblePlayersRef = useRef<Set<string>>(new Set());
    // Track ALL player IDs present in worldPlayers — used for LEAVE detection
    const knownPlayersRef = useRef<Set<string>>(new Set());
    // Latch pattern: always write names in, never clear
    const playerNamesRef = useRef<Map<string, string>>(new Map());
    // Dedup: track when we last announced a join for each player name
    const lastJoinAnnouncedRef = useRef<Map<string, number>>(new Map());
    const [events, setEvents] = useState<PlayerActivityEvent[]>([]);
    const mountTimeRef = useRef(Date.now());
    const isWarmedUpRef = useRef(false);

    // Play pop SFX (fire-and-forget)
    const playPop = useCallback(() => {
        try {
            const audio = new Audio(SFX_URL);
            audio.volume = 0.4;
            audio.play().catch(() => { /* ignore autoplay block */ });
        } catch { /* ignore */ }
    }, []);

    // Diff players on each world update
    useEffect(() => {
        const now = Date.now();

        // Always latch player names
        Object.entries(worldPlayers || {}).forEach(([id, player]) => {
            const name = player?.profile?.name;
            if (name) {
                playerNamesRef.current.set(id, name);
            }
        });

        // Build current sets
        const currentPlayerIds = new Set<string>(Object.keys(worldPlayers || {}));
        const currentlyVisible = new Set<string>();
        Object.entries(worldPlayers || {}).forEach(([id, player]) => {
            if (!player?.isLoading) {
                currentlyVisible.add(id);
            }
        });

        // During warm-up period, just track who's here without announcing
        if (!isWarmedUpRef.current) {
            if (now - mountTimeRef.current < WARMUP_MS) {
                visiblePlayersRef.current = currentlyVisible;
                knownPlayersRef.current = currentPlayerIds;
                return;
            }
            // Warm-up complete — snapshot current state as baseline
            isWarmedUpRef.current = true;
            visiblePlayersRef.current = currentlyVisible;
            knownPlayersRef.current = currentPlayerIds;
            return;
        }

        const prevVisible = visiblePlayersRef.current;
        const prevKnown = knownPlayersRef.current;
        const newEvents: PlayerActivityEvent[] = [];

        // Detect JOINS: player's isLoading went from true → false (avatar loaded)
        currentlyVisible.forEach((id) => {
            if (!prevVisible.has(id) && id !== myPlayroomId) {
                const playerName = worldPlayers[id]?.profile?.name
                    || playerNamesRef.current.get(id)
                    || 'Someone';

                // DEDUP: suppress if we announced this player's join recently
                const lastAnnounced = lastJoinAnnouncedRef.current.get(playerName);
                if (lastAnnounced && now - lastAnnounced < JOIN_DEDUP_MS) {
                    console.log('[PlayerActivity] Suppressed duplicate join for', playerName,
                        'last announced', now - lastAnnounced, 'ms ago');
                    return;
                }

                lastJoinAnnouncedRef.current.set(playerName, now);
                newEvents.push({
                    id: `${id}-join-${now}`,
                    playerName,
                    type: 'join',
                    timestamp: now,
                });
            }
        });

        // Detect LEAVES: player ID was known but is now gone from worldPlayers entirely
        // This uses knownPlayersRef (all IDs) instead of visiblePlayersRef (only loaded ones)
        // to avoid the two-phase removal bug where isLoading→true removes from visible
        // before the key is deleted
        prevKnown.forEach((id) => {
            if (!currentPlayerIds.has(id) && id !== myPlayroomId) {
                const playerName = playerNamesRef.current.get(id) || 'Someone';
                newEvents.push({
                    id: `${id}-leave-${now}`,
                    playerName,
                    type: 'leave',
                    timestamp: now,
                });
            }
        });

        if (newEvents.length > 0) {
            playPop();
            setEvents((prev) => [...prev, ...newEvents]);
        }

        visiblePlayersRef.current = currentlyVisible;
        knownPlayersRef.current = currentPlayerIds;
    }, [worldPlayers, myPlayroomId, playPop]);

    // Auto-cleanup expired events
    useEffect(() => {
        if (events.length === 0) return;

        const interval = setInterval(() => {
            const now = Date.now();
            setEvents((prev) => prev.filter((e) => now - e.timestamp < ACTIVITY_TTL_MS));
        }, 1000);

        return () => clearInterval(interval);
    }, [events.length]);

    return events;
}
