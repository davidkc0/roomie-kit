import { type GameConfig, type Match3GameState, type Position, type GemType, type SwapResult, type GameEvent } from './types';

const DEFAULT_CONFIG: GameConfig = {
    gridWidth: 8,
    gridHeight: 8,
    cellSize: 50,
    gemTypes: 6,
};

export class Match3Game {
    private config: GameConfig;
    private gameState: Match3GameState;
    private onStateChange?: (state: Match3GameState) => void;

    constructor(config?: Partial<GameConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.gameState = this.createInitialState();
    }

    private createInitialState(): Match3GameState {
        const grid = this.generateInitialGrid();

        return {
            state: 'idle',
            score: 0,
            highScore: 0,
            moves: 30,
            grid,
            selectedGem: null,
            isAnimating: false,
        };
    }

    private generateInitialGrid(): (GemType | null)[][] {
        const grid: (GemType | null)[][] = [];

        for (let row = 0; row < this.config.gridHeight; row++) {
            grid[row] = [];
            for (let col = 0; col < this.config.gridWidth; col++) {
                let gemType: GemType;
                let attempts = 0;

                do {
                    gemType = Math.floor(Math.random() * this.config.gemTypes) as GemType;
                    attempts++;
                    if (attempts > 100) break;
                } while (this.wouldCreateMatch(grid, row, col, gemType));

                grid[row][col] = gemType;
            }
        }

        return grid;
    }

    private wouldCreateMatch(grid: (GemType | null)[][], row: number, col: number, gemType: GemType): boolean {
        if (col >= 2 &&
            grid[row][col - 1] === gemType &&
            grid[row][col - 2] === gemType) {
            return true;
        }

        if (row >= 2 &&
            grid[row - 1][col] === gemType &&
            grid[row - 2][col] === gemType) {
            return true;
        }

        return false;
    }

    private findMatches(): Position[][] {
        const matches: Position[][] = [];
        const grid = this.gameState.grid;

        for (let row = 0; row < this.config.gridHeight; row++) {
            let matchStart = 0;
            for (let col = 1; col <= this.config.gridWidth; col++) {
                const current = col < this.config.gridWidth ? grid[row][col] : null;
                const previous = grid[row][col - 1];

                if (current !== previous || current === null) {
                    if (col - matchStart >= 3 && previous !== null) {
                        const match: Position[] = [];
                        for (let i = matchStart; i < col; i++) {
                            match.push({ row, col: i });
                        }
                        matches.push(match);
                    }
                    matchStart = col;
                }
            }
        }

        for (let col = 0; col < this.config.gridWidth; col++) {
            let matchStart = 0;
            for (let row = 1; row <= this.config.gridHeight; row++) {
                const current = row < this.config.gridHeight ? grid[row][col] : null;
                const previous = grid[row - 1][col];

                if (current !== previous || current === null) {
                    if (row - matchStart >= 3 && previous !== null) {
                        const match: Position[] = [];
                        for (let i = matchStart; i < row; i++) {
                            match.push({ row: i, col });
                        }
                        matches.push(match);
                    }
                    matchStart = row;
                }
            }
        }

        return matches;
    }

    private removeMatches(matches: Position[][]): number {
        let score = 0;
        for (const match of matches) {
            score += match.length * 10;
            for (const pos of match) {
                this.gameState.grid[pos.row][pos.col] = null;
            }
        }
        return score;
    }

    private applyGravity(): { drops: { from: Position; to: Position; gem: GemType }[]; newGems: { pos: Position; gem: GemType }[] } {
        const grid = this.gameState.grid;
        const drops: { from: Position; to: Position; gem: GemType }[] = [];
        const newGems: { pos: Position; gem: GemType }[] = [];

        for (let col = 0; col < this.config.gridWidth; col++) {
            let writeRow = this.config.gridHeight - 1;

            for (let row = this.config.gridHeight - 1; row >= 0; row--) {
                const gem = grid[row][col];
                if (gem !== null) {
                    if (row !== writeRow) {
                        grid[writeRow][col] = gem;
                        grid[row][col] = null;
                        drops.push({
                            from: { row, col },
                            to: { row: writeRow, col },
                            gem
                        });
                    }
                    writeRow--;
                }
            }

            for (let row = writeRow; row >= 0; row--) {
                const gemType = Math.floor(Math.random() * this.config.gemTypes) as GemType;
                grid[row][col] = gemType;
                newGems.push({
                    pos: { row, col },
                    gem: gemType
                });
            }
        }

        return { drops, newGems };
    }

    private isAdjacent(pos1: Position, pos2: Position): boolean {
        const rowDiff = Math.abs(pos1.row - pos2.row);
        const colDiff = Math.abs(pos1.col - pos2.col);
        return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
    }

    setOnStateChange(callback: (state: Match3GameState) => void): void {
        this.onStateChange = callback;
    }

    getState(): Match3GameState {
        return JSON.parse(JSON.stringify(this.gameState));
    }

    getConfig(): GameConfig {
        return { ...this.config };
    }

    start(): void {
        this.gameState = this.createInitialState();
        this.gameState.state = 'playing';
        this.notifyStateChange();
    }

    pause(): void {
        if (this.gameState.state === 'playing') {
            this.gameState.state = 'paused';
            this.notifyStateChange();
        }
    }

    resume(): void {
        if (this.gameState.state === 'paused') {
            this.gameState.state = 'playing';
            this.notifyStateChange();
        }
    }

    reset(): void {
        this.gameState = this.createInitialState();
        this.notifyStateChange();
    }

    selectGem(position: Position): SwapResult {
        if (this.gameState.state !== 'playing' || this.gameState.isAnimating) {
            return { success: false, events: [], finalScore: this.gameState.score };
        }

        if (!this.gameState.selectedGem) {
            this.gameState.selectedGem = position;
            this.notifyStateChange();
            return { success: true, events: [], finalScore: this.gameState.score };
        }

        if (this.gameState.selectedGem.row === position.row &&
            this.gameState.selectedGem.col === position.col) {
            this.gameState.selectedGem = null;
            this.notifyStateChange();
            return { success: true, events: [], finalScore: this.gameState.score };
        }

        if (this.isAdjacent(this.gameState.selectedGem, position)) {
            const result = this.attemptSwap(this.gameState.selectedGem, position);
            this.gameState.selectedGem = null;
            return result;
        }

        this.gameState.selectedGem = position;
        this.notifyStateChange();
        return { success: true, events: [], finalScore: this.gameState.score };
    }

    private attemptSwap(pos1: Position, pos2: Position): SwapResult {
        const events: GameEvent[] = [];
        const grid = this.gameState.grid;

        const temp = grid[pos1.row][pos1.col];
        grid[pos1.row][pos1.col] = grid[pos2.row][pos2.col];
        grid[pos2.row][pos2.col] = temp;

        const matches = this.findMatches();

        if (matches.length === 0) {
            grid[pos2.row][pos2.col] = grid[pos1.row][pos1.col];
            grid[pos1.row][pos1.col] = temp;

            events.push({ type: 'swap', pos1, pos2, valid: false });
            this.notifyStateChange();
            return { success: false, events, finalScore: this.gameState.score };
        }

        events.push({ type: 'swap', pos1, pos2, valid: true });
        this.gameState.moves--;

        let currentMatches = matches;
        while (currentMatches.length > 0) {
            events.push({ type: 'matches', matches: currentMatches });

            const score = this.removeMatches(currentMatches);
            this.gameState.score += score;
            events.push({ type: 'score', amount: score });

            const gravityResult = this.applyGravity();
            events.push({ type: 'gravity', ...gravityResult });

            currentMatches = this.findMatches();
        }

        if (this.gameState.score > this.gameState.highScore) {
            this.gameState.highScore = this.gameState.score;
        }

        if (this.gameState.moves <= 0) {
            this.gameOver();
        }

        this.notifyStateChange();
        return { success: true, events, finalScore: this.gameState.score };
    }

    private gameOver(): void {
        this.gameState.state = 'gameOver';
        this.notifyStateChange();
    }

    private notifyStateChange(): void {
        if (this.onStateChange) {
            this.onStateChange({ ...this.gameState });
        }
    }
}
