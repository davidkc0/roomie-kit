import { Chess, type Square, type Move } from 'chess.js';

export type GameStatus = 'idle' | 'playing' | 'checkmate' | 'stalemate' | 'draw';
export type GameMode = 'ai' | 'multiplayer';
export type PieceColor = 'w' | 'b';

export type ChessGameState = {
    fen: string;
    turn: PieceColor;
    status: GameStatus;
    isCheck: boolean;
    lastMove: { from: Square; to: Square } | null;
    capturedWhite: string[];
    capturedBlack: string[];
    moveHistory: string[];
};

/**
 * Chess game logic wrapper around chess.js
 */
export class ChessGameEngine {
    private game: Chess;
    private capturedWhite: string[] = [];
    private capturedBlack: string[] = [];
    private lastMove: { from: Square; to: Square } | null = null;

    constructor(fen?: string) {
        this.game = new Chess(fen);
    }

    /**
     * Get current game state
     */
    getState(): ChessGameState {
        let status: GameStatus = 'playing';

        if (this.game.isCheckmate()) {
            status = 'checkmate';
        } else if (this.game.isStalemate()) {
            status = 'stalemate';
        } else if (this.game.isDraw()) {
            status = 'draw';
        }

        return {
            fen: this.game.fen(),
            turn: this.game.turn(),
            status,
            isCheck: this.game.isCheck(),
            lastMove: this.lastMove,
            capturedWhite: [...this.capturedWhite],
            capturedBlack: [...this.capturedBlack],
            moveHistory: this.game.history(),
        };
    }

    /**
     * Get valid moves for a square
     */
    getValidMoves(square: Square): Square[] {
        const moves = this.game.moves({ square, verbose: true });
        return moves.map(m => m.to as Square);
    }

    /**
     * Make a move
     */
    move(from: Square, to: Square, promotion?: string): Move | null {
        try {
            const move = this.game.move({ from, to, promotion: promotion || 'q' });

            if (move) {
                this.lastMove = { from, to };

                // Track captured pieces
                if (move.captured) {
                    if (move.color === 'w') {
                        this.capturedBlack.push(move.captured);
                    } else {
                        this.capturedWhite.push(move.captured);
                    }
                }
            }

            return move;
        } catch {
            return null;
        }
    }

    /**
     * Get all legal moves (for AI)
     */
    getLegalMoves(): Move[] {
        return this.game.moves({ verbose: true });
    }

    /**
     * Check if game is over
     */
    isGameOver(): boolean {
        return this.game.isGameOver();
    }

    /**
     * Get winner color (null if draw or ongoing)
     */
    getWinner(): PieceColor | null {
        if (this.game.isCheckmate()) {
            // The player whose turn it is lost (they're in checkmate)
            return this.game.turn() === 'w' ? 'b' : 'w';
        }
        return null;
    }

    /**
     * Reset game
     */
    reset(): void {
        this.game.reset();
        this.capturedWhite = [];
        this.capturedBlack = [];
        this.lastMove = null;
    }

    /**
     * Load game from FEN
     */
    load(fen: string): boolean {
        try {
            this.game.load(fen);
            this.capturedWhite = [];
            this.capturedBlack = [];
            this.lastMove = null;
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get FEN string for syncing
     */
    getFen(): string {
        return this.game.fen();
    }
}

/**
 * Simple AI that picks a random legal move
 * (Can be replaced with Stockfish later)
 */
export function getRandomAIMove(engine: ChessGameEngine): Move | null {
    const moves = engine.getLegalMoves();
    if (moves.length === 0) return null;
    return moves[Math.floor(Math.random() * moves.length)];
}
