/**
 * Hex Arena Room Component
 * The main room component for the Hex Arena game mode.
 * Handles Playroom connection, game state, player rendering, and UI overlays.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Vector3, Color4 } from '@babylonjs/core';
import { SceneRoot, useScene } from '../../world/scene';
import { Avatar } from '../../world/Avatar';
import {
    connectToRoom,
    disconnectFromRoom,
    subscribeState,
    writeMyState,
    callRpc,
    registerRpc,
    type WorldState,
    type PlayerState
} from '../../multiplayer/playroom';
import { useAuthStore } from '../../state/authStore';
import { useEconomyStore } from '../../state/economyStore';
import { useVoiceChatStore } from '../../state/voiceChatStore';
import { useStreamingStore } from '../../state/streamingStore';
import { supabase } from '../../lib/supabase';
import { useKeyboardMovement, useJoystickMovement, type MovementInput } from '../../state/movement';
import { Joystick } from '../../components/Joystick';
import { ActionButton } from '../../components/ActionButton';
import { VoiceChat } from '../../components/VoiceChat';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { PlayerListDrawer } from '../../components/PlayerListDrawer';
import { GiftFeed } from '../../components/streaming';
import { HexArena, getSpawnPosition } from './HexArena';
import { useHexGameStore, type GameStage, checkPlayerDeath } from './hexGameStore';
import { HexGameUI } from './HexGameUI';
import { HexPlayerController } from './HexPlayerController';
import { useJumpStore } from './jumpStore';
import { FLOORS, FLOOR_HEIGHT, HEX_NAMEPLATE_SCALE } from './hexConfig';
import { trackRoomPresence } from '../../hooks/useRoomPresence';
import './hexFonts.css'; // Bowlby One font for game UI
import { AudioManagerProvider, useHexAudioManager } from './useHexAudioManager';


interface HexArenaRoomProps {
    slug: string;
}

function HexArenaRoomContent({ slug }: HexArenaRoomProps) {
    const { profile } = useAuthStore();
    const { playAudio } = useHexAudioManager();

    // Connection state
    const [myId, setMyId] = useState<string>('none');
    const [isConnecting, setIsConnecting] = useState(true);
    const [world, setWorld] = useState<WorldState>({ players: {} });
    const [isPlayerListOpen, setIsPlayerListOpen] = useState(false);
    const [cameraOn, setCameraOn] = useState(false);

    // Voice chat store
    const { micOn, speakerOn, micAllowed, toggleMic, toggleSpeaker } = useVoiceChatStore();

    // Game store
    const stage = useHexGameStore((s) => s.stage);
    const hostId = useHexGameStore((s) => s.hostId);
    const winnerId = useHexGameStore((s) => s.winnerId);
    const setHostId = useHexGameStore((s) => s.setHostId);
    const addPlayer = useHexGameStore((s) => s.addPlayer);
    const removePlayer = useHexGameStore((s) => s.removePlayer);
    const eliminatePlayer = useHexGameStore((s) => s.eliminatePlayer);
    const isPlayerDead = useHexGameStore((s) => s.isPlayerDead);
    const destroyHex = useHexGameStore((s) => s.destroyHex);
    const destroyedHexes = useHexGameStore((s) => s.destroyedHexes);
    const confirmedPlayerIds = useHexGameStore((s) => s.confirmedPlayerIds);
    const startGame = useHexGameStore((s) => s.startGame);
    const lobbyPhase = useHexGameStore((s) => s.lobbyPhase);
    const arenaReady = useHexGameStore((s) => s.arenaReady);
    const fetchBalances = useEconomyStore((s) => s.fetchBalances);

    // Jump store
    const requestJump = useJumpStore((s) => s.requestJump);

    // Player state refs
    const localPlayerStateRef = useRef<PlayerState | null>(null);
    const worldRef = useRef<WorldState>({ players: {} });
    const mountedRef = useRef(true);
    const presenceUntrackRef = useRef<(() => Promise<void>) | null>(null);
    const myIdRef = useRef<string>('none');
    // Guard: after lobby reset, ignore stale hexConfirmed from network state for a short window
    const lobbyResetGuardRef = useRef(false);

    // Movement
    const keyboardInput = useKeyboardMovement();
    const [joystickInput] = useJoystickMovement();

    // Check if I'm the host
    const isHost = myId !== 'none' && myId === hostId;

    // Check if I'm dead
    const amIDead = myId !== 'none' && isPlayerDead(myId);

    // Check if I'm a confirmed player (have a slot in the current match)
    const amIConfirmed = confirmedPlayerIds.includes(myId);

    // Create fallback player with proper avatar data
    const createFallbackPlayer = useCallback((): PlayerState => {
        const spawn = getSpawnPosition();

        // Build avatar URL with params
        let avatarUrl: string | undefined = undefined;
        if (profile?.avatar_url) {
            try {
                const url = new URL(profile.avatar_url);
                url.searchParams.set('meshLod', '2');
                url.searchParams.set('t', String(Date.now()));
                avatarUrl = url.toString();
            } catch {
                avatarUrl = profile.avatar_url;
            }
        }

        return {
            pos: { x: spawn.x, y: spawn.y, z: spawn.z },
            rotY: 0,
            anim: 'idle',
            head: { q: [0, 0, 0, 1] },
            blend: {},
            avatarUrl,
            avatarConfig: profile?.avatar_config,
            profile: {
                name: profile?.username || 'Player',
                photo: profile?.profile_image_url || profile?.avatar_headshot_url || '',
                bio: profile?.bio,
                username: profile?.username,
                id: profile?.id,
                friends_count: profile?.friends_count || 0,
            }
        };
    }, [profile]);

    const createFallbackPlayerRef = useRef(createFallbackPlayer);

    // Connect to Playroom
    // Keep refs current
    useEffect(() => { myIdRef.current = myId; }, [myId]);
    useEffect(() => { createFallbackPlayerRef.current = createFallbackPlayer; }, [createFallbackPlayer]);

    useEffect(() => {
        mountedRef.current = true;
        let unsubscribe: (() => void) | null = null;

        // Reset game store to clear stale state from previous session
        // (e.g., after a WebView memory crash and reload)
        useHexGameStore.getState().resetGame();

        const connect = async () => {
            try {
                console.log('[HexArenaRoom] Connecting to room:', slug);
                const { myId: id } = await connectToRoom(slug);

                if (!mountedRef.current) return;

                setMyId(id);
                myIdRef.current = id;
                console.log('[HexArenaRoom] Connected as:', id);

                // First player becomes host
                if (!hostId) {
                    setHostId(id);
                    console.log('[HexArenaRoom] I am the host');
                }

                // Add self to game players
                addPlayer({
                    id,
                    name: profile?.username || 'Player',
                    photo: profile?.profile_image_url || profile?.avatar_headshot_url || '',
                    avatarUrl: profile?.avatar_url,
                });

                // Subscribe to world state for avatar rendering + lobby catch-up.
                // ADDITIVE ONLY: reads hexConfirmed to ADD players who joined
                // (so late joiners can catch up from persistent state), but NEVER
                // removes players based on hexConfirmed=false. writeMyState is
                // async — hexConfirmed=false arrives stale and was undoing fast
                // RPC-based joins. Removes happen via explicit hex:playerLeave RPC.
                unsubscribe = subscribeState((state) => {
                    if (!mountedRef.current) return;
                    setWorld(state);
                    worldRef.current = state;

                    // Additive lobby catch-up: add any remote player whose
                    // hexConfirmed is true but isn't in our local confirmed list
                    const store = useHexGameStore.getState();
                    if (store.stage === 'lobby') {
                        let changed = false;
                        for (const [pid, ps] of Object.entries(state.players)) {
                            if (pid === id) continue; // Skip self — local store is source of truth
                            if (ps.hexConfirmed === true && !store.confirmedPlayerIds.includes(pid)) {
                                console.log('[HexArenaRoom] Catch-up: adding confirmed player from state:', pid);
                                useHexGameStore.getState().joinMatch(pid);
                                changed = true;
                            }
                        }
                        // If host and a catch-up join triggered countdown, broadcast
                        if (changed) {
                            const updated = useHexGameStore.getState();
                            if (updated.hostId === id && updated.lobbyCountdownActive) {
                                callRpc('hex:lobbySync', {
                                    lobbyTimer: updated.lobbyTimer,
                                    lobbyCountdownActive: updated.lobbyCountdownActive,
                                    confirmedPlayerIds: updated.confirmedPlayerIds,
                                });
                            }
                        }
                    }
                });
                // Initialize player state with full avatar data
                const initialState = createFallbackPlayerRef.current();
                localPlayerStateRef.current = initialState;
                await writeMyState(initialState, true);

                setIsConnecting(false);

                // Track presence for lobby user counts (same as Room.tsx)
                const userId = useAuthStore.getState().user?.id;
                if (userId && slug) {
                    const { untrack } = trackRoomPresence(slug, userId);
                    presenceUntrackRef.current = untrack;
                }

                // Register RPCs for game transitions only (lobby sync handled by player state)
                registerRpc('hex:gameStart', (data: any) => {
                    console.log('[HexArenaRoom] RPC hex:gameStart received, confirmedIds:', data?.confirmedPlayerIds);
                    const store = useHexGameStore.getState();
                    if (store.hostId === id) return; // Host already started
                    // Use host's authoritative confirmed list — our local list may be stale
                    if (data?.confirmedPlayerIds) {
                        useHexGameStore.setState({ confirmedPlayerIds: data.confirmedPlayerIds });
                    }
                    store.startGame(data?.worldPlayerNames || {});
                });

                // Authoritative stage sync from host — covers countdown→game→winner→lobby
                registerRpc('hex:stageSync', (data: any) => {
                    console.log('[HexArenaRoom] RPC hex:stageSync received:', data.stage, data.timer);
                    const store = useHexGameStore.getState();
                    if (store.hostId === id) return; // Host already applied locally
                    const update: any = {
                        stage: data.stage,
                        timer: data.timer,
                    };
                    if (data.winnerId !== undefined) update.winnerId = data.winnerId;
                    if (data.winnerProfile !== undefined) update.winnerProfile = data.winnerProfile;
                    if (data.lobbyPhase !== undefined) update.lobbyPhase = data.lobbyPhase;
                    if (data.confirmedPlayerIds !== undefined) update.confirmedPlayerIds = data.confirmedPlayerIds;
                    if (data.lobbyCountdownActive !== undefined) update.lobbyCountdownActive = data.lobbyCountdownActive;
                    // Reset state when returning to lobby
                    if (data.stage === 'lobby') {
                        update.confirmedPlayerIds = data.confirmedPlayerIds || [];
                        update.lobbyCountdownActive = data.lobbyCountdownActive ?? false;
                        update.destroyedHexes = new Set();
                        // Reset isDead on all players — host does this via openJoinWindow,
                        // but non-host only gets this partial update
                        const currentPlayers = useHexGameStore.getState().players;
                        update.players = currentPlayers.map(p => ({ ...p, isDead: false }));
                        // Guard: ignore stale hexConfirmed from network for 2s after reset
                        lobbyResetGuardRef.current = true;
                        setTimeout(() => { lobbyResetGuardRef.current = false; }, 2000);
                        // Clear hexConfirmed on player state when returning to lobby
                        writeMyState({ hexConfirmed: false }, true);
                    }
                    // Clear destroyed hexes when starting countdown
                    if (data.stage === 'countdown') {
                        update.destroyedHexes = new Set();
                    }
                    useHexGameStore.setState(update);
                });

                registerRpc('hex:resetGame', () => {
                    console.log('[HexArenaRoom] RPC hex:resetGame received');
                    const store = useHexGameStore.getState();
                    if (store.hostId === id) return;
                    store.resetGame();
                    // Clear hexConfirmed on player state
                    writeMyState({ hexConfirmed: false });
                });

                // Host-authoritative lobby sync — non-host receives timer/countdown state
                registerRpc('hex:lobbySync', (data: any) => {
                    const store = useHexGameStore.getState();
                    if (store.hostId === id) return; // Host already applied locally
                    console.log('[HexArenaRoom] RPC hex:lobbySync received:', data);
                    useHexGameStore.setState({
                        lobbyTimer: data.lobbyTimer,
                        lobbyCountdownActive: data.lobbyCountdownActive,
                        ...(data.confirmedPlayerIds ? { confirmedPlayerIds: data.confirmedPlayerIds } : {}),
                    });
                });

                // Player join/leave RPCs — fast path so host doesn't wait for slow hexConfirmed state
                registerRpc('hex:playerJoin', (data: any) => {
                    if (!data?.playerId) return;
                    if (data.playerId === id) return; // Already applied locally
                    console.log('[HexArenaRoom] RPC hex:playerJoin received:', data.playerId);
                    const store = useHexGameStore.getState();
                    if (store.stage !== 'lobby') return;
                    store.joinMatch(data.playerId);
                    // If I'm the host, broadcast updated lobby state to all
                    const updated = useHexGameStore.getState();
                    if (updated.hostId === id) {
                        callRpc('hex:lobbySync', {
                            lobbyTimer: updated.lobbyTimer,
                            lobbyCountdownActive: updated.lobbyCountdownActive,
                            confirmedPlayerIds: updated.confirmedPlayerIds,
                        });
                    }
                });

                registerRpc('hex:playerLeave', (data: any) => {
                    if (!data?.playerId) return;
                    if (data.playerId === id) return; // Already applied locally
                    console.log('[HexArenaRoom] RPC hex:playerLeave received:', data.playerId);
                    const store = useHexGameStore.getState();
                    if (store.stage !== 'lobby') return;
                    store.leaveMatch(data.playerId);
                    // If I'm the host, broadcast updated lobby state to all
                    const updated = useHexGameStore.getState();
                    if (updated.hostId === id) {
                        callRpc('hex:lobbySync', {
                            lobbyTimer: updated.lobbyTimer,
                            lobbyCountdownActive: updated.lobbyCountdownActive,
                            confirmedPlayerIds: updated.confirmedPlayerIds,
                        });
                    }
                });

                // Player elimination sync — marks remote players as dead in local store
                registerRpc('playerEliminated', (data: any) => {
                    if (!data?.playerId) return;
                    // Don't re-eliminate ourselves (we already set it locally)
                    if (data.playerId === id) return;
                    console.log('[HexArenaRoom] RPC playerEliminated received:', data.playerId);
                    useHexGameStore.getState().eliminatePlayer(data.playerId);
                });

                // No requestSync needed — player state sync is automatic via subscribeState
            } catch (error) {
                console.error('[HexArenaRoom] Connection failed:', error);
                setIsConnecting(false);
            }
        };

        connect();

        return () => {
            mountedRef.current = false;
            if (unsubscribe) unsubscribe();
            presenceUntrackRef.current?.();
            disconnectFromRoom();
            removePlayer(myIdRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug]);

    // Reset player position ref when returning to lobby — prevents stale death
    // position (e.g. y=-55) from leaking into the next game
    useEffect(() => {
        if (stage === 'lobby' && localPlayerStateRef.current) {
            console.log('[HexArenaRoom] Lobby reset — clearing stale player position');
            const lobbyPos = { x: 0, y: 2, z: 0 };
            localPlayerStateRef.current.pos = lobbyPos;
            // Broadcast reset position so remote clients don't see us stuck underground
            writeMyState({ pos: lobbyPos, anim: 'idle' }).catch(console.error);
            // Host doesn't receive hex:stageSync, so also set guard here
            lobbyResetGuardRef.current = true;
            setTimeout(() => { lobbyResetGuardRef.current = false; }, 2000);
        }
    }, [stage]);

    // Network sync - send state updates
    useEffect(() => {
        if (myId === 'none' || (stage !== 'game' && stage !== 'countdown')) return;

        const intervalId = setInterval(() => {
            // Skip writing if dead — controller is unmounted, position is stale
            if (useHexGameStore.getState().isPlayerDead(myId)) return;

            const state = localPlayerStateRef.current;
            if (!state) return;

            writeMyState({
                pos: state.pos,
                rotY: state.rotY,
                anim: state.anim,
            }).catch(console.error);
        }, 50);

        return () => clearInterval(intervalId);
    }, [myId, stage]);

    // Death detection - check Y position (only after arena is loaded)
    useEffect(() => {
        if (stage !== 'game' || amIDead || myId === 'none' || !arenaReady) return;

        const checkDeath = setInterval(() => {
            const state = localPlayerStateRef.current;
            if (state && checkPlayerDeath(state.pos.y)) {
                console.log('[HexArenaRoom] Player fell! Eliminating...');
                playAudio('Dead', true); // Play death sound
                eliminatePlayer(myId);
                callRpc('playerEliminated', { playerId: myId });
            }
        }, 100);

        return () => clearInterval(checkDeath);
    }, [stage, amIDead, myId, eliminatePlayer, playAudio, arenaReady]);

    // Countdown sound - play when countdown stage starts
    useEffect(() => {
        if (stage === 'countdown') {
            playAudio('countdown', true);
        }
    }, [stage, playAudio]);

    // Teleport local player to arena spawn position when countdown starts
    // This ensures avatars are visually in place during 3-2-1, instead of
    // loading+dropping at game start which creates jarring latency
    useEffect(() => {
        if (stage !== 'countdown' || myId === 'none' || !amIConfirmed || !arenaReady) return;

        const spawn = getSpawnPosition();
        const spawnPos = { x: spawn.x, y: spawn.y, z: spawn.z };

        // Update local state immediately
        if (localPlayerStateRef.current) {
            localPlayerStateRef.current = {
                ...localPlayerStateRef.current,
                pos: spawnPos,
                anim: 'idle',
            };
        }

        // Sync to Playroom so remote players also see the teleport
        writeMyState({ pos: spawnPos, anim: 'idle' }).catch(console.error);

        console.log('[HexArenaRoom] Teleported to arena spawn for countdown:', spawnPos);
    }, [stage, myId, amIConfirmed, arenaReady]);

    // Spectator mic muting — non-confirmed players are muted during active game
    const prevMicStateRef = useRef<boolean | null>(null);

    useEffect(() => {
        const isActivePlayer = confirmedPlayerIds.includes(myId);
        const isGameActive = stage === 'countdown' || stage === 'game';

        if (isGameActive && !isActivePlayer && myId !== 'none') {
            // Spectator: save mic state and force-mute
            if (prevMicStateRef.current === null) {
                prevMicStateRef.current = micOn;
            }
            if (micOn) {
                useVoiceChatStore.getState().setMicOn(false);
                console.log('[HexArenaRoom] Spectator mic muted');
            }
        } else if (!isGameActive && prevMicStateRef.current !== null) {
            // Game ended: restore mic state
            useVoiceChatStore.getState().setMicOn(prevMicStateRef.current);
            console.log('[HexArenaRoom] Mic state restored:', prevMicStateRef.current);
            prevMicStateRef.current = null;
        }
    }, [stage, confirmedPlayerIds, myId, micOn]);

    // Initialize gift channel for this hex arena room
    useEffect(() => {
        if (!slug) return;
        useStreamingStore.getState().initGiftsForRoom(slug);
        return () => {
            useStreamingStore.getState().cleanupGifts();
        };
    }, [slug]);

    // Win sound
    // [APPLE_COMPLIANCE] Gem payout via close_hex_match RPC disabled.
    useEffect(() => {
        if (stage === 'winner') {
            playAudio(winnerId === myId ? 'win' : 'Dead', true);

            /* [APPLE_COMPLIANCE] — close_hex_match RPC (gem payout) disabled.
            // Award gems to the winner via close_hex_match RPC
            if (isHost) {
                const potId = useHexGameStore.getState().potId;
                if (potId && winnerId) {
                    // Map Playroom winnerId → Supabase user ID
                    const winnerState = worldRef.current.players[winnerId];
                    const winnerSupabaseId = winnerState?.profile?.id;
                    if (winnerSupabaseId) {
                        supabase.rpc('close_hex_match', {
                            p_pot_id: potId,
                            p_winner_id: winnerSupabaseId
                        }).then(({ data, error }) => {
                            if (error) {
                                console.error('[HexArenaRoom] close_hex_match error:', error.message);
                            } else if (data?.success) {
                                console.log('[HexArenaRoom] Match closed — gems awarded:', data.gems_awarded);
                            } else {
                                console.warn('[HexArenaRoom] close_hex_match failed:', data?.reason);
                            }
                            // Refresh balances for this client
                            fetchBalances();
                        });
                    } else {
                        console.warn('[HexArenaRoom] No Supabase ID for winner:', winnerId);
                    }
                } else {
                    console.warn('[HexArenaRoom] No potId to close, skipping gem award');
                }
            }
            */
            console.log('[HexArenaRoom] [APPLE_COMPLIANCE] Skipping close_hex_match — gem payout disabled');
        }
    }, [stage, winnerId, myId, amIDead, playAudio, isHost, fetchBalances, slug]);

    // Hex hit handler
    const handleHexHit = useCallback((hexKey: string) => {
        if (destroyedHexes.has(hexKey)) return;

        console.log('[HexArenaRoom] Hex hit:', hexKey);
        destroyHex(hexKey);
        callRpc('hexagonHit', { hexagonKey: hexKey });
    }, [destroyedHexes, destroyHex]);

    // Movement input (disabled when dead)
    const movementInput: MovementInput = useMemo(() => {
        if (amIDead || stage !== 'game') {
            return { forward: 0, right: 0 };
        }
        if (joystickInput.forward !== 0 || joystickInput.right !== 0) {
            return joystickInput;
        }
        return keyboardInput;
    }, [keyboardInput, joystickInput, amIDead, stage]);

    // Leave room - force full page reload to '/' (same as Room.tsx)
    // PlayroomKit's insertCoin can only be called once per page load,
    // so we must do a hard navigation, not SPA routing
    const handleLeaveLobby = useCallback(() => {
        window.location.href = '/';
    }, []);

    // Leave game (from in-game) - reset to start screen
    const resetGame = useHexGameStore((s) => s.resetGame);
    const handleLeaveGame = useCallback(() => {
        resetGame();
    }, [resetGame]);

    // Stable callbacks for HexGameUI (avoid re-creating on every render)
    const handleToggleCamera = useCallback(() => setCameraOn(prev => !prev), []);
    const handleStartPractice = useCallback(() => { window.location.href = '/rooms/hex-practice'; }, []);
    const handleOpenPlayerList = useCallback(() => setIsPlayerListOpen(true), []);

    // Memoize player profiles — only changes when player IDs or profile data changes, NOT on position updates
    const playerProfiles = useMemo(() => {
        const profiles: Record<string, { profile?: PlayerState['profile'] }> = {};
        for (const [id, ps] of Object.entries(world.players)) {
            profiles[id] = { profile: ps.profile };
        }
        return profiles;
        // Stringify profiles only to detect actual profile changes, not position changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(Object.fromEntries(
        Object.entries(world.players).map(([id, ps]) => [id, ps.profile?.name])
    ))]);


    // Handle match start — called when join window timer expires or lobby fills
    const handleStartMatch = useCallback(() => {
        if (!isHost) return;

        const confirmedIds = useHexGameStore.getState().confirmedPlayerIds;
        console.log('[HexArenaRoom] Starting match with', confirmedIds.length, 'players');

        // Build name map from world state for all clients to resolve player names
        const worldPlayerNames: Record<string, string> = {};
        Object.entries(worldRef.current.players).forEach(([pid, ps]) => {
            worldPlayerNames[pid] = ps.profile?.username || ps.profile?.name || 'Player';
        });

        // START GAME IMMEDIATELY — synchronous, no waiting on network
        startGame(worldPlayerNames);
        // Broadcast game start to all clients — include confirmed IDs + names so non-host
        // uses the host's authoritative player list, not its own potentially stale local list
        callRpc('hex:gameStart', { worldPlayerNames, confirmedPlayerIds: confirmedIds });

        // THEN handle coin deduction in background (fire-and-forget, non-blocking)
        const entries: Record<string, number> = {};
        for (const playroomId of confirmedIds) {
            const playerState = worldRef.current.players[playroomId];
            const supabaseId = playerState?.profile?.id;
            if (!supabaseId) {
                console.warn('[HexArenaRoom] No Supabase UUID for player:', playroomId, '— skipping coin deduction');
                continue;
            }
            entries[supabaseId] = 5; // 5 coin entry fee
        }

        if (Object.keys(entries).length >= 2) {
            supabase.rpc('create_hex_match', {
                p_room_slug: slug,
                p_entries: entries,
            }).then(({ data, error }) => {
                if (error) {
                    console.error('[HexArenaRoom] create_hex_match RPC error:', error.message);
                } else if (data?.success) {
                    console.log('[HexArenaRoom] ✅ Match pot created:', data.pot_id, '| Total coins:', data.total_coins);
                    useHexGameStore.setState({ potId: data.pot_id });
                } else {
                    console.warn('[HexArenaRoom] create_hex_match failed:', data?.reason, data);
                }
                fetchBalances();
            });
        }
    }, [isHost, startGame, slug, fetchBalances]);

    // Players list
    const players = useMemo(() => Object.entries(world.players), [world.players]);

    // Detect disconnected players and remove them from game store.
    // Also handles HOST MIGRATION: if the host leaves, the remaining
    // player with the lowest Playroom ID becomes the new host.
    const gamePlayers = useHexGameStore((s) => s.players);
    useEffect(() => {
        const worldPlayerIds = new Set(Object.keys(world.players));

        // ─── Host migration ───
        const currentHostId = useHexGameStore.getState().hostId;
        if (currentHostId && !worldPlayerIds.has(currentHostId) && worldPlayerIds.size > 0) {
            // Host left — promote the player with the lowest ID (deterministic across all clients)
            const sortedIds = Array.from(worldPlayerIds).sort();
            const newHostId = sortedIds[0];
            console.log('[HexArenaRoom] Host', currentHostId, 'disconnected — promoting', newHostId);
            setHostId(newHostId);
        }

        // During join window: remove disconnected confirmed players
        if (stage === 'lobby') {
            const confirmed = useHexGameStore.getState().confirmedPlayerIds;
            const missingConfirmed = confirmed.filter(id => !worldPlayerIds.has(id));
            if (missingConfirmed.length > 0) {
                missingConfirmed.forEach(id => {
                    console.log('[HexArenaRoom] Confirmed player left during join window:', id);
                    useHexGameStore.getState().leaveMatch(id);
                });
            }
            return;
        }

        // During game: remove disconnected players
        if (stage !== 'countdown' && stage !== 'game') return;

        gamePlayers.forEach(player => {
            if (!worldPlayerIds.has(player.id)) {
                console.log('[HexArenaRoom] Player disconnected:', player.id);
                removePlayer(player.id);
            }
        });
    }, [world.players, gamePlayers, stage, lobbyPhase, removePlayer, setHostId]);

    // Show arena only during countdown and game
    const showArena = stage === 'countdown' || stage === 'game';

    // During game stages, only show confirmed players' avatars.
    // In lobby, show all connected players.
    const isGameStage = stage === 'countdown' || stage === 'game' || stage === 'winner';
    const visiblePlayers = useMemo(() => {
        if (isGameStage) {
            return players.filter(([id]) => confirmedPlayerIds.includes(id));
        }
        return players;
    }, [players, isGameStage, confirmedPlayerIds]);

    // Jump icon for ActionButton
    const jumpIcon = (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
        </svg>
    );

    return (
        <div className="fixed inset-0">
            {/* Loading Overlay */}
            {isConnecting && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
                    <div className="text-center">
                        <div className="mb-4 text-lg font-medium text-white">Joining Hex Arena...</div>
                        <LoadingSpinner size="lg" className="mx-auto" />
                    </div>
                </div>
            )}

            {/* Game UI Overlay - with safe area for dynamic island */}
            <HexGameUI
                isHost={isHost}
                onLeaveLobby={handleLeaveLobby}
                onLeaveGame={handleLeaveGame}
                onStartMatch={handleStartMatch}
                onStartPractice={handleStartPractice}
                myId={myId}
                cameraOn={cameraOn}
                onToggleCamera={handleToggleCamera}
                micOn={micOn}
                micAllowed={micAllowed}
                onToggleMic={toggleMic}
                speakerOn={speakerOn}
                onToggleSpeaker={toggleSpeaker}
                playerCount={Object.keys(world.players).length}
                worldPlayers={playerProfiles}
                onOpenPlayerList={handleOpenPlayerList}
            />

            {/* Gift Feed (left-aligned TikTok pills) — visible during game/winner */}
            {(stage === 'game' || stage === 'winner') && (
                <div className="fixed bottom-52 left-4 z-30 pointer-events-none" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
                    <GiftFeed />
                </div>
            )}



            {/* Joystick (during game only — confirmed players who are alive) */}
            {stage === 'game' && !amIDead && amIConfirmed && (
                <Joystick />
            )}

            {/* Jump Button (during game only — confirmed players who are alive) */}
            {stage === 'game' && !amIDead && amIConfirmed && (
                <ActionButton
                    icon={jumpIcon}
                    label="Jump"
                    onClick={requestJump}
                    visible={true}
                    className="fixed bottom-24 right-6"
                />
            )}

            {/* 3D Scene - using standard SceneRoot with hideGround for hex arena */}
            <SceneRoot paused={isConnecting} hideGround={true}>
                {/* Dark space background override */}
                <HexArenaBackground />

                {/* Hex Arena */}
                <HexArena visible={showArena} />

                {/* Players - during game stages only render confirmed players;
                    in lobby render all connected players */}
                {visiblePlayers.length > 0 ? (
                    visiblePlayers.map(([id, playerState]) => (
                        <Avatar
                            key={id}
                            playerId={id}
                            player={id === myId && localPlayerStateRef.current ? localPlayerStateRef.current : playerState}
                            isLocal={id === myId}
                            getLocalState={id === myId ? () => localPlayerStateRef.current : undefined}
                            nameplateScale={HEX_NAMEPLATE_SCALE}
                        />
                    ))
                ) : (
                    // Fallback: show local player even if world state not yet populated
                    myId !== 'none' && localPlayerStateRef.current && (
                        <Avatar
                            key={myId}
                            playerId={myId}
                            player={localPlayerStateRef.current}
                            isLocal={true}
                            getLocalState={() => localPlayerStateRef.current}
                            nameplateScale={HEX_NAMEPLATE_SCALE}
                        />
                    )
                )}

                {/* Player Controller — mount during countdown to pre-create agent at spawn,
                    but freeze movement until game stage */}
                {myId !== 'none' && (stage === 'countdown' || stage === 'game') && !amIDead && amIConfirmed && arenaReady && (
                    <HexPlayerController
                        myId={myId}
                        movementInput={movementInput}
                        localPlayerStateRef={localPlayerStateRef}
                        createFallbackPlayer={createFallbackPlayer}
                        onHexHit={handleHexHit}
                        frozen={stage !== 'game'}
                    />
                )}

                {/* Camera Setup */}
                <HexCameraSetup stage={stage} />
            </SceneRoot>

            {/* Player List Drawer */}
            <PlayerListDrawer
                isOpen={isPlayerListOpen}
                onClose={() => setIsPlayerListOpen(false)}
                players={players}
                myId={myId}
            />

            {/* VoiceChat - manages audio/video */}
            {myId !== 'none' && slug && (
                <VoiceChat
                    uid={myId}
                    roomCode={slug}
                    cameraStream={null}
                    cameraEnabled={cameraOn}
                />
            )}
        </div>
    );
}

/**
 * Override scene background for hex arena (dark space theme)
 */

function HexArenaBackground() {
    const { scene } = useScene();

    useEffect(() => {
        if (!scene) return;
        // Set dark space background
        scene.clearColor = new Color4(0.05, 0.05, 0.1, 1);
    }, [scene]);

    return null;
}

/**
 * Camera setup for different game stages
 */
function HexCameraSetup({ stage }: { stage: GameStage }) {
    const { camera } = useScene();

    useEffect(() => {
        if (!camera) return;

        switch (stage) {
            case 'lobby':
                // Wide view for lobby - looking at TOP floor where players are
                camera.radius = 50;
                camera.beta = Math.PI / 3.5;
                camera.target = new Vector3(0, (FLOORS.length - 1) * FLOOR_HEIGHT, 0);
                break;
            case 'countdown':
                // Bird's eye view during countdown - looking at TOP floor
                camera.radius = 60;
                camera.beta = Math.PI / 4;
                camera.target = new Vector3(0, (FLOORS.length - 1) * FLOOR_HEIGHT, 0);
                break;
            case 'game':
                // Camera following is handled entirely by HexPlayerController
                // Don't set any camera properties here or it will fight with the controller
                break;
            case 'winner':
                // Victory view
                camera.radius = 40;
                camera.beta = Math.PI / 4;
                break;
        }
    }, [camera, stage]);

    return null;
}

// Wrapper component to provide audio context
export function HexArenaRoom({ slug }: HexArenaRoomProps) {
    return (
        <AudioManagerProvider>
            <HexArenaRoomContent slug={slug} />
        </AudioManagerProvider>
    );
}
