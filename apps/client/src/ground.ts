/**
 * The live board's ground (meadow, parks, ponds and courtyards) baked into one cached picture per
 * world chunk. Without this, every frame painted the meadow chunks, then the terrain chunks over
 * them, then a solid fill under both: three full-screen layers. Now a frame draws one opaque layer,
 * and the meadow and terrain painters only run when a ground chunk is built.
 *
 * Building a chunk is the slow part, so (like `chunk-budget.ts`) a live view builds at most
 * `chunkBudget.left` per frame and shows the same chunk at another resolution meanwhile. When no
 * resolution of a chunk exists yet, it is built at the smallest one, which is quick. `warmGround`
 * builds chunks ahead of time while the browser is idle, so zooming finds them ready.
 */
import { CHUNK_LEVELS, chunkBudget, chunkLevel } from './chunk-budget';

/** World units per ground chunk (the terrain's own chunk size, so each maps to exactly one). */
export const GROUND_WORLD = 800;
/** Memory for one board's ground chunks; the oldest ones not drawn this frame go first. */
const MAX_BYTES = 96 * 1024 * 1024;
/** The color under the chunks: it shows only at a chunk's edge for a pixel at odd zooms. */
const UNDER = '#97b96f';

/** Paints the ground between world coordinates, at whatever transform the context already has. */
export type GroundPainter = (
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  right: number,
  bottom: number,
) => void;

interface GroundCache {
  chunks: Map<string, HTMLCanvasElement>;
  bytes: number;
}
const caches = new WeakMap<object, GroundCache>();

function cacheFor(owner: object): GroundCache {
  let cache = caches.get(owner);
  if (!cache) {
    cache = { chunks: new Map(), bytes: 0 };
    caches.set(owner, cache);
  }
  return cache;
}

const keyOf = (x: number, y: number, level: number) => `${x},${y},${level}`;

function build(cache: GroundCache, paint: GroundPainter, x: number, y: number, level: number) {
  const pixels = GROUND_WORLD * level;
  const cv = Object.assign(document.createElement('canvas'), { width: pixels, height: pixels });
  const ctx = cv.getContext('2d')!;
  const left = x * GROUND_WORLD,
    top = y * GROUND_WORLD;
  ctx.setTransform(level, 0, 0, level, -left * level, -top * level);
  // The painters' own caches build whatever this one chunk needs, all at once.
  const left0 = chunkBudget.left;
  chunkBudget.left = Infinity;
  paint(ctx, left, top, left + GROUND_WORLD, top + GROUND_WORLD);
  chunkBudget.left = left0;
  cache.chunks.set(keyOf(x, y, level), cv);
  cache.bytes += pixels * pixels * 4;
  return cv;
}

/** Look a chunk up and mark it as just used (Maps keep insertion order: oldest first). */
function touch(cache: GroundCache, key: string) {
  const hit = cache.chunks.get(key);
  if (hit) {
    cache.chunks.delete(key);
    cache.chunks.set(key, hit);
  }
  return hit;
}

/** Drop the oldest chunks over the memory budget, but never one of the `keep` drawn this frame. */
function trim(cache: GroundCache, keep: number) {
  while (cache.bytes > MAX_BYTES && cache.chunks.size > keep) {
    const [key, cv] = cache.chunks.entries().next().value!;
    cache.chunks.delete(key);
    cache.bytes -= cv.width * cv.height * 4;
  }
}

/**
 * Draw the ground over the visible world rectangle, from cached chunks. `owner` keys the cache
 * (the game state, or any fixed object for views without one).
 */
export function paintGround(
  ctx: CanvasRenderingContext2D,
  owner: object,
  paint: GroundPainter,
  left: number,
  top: number,
  right: number,
  bottom: number,
) {
  const t = ctx.getTransform();
  const level = chunkLevel(Math.hypot(t.a, t.b));
  // Stand-ins: the sharper resolutions first, then the softer ones.
  const others = [...CHUNK_LEVELS].filter((l) => l !== level).sort((a, b) => b - a);
  const cache = cacheFor(owner);
  ctx.fillStyle = UNDER;
  ctx.fillRect(left, top, right - left, bottom - top);
  let drawn = 0;
  for (let y = Math.floor(top / GROUND_WORLD); y < Math.ceil(bottom / GROUND_WORLD); y++)
    for (let x = Math.floor(left / GROUND_WORLD); x < Math.ceil(right / GROUND_WORLD); x++) {
      let cv = touch(cache, keyOf(x, y, level));
      if (!cv && chunkBudget.left > 0) {
        cv = build(cache, paint, x, y, level);
        chunkBudget.left--;
      }
      for (const l of others) cv ??= touch(cache, keyOf(x, y, l));
      // Nothing to stand in: the smallest resolution is quick to build.
      cv ??= build(cache, paint, x, y, CHUNK_LEVELS[0]);
      drawn++;
      ctx.drawImage(cv, x * GROUND_WORLD, y * GROUND_WORLD, GROUND_WORLD, GROUND_WORLD);
    }
  trim(cache, drawn);
}

/**
 * Build one missing chunk of the rectangle at `level`, for idle time. Returns false once the
 * whole rectangle is built (or the memory budget is nearly used, so warming would evict chunks).
 */
export function warmGround(
  owner: object,
  paint: GroundPainter,
  level: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): boolean {
  const cache = cacheFor(owner);
  const size = (GROUND_WORLD * level) ** 2 * 4;
  if (cache.bytes + size > MAX_BYTES * 0.75) return false;
  for (let y = Math.floor(top / GROUND_WORLD); y < Math.ceil(bottom / GROUND_WORLD); y++)
    for (let x = Math.floor(left / GROUND_WORLD); x < Math.ceil(right / GROUND_WORLD); x++) {
      if (cache.chunks.has(keyOf(x, y, level))) continue;
      build(cache, paint, x, y, level);
      return true;
    }
  return false;
}
