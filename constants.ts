export const TILE_SIZE = 48; // Pixels per grid cell
export const GRID_ROWS = 15;
export const GRID_COLS = 15;
export const CANVAS_WIDTH = GRID_COLS * TILE_SIZE;
export const CANVAS_HEIGHT = GRID_ROWS * TILE_SIZE;

export const FPS = 60;
export const BOMB_TIMER_MS = 3000; // 3 seconds
export const EXPLOSION_DURATION_MS = 600;

export const EMOJIS = {
  PLAYER: '🐰',
  BOMB: '💣',
  FIRE: '🔥',
  SOFT_WALL: '🧱',
  HARD_WALL: '🗿',
  ENEMY: '👻',
  GRASS: '🟩', // Though we might just use color for grass to reduce noise
};

export const COLORS = {
  GRASS: '#2E7D32', // Dark Green
  GRASS_ALT: '#246b28', // Slightly darker green for checkerboard
  HARD_WALL_BG: '#333333',
  SOFT_WALL_BG: '#D84315',
};