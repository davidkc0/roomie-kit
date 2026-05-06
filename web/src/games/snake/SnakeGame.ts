import { type Direction, type Position, type GameState, type GameConfig, type SnakeGameState } from './types';

const DEFAULT_CONFIG: GameConfig = {
  gridWidth: 20,
  gridHeight: 20,
  cellSize: 20,
  initialSpeed: 150, // milliseconds per move
  speedIncrease: 10, // decrease by 10ms per level
  speedIncreaseInterval: 10, // increase speed every 10 points
};

export class SnakeGame {
  private config: GameConfig;
  private gameState: SnakeGameState;
  private lastMoveTime: number = 0;
  private onStateChange?: (state: SnakeGameState) => void;
  private onScoreChange?: (score: number) => void;

  constructor(config?: Partial<GameConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.gameState = this.createInitialState();
  }

  private createInitialState(): SnakeGameState {
    const centerX = Math.floor(this.config.gridWidth / 2);
    const centerY = Math.floor(this.config.gridHeight / 2);

    const initialSnake: Position[] = [
      { x: centerX, y: centerY },
      { x: centerX - 1, y: centerY },
      { x: centerX - 2, y: centerY },
    ];

    return {
      state: 'idle',
      score: 0,
      highScore: 0,
      snake: initialSnake,
      food: this.generateFood(initialSnake),
      direction: 'right',
      nextDirection: 'right',
      speed: this.config.initialSpeed,
      level: 1,
    };
  }

  private generateFood(snake: Position[]): Position {
    let food: Position;
    let attempts = 0;
    do {
      food = {
        x: Math.floor(Math.random() * this.config.gridWidth),
        y: Math.floor(Math.random() * this.config.gridHeight),
      };
      attempts++;
      if (attempts > 100) break; // Prevent infinite loop
    } while (this.isSnakePosition(food, snake));
    return food;
  }

  private isSnakePosition(pos: Position, snake: Position[] = this.gameState.snake): boolean {
    return snake.some(
      (segment) => segment.x === pos.x && segment.y === pos.y
    );
  }

  setOnStateChange(callback: (state: SnakeGameState) => void): void {
    this.onStateChange = callback;
  }

  setOnScoreChange(callback: (score: number) => void): void {
    this.onScoreChange = callback;
  }

  getState(): SnakeGameState {
    return { ...this.gameState };
  }

  getConfig(): GameConfig {
    return { ...this.config };
  }

  start(): void {
    // ONLY start if idle or gameOver - reset the game
    if (this.gameState.state === 'idle' || this.gameState.state === 'gameOver') {
      const savedDirection = this.gameState.nextDirection;
      this.gameState = this.createInitialState();
      if (savedDirection) {
        this.gameState.direction = savedDirection;
        this.gameState.nextDirection = savedDirection;
      }
      this.gameState.state = 'playing';
      // Force immediate move on next update check to prevent input lag
      this.lastMoveTime = Date.now() - this.gameState.speed;
      this.notifyStateChange();
    }
    // If already playing or paused, do NOTHING
  }

  pause(): void {
    // ONLY pause if playing - do NOT reset anything
    if (this.gameState.state === 'playing') {
      this.gameState.state = 'paused';
      this.notifyStateChange();
    }
  }

  resume(): void {
    // ONLY resume if paused - do NOT reset anything
    if (this.gameState.state === 'paused') {
      this.gameState.state = 'playing';
      this.lastMoveTime = 0; // Reset timer for next move
      this.notifyStateChange();
    }
  }

  reset(): void {
    this.gameState = this.createInitialState();
    this.lastMoveTime = 0;
    this.notifyStateChange();
  }

  setDirection(direction: Direction): void {
    // Prevent reversing into itself
    const opposite: Record<Direction, Direction> = {
      up: 'down',
      down: 'up',
      left: 'right',
      right: 'left',
    };

    if (this.gameState.direction !== opposite[direction]) {
      this.gameState.nextDirection = direction;
    }
  }

  update(): void {
    if (this.gameState.state !== 'playing') {
      return;
    }

    // Initialize lastMoveTime if not set
    if (this.lastMoveTime === 0) {
      this.lastMoveTime = Date.now();
      return;
    }

    const now = Date.now();

    // Check if enough time has passed for next move
    if (now - this.lastMoveTime >= this.gameState.speed) {
      this.move();
      this.lastMoveTime = now;
    }
  }

  private move(): void {
    // Update direction
    this.gameState.direction = this.gameState.nextDirection;

    // Calculate new head position (copy current head)
    const head = {
      x: this.gameState.snake[0].x,
      y: this.gameState.snake[0].y
    };

    switch (this.gameState.direction) {
      case 'up':
        head.y -= 1;
        break;
      case 'down':
        head.y += 1;
        break;
      case 'left':
        head.x -= 1;
        break;
      case 'right':
        head.x += 1;
        break;
    }

    // Check wall collision
    if (
      head.x < 0 ||
      head.x >= this.config.gridWidth ||
      head.y < 0 ||
      head.y >= this.config.gridHeight
    ) {
      this.gameOver();
      return;
    }

    // Check self collision (exclude current head)
    const body = this.gameState.snake.slice(1);
    if (this.isSnakePosition(head, body)) {
      this.gameOver();
      return;
    }

    // Add new head
    this.gameState.snake.unshift(head);

    // Check food collision
    if (head.x === this.gameState.food.x && head.y === this.gameState.food.y) {
      this.eatFood();
    } else {
      // Remove tail if no food eaten
      this.gameState.snake.pop();
    }

    this.notifyStateChange();
  }

  private eatFood(): void {
    this.gameState.score += 10;
    this.gameState.food = this.generateFood(this.gameState.snake);

    // Increase speed every N points
    const newLevel = Math.floor(this.gameState.score / this.config.speedIncreaseInterval) + 1;
    if (newLevel > this.gameState.level) {
      this.gameState.level = newLevel;
      this.gameState.speed = Math.max(
        50, // Minimum speed
        this.config.initialSpeed - (newLevel - 1) * this.config.speedIncrease
      );
    }

    // Update high score
    if (this.gameState.score > this.gameState.highScore) {
      this.gameState.highScore = this.gameState.score;
    }

    if (this.onScoreChange) {
      this.onScoreChange(this.gameState.score);
    }

    this.notifyStateChange();
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



