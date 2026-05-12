/**
 * Hex Game UI Overlay
 * Displays game state UI: lobby (joinWindow), countdown, timer, winner screen.
 * Battle royale lobby: 30s join window, first N players confirmed, rest spectate.
 * Spectator gifting: eliminated/non-participants can send gifts to active players.
 */

import { useEffect, useRef, useState, memo } from 'react';
import { useEconomyStore } from '../../state/economyStore';
import { useHexGameStore } from './hexGameStore';
import { GamePrimaryButton } from '../../components/GamePrimaryButton';
import { useStreamingStore } from '../../state/streamingStore';
import { useAuthStore } from '../../state/authStore';
import { callRpc, writeMyState } from '../../multiplayer/playroom';
import { ArrowLeft, Check, Gift, Eye } from 'lucide-react';
import { brandAssetUrls } from '../../config/customization';
import {
    MIN_PLAYERS_TO_START,
    MAX_GAME_PLAYERS,
} from './hexConfig';

interface HexGameUIProps {
    isHost: boolean;
    onLeaveLobby: () => void;
    onLeaveGame: () => void;
    onStartMatch: () => void;
    onStartPractice?: () => void;
    myId: string;
    // Room-style controls
    cameraOn: boolean;
    onToggleCamera: () => void;
    micOn: boolean;
    micAllowed: boolean;
    onToggleMic: () => void;
    speakerOn: boolean;
    onToggleSpeaker: () => void;
    playerCount: number;
    worldPlayers: Record<string, { profile?: { name: string; photo: string; bio?: string; username?: string; id?: string; friends_count?: number } }>;
    onOpenPlayerList: () => void;
}

export const HexGameUI = memo(function HexGameUI({
    isHost, onLeaveLobby, onLeaveGame, onStartMatch, onStartPractice, myId,
    cameraOn, onToggleCamera, micOn, micAllowed, onToggleMic,
    speakerOn, onToggleSpeaker, playerCount, worldPlayers, onOpenPlayerList,
}: HexGameUIProps) {
    const stage = useHexGameStore((s) => s.stage);
    const timer = useHexGameStore((s) => s.timer);
    const players = useHexGameStore((s) => s.players);
    const winnerProfile = useHexGameStore((s) => s.winnerProfile);
    const winnerId = useHexGameStore((s) => s.winnerId);
    const tickTimer = useHexGameStore((s) => s.tickTimer);
    const isPlayerDead = useHexGameStore((s) => s.isPlayerDead);

    // Battle Royale Lobby state
    const lobbyPhase = useHexGameStore((s) => s.lobbyPhase);
    const lobbyTimer = useHexGameStore((s) => s.lobbyTimer);
    const confirmedPlayerIds = useHexGameStore((s) => s.confirmedPlayerIds);
    const lobbyCountdownActive = useHexGameStore((s) => s.lobbyCountdownActive);

    // Battle Royale Lobby actions
    const joinMatch = useHexGameStore((s) => s.joinMatch);
    const leaveMatch = useHexGameStore((s) => s.leaveMatch);
    const tickLobbyTimer = useHexGameStore((s) => s.tickLobbyTimer);

    // Gifting
    const gifts = useStreamingStore((s) => s.gifts);
    const sendGift = useStreamingStore((s) => s.sendGift);
    const recentGifts = useStreamingStore((s) => s.recentGifts);

    // Economy — free daily play
    const { checkGamePlayCost } = useEconomyStore();
    const [gamePlayCost, setGamePlayCost] = useState<{ isFree: boolean; cost: number; balance: number } | null>(null);

    // Local state
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showGiftDrawer, setShowGiftDrawer] = useState(false);
    const [selectedGiftRecipient, setSelectedGiftRecipient] = useState<string | null>(null);
    const [isVoluntarySpectator, setIsVoluntarySpectator] = useState(false);

    // Game timer interval (host only)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const prevStageRef = useRef<string>(stage);

    // Reset voluntary spectator state when returning to lobby
    useEffect(() => {
        if (stage === 'lobby') {
            setIsVoluntarySpectator(false);
        }
    }, [stage]);

    // Check game play cost when lobby is visible
    useEffect(() => {
        if (stage === 'lobby') {
            checkGamePlayCost('hex_arena').then(setGamePlayCost).catch(err => {
                console.error('[HexGameUI] Failed to check game cost:', err);
            });
        }
    }, [stage, checkGamePlayCost]);

    useEffect(() => {
        if (stage === 'lobby') {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            return;
        }

        timerRef.current = setInterval(() => {
            if (isHost) {
                // Host drives all stage transitions
                tickTimer();
            } else {
                // Non-host: only count up during game for display.
                // Countdown & winner timers are set authoritatively by host via hex:stageSync.
                // Do NOT independently decrement — that causes off-by-one desync.
                const s = useHexGameStore.getState();
                if (s.stage === 'game') {
                    useHexGameStore.setState({ timer: s.timer + 1 });
                }
                // countdown & winner: leave timer alone, host stageSync sets it
            }
        }, 1000);

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [isHost, stage, tickTimer]);

    // Host broadcasts stage transitions AND timer ticks to all clients
    // During countdown/winner, broadcast every tick so non-host display stays in sync
    // During game, only broadcast stage transitions (game timer is cosmetic)
    useEffect(() => {
        if (!isHost) return;

        const s = useHexGameStore.getState();
        const stageChanged = prevStageRef.current !== stage;
        prevStageRef.current = stage;

        // Always broadcast on stage change, also broadcast during countdown/winner for timer sync
        if (stageChanged || stage === 'countdown' || stage === 'winner') {
            console.log('[HexGameUI] Host broadcasting stage sync:', stage, 'timer:', timer);
            callRpc('hex:stageSync', {
                stage: s.stage,
                timer: s.timer,
                winnerId: s.winnerId,
                winnerProfile: s.winnerProfile,
                lobbyPhase: s.lobbyPhase,
                confirmedPlayerIds: s.confirmedPlayerIds,
                lobbyCountdownActive: s.lobbyCountdownActive,
            });
        }

        // Clear hexConfirmed when returning to lobby
        if (stageChanged && s.stage === 'lobby') {
            writeMyState({ hexConfirmed: false }, true);
        }
    }, [isHost, stage, timer]);

    // Lobby timer interval (HOST ONLY — broadcasts to all clients via RPC)
    const lobbyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!lobbyCountdownActive) {
            if (lobbyTimerRef.current) {
                clearInterval(lobbyTimerRef.current);
                lobbyTimerRef.current = null;
            }
            return;
        }

        if (!isHost) {
            // Non-host: do NOT tick locally — wait for host's hex:lobbySync
            return;
        }

        // Host: tick and broadcast every second
        lobbyTimerRef.current = setInterval(() => {
            tickLobbyTimer();
            const s = useHexGameStore.getState();
            callRpc('hex:lobbySync', {
                lobbyTimer: s.lobbyTimer,
                lobbyCountdownActive: s.lobbyCountdownActive,
                confirmedPlayerIds: s.confirmedPlayerIds,
            });
        }, 1000);

        return () => {
            if (lobbyTimerRef.current) {
                clearInterval(lobbyTimerRef.current);
                lobbyTimerRef.current = null;
            }
        };
    }, [isHost, lobbyCountdownActive, tickLobbyTimer]);

    // Auto-start game when join window timer expires and enough players joined (host only)
    // IMPORTANT: lobbyTimer must be EXACTLY 0 (counted down), not -1 (uninitialized)
    useEffect(() => {
        if (!isHost) return;
        if (stage !== 'lobby') return;
        if (!lobbyCountdownActive) return;
        if (lobbyTimer !== 0) return;
        if (confirmedPlayerIds.length < MIN_PLAYERS_TO_START) return;

        // Join window expired with enough players → start the game
        onStartMatch();
        // Game is starting — no need to clear lobby state, hex:lobbySync handles it
    }, [isHost, stage, lobbyCountdownActive, lobbyTimer, confirmedPlayerIds, onStartMatch]);

    // Also auto-start when lobby fills to MAX_GAME_PLAYERS (host only)
    useEffect(() => {
        if (!isHost) return;
        if (stage !== 'lobby') return;
        if (confirmedPlayerIds.length < MAX_GAME_PLAYERS) return;

        // All slots filled → start immediately
        onStartMatch();
    }, [isHost, stage, confirmedPlayerIds, onStartMatch]);

    // Check if all selected players are ready → trigger game start
    // (Now handled by join window auto-start effects above)

    const amIDead = myId !== 'none' && isPlayerDead(myId);
    const alivePlayers = players.filter((p) => !p.isDead);
    const amIConfirmed = confirmedPlayerIds.includes(myId);
    const isLobbyFull = confirmedPlayerIds.length >= MAX_GAME_PLAYERS;

    // Am I a spectator? (not in the confirmed list, or I'm dead, or voluntarily spectating)
    const isGameActive = stage === 'game' || stage === 'countdown' || stage === 'winner';
    const amISpectator = isGameActive && !amIConfirmed;
    const amISpectatorInGame = stage === 'game' && (amIDead || !amIConfirmed);

    // Helper to get player name by id - uses synced Playroom world state
    const getPlayerName = (id: string) => {
        const ws = worldPlayers[id];
        if (ws?.profile?.username) return ws.profile.username;
        if (ws?.profile?.name) return ws.profile.name;
        const p = players.find(p => p.id === id);
        return p?.name || 'Player';
    };

    // Handle joining the match — notify all devices via RPC + Playroom state
    const handleJoinMatch = () => {
        console.log('[HexGameUI] handleJoinMatch called. myId:', myId);
        joinMatch(myId);
        // Write to Playroom Kit player state (persistent, but slow WebSocket)
        writeMyState({ hexConfirmed: true }, true);
        // Also broadcast via RPC so the host picks it up immediately
        callRpc('hex:playerJoin', { playerId: myId });
        const after = useHexGameStore.getState();
        console.log('[HexGameUI] handleJoinMatch done. confirmed:', after.confirmedPlayerIds, 'countdownActive:', after.lobbyCountdownActive);
        // If I'm the host and this triggered countdown, broadcast lobby state
        if (after.lobbyCountdownActive && isHost) {
            callRpc('hex:lobbySync', {
                lobbyTimer: after.lobbyTimer,
                lobbyCountdownActive: after.lobbyCountdownActive,
                confirmedPlayerIds: after.confirmedPlayerIds,
            });
        }
    };

    // Handle leaving the match — notify all devices via RPC + Playroom state
    const handleLeaveMatch = () => {
        console.log('[HexGameUI] handleLeaveMatch called. myId:', myId);
        leaveMatch(myId);
        writeMyState({ hexConfirmed: false }, true);
        // Also broadcast via RPC so the host picks it up immediately
        callRpc('hex:playerLeave', { playerId: myId });
        const after = useHexGameStore.getState();
        console.log('[HexGameUI] handleLeaveMatch done. confirmed:', after.confirmedPlayerIds);
        // If I'm the host and countdown was cancelled, broadcast
        if (!after.lobbyCountdownActive && isHost) {
            callRpc('hex:lobbySync', {
                lobbyTimer: after.lobbyTimer,
                lobbyCountdownActive: false,
                confirmedPlayerIds: after.confirmedPlayerIds,
            });
        }
    };

    // Handle sending a gift
    const handleSendGift = (giftId: string, giftName: string) => {
        if (!selectedGiftRecipient) return;

        const mySbaId = useAuthStore.getState().user?.id;
        const recipientProfile = worldPlayers[selectedGiftRecipient]?.profile;
        const recipientSbaId = recipientProfile?.id;

        if (!mySbaId) {
            console.error('[HexGameUI] ❌ Missing sender Supabase UUID');
            return;
        }
        if (!recipientSbaId) {
            console.error('[HexGameUI] ❌ Missing recipient Supabase UUID');
            return;
        }

        const myName = worldPlayers[myId]?.profile?.name || 'Guest';
        sendGift(mySbaId, recipientSbaId, giftId, giftName, myName);
    };

    // Filter gifts to show in drawer (same subset as theater)
    const drawerGifts = gifts.filter(g =>
        ['Heart', 'Star', 'Crown', 'Diamond'].includes(g.name)
    );

    return (
        <div className="fixed inset-0 z-30 pointer-events-none font-sans">
            {/* TOP HUD BAR - In-Game */}
            {stage !== 'lobby' && (
                <div
                    className="absolute top-0 left-0 right-0 grid grid-cols-3 items-start pb-2 bg-gradient-to-b from-black/60 to-transparent pointer-events-none"
                    style={{
                        paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
                        paddingLeft: 'max(env(safe-area-inset-left), 16px)',
                        paddingRight: 'max(env(safe-area-inset-right), 16px)',
                    }}
                >
                    {/* Left: Leave Button */}
                    <div className="justify-self-start">
                        <button
                            className="pointer-events-auto p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white/80 hover:text-white transition-colors border border-white/10"
                            onClick={() => {
                                if (window.confirm('Leave the game?')) {
                                    onLeaveGame();
                                }
                            }}
                            aria-label="Leave game"
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Center: Alive Pill */}
                    <div className="justify-self-center pt-2">
                        {stage === 'game' && !amIDead && (
                            <div className="px-4 py-1.5 rounded-full bg-black/50 backdrop-blur-md text-white text-sm font-bold border border-white/10 shadow-lg">
                                {alivePlayers.length} alive
                            </div>
                        )}
                    </div>

                    {/* Right: Timer */}
                    <div className="justify-self-end">
                        <div className="text-5xl font-black text-white drop-shadow-lg hex-font leading-none">
                            {stage === 'countdown' ? timer : (
                                stage === 'game' ? formatTime(timer) : timer
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════ LOBBY SCREEN ═══════════ */}
            {stage === 'lobby' && (
                <div className="absolute inset-0 flex flex-col pointer-events-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    {/* Top Bar – Room-style Header */}
                    <div
                        className="absolute top-0 left-0 right-0 flex justify-between items-center z-10"
                        style={{
                            top: 'max(env(safe-area-inset-top), 24px)',
                            paddingLeft: 'max(env(safe-area-inset-left), 16px)',
                            paddingRight: 'max(env(safe-area-inset-right), 16px)',
                        }}
                    >
                        {/* Left: Menu Button (3-dot ellipsis) */}
                        <div className="relative pointer-events-auto">
                            <button
                                className="h-12 w-12 rounded-full bg-bg-surface/60 backdrop-blur-md border border-white/10 text-white flex items-center justify-center shadow-xl active:scale-95 transition-all"
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                            >
                                {/* Menu Icon (3 dots vertical) */}
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
                                </svg>
                            </button>

                            {/* Dropdown Menu */}
                            {isMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" data-no-joystick onClick={() => setIsMenuOpen(false)} />
                                    <div className="absolute left-0 top-14 z-20 bg-bg-surface/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl overflow-hidden min-w-[180px]">
                                        {/* Camera Toggle */}
                                        <button
                                            className="w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 transition-colors"
                                            onClick={() => { onToggleCamera(); setIsMenuOpen(false); }}
                                        >
                                            {cameraOn ? (
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                                                </svg>
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75l16.5 16.5" />
                                                </svg>
                                            )}
                                            <span className={cameraOn ? '' : 'text-slate-400'}>{cameraOn ? 'Camera On' : 'Camera Off'}</span>
                                        </button>

                                        {/* Mic Toggle */}
                                        <button
                                            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors border-t border-white/5 ${!micAllowed ? 'opacity-50' : ''}`}
                                            onClick={() => { onToggleMic(); setIsMenuOpen(false); }}
                                            disabled={!micAllowed}
                                        >
                                            {micOn ? (
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-white">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                                                </svg>
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75l16.5 16.5" />
                                                </svg>
                                            )}
                                            <span className={micOn ? 'text-white' : 'text-slate-400'}>{micOn ? 'Mic On' : 'Mic Off'}</span>
                                        </button>

                                        {/* Mute Room */}
                                        <button
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors border-t border-white/5"
                                            onClick={() => { onToggleSpeaker(); setIsMenuOpen(false); }}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${speakerOn ? 'text-white' : 'text-slate-400'}`}>
                                                {speakerOn ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                                                )}
                                            </svg>
                                            <span className={speakerOn ? 'text-white' : 'text-slate-400'}>{speakerOn ? 'Room Audio On' : 'Room Muted'}</span>
                                        </button>

                                        {/* Leave Room */}
                                        <button
                                            className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 transition-colors border-t border-white/5"
                                            onClick={() => { setIsMenuOpen(false); onLeaveLobby(); }}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
                                            </svg>
                                            <span>Leave Room</span>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Right: People Pill */}
                        <div className="flex items-center gap-2">
                            {/* Player Count Pill – tappable to open player list */}
                            <button
                                onClick={onOpenPlayerList}
                                className="flex items-center gap-2 bg-bg-surface/60 backdrop-blur-md border border-white/10 px-3 py-2 rounded-full shadow-xl h-[42px] active:scale-95 transition-transform"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-white">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                                </svg>
                                <span className="text-white font-medium text-sm">{playerCount}</span>
                            </button>
                        </div>
                    </div>

                    {/* ── JOIN WINDOW PHASE ── */}
                    {lobbyPhase === 'joinWindow' && (
                        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                            <img
                                src={brandAssetUrls.hexArenaLogo}
                                alt="Hex Arena"
                                className="w-64 max-w-[80%] h-auto object-contain drop-shadow-2xl mb-6 animate-in zoom-in duration-500"
                            />

                            <p className="text-white/90 text-lg font-medium max-w-xs drop-shadow-md mb-4 leading-relaxed">
                                Be the last one standing! <br />
                                <span className="text-white/60 text-sm">Tiles fall when you step on them.</span>
                            </p>

                            {/* Countdown timer — only visible once MIN_PLAYERS is reached */}
                            {lobbyCountdownActive && lobbyTimer > 0 && (
                                <div className="text-6xl font-black text-white drop-shadow-lg hex-font mb-4 animate-in zoom-in duration-300">
                                    {lobbyTimer}
                                </div>
                            )}

                            {/* Join / Joined / Spectate buttons */}
                            {isVoluntarySpectator && !amIConfirmed ? (
                                /* Voluntary spectator state */
                                <div className="flex flex-col items-center gap-3 mb-4">
                                    <div
                                        className="flex items-center gap-2.5 px-8 py-4 rounded-full
                                            bg-bg-surface/60 backdrop-blur-xl border border-primary/30
                                            shadow-[inset_0_0_30px_rgba(123,47,255,0.15),0_4px_20px_rgba(0,0,0,0.3)]"
                                    >
                                        <Eye className="w-5 h-5 text-primary" />
                                        <span className="font-black text-xl text-white/80 tracking-wide">SPECTATING</span>
                                    </div>
                                    {!isLobbyFull && (
                                        <button
                                            onClick={() => {
                                                setIsVoluntarySpectator(false);
                                                handleJoinMatch();
                                            }}
                                            className="px-6 py-3 rounded-2xl text-sm font-bold text-white/50 hover:text-white transition-all active:scale-95
                                                bg-white/10 border-b-4 border-white/10
                                                active:border-b-0 active:translate-y-1 active:mt-1"
                                        >
                                            Switch to Join Match
                                        </button>
                                    )}
                                </div>
                            ) : !amIConfirmed ? (
                                isLobbyFull ? (
                                    <div
                                        className="px-8 py-4 rounded-full mb-4
                                            bg-bg-surface/60 backdrop-blur-xl border border-white/10
                                            shadow-[inset_0_0_30px_rgba(123,47,255,0.1),0_4px_20px_rgba(0,0,0,0.3)]"
                                    >
                                        <span className="font-black text-xl text-white/50 tracking-wide">Match Full — Spectating</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-3 mb-4 w-full max-w-sm">
                                        {/* Cost Badge — matches Snake/Chess pattern */}
                                        {gamePlayCost && (
                                            <div className={`mx-auto px-3 py-1.5 rounded-full text-sm font-medium border flex items-center gap-2
                                                bg-bg-surface/60 backdrop-blur-xl
                                                ${gamePlayCost.isFree
                                                    ? 'text-success border-success/30 shadow-[inset_0_0_20px_rgba(0,255,156,0.1)]'
                                                    : 'text-yellow-400 border-yellow-500/30 shadow-[inset_0_0_20px_rgba(234,179,8,0.1)]'
                                                }`}>
                                                {gamePlayCost.isFree ? (
                                                    <>✨ 1 Free Game</>
                                                ) : (
                                                    <>
                                                        <img src={brandAssetUrls.coinIcon} alt="Coins" className="w-4 h-4 object-contain" />
                                                        {gamePlayCost.cost} Coins / game
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        <GamePrimaryButton
                                            onClick={handleJoinMatch}
                                            className="w-full !py-4 !text-lg !rounded-2xl shadow-2xl animate-in zoom-in duration-300"
                                        >
                                            JOIN MATCH
                                            {gamePlayCost && !gamePlayCost.isFree && (
                                                <span className="flex items-center gap-1 text-slate-500 text-base font-medium ml-1">
                                                    · <img src={brandAssetUrls.coinIcon} alt="" className="w-5 h-5 object-contain" /> {gamePlayCost.cost}
                                                </span>
                                            )}
                                        </GamePrimaryButton>

                                        <div className="grid grid-cols-2 gap-3 w-full">
                                            <button
                                                onClick={() => setIsVoluntarySpectator(true)}
                                                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl
                                                    bg-white/10 backdrop-blur-md border-b-4 border-white/10
                                                    active:border-b-0 active:translate-y-1 active:mt-1
                                                    text-white/70 hover:text-white font-bold text-sm transition-all active:scale-95 no-underline"
                                            >
                                                <Eye className="w-4 h-4" />
                                                Spectate
                                            </button>
                                            {onStartPractice && (
                                                <button
                                                    onClick={onStartPractice}
                                                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl
                                                      bg-white/10 backdrop-blur-md border-b-4 border-white/10
                                                      active:border-b-0 active:translate-y-1 active:mt-1
                                                      text-white/70 hover:text-white font-bold text-sm transition-all active:scale-95 no-underline"
                                                >
                                                    🎮 Practice
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            ) : (
                                <button
                                    onClick={handleLeaveMatch}
                                    className="flex items-center gap-2.5 px-8 py-4 rounded-full mb-4 active:scale-95 transition-all
                                        bg-bg-surface/60 backdrop-blur-xl border border-success/30
                                        shadow-[inset_0_0_30px_rgba(0,255,156,0.1),0_4px_20px_rgba(0,0,0,0.3)]"
                                >
                                    <Check className="w-5 h-5 text-success" />
                                    <span className="font-black text-xl text-white/80 tracking-wide">JOINED</span>
                                </button>
                            )}

                            {/* Player Slots — only shown once at least 1 player has joined */}
                            {confirmedPlayerIds.length > 0 && (
                                <div className="mt-8 w-full max-w-sm bg-bg-surface/60 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                                    <div className="px-4 py-2 border-b border-white/10 flex justify-between items-center">
                                        <span className="text-white/60 text-xs font-bold uppercase tracking-wider">Arena Slots · {MIN_PLAYERS_TO_START} minimum</span>
                                        <span className="text-white/40 text-xs">{confirmedPlayerIds.length}/{MAX_GAME_PLAYERS}</span>
                                    </div>
                                    <div className="divide-y divide-white/5">
                                        {confirmedPlayerIds.map((pid, i) => {
                                            const isMe = pid === myId;
                                            return (
                                                <div
                                                    key={pid}
                                                    className={`px-4 py-2.5 flex items-center justify-between ${isMe ? 'bg-purple-500/10' : ''}`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold w-5 text-green-400">
                                                            #{i + 1}
                                                        </span>
                                                        <span className={`text-sm font-medium ${isMe ? 'text-purple-300' : 'text-white/80'}`}>
                                                            {isMe ? 'You' : getPlayerName(pid)}
                                                        </span>
                                                    </div>
                                                    <Check className="w-4 h-4 text-green-400" />
                                                </div>
                                            );
                                        })}
                                        {/* Empty slots */}
                                        {Array.from({ length: MAX_GAME_PLAYERS - confirmedPlayerIds.length }).map((_, i) => (
                                            <div key={`empty-${i}`} className="px-4 py-2.5 flex items-center gap-2">
                                                <span className="text-xs font-bold w-5 text-white/20">
                                                    #{confirmedPlayerIds.length + i + 1}
                                                </span>
                                                <span className="text-sm text-white/20">Empty</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )
            }

            {/* ═══════════ SPECTATOR BANNER ═══════════ */}
            {/* Small floating banner for non-participants during active game — no blur/overlay */}
            {
                amISpectator && !amIDead && stage !== 'winner' && (
                    <div className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-in fade-in duration-300"
                        style={{ top: 'calc(env(safe-area-inset-top) + 60px)' }}
                    >
                        <div
                            className="px-5 py-2.5 rounded-full flex items-center gap-2.5
                            bg-bg-surface/60 backdrop-blur-xl border border-primary/20
                            shadow-[inset_0_0_20px_rgba(123,47,255,0.1),0_4px_16px_rgba(0,0,0,0.3)]"
                        >
                            <Eye className="w-4 h-4 text-primary" />
                            <span className="text-sm font-black text-white/80 hex-font">SPECTATING</span>
                            <span className="text-white/40 text-xs">
                                {alivePlayers.length > 0 ? `${alivePlayers.length} alive` : 'Match in progress'}
                            </span>
                        </div>
                    </div>
                )
            }

            {/* Countdown Big Text */}
            {
                stage === 'countdown' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-[12rem] font-black text-white drop-shadow-2xl hex-font animate-in zoom-in duration-300">
                            {timer > 0 ? timer : 'GO!'}
                        </div>
                    </div>
                )
            }

            {/* Eliminated Overlay */}
            {
                stage === 'game' && amIDead && (
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none">
                        <div className="bg-black/60 backdrop-blur-md px-8 py-6 rounded-3xl border border-red-500/30 flex flex-col items-center animate-in zoom-in duration-300">
                            <div className="text-5xl mb-2">💀</div>
                            <div className="text-3xl font-black text-red-500 hex-font">ELIMINATED</div>
                            <div className="text-white/60 text-sm mt-2">
                                Spectating • {alivePlayers.length} left
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Spectator Gift FAB — shown for eliminated players and non-participants during active game */}
            {
                (amISpectatorInGame || (stage === 'winner' && !amIConfirmed)) && (
                    <button
                        onClick={() => {
                            setSelectedGiftRecipient(null);
                            setShowGiftDrawer(true);
                        }}
                        className="fixed bottom-28 right-4 pointer-events-auto w-14 h-14 rounded-full bg-pink-500/80 hover:bg-pink-500 backdrop-blur-md shadow-xl flex items-center justify-center active:scale-90 transition-all z-40 border border-pink-400/30"
                        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
                    >
                        <Gift className="w-7 h-7 text-white" />
                    </button>
                )
            }

            {/* Gift Drawer — player selection + gift selection */}
            {
                showGiftDrawer && (
                    <>
                        {/* Backdrop */}
                        <div
                            className="fixed inset-0 bg-black/40 z-50 pointer-events-auto"
                            onClick={() => setShowGiftDrawer(false)}
                        />
                        <div
                            className="fixed bottom-0 left-0 right-0 z-50 pointer-events-auto bg-bg-surface/95 backdrop-blur-xl rounded-t-3xl border-t border-white/10 shadow-2xl animate-in slide-in-from-bottom duration-300"
                            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
                        >
                            {!selectedGiftRecipient ? (
                                /* Step 1: Pick a player */
                                <div className="p-4">
                                    <div className="text-white/60 text-xs font-bold uppercase tracking-wider mb-3 text-center">
                                        Choose a Player
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                                        {alivePlayers.map((p) => (
                                            <button
                                                key={p.id}
                                                onClick={() => setSelectedGiftRecipient(p.id)}
                                                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 active:scale-95 transition-all"
                                            >
                                                {p.photo ? (
                                                    <img src={p.photo} className="w-8 h-8 rounded-full object-cover" alt="" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-purple-500/30 flex items-center justify-center text-sm">
                                                        {p.name[0]?.toUpperCase() || '?'}
                                                    </div>
                                                )}
                                                <span className="text-white text-sm font-medium truncate">
                                                    {getPlayerName(p.id)}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                /* Step 2: Pick a gift */
                                <div className="p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <button
                                            onClick={() => setSelectedGiftRecipient(null)}
                                            className="text-white/60 text-sm flex items-center gap-1"
                                        >
                                            <ArrowLeft className="w-4 h-4" /> Back
                                        </button>
                                        <div className="text-white/60 text-xs font-bold uppercase tracking-wider">
                                            Gift to {getPlayerName(selectedGiftRecipient)}
                                        </div>
                                        <div className="w-12" /> {/* Spacer */}
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {drawerGifts.map((gift) => {
                                            const emoji = gift.name === 'Heart' ? '❤️' : gift.name === 'Star' ? '⭐' : gift.name === 'Crown' ? '👑' : '💎';
                                            return (
                                                <button
                                                    key={gift.id}
                                                    onClick={() => handleSendGift(gift.id, gift.name)}
                                                    className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 active:scale-90 transition-all"
                                                >
                                                    <span className="text-2xl">{emoji}</span>
                                                    <span className="text-white text-xs font-medium">{gift.name}</span>
                                                    <div className="flex items-center gap-1">
                                                        <img src={brandAssetUrls.coinIcon} alt="" className="w-3 h-3 object-contain" />
                                                        <span className="text-white/60 text-[10px]">{gift.cost}</span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Recharge button */}
                                    <button
                                        onClick={() => {
                                            useEconomyStore.getState().openPurchaseDrawer();
                                            setShowGiftDrawer(false);
                                        }}
                                        className="w-full mt-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm font-medium active:scale-95 transition-all"
                                    >
                                        ⚡ Recharge Coins
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )
            }

            {/* Winner/Loser/Spectator Screen */}
            {
                stage === 'winner' && (() => {
                    const isWinner = winnerId === myId;
                    const wasSpectator = !amIConfirmed; // Spectators were never confirmed
                    // Show total gifts received during match
                    const totalGiftsReceived = recentGifts.length;

                    return (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm z-50 animate-in fade-in duration-500">
                            {isWinner ? (
                                // ── Winner View ──
                                <>
                                    <div className="text-8xl mb-6 animate-bounce">🏆</div>
                                    <div className="text-5xl font-black text-yellow-400 mb-4 hex-font text-center px-4">
                                        You Won!
                                    </div>
                                    {winnerProfile?.photo && (
                                        <img
                                            src={winnerProfile.photo}
                                            className="w-24 h-24 rounded-full border-4 border-yellow-400 shadow-xl mb-4 object-cover"
                                            alt="Winner"
                                        />
                                    )}
                                    {/* Gift summary */}
                                    {totalGiftsReceived > 0 && (
                                        <div className="flex items-center gap-2 bg-pink-500/20 px-5 py-2.5 rounded-full border border-pink-400/30 mb-6 animate-in zoom-in duration-500">
                                            <Gift className="w-5 h-5 text-pink-400" />
                                            <span className="text-pink-300 font-bold">
                                                {totalGiftsReceived} gift{totalGiftsReceived !== 1 ? 's' : ''} this match!
                                            </span>
                                        </div>
                                    )}
                                </>
                            ) : wasSpectator ? (
                                // ── Spectator View — neutral, shows who won ──
                                <>
                                    <div className="text-7xl mb-6">🏆</div>
                                    <div className="text-4xl font-black text-white mb-2 hex-font text-center px-4">
                                        Match Over
                                    </div>
                                    <div className="text-xl text-white/80 mb-4 hex-font text-center px-4">
                                        {winnerProfile?.name || 'Someone'} won!
                                    </div>
                                    {winnerProfile?.photo && (
                                        <img
                                            src={winnerProfile.photo}
                                            className="w-20 h-20 rounded-full border-4 border-yellow-400/60 shadow-lg mb-4 object-cover"
                                            alt="Winner"
                                        />
                                    )}
                                </>
                            ) : (
                                // ── Loser View ──
                                <>
                                    <div className="text-7xl mb-6">💀</div>
                                    <div className="text-4xl font-black text-red-400 mb-2 hex-font text-center px-4">
                                        You Lost!
                                    </div>
                                    <div className="text-xl text-white/80 mb-4 hex-font text-center px-4">
                                        {winnerProfile?.name || 'Someone'} won the match
                                    </div>
                                    {winnerProfile?.photo && (
                                        <img
                                            src={winnerProfile.photo}
                                            className="w-16 h-16 rounded-full border-2 border-white/30 shadow-lg mb-4 object-cover opacity-80"
                                            alt="Winner"
                                        />
                                    )}
                                    {/* Gift summary */}
                                    {totalGiftsReceived > 0 && (
                                        <div className="flex items-center gap-2 bg-pink-500/20 px-5 py-2.5 rounded-full border border-pink-400/30 mb-4 animate-in zoom-in duration-500">
                                            <Gift className="w-5 h-5 text-pink-400" />
                                            <span className="text-pink-300 font-bold">
                                                {totalGiftsReceived} gift{totalGiftsReceived !== 1 ? 's' : ''} this match!
                                            </span>
                                        </div>
                                    )}
                                </>
                            )}

                            <div className="text-white/60 bg-white/10 px-4 py-2 rounded-full">
                                Returning to lobby in {timer}…
                            </div>
                        </div>
                    );
                })()
            }
        </div >
    );
});

/**
 * Format seconds to MM:SS
 */
function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
