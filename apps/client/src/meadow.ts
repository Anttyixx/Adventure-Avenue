/** Softly blended, coordinate-seeded grass patches: no mirrored or repeating world tile. */
import { landscapeRandom } from './scenery';

const WORLD = 768;
const PATCHES = 3;
const LIMIT = 256;
interface MeadowCache {
  pixels: number;
  chunks: Map<string, HTMLCanvasElement>;
  masks: HTMLCanvasElement[] | null;
}
const caches = new WeakMap<HTMLCanvasElement, Map<string, MeadowCache>>();
const canvas = (size: number) =>
  Object.assign(document.createElement('canvas'), { width: size, height: size });

function weights(PATCH_PIXELS: number) {
  return Array.from({ length: 4 }, (_, corner) => {
    const cv = canvas(PATCH_PIXELS);
    const ctx = cv.getContext('2d')!;
    const image = ctx.createImageData(PATCH_PIXELS, PATCH_PIXELS);
    const smooth = (t: number) => t * t * (3 - 2 * t);
    for (let y = 0; y < PATCH_PIXELS; y++) {
      const v = smooth((y + 0.5) / PATCH_PIXELS);
      for (let x = 0; x < PATCH_PIXELS; x++) {
        const u = smooth((x + 0.5) / PATCH_PIXELS);
        image.data[(y * PATCH_PIXELS + x) * 4 + 3] =
          255 * (corner & 1 ? u : 1 - u) * (corner & 2 ? v : 1 - v);
      }
    }
    ctx.putImageData(image, 0, 0);
    return cv;
  });
}

function chunk(source: HTMLCanvasElement, x: number, y: number, park: boolean, cache: MeadowCache) {
  const PIXELS = cache.pixels,
    PATCH_PIXELS = PIXELS / PATCHES,
    chunks = cache.chunks;
  const key = `${x},${y}`;
  const saved = chunks.get(key);
  if (saved) {
    chunks.delete(key);
    chunks.set(key, saved);
    return saved;
  }
  const masks = (cache.masks ??= weights(PATCH_PIXELS));
  const cv = canvas(PIXELS);
  const ctx = cv.getContext('2d')!;
  const layer = canvas(PATCH_PIXELS);
  const lctx = layer.getContext('2d')!;
  // Only use the original quarter of the asset, avoiding its mirrored seams altogether.
  const quarter = Math.min(source.width, source.height) / 2;
  for (let py = 0; py < PATCHES; py++) {
    for (let px = 0; px < PATCHES; px++) {
      for (let corner = 0; corner < 4; corner++) {
        const dx = corner & 1;
        const dy = corner >> 1;
        const r = landscapeRandom(x * PATCHES + px + dx, y * PATCHES + py + dy);
        const size = quarter * (0.66 + r() * 0.34);
        const sx = r() * (quarter - size);
        const sy = r() * (quarter - size);
        lctx.clearRect(0, 0, PATCH_PIXELS, PATCH_PIXELS);
        lctx.save();
        lctx.translate(dx * PATCH_PIXELS, dy * PATCH_PIXELS);
        // Keep grass blades upright; horizontal flips and varied crops supply the variation.
        lctx.scale(r() < 0.5 ? -1 : 1, 1);
        if (park) lctx.filter = 'saturate(0.65)';
        lctx.drawImage(
          source,
          sx,
          sy,
          size,
          size,
          -PATCH_PIXELS,
          -PATCH_PIXELS,
          PATCH_PIXELS * 2,
          PATCH_PIXELS * 2,
        );
        lctx.restore();
        lctx.globalCompositeOperation = 'destination-in';
        lctx.drawImage(masks[corner], 0, 0);
        lctx.globalCompositeOperation = 'source-over';
        // Add complementary weights instead of stacking translucent patches (which leaves seams).
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(layer, px * PATCH_PIXELS, py * PATCH_PIXELS);
      }
    }
  }
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#97b96f';
  ctx.fillRect(0, 0, PIXELS, PIXELS);
  if (park) paintTones(ctx, x, y, PIXELS);
  chunks.set(key, cv);
  while (chunks.size > LIMIT || chunks.size * PIXELS * PIXELS * 4 > 96 * 1024 * 1024)
    chunks.delete(chunks.keys().next().value!);
  return cv;
}

/** Broad sun-dried clearings and cool woodland shade, shared across chunk edges. */
function paintTones(ctx: CanvasRenderingContext2D, x: number, y: number, PIXELS: number) {
  ctx.save();
  ctx.setTransform(PIXELS / WORLD, 0, 0, PIXELS / WORLD, -x * PIXELS, -y * PIXELS);
  ctx.globalCompositeOperation = 'source-over';
  const step = 600;
  for (
    let gy = Math.floor((y * WORLD - 1400) / step);
    gy <= Math.ceil(((y + 1) * WORLD + 800) / step);
    gy++
  ) {
    for (
      let gx = Math.floor((x * WORLD - 1400) / step);
      gx <= Math.ceil(((x + 1) * WORLD + 800) / step);
      gx++
    ) {
      const r = landscapeRandom(gx - 101, gy + 337);
      const px = gx * step + r() * step,
        py = gy * step + r() * step;
      const radius = 260 + r() * 260;
      const kind = r();
      const color = kind < 0.34 ? '191,164,111' : kind < 0.68 ? '56,99,76' : '208,199,143';
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(r() * Math.PI);
      ctx.scale(1.35, 0.75);
      const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      shade.addColorStop(0, `rgba(${color},0.48)`);
      shade.addColorStop(0.45, `rgba(${color},0.25)`);
      shade.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = shade;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Draw only visible cached meadow chunks, keeping the landscape fixed while panning/zooming. */
export function paintMeadow(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  left: number,
  top: number,
  right: number,
  bottom: number,
  park = false,
) {
  const transform = ctx.getTransform();
  const pixels =
    WORLD *
    (Math.hypot(transform.a, transform.b) <= 0.5
      ? 0.5
      : Math.min(2, Math.ceil(Math.hypot(transform.a, transform.b))));
  let levels = caches.get(source);
  if (!levels) {
    levels = new Map();
    caches.set(source, levels);
  }
  const key = `${pixels},${park}`;
  let cache = levels.get(key);
  if (!cache) {
    cache = { pixels, chunks: new Map(), masks: null };
    levels.set(key, cache);
  }
  ctx.fillStyle = '#97b96f';
  ctx.fillRect(left, top, right - left, bottom - top);
  for (let y = Math.floor(top / WORLD); y < Math.ceil(bottom / WORLD); y++) {
    for (let x = Math.floor(left / WORLD); x < Math.ceil(right / WORLD); x++) {
      ctx.drawImage(chunk(source, x, y, park, cache), x * WORLD, y * WORLD, WORLD, WORLD);
    }
  }
  // Retain useful zoom levels without keeping several full-resolution meadow caches forever.
  levels.delete(key);
  levels.set(key, cache);
  const bytes = () => [...levels.values()].reduce((n, l) => n + l.chunks.size * l.pixels * l.pixels * 4, 0);
  while (levels.size > 1 && bytes() > 128 * 1024 * 1024) levels.delete(levels.keys().next().value!);
}
