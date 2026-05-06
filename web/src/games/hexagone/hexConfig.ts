/**
 * Hex Arena Configuration
 * Grid constants and floor definitions copied from wawa-guys-final/GameArena.jsx
 */

// Grid spacing - EXACT values from wawa-guys-final/GameArena.jsx
// These values are tuned to work with the ~2 unit diameter hexagon model
export const HEX_X_SPACING = 2.25;  // Horizontal spacing between hex centers
export const HEX_Z_SPACING = 1.95;  // Vertical (row) spacing between hex centers

// Grid dimensions
export const NB_ROWS = 7;
export const NB_COLUMNS = 7;

// Vertical spacing between floors
export const FLOOR_HEIGHT = 10;

// Time (ms) after hex is touched before it disappears
export const HEX_FADE_DELAY = 600;

// Floor color definitions (bottom to top when rendered)
export const FLOORS = [
    { color: '#ff4444', name: 'red' },    // Bottom floor
    { color: '#4444ff', name: 'blue' },
    { color: '#44ff44', name: 'green' },
    { color: '#ffff44', name: 'yellow' },
    { color: '#aa44ff', name: 'purple' }, // Top floor (spawn)
] as const;

// Game timing constants
export const COUNTDOWN_SECONDS = 3;
export const WINNER_DISPLAY_SECONDS = 5;

// Player limits
export const MIN_PLAYERS_TO_START = 2; // TODO: revert to 3 for production
export const MAX_GAME_PLAYERS = 5;
export const MAX_PLAYERS_PER_ROOM = 12;

// Battle Royale Lobby
export const JOIN_WINDOW_SECONDS = 30;

// [DEPRECATED] Old bidding/entry system — replaced by battle royale join window.
// Kept for reference. To restore, search for [APPLE_COMPLIANCE] and [DEPRECATED].
// export const BASE_ENTRY_FEE = 5;
// export const ENTRY_PRESETS = [5, 10, 20, 40] as const;
// export const COMPETE_TIMER_SECONDS = 15;
// export const READY_TIMER_SECONDS = 20;
// export const WINNER_GEM_SPLIT = 0.85;

// Death threshold (Y position below which player is eliminated)
export const DEATH_Y_THRESHOLD = -FLOOR_HEIGHT * FLOORS.length - 5;

// Hex Arena Avatar Settings (overrides global defaults)
export const HEX_MOVE_SPEED = 0.08; // Faster than default 0.06 for arcade feel
export const HEX_NAMEPLATE_SCALE = 2.5; // Larger nameplates for zoomed-out camera

// Grace period (ms) after game start — hexes won't break during this window
// Gives players time to orient before tiles start disappearing
export const HEX_GRACE_PERIOD_MS = 1000;
