import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  TileType, 
  Player, 
  Bomb, 
  Explosion, 
  Enemy, 
  GameStatus, 
  Point,
  Entity
} from '../types';
import { 
  TILE_SIZE, 
  GRID_ROWS, 
  GRID_COLS, 
  CANVAS_WIDTH, 
  CANVAS_HEIGHT, 
  EMOJIS, 
  BOMB_TIMER_MS, 
  EXPLOSION_DURATION_MS,
  COLORS
} from '../constants';

const HITBOX_SIZE = 30; // Logical hitbox

const GameEngine: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameStatus, setGameStatus] = useState<GameStatus>(GameStatus.Menu);
  
  // Game State Refs
  const mapRef = useRef<TileType[][]>([]);
  const playerRef = useRef<Player>({ 
    x: TILE_SIZE, y: TILE_SIZE, width: HITBOX_SIZE, height: HITBOX_SIZE, 
    alive: true, speed: 3.5, bombCount: 0, maxBombs: 3, blastRadius: 2 
  });
  const bombsRef = useRef<Bomb[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const lastTimeRef = useRef<number>(0);
  const animationFrameId = useRef<number | null>(null);

  // --- Helpers ---
  const rectIntersect = (r1: any, r2: any) => {
    return !(r2.x >= r1.x + r1.w || 
             r2.x + r2.w <= r1.x || 
             r2.y >= r1.y + r1.h || 
             r2.y + r2.h <= r1.y);
  };

  const getGridPos = (x: number, y: number) => {
    return { c: Math.floor(x / TILE_SIZE), r: Math.floor(y / TILE_SIZE) };
  };

  const initGame = useCallback(() => {
    const newMap: TileType[][] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      const row: TileType[] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        if (r === 0 || r === GRID_ROWS - 1 || c === 0 || c === GRID_COLS - 1 || (r % 2 === 0 && c % 2 === 0)) {
          row.push(TileType.HardWall);
        } else {
          const isSafeZone = (r === 1 && c === 1) || (r === 1 && c === 2) || (r === 2 && c === 1);
          if (!isSafeZone && Math.random() < 0.3) {
            row.push(TileType.SoftWall);
          } else {
            row.push(TileType.Empty);
          }
        }
      }
      newMap.push(row);
    }
    mapRef.current = newMap;

    playerRef.current = {
      x: TILE_SIZE * 1.5,
      y: TILE_SIZE * 1.5,
      width: HITBOX_SIZE,
      height: HITBOX_SIZE,
      alive: true,
      speed: 3.5,
      bombCount: 0,
      maxBombs: 3,
      blastRadius: 2
    };

    const enemies: Enemy[] = [];
    let enemyCount = 3;
    let attempts = 0;
    while(enemyCount > 0 && attempts < 100) {
      attempts++;
      const r = Math.floor(Math.random() * (GRID_ROWS - 2)) + 1;
      const c = Math.floor(Math.random() * (GRID_COLS - 2)) + 1;
      if (newMap[r][c] === TileType.Empty && (r > 4 || c > 4)) {
        enemies.push({
          id: Math.random(),
          x: c * TILE_SIZE + TILE_SIZE / 2,
          y: r * TILE_SIZE + TILE_SIZE / 2,
          width: HITBOX_SIZE,
          height: HITBOX_SIZE,
          alive: true,
          speed: 2,
          direction: { x: 1, y: 0 },
          changeDirTimer: 0
        });
        enemyCount--;
      }
    }
    enemiesRef.current = enemies;
    bombsRef.current = [];
    explosionsRef.current = [];
    setGameStatus(GameStatus.Playing);
    lastTimeRef.current = performance.now();
  }, []);

  // --- Physics Logic ---

  const isCollision = (targetX: number, targetY: number, w: number, h: number, currentX: number, currentY: number) => {
      const pRect = { x: targetX - w/2, y: targetY - h/2, w: w, h: h };
      const curRect = { x: currentX - w/2, y: currentY - h/2, w: w, h: h };

      // Walls
      const leftCol = Math.floor(pRect.x / TILE_SIZE);
      const rightCol = Math.floor((pRect.x + pRect.w - 0.01) / TILE_SIZE);
      const topRow = Math.floor(pRect.y / TILE_SIZE);
      const bottomRow = Math.floor((pRect.y + pRect.h - 0.01) / TILE_SIZE);

      for (let r = topRow; r <= bottomRow; r++) {
          for (let c = leftCol; c <= rightCol; c++) {
              if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) return true;
              if (mapRef.current[r][c] !== TileType.Empty) return true;
          }
      }

      // Bombs
      for (const b of bombsRef.current) {
          const bRect = { x: b.x - TILE_SIZE/2, y: b.y - TILE_SIZE/2, w: TILE_SIZE, h: TILE_SIZE };
          if (rectIntersect(pRect, bRect)) {
              // Pass-through check
              if (rectIntersect(curRect, bRect)) {
                  continue; 
              }
              return true;
          }
      }
      return false;
  };

  const update = (dt: number) => {
    if (gameStatus !== GameStatus.Playing) return;

    const player = playerRef.current;
    
    // Player Move
    let dx = 0; let dy = 0;
    if (keysPressed.current['ArrowUp']) dy -= player.speed;
    if (keysPressed.current['ArrowDown']) dy += player.speed;
    if (keysPressed.current['ArrowLeft']) dx -= player.speed;
    if (keysPressed.current['ArrowRight']) dx += player.speed;

    if (dx !== 0 && dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx = (dx / len) * player.speed;
      dy = (dy / len) * player.speed;
    }

    // X Axis with Corner Sliding
    if (dx !== 0) {
        const nextX = player.x + dx;
        if (!isCollision(nextX, player.y, player.width, player.height, player.x, player.y)) {
            player.x = nextX;
        } else {
            // Slide
            const gridY = Math.floor(player.y / TILE_SIZE);
            const centerY = gridY * TILE_SIZE + TILE_SIZE / 2;
            const offset = player.y - centerY;
            const SNAP_THRESHOLD = 20;

            if (Math.abs(offset) < SNAP_THRESHOLD) {
                if (offset > 0) {
                   if (!isCollision(nextX, player.y - player.speed, player.width, player.height, player.x, player.y)) 
                      player.y -= player.speed;
                } else if (offset < 0) {
                   if (!isCollision(nextX, player.y + player.speed, player.width, player.height, player.x, player.y)) 
                      player.y += player.speed;
                }
            }
        }
    }

    // Y Axis with Corner Sliding
    if (dy !== 0) {
        const nextY = player.y + dy;
        if (!isCollision(player.x, nextY, player.width, player.height, player.x, player.y)) {
            player.y = nextY;
        } else {
            // Slide
            const gridX = Math.floor(player.x / TILE_SIZE);
            const centerX = gridX * TILE_SIZE + TILE_SIZE / 2;
            const offset = player.x - centerX;
            const SNAP_THRESHOLD = 20;

            if (Math.abs(offset) < SNAP_THRESHOLD) {
                if (offset > 0) {
                   if (!isCollision(player.x - player.speed, nextY, player.width, player.height, player.x, player.y)) 
                      player.x -= player.speed;
                } else if (offset < 0) {
                   if (!isCollision(player.x + player.speed, nextY, player.width, player.height, player.x, player.y)) 
                      player.x += player.speed;
                }
            }
        }
    }

    if (keysPressed.current['Space']) {
      placeBomb();
      keysPressed.current['Space'] = false;
    }

    // Bombs
    for (let i = bombsRef.current.length - 1; i >= 0; i--) {
      bombsRef.current[i].timer -= dt;
      if (bombsRef.current[i].timer <= 0) {
        explodeBomb(bombsRef.current[i], i);
      }
    }

    // Explosions
    for (let i = explosionsRef.current.length - 1; i >= 0; i--) {
      const exp = explosionsRef.current[i];
      exp.timer -= dt;
      if (exp.timer <= 0) {
        explosionsRef.current.splice(i, 1);
        continue;
      }
      exp.particles.forEach(p => {
        const pGrid = getGridPos(player.x, player.y);
        if (pGrid.r === p.y && pGrid.c === p.x) {
          player.alive = false;
          setGameStatus(GameStatus.Lost);
        }
        for (let ei = enemiesRef.current.length - 1; ei >= 0; ei--) {
          const eGrid = getGridPos(enemiesRef.current[ei].x, enemiesRef.current[ei].y);
          if (eGrid.r === p.y && eGrid.c === p.x) enemiesRef.current.splice(ei, 1);
        }
      });
    }

    // Enemies
    enemiesRef.current.forEach(enemy => {
       const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
       if (dist < TILE_SIZE * 0.7) {
         player.alive = false;
         setGameStatus(GameStatus.Lost);
       }
       
       const nextX = enemy.x + enemy.direction.x * enemy.speed;
       const nextY = enemy.y + enemy.direction.y * enemy.speed;
       
       if (isCollision(nextX, nextY, enemy.width, enemy.height, enemy.x, enemy.y)) {
         const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];
         enemy.direction = dirs[Math.floor(Math.random() * dirs.length)];
       } else {
         enemy.x = nextX;
         enemy.y = nextY;
       }
       
       if (Math.random() < 0.01) {
         const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];
         enemy.direction = dirs[Math.floor(Math.random() * dirs.length)];
       }
    });

    if (enemiesRef.current.length === 0 && gameStatus === GameStatus.Playing) {
        setGameStatus(GameStatus.Won);
    }
  };

  const placeBomb = () => {
    const player = playerRef.current;
    if (player.bombCount >= player.maxBombs) return;

    const gridPos = getGridPos(player.x, player.y);
    const bombX = gridPos.c * TILE_SIZE + TILE_SIZE / 2;
    const bombY = gridPos.r * TILE_SIZE + TILE_SIZE / 2;

    const exists = bombsRef.current.some(b => {
      const bPos = getGridPos(b.x, b.y);
      return bPos.r === gridPos.r && bPos.c === gridPos.c;
    });

    if (!exists) {
      bombsRef.current.push({
        id: Date.now(),
        x: bombX,
        y: bombY,
        timer: BOMB_TIMER_MS,
        range: player.blastRadius,
        ownerId: 'player'
      });
      player.bombCount++;
    }
  };

  const explodeBomb = (bomb: Bomb, index: number) => {
    bombsRef.current.splice(index, 1);
    if(bomb.ownerId === 'player') playerRef.current.bombCount--;
    
    const center = getGridPos(bomb.x, bomb.y);
    const particles: Point[] = [{ x: center.c, y: center.r }];
    const dirs = [{dr: -1, dc: 0}, {dr: 1, dc: 0}, {dr: 0, dc: -1}, {dr: 0, dc: 1}];

    dirs.forEach(d => {
      for (let i = 1; i <= bomb.range; i++) {
        const r = center.r + d.dr * i;
        const c = center.c + d.dc * i;
        if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) break;
        
        const tile = mapRef.current[r][c];
        if (tile === TileType.HardWall) break;
        particles.push({ x: c, y: r });
        if (tile === TileType.SoftWall) {
          mapRef.current[r][c] = TileType.Empty;
          break; 
        }
      }
    });

    explosionsRef.current.push({
      id: Date.now(),
      timer: EXPLOSION_DURATION_MS,
      particles: particles.map(p => ({ ...p, alpha: 1.0 }))
    });
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = COLORS.GRASS;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.font = `${TILE_SIZE * 0.8}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    mapRef.current.forEach((row, r) => {
      row.forEach((tile, c) => {
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;
        if ((r + c) % 2 === 1) {
             ctx.fillStyle = COLORS.GRASS_ALT; // Use constant
             ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        }
        if (tile === TileType.HardWall) {
          ctx.fillStyle = COLORS.HARD_WALL_BG;
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = 'white';
          ctx.fillText(EMOJIS.HARD_WALL, x + TILE_SIZE/2, y + TILE_SIZE/2);
        } else if (tile === TileType.SoftWall) {
          ctx.fillStyle = COLORS.SOFT_WALL_BG;
          ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          ctx.fillStyle = 'white';
          ctx.fillText(EMOJIS.SOFT_WALL, x + TILE_SIZE/2, y + TILE_SIZE/2);
        }
      });
    });

    bombsRef.current.forEach(bomb => {
      const scale = 1 + Math.sin(Date.now() / 200) * 0.1;
      ctx.save();
      ctx.translate(bomb.x, bomb.y);
      ctx.scale(scale, scale);
      ctx.fillText(EMOJIS.BOMB, 0, 0);
      ctx.restore();
    });

    explosionsRef.current.forEach(exp => {
       ctx.fillStyle = `rgba(255, 69, 0, ${exp.timer / EXPLOSION_DURATION_MS})`; 
       exp.particles.forEach(p => {
          const x = p.x * TILE_SIZE + TILE_SIZE / 2;
          const y = p.y * TILE_SIZE + TILE_SIZE / 2;
          ctx.fillText(EMOJIS.FIRE, x, y);
       });
    });

    enemiesRef.current.forEach(enemy => ctx.fillText(EMOJIS.ENEMY, enemy.x, enemy.y));
    const player = playerRef.current;
    if (player.alive) ctx.fillText(EMOJIS.PLAYER, player.x, player.y);
  };

  const render = (time: number) => {
    const dt = time - lastTimeRef.current;
    lastTimeRef.current = time;
    update(dt);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        draw(ctx);
      }
    }
    animationFrameId.current = requestAnimationFrame(render);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    };
    const handleKeyUp = (e: KeyboardEvent) => keysPressed.current[e.code] = false;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    animationFrameId.current = requestAnimationFrame(render);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [gameStatus]);

  useEffect(() => {
    if (gameStatus === GameStatus.Menu) {
       // Optional auto-init or wait for user
    }
  }, [gameStatus, initGame]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-900 p-4 relative">
      <h1 className="text-3xl mb-4 text-emerald-400 tracking-wider">BUNNY BOMBER</h1>
      <div className="relative border-4 border-emerald-800 rounded-lg shadow-2xl bg-neutral-800">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block"
          style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
        />
        {gameStatus === GameStatus.Menu && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white">
             <div className="text-6xl mb-4">🐰 vs 👻</div>
             <p className="mb-8 text-center max-w-md leading-6 text-gray-300">
               Use Arrow Keys to Move<br/>Spacebar to place Bombs<br/>Destroy Walls & Enemies
             </p>
             <button 
               onClick={initGame}
               className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded shadow-[0_4px_0_rgb(6,95,70)] active:shadow-none active:translate-y-1 transition-all"
             >
               START GAME
             </button>
          </div>
        )}
        {(gameStatus === GameStatus.Lost || gameStatus === GameStatus.Won) && (
           <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white">
             <h2 className={`text-5xl mb-4 ${gameStatus === GameStatus.Won ? 'text-yellow-400' : 'text-red-500'}`}>
               {gameStatus === GameStatus.Won ? 'VICTORY!' : 'GAME OVER'}
             </h2>
             <button 
               onClick={initGame}
               className="mt-4 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded"
             >
               {gameStatus === GameStatus.Won ? 'PLAY AGAIN' : 'TRY AGAIN'}
             </button>
           </div>
        )}
      </div>
      <div className="mt-4 text-gray-400 text-xs">
         React + Canvas + Tailwind | No Images Used
      </div>
    </div>
  );
};

export default GameEngine;