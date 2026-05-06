export type Direction = 'up' | 'down' | 'left' | 'right';

export type Position = {
  x: number;
  y: number;
};

export type GameState = 'idle' | 'playing' | 'paused' | 'gameOver';

export type GameConfig = {
  gridWidth: number;
  gridHeight: number;
  cellSize: number;
  initialSpeed: number;
  speedIncrease: number;
  speedIncreaseInterval: number;
};

export type SnakeGameState = {
  state: GameState;
  score: number;
  highScore: number;
  snake: Position[];
  food: Position;
  direction: Direction;
  nextDirection: Direction;
  speed: number;
  level: number;
};



