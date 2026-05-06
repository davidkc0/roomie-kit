import { create } from 'zustand';
import type { Square } from 'chess.js';
import { ChessGameEngine, type ChessGameState, type GameMode, type PieceColor } from '../games/chess/ChessGame';

export type ChessMultiplayerStatus = 'idle' | 'inviting' | 'incoming' | 'playing';

type ChessStore = {
    // Game state
    engine: ChessGameEngine | null;
    gameState: ChessGameState | null;
    gameMode: GameMode | null;
    playerColor: PieceColor;
    opponentInfo: { id: string; name: string; avatar?: string } | null;

    // UI state
    isPlaying: boolean;
    isModalOpen: boolean;
    isPaused: boolean;
    showPlayerSelect: boolean; // Show player selection list

    // Multiplayer state (mirrors videoCallStore)
    multiplayerStatus: ChessMultiplayerStatus;
    gameSessionId: string | null;
    pendingInvite: { fromId: string; fromName: string; fromAvatar?: string; sessionId: string; assignedColor: PieceColor } | null;

    // Actions
    openChessModal: () => void;
    closeChessModal: () => void;
    startGame: (mode: GameMode, opponentInfo?: { id: string; name: string; avatar?: string }) => void;
    makeMove: (from: Square, to: Square) => boolean;
    receiveMove: (from: Square, to: Square) => void;
    getValidMoves: (square: Square) => Square[];
    resetGame: () => void;

    // Multiplayer actions
    setShowPlayerSelect: (show: boolean) => void;
    sendInvite: (toId: string, toName: string, toAvatar?: string) => void;
    receiveInvite: (fromId: string, fromName: string, fromAvatar: string | undefined, sessionId: string, assignedColor: PieceColor) => void;
    acceptInvite: () => void;
    declineInvite: () => void;
    startMultiplayerGame: (sessionId: string, opponentInfo: { id: string; name: string; avatar?: string }, myColor: PieceColor) => void;
    endMultiplayerGame: () => void;
};

export const useChessStore = create<ChessStore>((set, get) => ({
    // Initial state
    engine: null,
    gameState: null,
    gameMode: null,
    playerColor: 'w',
    opponentInfo: null,
    isPlaying: false,
    isModalOpen: false,
    isPaused: false,
    showPlayerSelect: false,
    multiplayerStatus: 'idle',
    gameSessionId: null,
    pendingInvite: null,

    openChessModal: () => {
        set({ isModalOpen: true });
    },

    closeChessModal: () => {
        set({
            isModalOpen: false,
            isPlaying: false,
            engine: null,
            gameState: null,
            gameMode: null,
            opponentInfo: null
        });
    },

    startGame: (mode, opponentInfo) => {
        const engine = new ChessGameEngine();
        // In multiplayer, randomly assign colors; vs AI, player is always white
        const playerColor: PieceColor = mode === 'ai' ? 'w' : (Math.random() > 0.5 ? 'w' : 'b');

        set({
            engine,
            gameState: engine.getState(),
            gameMode: mode,
            playerColor,
            opponentInfo: opponentInfo || null,
            isPlaying: true,
            isPaused: false,
        });
    },

    makeMove: (from, to) => {
        const { engine, gameMode, playerColor } = get();
        if (!engine) return false;

        const state = engine.getState();
        if (state.turn !== playerColor) return false;

        const move = engine.move(from, to);
        if (!move) return false;

        set({ gameState: engine.getState() });

        return true;
    },

    receiveMove: (from, to) => {
        const { engine } = get();
        if (!engine) return;

        engine.move(from, to);
        set({ gameState: engine.getState() });
    },

    getValidMoves: (square) => {
        const { engine } = get();
        if (!engine) return [];
        return engine.getValidMoves(square);
    },

    resetGame: () => {
        const { engine } = get();
        if (engine) {
            engine.reset();
            set({ gameState: engine.getState(), isPlaying: false });
        }
    },

    // Multiplayer actions
    setShowPlayerSelect: (show) => {
        set({ showPlayerSelect: show });
    },

    sendInvite: (toId, toName, toAvatar) => {
        // Generate session ID
        const sessionId = `chess_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        set({
            multiplayerStatus: 'inviting',
            gameSessionId: sessionId,
            opponentInfo: { id: toId, name: toName, avatar: toAvatar },
            showPlayerSelect: false
        });
    },

    receiveInvite: (fromId, fromName, fromAvatar, sessionId, assignedColor) => {
        set({
            pendingInvite: { fromId, fromName, fromAvatar, sessionId, assignedColor },
            multiplayerStatus: 'incoming'
        });
    },

    acceptInvite: () => {
        const { pendingInvite } = get();
        if (!pendingInvite) return;

        // Start the game with the assigned color
        const engine = new ChessGameEngine();
        set({
            engine,
            gameState: engine.getState(),
            gameMode: 'multiplayer',
            playerColor: pendingInvite.assignedColor,
            opponentInfo: {
                id: pendingInvite.fromId,
                name: pendingInvite.fromName,
                avatar: pendingInvite.fromAvatar
            },
            gameSessionId: pendingInvite.sessionId,
            isPlaying: true,
            isModalOpen: true,
            multiplayerStatus: 'playing',
            pendingInvite: null
        });
    },

    declineInvite: () => {
        set({
            pendingInvite: null,
            multiplayerStatus: 'idle'
        });
    },

    startMultiplayerGame: (sessionId, opponentInfo, myColor) => {
        const engine = new ChessGameEngine();
        set({
            engine,
            gameState: engine.getState(),
            gameMode: 'multiplayer',
            playerColor: myColor,
            opponentInfo,
            gameSessionId: sessionId,
            isPlaying: true,
            multiplayerStatus: 'playing'
        });
    },

    endMultiplayerGame: () => {
        set({
            engine: null,
            gameState: null,
            gameMode: null,
            opponentInfo: null,
            gameSessionId: null,
            isPlaying: false,
            multiplayerStatus: 'idle'
        });
    },
}));
