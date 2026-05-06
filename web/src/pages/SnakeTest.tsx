import { useEffect, useRef, useState } from 'react';
import { SnakeGame } from '../games/snake/SnakeGame';
import { type Direction } from '../games/snake/types';

export default function SnakeTest() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<SnakeGame | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'gameOver'>('idle');
  const [level, setLevel] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initialize game
    const game = new SnakeGame({
      gridWidth: 20,
      gridHeight: 20,
      cellSize: 20,
    });
    gameRef.current = game;

    // Set up state callbacks
    game.setOnStateChange((state) => {
      setScore(state.score);
      setHighScore(state.highScore);
      setGameState(state.state);
      setLevel(state.level);
    });

    game.setOnScoreChange((newScore) => {
      setScore(newScore);
    });

    // Get canvas context
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) return;

    // Set canvas size
    const config = game.getConfig();
    canvas.width = config.gridWidth * config.cellSize;
    canvas.height = config.gridHeight * config.cellSize;

    // Render function
    const render = (ctx: CanvasRenderingContext2D, game: SnakeGame) => {
      const state = game.getState();
      const config = game.getConfig();

      // Clear canvas
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid
      ctx.strokeStyle = '#333';
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

      // Draw snake
      ctx.fillStyle = '#4ade80';
      state.snake.forEach((segment, index) => {
        if (index === 0) {
          // Head
          ctx.fillStyle = '#22c55e';
        } else {
          ctx.fillStyle = '#4ade80';
        }
        ctx.fillRect(
          segment.x * config.cellSize + 1,
          segment.y * config.cellSize + 1,
          config.cellSize - 2,
          config.cellSize - 2
        );
      });

      // Draw food
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(
        state.food.x * config.cellSize + 1,
        state.food.y * config.cellSize + 1,
        config.cellSize - 2,
        config.cellSize - 2
      );
    };

    // Game loop - simple approach: update and render every frame
    const gameLoop = () => {
      if (gameRef.current) {
        gameRef.current.update();
        render(ctx, gameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animationFrameRef.current = requestAnimationFrame(gameLoop);

    // Don't auto-start - wait for user to press Start button or arrow key

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!gameRef.current) return;

      const key = e.key.toLowerCase();
      let direction: Direction | null = null;

      if (key === 'arrowup' || key === 'w') direction = 'up';
      else if (key === 'arrowdown' || key === 's') direction = 'down';
      else if (key === 'arrowleft' || key === 'a') direction = 'left';
      else if (key === 'arrowright' || key === 'd') direction = 'right';
      else if (key === ' ') {
        // Space to pause/resume
        const currentState = gameRef.current.getState();
        if (currentState.state === 'playing') {
          gameRef.current.pause();
        } else if (currentState.state === 'paused') {
          gameRef.current.resume();
        }
        return;
      }

      if (direction) {
        gameRef.current.setDirection(direction);
        const currentState = gameRef.current.getState();
        if (currentState.state === 'idle' || currentState.state === 'gameOver') {
          gameRef.current.start();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Initial render
    render(ctx, game);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState]);

  const handleStart = () => {
    if (!gameRef.current) return;
    const currentState = gameRef.current.getState();
    // Only start if idle or gameOver
    if (currentState.state === 'idle' || currentState.state === 'gameOver') {
      gameRef.current.start();
    } else if (currentState.state === 'paused') {
      // If paused, resume instead
      gameRef.current.resume();
    }
    // If already playing, do nothing
  };

  const handleReset = () => {
    if (gameRef.current) {
      gameRef.current.reset();
    }
  };

  const handlePause = () => {
    if (!gameRef.current) return;
    const currentState = gameRef.current.getState();
    // Toggle pause/resume - do NOT reset anything
    if (currentState.state === 'playing') {
      gameRef.current.pause();
    } else if (currentState.state === 'paused') {
      gameRef.current.resume();
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center p-4">

      {/* Top Bar: Stats & Exit */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10 pointer-events-none">
        <div className="flex flex-col text-white pointer-events-auto">
          <div className="flex gap-4">
            <div className="font-bold text-green-400">SCORE: {score}</div>
            <div className="text-yellow-500">HIGH: {highScore}</div>
          </div>
          <div className="text-xs text-gray-500">LEVEL {level}</div>
        </div>

        <button
          onClick={() => window.history.back()}
          className="bg-red-900/80 p-2 rounded-full text-white pointer-events-auto border border-red-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Game Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="border-2 border-gray-700 bg-gray-900 mx-auto rounded-lg shadow-2xl"
          style={{ imageRendering: 'pixelated', maxWidth: '100%', maxHeight: '60vh' }}
        />

        {/* Pause Overlay (when paused) */}
        {(gameState === 'paused' || gameState === 'idle' || gameState === 'gameOver') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg">
            {gameState === 'gameOver' && <h2 className="text-red-500 font-bold text-2xl mb-2">GAME OVER</h2>}
            {gameState === 'paused' && <h2 className="text-yellow-400 font-bold text-2xl mb-2">PAUSED</h2>}

            <button
              onClick={handleStart}
              className="px-8 py-3 bg-brand-primary hover:bg-brand-primary/80 text-white font-bold rounded-lg shadow-lg transform transition active:scale-95"
            >
              {gameState === 'idle' || gameState === 'gameOver' ? 'START GAME' : 'RESUME'}
            </button>
          </div>
        )}
      </div>

      {/* Controls Area */}
      <div className="flex-1 w-full flex flex-col justify-end pb-8 gap-6 z-10 mt-4">

        {/* Pause / Reset Row */}
        <div className="flex justify-center gap-4">
          <button
            onClick={handlePause}
            disabled={gameState === 'idle' || gameState === 'gameOver'}
            className="px-6 py-2 bg-slate-800 border border-slate-600 rounded-full text-white font-medium disabled:opacity-30 active:bg-slate-700"
          >
            {gameState === 'paused' ? 'RESUME' : 'PAUSE'}
          </button>
        </div>

        {/* D-Pad */}
        <div className="grid grid-cols-3 gap-2 mx-auto w-48 h-48">
          <div />
          <button
            className="bg-slate-800/80 active:bg-brand-primary/80 rounded-lg flex items-center justify-center border border-slate-600"
            onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setDirection('up'); gameRef.current?.start(); }}
          >
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
          </button>
          <div />

          <button
            className="bg-slate-800/80 active:bg-brand-primary/80 rounded-lg flex items-center justify-center border border-slate-600"
            onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setDirection('left'); gameRef.current?.start(); }}
          >
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-slate-700"></div>
          </div>
          <button
            className="bg-slate-800/80 active:bg-brand-primary/80 rounded-lg flex items-center justify-center border border-slate-600"
            onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setDirection('right'); gameRef.current?.start(); }}
          >
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>

          <div />
          <button
            className="bg-slate-800/80 active:bg-brand-primary/80 rounded-lg flex items-center justify-center border border-slate-600"
            onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setDirection('down'); gameRef.current?.start(); }}
          >
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          <div />
        </div>
      </div>

    </div>
  );
}



