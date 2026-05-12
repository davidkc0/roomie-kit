import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Trophy, Play } from 'lucide-react';
import { Dialog } from '@capacitor/dialog';
import { SnakeGame } from './SnakeGame';
import { type Direction } from './types';
import type { PlayerState } from '../../multiplayer/playroom';
import { useEconomyStore } from '../../state/economyStore';
import { SnakeLeaderboard } from '../../components/SnakeLeaderboard';
import { useOrientationLock } from '../../hooks/useOrientationLock';
import { GamePrimaryButton } from '../../components/GamePrimaryButton';
import { brandAssetUrls } from '../../config/customization';

type SnakeGameCanvasProps = {
  gameMode: boolean;
  onExitGame: () => void;
  onGameOver: (score: number) => void;
  writeMyState?: (partial: Partial<PlayerState>) => Promise<void>;
};

export function SnakeGameCanvas({
  gameMode,
  onExitGame,
  onGameOver,
  writeMyState,
}: SnakeGameCanvasProps) {
  // Lock to portrait during snake game
  useOrientationLock(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<SnakeGame | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const scoreSubmittedRef = useRef<boolean>(false); // Track if score has been submitted

  // React state for UI overlays
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [highScore, setHighScore] = useState(0);
  const [gameState, setGameState] = useState<'menu' | 'idle' | 'playing' | 'paused' | 'gameOver'>('menu');
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const { startGamePlay, openPurchaseDrawer, checkGamePlayCost } = useEconomyStore();
  const [gamePlayCost, setGamePlayCost] = useState<{ isFree: boolean; cost: number; balance: number } | null>(null);

  // Check cost when entering menu
  useEffect(() => {
    if (gameMode && gameState === 'menu') {
      checkGamePlayCost('snake').then(setGamePlayCost).catch(err => {
        console.error('[SnakeGameCanvas] Failed to check game cost:', err);
      });
    }
  }, [gameMode, gameState, checkGamePlayCost]);

  // Initialize game when starting from menu
  const initializeGame = useCallback(() => {
    // Create game instance
    const game = new SnakeGame({
      gridWidth: 20,
      gridHeight: 20,
      cellSize: 20,
    });
    gameRef.current = game;
    game.setOnStateChange((state) => {
      setScore(state.score);
      setLevel(state.level);
      setHighScore(state.highScore);
      setGameState(state.state);
    });

    // Sync initial state
    const initialState = game.getState();
    setScore(initialState.score);
    setLevel(initialState.level);
    setHighScore(initialState.highScore);
    setGameState(initialState.state);

    // Mark as playing for avatar hiding
    // CRITICAL: Cleanup on unmount ensures avatar visibility is restored
    writeMyState?.({ isPlayingGame: true });

    return () => {
      console.log('[Snake] Cleanup: Setting isPlayingGame: false');
      writeMyState?.({ isPlayingGame: false });
    };
  }, [writeMyState]);

  // Cleanup on unmount or gameMode change
  useEffect(() => {
    if (!gameMode) {
      // Cleanup when exiting game mode
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      gameRef.current = null;
      setGameState('menu');
      setScore(0);
      setLevel(1);
      // Clear game state for avatar
      writeMyState?.({ isPlayingGame: false });
      return;
    }
  }, [gameMode, writeMyState]);

  // Render loop - starts when canvas is available and game is initialized
  useEffect(() => {
    if (!gameMode || !gameRef.current || gameState === 'menu') return;

    // Wait for canvas to be available (next frame after render)
    const startLoop = () => {
      const canvas = canvasRef.current;
      const game = gameRef.current;
      if (!canvas || !game) {
        // Canvas not ready yet, try again next frame
        animationFrameRef.current = requestAnimationFrame(startLoop);
        return;
      }

      const config = game.getConfig();
      const canvasSize = config.gridWidth * config.cellSize;
      canvas.width = canvasSize;
      canvas.height = canvasSize;

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;

      const render = () => {
        const state = game.getState();

        // Clear
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Grid
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        for (let x = 0; x <= config.gridWidth; x++) {
          ctx.beginPath();
          ctx.moveTo(x * config.cellSize, 0);
          ctx.lineTo(x * config.cellSize, canvas.height);
          ctx.stroke();
        }
        for (let y = 0; y <= config.gridHeight; y++) {
          ctx.beginPath();
          ctx.moveTo(0, y * config.cellSize);
          ctx.lineTo(canvas.width, y * config.cellSize);
          ctx.stroke();
        }

        // Snake
        state.snake.forEach((segment, index) => {
          ctx.fillStyle = index === 0 ? '#4ade80' : '#22c55e';
          const margin = 1;
          ctx.fillRect(
            segment.x * config.cellSize + margin,
            segment.y * config.cellSize + margin,
            config.cellSize - margin * 2,
            config.cellSize - margin * 2
          );
        });

        // Food
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        const foodX = state.food.x * config.cellSize + config.cellSize / 2;
        const foodY = state.food.y * config.cellSize + config.cellSize / 2;
        ctx.arc(foodX, foodY, config.cellSize / 2 - 2, 0, Math.PI * 2);
        ctx.fill();
      };

      const loop = () => {
        if (!gameRef.current) return;
        gameRef.current.update();
        render();
        animationFrameRef.current = requestAnimationFrame(loop);
      };

      // Start immediately
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    startLoop();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [gameMode, gameState]);

  // Input Handling (Keyboard)
  useEffect(() => {
    if (!gameMode || gameState === 'menu') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!gameRef.current) return;

      switch (e.key.toLowerCase()) {
        case 'arrowup':
        case 'w':
          gameRef.current.setDirection('up');
          if (gameRef.current.getState().state === 'idle') gameRef.current.start();
          break;
        case 'arrowdown':
        case 's':
          gameRef.current.setDirection('down');
          if (gameRef.current.getState().state === 'idle') gameRef.current.start();
          break;
        case 'arrowleft':
        case 'a':
          gameRef.current.setDirection('left');
          if (gameRef.current.getState().state === 'idle') gameRef.current.start();
          break;
        case 'arrowright':
        case 'd':
          gameRef.current.setDirection('right');
          if (gameRef.current.getState().state === 'idle') gameRef.current.start();
          break;
        case ' ':
          const s = gameRef.current.getState().state;
          if (s === 'playing') gameRef.current.pause();
          else if (s === 'paused') gameRef.current.resume();
          else if (s === 'idle' || s === 'gameOver') gameRef.current.start();
          break;
        case 'escape':
          onExitGame();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameMode, gameState, onExitGame]);

  // Notify parent of Game Over - FIXED: Only submit score once
  useEffect(() => {
    if (gameState === 'gameOver' && !scoreSubmittedRef.current) {
      scoreSubmittedRef.current = true;
      onGameOver(score);
    }
    // Reset flag when game restarts
    if (gameState === 'idle' || gameState === 'playing') {
      scoreSubmittedRef.current = false;
    }
  }, [gameState, onGameOver]);

  // UI Actions
  const handleStartGame = async () => {
    // Check payment first
    const result = await startGamePlay('snake');

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
  };
  const handleStart = () => gameRef.current?.start();
  const handleResume = () => gameRef.current?.resume();
  const handlePause = () => gameRef.current?.pause();
  const move = (dir: Direction) => {
    if (!gameRef.current) return;
    gameRef.current.setDirection(dir);
    if (gameRef.current.getState().state === 'idle') {
      gameRef.current.start();
    }
  };

  const handleBackToMenu = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    gameRef.current = null;
    setGameState('menu');
    setScore(0);
    setLevel(1);
  };

  if (!gameMode) return null;

  // Use Portal to render full-screen overlay above everything
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
            {gameState === 'menu' ? 'Snake' : 'Snake Game'}
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
                <img src={brandAssetUrls.snakeLogo} alt="Snake" className="w-full h-full object-contain drop-shadow-[0_0_15px_rgba(74,222,128,0.4)]" />
              </div>
              <h2 className="text-2xl font-bold text-white">Play Snake</h2>

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
                      <img src={brandAssetUrls.coinIcon} alt="Coins" className="w-4 h-4 object-contain" />
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
              <div className="bg-bg-elevated/80 p-3 rounded-lg border border-border shadow-lg backdrop-blur-md">
                <div className="text-green-400 font-bold text-xl leading-none">SCORE: {score}</div>
                <div className="flex gap-3 text-xs mt-1 leading-none font-medium">
                  <span className="text-text-secondary">LVL {level}</span>
                  <span className="text-yellow-500">HI {highScore}</span>
                </div>
              </div>

              {/* Game Area */}
              <div className="flex items-center justify-center relative">
                <canvas
                  ref={canvasRef}
                  className="bg-black border-4 border-bg-elevated rounded-md shadow-2xl"
                  style={{
                    imageRendering: 'pixelated',
                    width: 'clamp(300px, 80vw, 400px)',
                    height: 'clamp(300px, 80vw, 400px)',
                  }}
                />

                {/* Game State Overlays */}
                {gameState !== 'playing' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/60 backdrop-blur-sm p-8 rounded-2xl flex flex-col items-center pointer-events-auto border border-white/10 shadow-2xl">
                      {gameState === 'gameOver' && (
                        <>
                          <h2 className="text-4xl font-bold text-red-500 mb-2 drop-shadow-lg">GAME OVER</h2>
                          <div className="text-xl mb-4 font-bold text-white">Final Score: {score}</div>
                        </>
                      )}
                      {gameState === 'paused' && <h2 className="text-4xl font-bold text-yellow-400 mb-6 drop-shadow-lg">PAUSED</h2>}
                      {gameState === 'idle' && <h2 className="text-2xl font-bold text-text-secondary mb-6 drop-shadow-lg">READY?</h2>}

                      <div className="flex gap-3">
                        <GamePrimaryButton
                          onClick={(e) => { e.stopPropagation(); gameState === 'paused' ? handleResume() : handleStart(); }}
                          className="text-lg"
                        >
                          {gameState === 'paused' ? 'RESUME' : gameState === 'gameOver' ? 'PLAY AGAIN' : 'START'}
                        </GamePrimaryButton>
                        {gameState === 'gameOver' && (
                          <button
                            onClick={handleBackToMenu}
                            className="px-8 py-4 rounded-2xl text-white font-black text-lg tracking-wide whitespace-nowrap transition-all active:scale-95
                              bg-white/10 backdrop-blur-xl border-b-4 border-white/10
                              active:border-b-0 active:translate-y-1 active:mt-1
                              shadow-lg shadow-black/10"
                          >
                            Menu
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile Controls */}
              <div className="flex flex-col gap-4 w-full max-w-sm mx-auto px-6">
                {/* Pause Button */}
                <div className="flex justify-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); gameState === 'playing' ? handlePause() : handleResume(); }}
                    disabled={gameState === 'idle' || gameState === 'gameOver'}
                    className="px-8 py-3 rounded-full font-bold transition-all active:scale-95
                      bg-bg-surface/60 backdrop-blur-xl border border-white/10 text-white/80
                      shadow-[0_4px_16px_rgba(0,0,0,0.2)]
                      disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {gameState === 'paused' ? 'RESUME' : 'PAUSE'}
                  </button>
                </div>

                {/* D-Pad */}
                <div className="grid grid-cols-3 gap-3 mx-auto aspect-square w-48 touch-none">
                  <div></div>
                  <button
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); move('up'); }}
                    className="bg-bg-elevated/90 active:bg-green-600 active:border-green-500/50 rounded-xl flex items-center justify-center border border-border shadow-lg active:scale-95 transition-colors duration-75"
                  >
                    <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
                  </button>
                  <div></div>

                  <button
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); move('left'); }}
                    className="bg-bg-elevated/90 active:bg-green-600 active:border-green-500/50 rounded-xl flex items-center justify-center border border-border shadow-lg active:scale-95 transition-colors duration-75"
                  >
                    <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="bg-bg-base/50 rounded-full m-2 border border-bg-elevated/50"></div>
                  <button
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); move('right'); }}
                    className="bg-bg-elevated/90 active:bg-green-600 active:border-green-500/50 rounded-xl flex items-center justify-center border border-border shadow-lg active:scale-95 transition-colors duration-75"
                  >
                    <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                  </button>

                  <div></div>
                  <button
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); move('down'); }}
                    className="bg-bg-elevated/90 active:bg-green-600 active:border-green-500/50 rounded-xl flex items-center justify-center border border-border shadow-lg active:scale-95 transition-colors duration-75"
                  >
                    <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <div></div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <SnakeLeaderboard isOpen={showLeaderboard} onClose={() => setShowLeaderboard(false)} />
    </>,
    document.body
  );
}
