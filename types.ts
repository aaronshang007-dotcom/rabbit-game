export enum TileType {
  Empty = 0,
  HardWall = 1,
  SoftWall = 2,
}

export interface Point {
  x: number;
  y: number;
}

export interface Entity extends Point {
  width: number;
  height: number;
}

export interface Player extends Entity {
  alive: boolean;
  speed: number;
  bombCount: number;
  maxBombs: number;
  blastRadius: number;
}

export interface Enemy extends Entity {
  id: number;
  alive: boolean;
  speed: number;
  direction: Point; // {x: 1, y: 0} etc.
  changeDirTimer: number;
}

export interface Bomb extends Point {
  id: number;
  timer: number; // Frames or milliseconds until explosion
  range: number;
  ownerId: string; // 'player' or other
}

export interface ExplosionParticle extends Point {
  alpha: number; // For fading out
}

export interface Explosion {
  id: number;
  particles: ExplosionParticle[];
  timer: number;
}

export enum GameStatus {
  Menu,
  Playing,
  Won,
  Lost,
}