/**
 * Shared rules for the cached background chunks (the meadow in `meadow.ts`, the parks and ponds in
 * `town-terrain-art.ts`). Building a chunk is slow, so a live view builds at most a few per frame
 * and shows an already-built chunk at the other resolution meanwhile; without this, a zoom that
 * crosses a resolution step rebuilt every visible chunk in one frame and the camera stuttered.
 */

/** How many chunks may still be built in this frame. Live views set it per frame; still pictures leave it unlimited. */
export const chunkBudget = { left: Infinity };

/** The chunk resolutions, in pixels per world unit. */
export const CHUNK_LEVELS = [0.5, 1, 2] as const;

/**
 * The chunk resolution for a canvas scale: half for far-out views, 2x only once the background is
 * clearly magnified, so a whole-board view (many chunks on screen) stays small and fits the cache.
 */
export function chunkLevel(scale: number): (typeof CHUNK_LEVELS)[number] {
  return scale <= 0.5 ? 0.5 : scale >= 1.5 ? 2 : 1;
}

/** Look a chunk up and mark it as just used (Maps keep insertion order: oldest first). */
export function touchChunk<T>(cache: Map<string, T>, key: string): T | undefined {
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

/**
 * Drop the oldest chunks over `limit`, but never the `keep` most recent ones (the chunks drawn
 * this frame), so a view showing many chunks never throws away what it is about to draw again.
 */
export function trimChunks<T>(cache: Map<string, T>, limit: number, keep: number, drop?: (v: T) => void) {
  while (cache.size > Math.max(limit, keep)) {
    const first = cache.keys().next().value!;
    drop?.(cache.get(first)!);
    cache.delete(first);
  }
}
