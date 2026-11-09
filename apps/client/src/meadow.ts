/** Softly blended, coordinate-seeded grass patches: no mirrored or repeating world tile. */
import { landscapeRandom } from './scenery';

const WORLD = 768;
const PIXELS = 384;
const PATCHES = 3;
const PATCH_PIXELS = PIXELS / PATCHES;
const LIMIT = 96;
const chunks = new Map<string, HTMLCanvasElement>();
let sourceImage: HTMLCanvasElement | null = null;
let masks: HTMLCanvasElement[] | null = null;

const canvas = (size = PIXELS) =>
  Object.assign(document.createElement('canvas'), { width: size, height: size });

function weights() {
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

function chunk(source: HTMLCanvasElement, x: number, y: number) {
  const key = `${x},${y}`;
  const saved = chunks.get(key);
  if (saved) {
    chunks.delete(key);
    chunks.set(key, saved);
    return saved;
  }
  masks ??= weights();
  const cv = canvas();
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
        lctx.rotate((Math.floor(r() * 4) * Math.PI) / 2);
        lctx.scale(r() < 0.5 ? -1 : 1, 1);
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
  chunks.set(key, cv);
  if (chunks.size > LIMIT) chunks.delete(chunks.keys().next().value!);
  return cv;
}

/** Draw only visible cached meadow chunks, keeping the landscape fixed while panning/zooming. */
export function paintMeadow(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  left: number,
  top: number,
  right: number,
  bottom: number,
) {
  if (source !== sourceImage) {
    chunks.clear();
    sourceImage = source;
  }
  ctx.fillStyle = '#97b96f';
  ctx.fillRect(left, top, right - left, bottom - top);
  for (let y = Math.floor(top / WORLD); y < Math.ceil(bottom / WORLD); y++) {
    for (let x = Math.floor(left / WORLD); x < Math.ceil(right / WORLD); x++) {
      ctx.drawImage(chunk(source, x, y), x * WORLD, y * WORLD, WORLD, WORLD);
    }
  }
}
