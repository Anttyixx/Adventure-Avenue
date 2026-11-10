/**
 * Light scenery on the solid grass ground (`GROUND_SET = 'solid'`): a winding river beside the
 * board and foliage in the empty space around it, sparse near the tiles and denser further out,
 * in natural clumps. Placement is planned once per 800-unit chunk from board coordinates (no
 * engine randomness) and kept clear of tiles, roads and portal openings.
 *
 * It stays cheap because nothing covers the whole screen: each frame strokes the river's few
 * visible curves and draws the visible pieces, each from a copy of its picture shrunk close to
 * its size on screen (`spriteAt`), so zoomed out the game draws small images, not 256px ones.
 */
import type { GameState } from '@aa/engine';
import { cellCenter } from './geometry';
import { propCanvas, type PropKey } from './props';
import { landscapeRandom } from './scenery';

/** A piece of scenery: its picture, where it stands (center) and its size in world units. */
interface Piece {
  key: PropKey;
  x: number;
  y: number;
  size: number;
}

/** A river running top to bottom beside the board: its middle line is `x(y)`. */
interface River {
  x: (y: number) => number;
  width: number;
}

interface Scene {
  /** Tile centers and portal openings that scenery keeps away from. */
  clear: { x: number; y: number }[];
  river: River | null;
  chunks: Map<string, Piece[]>;
}

const CHUNK = 800;
/** The planting grid: at most one piece per cell. */
const CELL = 80;
/** Nothing grows closer than this to a tile's center (tiles reach 43, roads join them). */
const CLEAR_SMALL = 125;
const CLEAR_TREE = 155;
/** How far out from the board the scenery reaches full density. */
const FADE = 650;
const RIVER_WIDTH = 74;
/** Pieces smaller than this on screen (in pixels) are not drawn. */
const MIN_PIXELS = 14;
/** River bank (darker grass), water and highlight colors. */
const BANK = '#7fae58';
const WATER = '#4cb8cf';
const SHINE = 'rgba(255,255,255,0.45)';

const scenes = new WeakMap<GameState, Scene>();

/** Smooth value noise in 0..1 for clumping (woods here, meadow there). */
function noise(x: number, y: number, salt: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    u = x - ix,
    v = y - iy;
  const sx = u * u * (3 - 2 * u),
    sy = v * v * (3 - 2 * v);
  const at = (a: number, b: number) => landscapeRandom(a + salt, b - salt)();
  const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
  const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
  return top + (bottom - top) * sy;
}

/**
 * The scene for a board. `portals` are the portal openings (world points), which stick out past
 * their tiles.
 */
function sceneFor(G: GameState, portals: { x: number; y: number }[]): Scene {
  let scene = scenes.get(G);
  if (scene) return scene;
  const tiles = G.nodes.map((n) => cellCenter(G.layout, n.x, n.y));
  const clear = [...tiles, ...portals];
  let river: River | null = null;
  if (tiles.length) {
    const xs = tiles.map((p) => p.x);
    // The river runs down one side of the board, chosen by the board so each board keeps its own.
    const id = G.boardId ?? '';
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const right = h % 2 === 0;
    const base = right ? Math.max(...xs) + 430 : Math.min(...xs) - 430;
    const phase = (h % 997) / 997;
    river = {
      width: RIVER_WIDTH,
      // Two gentle bends of different lengths, never swinging back toward the board by more than 90.
      x: (y) =>
        base +
        60 * Math.sin(y / 420 + phase * 6.28) +
        30 * Math.sin(y / 170 + phase * 17) +
        (right ? 30 : -30),
    };
  }
  scene = { clear, river, chunks: new Map() };
  scenes.set(G, scene);
  return scene;
}

/** Plan one chunk's pieces (cached). */
function chunkPieces(scene: Scene, cx: number, cy: number): Piece[] {
  const key = `${cx},${cy}`;
  const hit = scene.chunks.get(key);
  if (hit) return hit;
  const out: Piece[] = [];
  const n = CHUNK / CELL;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const gx = cx * n + i,
        gy = cy * n + j;
      const r = landscapeRandom(gx * 7 + 13, gy * 11 - 5);
      const x = (gx + 0.2 + r() * 0.6) * CELL,
        y = (gy + 0.2 + r() * 0.6) * CELL;
      let d = Infinity;
      for (const p of scene.clear) d = Math.min(d, Math.hypot(x - p.x, y - p.y));
      if (d < CLEAR_SMALL) continue;
      const pick = r();
      // Along the river: reeds and rocks on the banks, now and then lily pads on the water.
      if (scene.river) {
        const off = Math.abs(x - scene.river.x(y));
        const half = scene.river.width / 2;
        if (off < half - 14) {
          if (pick > 0.86) out.push({ key: 'pond-lilies', x, y, size: 30 });
          continue;
        }
        if (off < half + 34) {
          if (pick > 0.55) out.push({ key: pick > 0.82 ? 'pond-rocks' : 'pond-reeds', x, y, size: 36 });
          continue;
        }
      }
      // Sparse near the board, full density further out.
      const fade = Math.min(1, (d - CLEAR_SMALL) / FADE);
      const wooded = noise(gx / 5, gy / 5, 71) > 0.56;
      if (wooded && d >= CLEAR_TREE && pick < 0.1 + 0.5 * fade) {
        const t = r();
        out.push({
          key: t < 0.62 ? 'park-tree' : t < 0.8 ? 'orchard-apple' : 'scenery-shrubs',
          x,
          y,
          size: t < 0.8 ? 62 + r() * 14 : 44,
        });
      } else if (pick < 0.05 + 0.13 * fade) {
        const t = r();
        out.push({
          key:
            t < 0.45
              ? 'park-flowers'
              : t < 0.65
                ? 'scenery-shrubs'
                : t < 0.8
                  ? 'scenery-rocks'
                  : t < 0.92
                    ? 'scenery-sapling'
                    : 'scenery-mushrooms',
          x,
          y,
          size: t < 0.45 ? 34 : t < 0.65 ? 40 : 30,
        });
      }
    }
  scene.chunks.set(key, out);
  // Plans are small, but a long pan could collect many: keep the most recent.
  if (scene.chunks.size > 256) scene.chunks.delete(scene.chunks.keys().next().value!);
  return out;
}

/** Shrunk copies of the pictures, by key and pixel size (powers of two). */
const shrunk = new Map<string, HTMLCanvasElement>();

/**
 * The picture for `key` at about `px` pixels across: a copy shrunk in halves from the full
 * picture (smooth, without the shimmer of shrinking a big image in one go each frame).
 */
function spriteAt(key: PropKey, px: number): HTMLCanvasElement | null {
  const full = propCanvas(key, '#808080');
  if (!full) return null;
  let size = full.width;
  // The smallest halving that is still at least as big as it shows.
  while (size / 2 >= Math.max(16, px)) size /= 2;
  if (size >= full.width) return full;
  const ck = `${key}|${size}`;
  let cv = shrunk.get(ck);
  if (!cv) {
    let src: HTMLCanvasElement = full;
    for (let s = full.width / 2; s >= size; s /= 2) {
      const next = Object.assign(document.createElement('canvas'), {
        width: s,
        height: Math.round((s * full.height) / full.width),
      });
      const c = next.getContext('2d')!;
      c.imageSmoothingQuality = 'high';
      c.drawImage(src, 0, 0, next.width, next.height);
      src = next;
    }
    cv = src;
    shrunk.set(ck, cv);
  }
  return cv;
}

/**
 * Draw the river and the foliage between these world coordinates. `scale` is screen pixels per
 * world unit (picks the picture sizes); `portals` are the portal openings to keep clear.
 */
export function paintFoliage(
  ctx: CanvasRenderingContext2D,
  G: GameState,
  portals: { x: number; y: number }[],
  left: number,
  top: number,
  right: number,
  bottom: number,
  scale: number,
) {
  const scene = sceneFor(G, portals);
  const river = scene.river;
  if (river) {
    const reach = river.width / 2 + 120;
    // Only the visible stretch of the river, in short steps.
    const y0 = Math.floor(top / 40) * 40 - 40,
      y1 = bottom + 40;
    let near = false;
    for (let y = y0; y <= y1 && !near; y += 40) {
      const x = river.x(y);
      near = x > left - reach && x < right + reach;
    }
    if (near) {
      const path = new Path2D();
      for (let y = y0; y <= y1; y += 40) {
        const x = river.x(y);
        if (y === y0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = BANK;
      ctx.lineWidth = river.width + 18;
      ctx.stroke(path);
      ctx.strokeStyle = WATER;
      ctx.lineWidth = river.width;
      ctx.stroke(path);
      // Soft ripples: short broken highlights a little off the middle.
      ctx.strokeStyle = SHINE;
      ctx.lineWidth = 4;
      ctx.setLineDash([18, 70]);
      ctx.translate(-11, 0);
      ctx.stroke(path);
      ctx.setLineDash([12, 90]);
      ctx.translate(20, 35);
      ctx.stroke(path);
      ctx.restore();
    }
  }
  const pieces: Piece[] = [];
  const m = 50;
  for (let cy = Math.floor((top - m) / CHUNK); cy <= Math.floor((bottom + m) / CHUNK); cy++)
    for (let cx = Math.floor((left - m) / CHUNK); cx <= Math.floor((right + m) / CHUNK); cx++)
      for (const p of chunkPieces(scene, cx, cy))
        if (p.x > left - m && p.x < right + m && p.y > top - m && p.y < bottom + m) pieces.push(p);
  // Back to front, so lower pieces overlap the ones behind them.
  pieces.sort((a, b) => a.y - b.y);
  for (const p of pieces) {
    // Zoomed far out, the small pieces would be a few pixels across: leave them out (the trees
    // still show), which keeps a whole-board view from drawing hundreds of specks.
    if (p.size * scale < MIN_PIXELS) continue;
    const img = spriteAt(p.key, p.size * scale);
    if (img)
      ctx.drawImage(img, p.x - p.size / 2, p.y - p.size / 2, p.size, (p.size * img.height) / img.width);
  }
}
