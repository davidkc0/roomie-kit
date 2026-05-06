import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Trophy, Play } from 'lucide-react';
import { Dialog } from '@capacitor/dialog';
import { Match3Game } from './Match3Game';
import type { GameEvent, Position, GemType } from './types';
import type { PlayerState } from '../../multiplayer/playroom';
import { useEconomyStore } from '../../state/economyStore';
import { Match3Leaderboard } from '../../components/Match3Leaderboard';
import { useOrientationLock } from '../../hooks/useOrientationLock';
import { GamePrimaryButton } from '../../components/GamePrimaryButton';

type Match3GameCanvasProps = {
    gameMode: boolean;
    onExitGame: () => void;
    onGameOver: (score: number) => void;
    writeMyState?: (partial: Partial<PlayerState>) => Promise<void>;
};

// Sprite sheet configuration (768x128, 6 gems at 128x128 each)
const SPRITE_CONFIG = {
    path: '/assets/gem_sprite_sheet.png',
    gemWidth: 128,
    gemHeight: 128,
    gemCount: 6,
};

// Visual state for gems (decoupled from logical grid)
type VisualGem = {
    type: GemType;
    row: number;
    col: number;
    x: number; // Visual X (in grid units)
    y: number; // Visual Y (in grid units)
    scale: number;
    alpha: number;
    id: string; // Unique ID for tracking
};

export function Match3GameCanvas({
    gameMode,
    onExitGame,
    onGameOver,
    writeMyState,
}: Match3GameCanvasProps) {
    // Lock to portrait during match3 game
    useOrientationLock(true);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const gameRef = useRef<Match3Game | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const scoreSubmittedRef = useRef<boolean>(false);
    const spriteSheetRef = useRef<HTMLImageElement | null>(null);

    // Animation state
    const visualGemsRef = useRef<VisualGem[]>([]);
    const eventQueueRef = useRef<GameEvent[]>([]);
    const processingEventRef = useRef<GameEvent | null>(null);
    const animationStartTimeRef = useRef<number>(0);
    const lastFrameTimeRef = useRef<number>(0);
    const gemIdCounterRef = useRef<number>(0);

    // Touch/swipe state for mobile
    const touchStartRef = useRef<{ x: number; y: number; row: number; col: number } | null>(null);

    // React state for UI overlays
    const [score, setScore] = useState(0);
    const [moves, setMoves] = useState(30);
    const [highScore, setHighScore] = useState(0);
    const [gameState, setGameState] = useState<'menu' | 'idle' | 'playing' | 'paused' | 'gameOver'>('menu');
    const [showLeaderboard, setShowLeaderboard] = useState(false);

    const { startGamePlay, openPurchaseDrawer, checkGamePlayCost } = useEconomyStore();
    const [gamePlayCost, setGamePlayCost] = useState<{ isFree: boolean; cost: number; balance: number } | null>(null);

    // Check cost when entering menu
    useEffect(() => {
        if (gameMode && gameState === 'menu') {
            checkGamePlayCost('match3').then(setGamePlayCost).catch(err => {
                console.error('[Match3GameCanvas] Failed to check game cost:', err);
            });
        }
    }, [gameMode, gameState, checkGamePlayCost]);

    // Preload sprite sheet
    useEffect(() => {
        const img = new Image();
        img.onload = () => {
            spriteSheetRef.current = img;
            console.log('[Match3GameCanvas] Sprite sheet loaded');
        };
        img.onerror = () => {
            console.error('[Match3GameCanvas] Failed to load sprite sheet');
        };
        img.src = SPRITE_CONFIG.path;
    }, []);

    // Initialize game
    const initializeGame = useCallback(() => {
        const game = new Match3Game({
            gridWidth: 8,
            gridHeight: 8,
            cellSize: 50,
        });
        gameRef.current = game;

        game.setOnStateChange((state) => {
            setScore(state.score);
            setMoves(state.moves);
            setHighScore(state.highScore);
            setGameState(state.state);
        });

        // Start game FIRST so grid is finalized
        game.start();

        // THEN initialize visual gems from the playing state
        const initialState = game.getState();
        const initialVisualGems: VisualGem[] = [];

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const type = initialState.grid[r][c];
                if (type !== null) {
                    initialVisualGems.push({
                        type,
                        row: r,
                        col: c,
                        x: c,
                        y: r,
                        scale: 1,
                        alpha: 1,
                        id: `init_${gemIdCounterRef.current++}`
                    });
                }
            }
        }
        visualGemsRef.current = initialVisualGems;

        setScore(initialState.score);
        setMoves(initialState.moves);
        setHighScore(initialState.highScore);
        setGameState(initialState.state);

        // Mark as playing for avatar hiding
        // CRITICAL: Cleanup on unmount ensures avatar visibility is restored
        writeMyState?.({ isPlayingGame: true });

        return () => {
            console.log('[Match3] Cleanup: Setting isPlayingGame: false');
            writeMyState?.({ isPlayingGame: false });
        };
    }, [writeMyState]);

    // Cleanup on unmount or gameMode change
    useEffect(() => {
        if (!gameMode) {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            gameRef.current = null;
            setGameState('menu');
            setScore(0);
            setMoves(30);
            visualGemsRef.current = [];
            eventQueueRef.current = [];
            processingEventRef.current = null;
            writeMyState?.({ isPlayingGame: false });
            return;
        }
    }, [gameMode, writeMyState]);

    // Animation Constants
    const SWAP_DURATION = 200;
    const MATCH_DURATION = 200;
    const GRAVITY_DURATION = 300; // ms per cell fell? No, total drop time.

    // Render loop
    useEffect(() => {
        if (!gameMode || !gameRef.current || gameState === 'menu') return;

        const startLoop = () => {
            const canvas = canvasRef.current;
            const game = gameRef.current;
            if (!canvas || !game) {
                animationFrameRef.current = requestAnimationFrame(startLoop);
                return;
            }

            const config = game.getConfig();
            const canvasSize = config.gridWidth * config.cellSize;
            canvas.width = canvasSize;
            canvas.height = canvasSize;

            const ctx = canvas.getContext('2d', { alpha: false });
            if (!ctx) return;

            const render = (timestamp: number) => {
                if (!lastFrameTimeRef.current) lastFrameTimeRef.current = timestamp;
                // const deltaTime = timestamp - lastFrameTimeRef.current;
                lastFrameTimeRef.current = timestamp;

                // Process Event Queue
                if (!processingEventRef.current && eventQueueRef.current.length > 0) {
                    processingEventRef.current = eventQueueRef.current.shift()!;
                    animationStartTimeRef.current = timestamp;
                }

                if (processingEventRef.current) {
                    const event = processingEventRef.current;
                    const progress = Math.min(1, (timestamp - animationStartTimeRef.current) / (
                        event.type === 'swap' ? SWAP_DURATION :
                            event.type === 'matches' ? MATCH_DURATION :
                                event.type === 'gravity' ? GRAVITY_DURATION : 0
                    ));

                    if (event.type === 'swap') {
                        const { pos1, pos2 } = event;
                        // Find gems
                        const gem1 = visualGemsRef.current.find(g => g.row === pos1.row && g.col === pos1.col);
                        const gem2 = visualGemsRef.current.find(g => g.row === pos2.row && g.col === pos2.col);

                        if (gem1 && gem2) {
                            // Interpolate visual positions (Swap X/Y)
                            // We need to lerp from pos1 to pos2 for gem1, and pos2 to pos1 for gem2
                            // Gem1 logical is at pos1, Gem2 logical is at pos2. 
                            // Wait, if swap is INVALID, they swap back.
                            // If VALID, they stay swapped.

                            // Let's assume logical state is already updated (except for invalid swap which gets reverted)

                            // Visual interpolation logic:
                            // We need to know START and END positions visually.
                            // For swap:
                            // Start: gem1 is at pos1, gem2 at pos2
                            // End: gem1 is at pos2, gem2 at pos1 (visually)

                            // Actually, simpler:
                            // Just animate the VISUAL offsets.
                            // Gem 1 moves from (pos1.x, pos1.y) to (pos2.x, pos2.y)

                            const t = event.valid ? progress : (
                                // For invalid swap: go to mid (0.5) then back to 0
                                progress < 0.5 ? progress * 2 : (1 - progress) * 2
                            );

                            // We aren't actually updating the `row/col` properties yet until animation done?
                            // No, `row/col` identify the gem.
                            // Let's rely on IDs.
                            // But we search by row/col.
                            // When swap STARTS, we should probably update their logical row/col immediately if valid?

                            // To keep it simple:
                            // VisualGem has `x` and `y` (float).
                            // `row` and `col` are their *target* logical grid positions.

                            // For swap event:
                            // We visually interpolate `x` and `y` between the two target spots.

                            if (progress < 1) {
                                // Interpolate
                                // Gem1 going to pos2
                                gem1.x = pos1.col + (pos2.col - pos1.col) * (event.valid ? progress : (progress < 0.5 ? progress * 2 : (1 - progress) * 2));
                                gem1.y = pos1.row + (pos2.row - pos1.row) * (event.valid ? progress : (progress < 0.5 ? progress * 2 : (1 - progress) * 2));

                                gem2.x = pos2.col + (pos1.col - pos2.col) * (event.valid ? progress : (progress < 0.5 ? progress * 2 : (1 - progress) * 2));
                                gem2.y = pos2.row + (pos1.row - pos2.row) * (event.valid ? progress : (progress < 0.5 ? progress * 2 : (1 - progress) * 2));
                            } else {
                                // Finish
                                if (event.valid) {
                                    // Swap logical coordinates
                                    gem1.row = pos2.row;
                                    gem1.col = pos2.col;
                                    gem1.x = pos2.col;
                                    gem1.y = pos2.row;

                                    gem2.row = pos1.row;
                                    gem2.col = pos1.col;
                                    gem2.x = pos1.col;
                                    gem2.y = pos1.row;
                                } else {
                                    // Reset
                                    gem1.x = pos1.col;
                                    gem1.y = pos1.row;
                                    gem2.x = pos2.col;
                                    gem2.y = pos2.row;
                                }
                            }
                        }
                    } else if (event.type === 'matches') {
                        // Scale down matched gems
                        event.matches.forEach(match => {
                            match.forEach(pos => {
                                const gem = visualGemsRef.current.find(g => g.row === pos.row && g.col === pos.col);
                                if (gem) {
                                    gem.scale = 1 - progress;
                                    gem.alpha = 1 - progress;
                                }
                            });
                        });

                        if (progress === 1) {
                            // Remove gems
                            const allMatchPositions = event.matches.flat();
                            visualGemsRef.current = visualGemsRef.current.filter(g =>
                                !allMatchPositions.some(p => p.row === g.row && p.col === g.col)
                            );
                        }
                    } else if (event.type === 'gravity') {
                        // Animate drops
                        event.drops.forEach(drop => {
                            const gem = visualGemsRef.current.find(g => g.row === drop.from.row && g.col === drop.from.col);
                            if (gem) {
                                // During animation, keep row/col at source, but animate Y
                                // Or update row/col at start?
                                // Better: Identify by ID so we don't lose it.
                                // But we need to update row/col at the END so subsequent lookups work.

                                // Animate Y from drop.from.row to drop.to.row
                                gem.y = drop.from.row + (drop.to.row - drop.from.row) * progress;

                                if (progress === 1) {
                                    gem.row = drop.to.row;
                                    gem.y = drop.to.row;
                                }
                            }
                        });

                        // New gems
                        if (progress === 1) {
                            event.newGems.forEach(newGem => {
                                visualGemsRef.current.push({
                                    type: newGem.gem,
                                    row: newGem.pos.row,
                                    col: newGem.pos.col,
                                    x: newGem.pos.col,
                                    y: newGem.pos.row,
                                    scale: 1,
                                    alpha: 1,
                                    id: `new_${gemIdCounterRef.current++}`
                                });
                            });
                        }
                    }

                    if (progress >= 1) {
                        processingEventRef.current = null;
                        if (eventQueueRef.current.length === 0) {
                            // Queue empty, can verify state?
                        }
                    }
                }

                // DRAW
                // Clear
                const grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
                grd.addColorStop(0, '#1a1a1a');
                grd.addColorStop(1, '#0a0a0a');
                ctx.fillStyle = grd;
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Grid background
                ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                for (let r = 0; r < 8; r++) {
                    for (let c = 0; c < 8; c++) {
                        if ((r + c) % 2 === 0) {
                            ctx.fillRect(c * config.cellSize, r * config.cellSize, config.cellSize, config.cellSize);
                        }
                    }
                }

                // Grid lines
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.lineWidth = 1;
                for (let i = 0; i <= config.gridWidth; i++) {
                    ctx.beginPath();
                    ctx.moveTo(i * config.cellSize, 0);
                    ctx.lineTo(i * config.cellSize, canvas.height);
                    ctx.stroke();
                }
                for (let i = 0; i <= config.gridHeight; i++) {
                    ctx.beginPath();
                    ctx.moveTo(0, i * config.cellSize);
                    ctx.lineTo(canvas.width, i * config.cellSize);
                    ctx.stroke();
                }

                // Draw gems
                const spriteSheet = spriteSheetRef.current;
                visualGemsRef.current.forEach(gem => {
                    const destX = gem.x * config.cellSize;
                    const destY = gem.y * config.cellSize;
                    const destSize = config.cellSize * gem.scale;
                    const offset = (config.cellSize - destSize) / 2;

                    if (gem.scale <= 0) return;

                    ctx.globalAlpha = gem.alpha;

                    if (spriteSheet) {
                        // Draw from sprite sheet
                        const srcX = gem.type * SPRITE_CONFIG.gemWidth;
                        ctx.drawImage(
                            spriteSheet,
                            srcX, 0, SPRITE_CONFIG.gemWidth, SPRITE_CONFIG.gemHeight,  // Source
                            destX + offset, destY + offset, destSize, destSize          // Destination
                        );
                    } else {
                        // Fallback: Simple colored circle if sprite not loaded
                        const fallbackColors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899'];
                        ctx.fillStyle = fallbackColors[gem.type] || '#888';
                        ctx.beginPath();
                        ctx.arc(
                            destX + config.cellSize / 2,
                            destY + config.cellSize / 2,
                            destSize / 2 - 4,
                            0, Math.PI * 2
                        );
                        ctx.fill();
                    }

                    ctx.globalAlpha = 1;
                });

                // Selection Highlight
                const state = game.getState();
                if (state.selectedGem) {
                    const x = state.selectedGem.col * config.cellSize;
                    const y = state.selectedGem.row * config.cellSize;

                    ctx.shadowColor = 'white';
                    ctx.shadowBlur = 15;
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(x + 4, y + 4, config.cellSize - 8, config.cellSize - 8);
                    ctx.shadowBlur = 0;
                }

                // Animation loop
                animationFrameRef.current = requestAnimationFrame((t) => render(t));
            };

            animationFrameRef.current = requestAnimationFrame((t) => render(t));
        };

        startLoop();

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [gameMode, gameState]);

    // Handle canvas clicks (for desktop)
    const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        // Prevent input if animating
        if (!gameRef.current || !canvasRef.current || processingEventRef.current || eventQueueRef.current.length > 0) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const config = gameRef.current.getConfig();

        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);

        const col = Math.floor(x / config.cellSize);
        const row = Math.floor(y / config.cellSize);

        if (row >= 0 && row < config.gridHeight && col >= 0 && col < config.gridWidth) {
            const result = gameRef.current.selectGem({ row, col });
            if (result.events && result.events.length > 0) {
                eventQueueRef.current.push(...result.events);
            }
        }
    }, []);

    // Handle touch start (for swipe gestures on mobile)
    const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
        if (!gameRef.current || !canvasRef.current || processingEventRef.current || eventQueueRef.current.length > 0) return;

        const touch = e.touches[0];
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const config = gameRef.current.getConfig();

        const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
        const y = (touch.clientY - rect.top) * (canvas.height / rect.height);

        const col = Math.floor(x / config.cellSize);
        const row = Math.floor(y / config.cellSize);

        if (row >= 0 && row < config.gridHeight && col >= 0 && col < config.gridWidth) {
            touchStartRef.current = { x: touch.clientX, y: touch.clientY, row, col };
        }
    }, []);

    // Handle touch end (complete swipe gesture)
    const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
        if (!gameRef.current || !touchStartRef.current) return;
        if (processingEventRef.current || eventQueueRef.current.length > 0) {
            touchStartRef.current = null;
            return;
        }

        const touch = e.changedTouches[0];
        const startPos = touchStartRef.current;
        touchStartRef.current = null;

        const dx = touch.clientX - startPos.x;
        const dy = touch.clientY - startPos.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // Minimum swipe distance (20 pixels)
        const minSwipeDistance = 20;

        if (absDx < minSwipeDistance && absDy < minSwipeDistance) {
            // Too small - treat as tap (select gem)
            const result = gameRef.current.selectGem({ row: startPos.row, col: startPos.col });
            if (result.events && result.events.length > 0) {
                eventQueueRef.current.push(...result.events);
            }
            return;
        }

        // Determine swipe direction
        let targetRow = startPos.row;
        let targetCol = startPos.col;

        if (absDx > absDy) {
            // Horizontal swipe
            targetCol = dx > 0 ? startPos.col + 1 : startPos.col - 1;
        } else {
            // Vertical swipe
            targetRow = dy > 0 ? startPos.row + 1 : startPos.row - 1;
        }

        const config = gameRef.current.getConfig();

        // Validate target position
        if (targetRow < 0 || targetRow >= config.gridHeight || targetCol < 0 || targetCol >= config.gridWidth) {
            return;
        }

        // First select the starting gem, then select the target to trigger swap
        gameRef.current.selectGem({ row: startPos.row, col: startPos.col });
        const result = gameRef.current.selectGem({ row: targetRow, col: targetCol });

        if (result.events && result.events.length > 0) {
            eventQueueRef.current.push(...result.events);
        }
    }, []);

    // Notify parent of Game Over
    useEffect(() => {
        if (gameState === 'gameOver' && !scoreSubmittedRef.current) {
            scoreSubmittedRef.current = true;
            onGameOver(score);
        }
        if (gameState === 'idle' || gameState === 'playing') {
            scoreSubmittedRef.current = false;
        }
    }, [gameState, onGameOver]);

    // UI Actions
    const handleStartGame = async () => {
        const result = await startGamePlay('match3');

        if (!result.allowed) {
            if (result.reason === 'insufficient_coins') {
                await Dialog.alert({
                    title: 'Not Enough Coins',
                    message: `You need ${result.cost} coins to play. You have ${result.balance}.`
                });
                openPurchaseDrawer();
            } else {
                await Dialog.alert({
                    title: 'Cannot Start Game',
                    message: 'There was an error starting the game. Please try again.'
                });
            }
            return;
        }

        initializeGame();
        // start() is now called inside initializeGame
    };

    const handleBackToMenu = () => {
        gameRef.current = null;
        setGameState('menu');
        setScore(0);
        setMoves(30);
    };

    const handleRestart = () => {
        // Re-initialize completely (includes start())
        initializeGame();
    };

    if (!gameMode) return null;

    return createPortal(
        <>
            <div
                className="fixed inset-0 z-[5000] bg-black flex flex-col font-mono select-none overflow-hidden"
                style={{ touchAction: 'none' }}
            >
                {/* Header */}
                <div
                    className="flex-none flex items-center justify-between p-4 border-b border-white/10"
                    style={{ paddingTop: 'max(3.5rem, env(safe-area-inset-top))' }}
                >
                    <h1 className="text-xl font-bold text-white">
                        {gameState === 'menu' ? 'Bedazzled' : 'Bedazzled'}
                    </h1>
                    <button
                        onClick={async () => {
                            // If actively playing, confirm before exiting
                            if (gameState === 'playing' || gameState === 'paused') {
                                let confirmed = false;
                                const { Dialog } = await import('@capacitor/dialog');
                                const { Capacitor } = await import('@capacitor/core');

                                if (Capacitor.isNativePlatform()) {
                                    const { value } = await Dialog.confirm({
                                        title: 'End Game?',
                                        message: 'Are you sure you want to end this game?',
                                        okButtonTitle: 'End Game',
                                        cancelButtonTitle: 'Keep Playing',
                                    });
                                    confirmed = value;
                                } else {
                                    confirmed = window.confirm('Are you sure you want to end this game?');
                                }

                                if (!confirmed) return;
                            }
                            onExitGame();
                        }}
                        className="p-2 text-text-tertiary hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6">
                    {gameState === 'menu' ? (
                        // Main Menu
                        <div className="flex flex-col items-center gap-6">
                            <div className="w-32 h-32 animate-bounce">
                                <span className="text-[8rem]">💎</span>
                            </div>
                            <h2 className="text-2xl font-bold text-white">Bedazzled</h2>

                            {/* Cost Badge */}
                            {gamePlayCost && (
                                <div className={`px-3 py-1.5 rounded-full text-sm font-medium border flex items-center gap-2
                                    bg-bg-surface/60 backdrop-blur-xl
                                    ${gamePlayCost.isFree
                                        ? 'text-success border-success/30 shadow-[inset_0_0_20px_rgba(0,255,156,0.1)]'
                                        : 'text-yellow-400 border-yellow-500/30 shadow-[inset_0_0_20px_rgba(234,179,8,0.1)]'
                                    }`}>
                                    {gamePlayCost.isFree ? (
                                        <>✨ 1 Free Game</>
                                    ) : (
                                        <>
                                            <img src="/coin.png" alt="Coins" className="w-4 h-4 object-contain" />
                                            {gamePlayCost.cost} Coins / game
                                        </>
                                    )}
                                </div>
                            )}

                            <div className="flex flex-col gap-3 w-64">
                                <GamePrimaryButton
                                    onClick={handleStartGame}
                                >
                                    <Play className="w-5 h-5" />
                                    Start Game
                                </GamePrimaryButton>
                                <button
                                    onClick={() => setShowLeaderboard(true)}
                                    className="flex items-center justify-center gap-2 w-full py-4 px-8 rounded-2xl text-white font-black text-lg tracking-wide transition-all active:scale-95
                                        bg-white/10 backdrop-blur-xl border-b-4 border-white/10
                                        active:border-b-0 active:translate-y-1 active:mt-1
                                        shadow-lg shadow-black/10"
                                >
                                    <Trophy className="w-5 h-5 text-yellow-400" />
                                    Leaderboard
                                </button>
                            </div>
                        </div>
                    ) : (
                        // Game Screen
                        <>
                            {/* Score Bar */}
                            <div className="bg-bg-elevated/80 p-3 rounded-lg border border-border shadow-lg backdrop-blur-md w-full max-w-[400px] flex justify-between items-center">
                                <div>
                                    <div className="text-green-400 font-bold text-xl leading-none">SCORE: {score}</div>
                                    <div className="flex gap-3 text-xs mt-1 leading-none font-medium">
                                        <span className="text-yellow-500">HI {highScore}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-blue-400 font-bold text-xl leading-none">MOVES</div>
                                    <div className="text-2xl font-black text-white leading-none">{moves}</div>
                                </div>
                            </div>

                            {/* Game Area */}
                            <div className="flex items-center justify-center relative">
                                <canvas
                                    ref={canvasRef}
                                    onClick={handleCanvasClick}
                                    onTouchStart={handleTouchStart}
                                    onTouchEnd={handleTouchEnd}
                                    className="bg-black border-4 border-bg-elevated rounded-xl shadow-2xl cursor-pointer"
                                    style={{
                                        width: 'clamp(300px, 90vw, 400px)',
                                        height: 'clamp(300px, 90vw, 400px)',
                                        touchAction: 'none'
                                    }}
                                />

                                {/* Game State Overlays */}
                                {gameState === 'gameOver' && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="bg-black/80 backdrop-blur-sm p-8 rounded-2xl flex flex-col items-center pointer-events-auto border border-white/10 shadow-2xl animate-in zoom-in-95 duration-200">
                                            <h2 className="text-4xl font-bold text-green-500 mb-2 drop-shadow-lg">GAME OVER</h2>
                                            <div className="text-xl mb-4 font-bold text-white">Final Score: {score}</div>

                                            <div className="flex gap-3">
                                                <GamePrimaryButton
                                                    onClick={handleRestart}
                                                    className="text-lg"
                                                >
                                                    PLAY AGAIN
                                                </GamePrimaryButton>
                                                <button
                                                    onClick={handleBackToMenu}
                                                    className="px-8 py-4 rounded-2xl text-white font-black text-lg tracking-wide transition-all active:scale-95
                                                        bg-white/10 backdrop-blur-xl border-b-4 border-white/10
                                                        active:border-b-0 active:translate-y-1 active:mt-1
                                                        shadow-lg shadow-black/10"
                                                >
                                                    MENU
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
            <Match3Leaderboard isOpen={showLeaderboard} onClose={() => setShowLeaderboard(false)} />
        </>,
        document.body
    );
}
