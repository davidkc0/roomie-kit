export type Position = {
    row: number;
    col: number;
};

export type GemType = 0 | 1 | 2 | 3 | 4 | 5; // 6 different gem types

export type Gem = {
    type: GemType;
    position: Position;
};

export type GameState = 'idle' | 'playing' | 'paused' | 'gameOver';

export type GameConfig = {
    gridWidth: number;
    gridHeight: number;
    cellSize: number;
    gemTypes: number; // Number of different gem types (default 6)
};

export type Match3GameState = {
    state: GameState;
    score: number;
    highScore: number;
    moves: number; // Moves remaining
    grid: (GemType | null)[][]; // 2D array of gem types
    selectedGem: Position | null; // Currently selected gem for swapping
    isAnimating: boolean; // Prevent input during animations
};

export type GameEvent =
    | { type: 'swap'; pos1: Position; pos2: Position; valid: boolean }
    | { type: 'matches'; matches: Position[][] }
    | { type: 'gravity'; drops: { from: Position; to: Position; gem: GemType }[]; newGems: { pos: Position; gem: GemType }[] }
    | { type: 'score'; amount: number };

export interface SwapResult {
    success: boolean;
    events: GameEvent[];
    finalScore: number;
}
