/**
 * Hex Arena Game State Store
 * Manages game lifecycle: joinWindow → countdown → game → winner → joinWindow
 * Battle royale lobby: players tap "Join" during 30s window, first N play.
 */

import { create } from 'zustand';
import {
    COUNTDOWN_SECONDS,
    WINNER_DISPLAY_SECONDS,
    DEATH_Y_THRESHOLD,
    MAX_GAME_PLAYERS,
    MIN_PLAYERS_TO_START,
    JOIN_WINDOW_SECONDS,
} from './hexConfig';

// Game stages (in-game phases)
export type GameStage = 'lobby' | 'countdown' | 'game' | 'winner';

// Lobby phase — single phase replaces old waiting/competing/readyUp
export type LobbyPhase = 'joinWindow';

// Stage transitions for in-game
const NEXT_STAGE: Record<GameStage, GameStage> = {
    lobby: 'countdown',
    countdown: 'game',
    game: 'winner',
    winner: 'lobby',
};

// Timer values for game stages
const TIMER_STAGE: Record<GameStage, number> = {
    lobby: -1,
    countdown: COUNTDOWN_SECONDS,
    game: 0,
    winner: WINNER_DISPLAY_SECONDS,
};

export interface HexPlayer {
    id: string;
    name: string;
    photo?: string;
    avatarUrl?: string;
    isDead: boolean;
    startingPos: { x: number; z: number };
}

export interface HexGameState {
    // Core state
    stage: GameStage;
    timer: number;
    hostId: string | null;
    winnerId: string | null;
    winnerProfile: { name: string; photo?: string } | null;

    // Players (all in room)
    players: HexPlayer[];

    // Battle Royale Lobby
    lobbyPhase: LobbyPhase;
    lobbyTimer: number;                 // -1 = waiting for min players, >0 = countdown active
    confirmedPlayerIds: string[];       // Players who tapped "Join" (max MAX_GAME_PLAYERS)
    lobbyCountdownActive: boolean;      // True once MIN_PLAYERS reached and 30s countdown started

    // Match pot tracking (from create_hex_match RPC)
    potId: string | null;

    // Destroyed hexagons
    destroyedHexes: Set<string>;

    // Solo mode flag
    isSoloGame: boolean;

    // Practice mode (local-only, no Playroom)
    isPracticeMode: boolean;

    // Arena readiness — true once hex meshes are loaded and cloned
    arenaReady: boolean;

    // ─── Actions ───

    // Player management
    setHostId: (id: string) => void;
    addPlayer: (player: Omit<HexPlayer, 'isDead' | 'startingPos'>) => void;
    removePlayer: (id: string) => void;
    eliminatePlayer: (id: string) => void;
    destroyHex: (key: string) => void;

    // Battle Royale Lobby
    joinMatch: (playerId: string) => void;
    leaveMatch: (playerId: string) => void;
    openJoinWindow: () => void;
    closeJoinWindow: () => void;
    tickLobbyTimer: () => void;

    // Game control (host only)
    startGame: (worldPlayerNames?: Record<string, string>) => void;
    advanceStage: () => void;
    tickTimer: () => void;
    resetGame: () => void;
    setArenaReady: (ready: boolean) => void;

    // Practice mode
    startPracticeGame: (playerName: string, playerPhoto?: string) => void;

    // Computed
    getAlivePlayers: () => HexPlayer[];
    isPlayerDead: (id: string) => boolean;
    isPlayerConfirmed: (id: string) => boolean;
    isLobbyFull: () => boolean;
}

export const useHexGameStore = create<HexGameState>((set, get) => ({
    // Initial state
    stage: 'lobby',
    timer: TIMER_STAGE.lobby,
    hostId: null,
    winnerId: null,
    winnerProfile: null,
    players: [],
    potId: null,
    destroyedHexes: new Set(),
    isSoloGame: false,
    isPracticeMode: false,
    arenaReady: false,

    // Battle Royale Lobby initial state
    lobbyPhase: 'joinWindow',
    lobbyTimer: -1,
    confirmedPlayerIds: [],
    lobbyCountdownActive: false,

    // ─── Player Management ───

    setHostId: (id) => set({ hostId: id }),

    addPlayer: (player) => set((state) => {
        const startingPos = {
            x: (Math.random() - 0.5) * 10,
            z: (Math.random() - 0.5) * 10,
        };

        return {
            players: [
                ...state.players,
                { ...player, isDead: state.stage === 'game', startingPos }
            ]
        };
    }),

    removePlayer: (id) => {
        const state = get();
        const newPlayers = state.players.filter(p => p.id !== id);
        const newConfirmed = state.confirmedPlayerIds.filter(pid => pid !== id);

        // Check win condition if in game
        if (state.stage === 'game') {
            const alivePlayers = newPlayers.filter(p => !p.isDead);
            const threshold = state.isSoloGame ? 0 : 1;

            if (alivePlayers.length <= threshold) {
                const winner = alivePlayers[0];
                set({
                    players: newPlayers,
                    confirmedPlayerIds: newConfirmed,
                    stage: 'winner',
                    timer: TIMER_STAGE.winner,
                    winnerId: winner?.id || null,
                    winnerProfile: winner ? { name: winner.name, photo: winner.photo } : null,
                });
                return;
            }
        }

        // If player leaves during join window and countdown was active,
        // check if we still have min players
        if (state.stage === 'lobby' && state.lobbyCountdownActive) {
            if (newConfirmed.length < MIN_PLAYERS_TO_START) {
                // Not enough confirmed players — pause countdown, wait for more
                set({
                    players: newPlayers,
                    confirmedPlayerIds: newConfirmed,
                    lobbyCountdownActive: false,
                    lobbyTimer: -1,
                });
                return;
            }
        }

        set({
            players: newPlayers,
            confirmedPlayerIds: newConfirmed,
        });
    },

    eliminatePlayer: (id) => set((state) => ({
        players: state.players.map(p =>
            p.id === id ? { ...p, isDead: true } : p
        )
    })),

    destroyHex: (key) => set((state) => {
        const newSet = new Set(state.destroyedHexes);
        newSet.add(key);
        return { destroyedHexes: newSet };
    }),

    // ─── Battle Royale Lobby ───

    joinMatch: (playerId) => {
        const state = get();
        // Can only join during join window in lobby stage
        if (state.stage !== 'lobby') return;
        // Already confirmed
        if (state.confirmedPlayerIds.includes(playerId)) return;
        // Lobby full
        if (state.confirmedPlayerIds.length >= MAX_GAME_PLAYERS) return;

        const newConfirmed = [...state.confirmedPlayerIds, playerId];

        // Check if we just hit MIN_PLAYERS and need to start countdown
        if (!state.lobbyCountdownActive && newConfirmed.length >= MIN_PLAYERS_TO_START) {
            set({
                confirmedPlayerIds: newConfirmed,
                lobbyCountdownActive: true,
                lobbyTimer: JOIN_WINDOW_SECONDS,
            });
        } else if (newConfirmed.length >= MAX_GAME_PLAYERS) {
            // Lobby full → start immediately
            set({ confirmedPlayerIds: newConfirmed });
            // closeJoinWindow will be called by the host
        } else {
            set({ confirmedPlayerIds: newConfirmed });
        }
    },

    leaveMatch: (playerId) => {
        const state = get();
        if (state.stage !== 'lobby') return;
        if (!state.confirmedPlayerIds.includes(playerId)) return;

        const newConfirmed = state.confirmedPlayerIds.filter(id => id !== playerId);

        // If we drop below min players, pause countdown
        if (state.lobbyCountdownActive && newConfirmed.length < MIN_PLAYERS_TO_START) {
            set({
                confirmedPlayerIds: newConfirmed,
                lobbyCountdownActive: false,
                lobbyTimer: -1,
            });
        } else {
            set({ confirmedPlayerIds: newConfirmed });
        }
    },

    openJoinWindow: () => set({
        stage: 'lobby',
        timer: TIMER_STAGE.lobby,
        lobbyPhase: 'joinWindow',
        lobbyTimer: -1,
        confirmedPlayerIds: [],
        lobbyCountdownActive: false,
        winnerId: null,
        winnerProfile: null,
        destroyedHexes: new Set(),
        players: get().players.map(p => ({
            ...p,
            isDead: false,
            startingPos: {
                x: (Math.random() - 0.5) * 10,
                z: (Math.random() - 0.5) * 10,
            }
        })),
    }),

    closeJoinWindow: () => {
        const state = get();
        if (state.confirmedPlayerIds.length < MIN_PLAYERS_TO_START) return;
        // Transition to game — startGame will be called by the host
    },

    tickLobbyTimer: () => {
        const state = get();
        if (!state.lobbyCountdownActive) return;
        if (state.lobbyTimer <= 0) return;

        const newTimer = state.lobbyTimer - 1;
        set({ lobbyTimer: newTimer });
    },

    // ─── Game Control ───

    startGame: (worldPlayerNames?: Record<string, string>) => {
        const state = get();

        // Build players array from confirmedPlayerIds
        let gamePlayers: HexPlayer[];
        if (state.confirmedPlayerIds.length > 0 && worldPlayerNames) {
            gamePlayers = state.confirmedPlayerIds.map(id => {
                const existing = state.players.find(p => p.id === id);
                return {
                    id,
                    name: existing?.name || worldPlayerNames[id] || 'Player',
                    photo: existing?.photo || '',
                    avatarUrl: existing?.avatarUrl,
                    isDead: false,
                    startingPos: {
                        x: (Math.random() - 0.5) * 10,
                        z: (Math.random() - 0.5) * 10,
                    },
                };
            });
        } else {
            gamePlayers = state.confirmedPlayerIds.length > 0
                ? state.players.filter(p => state.confirmedPlayerIds.includes(p.id))
                : state.players;
        }

        set({
            stage: 'countdown',
            timer: TIMER_STAGE.countdown,
            isSoloGame: gamePlayers.length === 1,
            destroyedHexes: new Set(),
            winnerId: null,
            winnerProfile: null,
            arenaReady: false, // Reset — will be set true after hex meshes load
            // Clear lobby countdown state — game is starting
            lobbyCountdownActive: false,
            lobbyTimer: -1,
            players: gamePlayers.map(p => ({
                ...p,
                isDead: false,
                startingPos: {
                    x: (Math.random() - 0.5) * 10,
                    z: (Math.random() - 0.5) * 10,
                },
            })),
        });
    },

    advanceStage: () => set((state) => {
        const nextStage = NEXT_STAGE[state.stage];
        return {
            stage: nextStage,
            timer: TIMER_STAGE[nextStage],
        };
    }),

    tickTimer: () => {
        const state = get();

        if (state.stage === 'lobby') return;

        let newTimer: number;

        if (state.stage === 'game') {
            newTimer = state.timer + 1;
        } else {
            newTimer = state.timer - 1;
        }

        if (newTimer === 0 && state.stage !== 'game') {
            const nextStage = NEXT_STAGE[state.stage];

            if (nextStage === 'lobby') {
                // Winner display done → open next join window
                get().openJoinWindow();
            } else if (nextStage === 'game') {
                // Countdown done → start game
                set({
                    stage: nextStage,
                    timer: TIMER_STAGE[nextStage],
                });
            } else {
                set({
                    stage: nextStage,
                    timer: TIMER_STAGE[nextStage],
                });
            }
        } else if (state.stage === 'game') {
            const alivePlayers = state.players.filter(p => !p.isDead);
            const threshold = state.isSoloGame ? 0 : 1;

            if (alivePlayers.length <= threshold) {
                const winner = alivePlayers[0];
                set({
                    stage: 'winner',
                    timer: TIMER_STAGE.winner,
                    winnerId: winner?.id || null,
                    winnerProfile: winner ? { name: winner.name, photo: winner.photo } : null,
                });
            } else {
                set({ timer: newTimer });
            }
        } else {
            set({ timer: newTimer });
        }
    },

    resetGame: () => {
        set({ potId: null, isPracticeMode: false, arenaReady: false });
        get().openJoinWindow();
    },

    setArenaReady: (ready) => set({ arenaReady: ready }),

    startPracticeGame: (playerName: string, playerPhoto?: string) => {
        const practicePlayerId = 'practice-player';
        set({
            stage: 'countdown',
            timer: TIMER_STAGE.countdown,
            isSoloGame: true,
            isPracticeMode: true,
            arenaReady: false,
            hostId: practicePlayerId,
            destroyedHexes: new Set(),
            winnerId: null,
            winnerProfile: null,
            lobbyCountdownActive: false,
            lobbyTimer: -1,
            confirmedPlayerIds: [practicePlayerId],
            players: [{
                id: practicePlayerId,
                name: playerName,
                photo: playerPhoto || '',
                isDead: false,
                startingPos: {
                    x: (Math.random() - 0.5) * 10,
                    z: (Math.random() - 0.5) * 10,
                },
            }],
        });
    },

    // ─── Computed ───

    getAlivePlayers: () => get().players.filter(p => !p.isDead),
    isPlayerDead: (id) => get().players.find(p => p.id === id)?.isDead ?? false,
    isPlayerConfirmed: (id) => get().confirmedPlayerIds.includes(id),
    isLobbyFull: () => get().confirmedPlayerIds.length >= MAX_GAME_PLAYERS,
}));

// Helper to check if player Y position means death
export function checkPlayerDeath(yPosition: number): boolean {
    return yPosition < DEATH_Y_THRESHOLD;
}
