import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  TileType, 
  Player, 
  Bomb, 
  Explosion, 
  Enemy, 
  GameStatus, 
  Point
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

const HITBOX_SIZE = 30;

const GameEngine: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameStatus, setGameStatus] = useState<GameStatus>(GameStatus.Menu);
  
  // Game State Refs
  const mapRef = useRef<TileType[][]>([]);
  const playerRef = useRef<Player>({ 
    x: TILE_SIZE, y: TILE_SIZE, width: HITBOX_SIZE, height: HITBOX_SIZE, 
    alive: true, speed: 4, bombCount: 0, maxBombs: 3, blastRadius: 2 
  });
  const bombsRef = useRef<Bomb[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  
  // Unified Input State
  const inputsRef = useRef({
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    Space: false
  });

  const lastTimeRef = useRef<number>(0);
  const animationFrameId = useRef<number | null>(null);

  // --- Helpers ---
  const rectIntersect = (r1: any, r2: any) => {
    return !(r2.x >= r1.x + r1.w || r2.x + r2.w <= r1.x || r2.y >= r1.y + r1.h || r2.y + r2.h <= r1.y);
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
          const isSafeZone = (r < 3 && c < 3);
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
      speed: 4,
      bombCount: 0,
      maxBombs: 3,
      blastRadius: 2
    };

    const enemies: Enemy[] = [];
    let enemyCount = 4;
    while(enemyCount > 0) {
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

  // --- Physics ---
  const isCollision = (targetX: number, targetY: number, w: number, h: number, currentX: number, currentY: number) => {
      const pRect = { x: targetX - w/2, y: targetY - h/2, w: w, h: h };
      const curRect = { x: currentX - w/2, y: currentY - h/2, w: w, h: h };

      const left = Math.floor(pRect.x / TILE_SIZE);
      const right = Math.floor((pRect.x + pRect.w - 0.01) / TILE_SIZE);
      const top = Math.floor(pRect.y / TILE_SIZE);
      const bottom = Math.floor((pRect.y + pRect.h - 0.01) / TILE_SIZE);

      for (let r = top; r <= bottom; r++) {
          for (let c = left; c <= right; c++) {
              if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) return true;
              if (mapRef.current[r][c] !== TileType.Empty) return true;
          }
      }

      for (const b of bombsRef.current) {
          const bRect = { x: b.x - TILE_SIZE/2, y: b.y - TILE_SIZE/2, w: TILE_SIZE, h: TILE_SIZE };
          if (rectIntersect(pRect, bRect)) {
              if (rectIntersect(curRect, bRect)) continue; 
              return true;
          }
      }
      return false;
  };

  const update = (dt: number) => {
    if (gameStatus !== GameStatus.Playing) return;

    const player = playerRef.current;
    
    // Player Move based on unified inputs
    let dx = 0; let dy = 0;
    if (inputsRef.current['ArrowUp']) dy -= player.speed;
    if (inputsRef.current['ArrowDown']) dy += player.speed;
    if (inputsRef.current['ArrowLeft']) dx -= player.speed;
    if (inputsRef.current['ArrowRight']) dx += player.speed;

    if (dx !== 0 && dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx = (dx / len) * player.speed;
      dy = (dy / len) * player.speed;
    }

    if (dx !== 0) {
        const nextX = player.x + dx;
        if (!isCollision(nextX, player.y, player.width, player.height, player.x, player.y)) {
            player.x = nextX;
        } else {
            const gridY = Math.floor(player.y / TILE_SIZE);
            const centerY = gridY * TILE_SIZE + TILE_SIZE / 2;
            const offset = player.y - centerY;
            if (Math.abs(offset) < 20) {
                if (offset > 0) {
                   if (!isCollision(nextX, player.y - player.speed, player.width, player.height, player.x, player.y)) player.y -= player.speed;
                } else {
                   if (!isCollision(nextX, player.y + player.speed, player.width, player.height, player.x, player.y)) player.y += player.speed;
                }
            }
        }
    }

    if (dy !== 0) {
        const nextY = player.y + dy;
        if (!isCollision(player.x, nextY, player.width, player.height, player.x, player.y)) {
            player.y = nextY;
        } else {
            const gridX = Math.floor(player.x / TILE_SIZE);
            const centerX = gridX * TILE_SIZE + TILE_SIZE / 2;
            const offset = player.x - centerX;
            if (Math.abs(offset) < 20) {
                if (offset > 0) {
                   if (!isCollision(player.x - player.speed, nextY, player.width, player.height, player.x, player.y)) player.x -= player.speed;
                } else {
                   if (!isCollision(player.x + player.speed, nextY, player.width, player.height, player.x, player.y)) player.x += player.speed;
                }
            }
        }
    }

    if (inputsRef.current['Space']) {
      placeBomb();
      inputsRef.current['Space'] = false; // consume input
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
       if (Math.random() < 0.02) {
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
        id: Date.now(), x: bombX, y: bombY, timer: BOMB_TIMER_MS, range: player.blastRadius, ownerId: 'player'
      });
      player.bombCount++;
    }
  };

  const explodeBomb = (bomb: Bomb, index: number) => {
    bombsRef.current.splice(index, 1);
    playerRef.current.bombCount--;
    const center = getGridPos(bomb.x, bomb.y);
    const particles = [{ x: center.c, y: center.r }];
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
    ctx.font = `${TILE_SIZE * 0.75}px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    mapRef.current.forEach((row, r) => {
      row.forEach((tile, c) => {
        const x = c * TILE_SIZE, y = r * TILE_SIZE;
        if ((r + c) % 2 === 1) {
             ctx.fillStyle = 'rgba(0,0,0,0.15)';
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

    bombsRef.current.forEach(b => {
      const s = 1 + Math.sin(Date.now() / 200) * 0.1;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(s, s);
      ctx.fillText(EMOJIS.BOMB, 0, 0);
      ctx.restore();
    });

    explosionsRef.current.forEach(exp => {
       ctx.fillStyle = `rgba(255, 69, 0, ${exp.timer / EXPLOSION_DURATION_MS})`; 
       exp.particles.forEach(p => ctx.fillText(EMOJIS.FIRE, p.x * TILE_SIZE + TILE_SIZE/2, p.y * TILE_SIZE + TILE_SIZE/2));
    });

    enemiesRef.current.forEach(e => {
        ctx.save();
        ctx.translate(e.x, e.y);
        if(e.direction.x < 0) ctx.scale(-1, 1);
        ctx.fillText(EMOJIS.ENEMY, 0, 0);
        ctx.restore();
    });

    if (playerRef.current.alive && gameStatus === GameStatus.Playing) {
        ctx.fillText(EMOJIS.PLAYER, playerRef.current.x, playerRef.current.y);
    }
  };

  const render = (time: number) => {
    const dt = time - lastTimeRef.current;
    lastTimeRef.current = time;
    update(dt);
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        draw(ctx);
      }
    }
    animationFrameId.current = requestAnimationFrame(render);
  };

  // --- Controls Handlers ---
  const handleInputStart = (key: string) => { inputsRef.current[key as keyof typeof inputsRef.current] = true; };
  const handleInputEnd = (key: string) => { inputsRef.current[key as keyof typeof inputsRef.current] = false; };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
        inputsRef.current[e.code as keyof typeof inputsRef.current] = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        inputsRef.current[e.code as keyof typeof inputsRef.current] = false;
      }
    };
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
       // init on mount logic if needed
    }
  }, [gameStatus, initGame]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-900 p-2 relative overflow-hidden select-none touch-none">
      <h1 className="text-2xl mb-2 text-emerald-400 font-bold z-10">BUNNY BOMBER</h1>
      
      <div className="relative border-4 border-emerald-800 rounded-lg shadow-2xl bg-neutral-800"
           style={{ maxWidth: '100%', aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-full object-contain"
        />
        
        {/* Mobile Controls Overlay - Visible only on Touch devices via CSS/Media Queries logic usually, 
            but for React Preview we show them below or overlay if screen is small */}
        
        {gameStatus === GameStatus.Menu && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-50">
             <div className="text-5xl mb-2">🐰</div>
             <button onClick={initGame} className="px-8 py-4 bg-emerald-600 rounded font-bold text-xl shadow-lg active:scale-95">START</button>
          </div>
        )}
        {(gameStatus === GameStatus.Lost || gameStatus === GameStatus.Won) && (
           <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white z-50">
             <h2 className="text-4xl mb-4 font-bold">{gameStatus === GameStatus.Won ? 'WIN!' : 'GAME OVER'}</h2>
             <button onClick={initGame} className="px-6 py-3 bg-gray-600 rounded text-lg">RETRY</button>
           </div>
        )}
      </div>

      {/* Virtual Controls for Mobile */}
      <div className="flex w-full justify-between items-end px-4 mt-4 max-w-lg z-50 h-32">
        {/* D-Pad */}
        <div className="relative w-32 h-32 bg-white/10 rounded-full">
            <button className="absolute top-0 left-10 w-10 h-10 bg-white/20 rounded-t-lg active:bg-emerald-500/50"
              onMouseDown={() => handleInputStart('ArrowUp')} onMouseUp={() => handleInputEnd('ArrowUp')}
              onTouchStart={(e) => { e.preventDefault(); handleInputStart('ArrowUp'); }} onTouchEnd={(e) => { e.preventDefault(); handleInputEnd('ArrowUp'); }}
            />
            <button className="absolute bottom-0 left-10 w-10 h-10 bg-white/20 rounded-b-lg active:bg-emerald-500/50"
              onMouseDown={() => handleInputStart('ArrowDown')} onMouseUp={() => handleInputEnd('ArrowDown')}
              onTouchStart={(e) => { e.preventDefault(); handleInputStart('ArrowDown'); }} onTouchEnd={(e) => { e.preventDefault(); handleInputEnd('ArrowDown'); }}
            />
            <button className="absolute left-0 top-10 w-10 h-10 bg-white/20 rounded-l-lg active:bg-emerald-500/50"
              onMouseDown={() => handleInputStart('ArrowLeft')} onMouseUp={() => handleInputEnd('ArrowLeft')}
              onTouchStart={(e) => { e.preventDefault(); handleInputStart('ArrowLeft'); }} onTouchEnd={(e) => { e.preventDefault(); handleInputEnd('ArrowLeft'); }}
            />
            <button className="absolute right-0 top-10 w-10 h-10 bg-white/20 rounded-r-lg active:bg-emerald-500/50"
              onMouseDown={() => handleInputStart('ArrowRight')} onMouseUp={() => handleInputEnd('ArrowRight')}
              onTouchStart={(e) => { e.preventDefault(); handleInputStart('ArrowRight'); }} onTouchEnd={(e) => { e.preventDefault(); handleInputEnd('ArrowRight'); }}
            />
        </div>

        {/* Action Button */}
        <button 
          className="w-24 h-24 bg-red-500/30 border-2 border-white/30 rounded-full flex items-center justify-center text-4xl active:bg-red-500/80 active:scale-95 transition-all"
          onMouseDown={() => handleInputStart('Space')} onMouseUp={() => handleInputEnd('Space')}
          onTouchStart={(e) => { e.preventDefault(); handleInputStart('Space'); }} onTouchEnd={(e) => { e.preventDefault(); handleInputEnd('Space'); }}
        >
          💣
        </button>
      </div>
      
      <div className="text-gray-500 text-xs mt-2">Mobile controls visible below game area</div>
    </div>
  );
};

export default GameEngine;