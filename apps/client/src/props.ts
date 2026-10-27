/**
 * Property art: shops, 3-Star Shops, plot buildings and the bank as images (assets/props). The
 * parts in the owner's color (grey when unowned) come from one of two places:
 * - a tint layer, `<name>-tint.png`: the same size as the image, holding only the parts to color,
 *   painted in grey. Each grey is colorized (its lightness kept) and drawn over the image;
 * - otherwise the image's own blue parts (windows, doors, awnings, signs) are recolored.
 * Call `loadProps()` once before drawing; until then callers fall back to the vector art.
 */

export type PropKey =
  | `shop${0 | 1 | 2 | 3 | 4}`
  | `star${0 | 1 | 2}`
  | `circus${0 | 1 | 2 | 3}`
  | 'checkpoint'
  | 'balloon'
  | 'tax'
  | 'home'
  | 'agency'
  | 'bank';

const urls = import.meta.glob<string>('./assets/props/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

interface Source {
  data: ImageData;
  /** Which pixels are the blue accent color. */
  blue: Uint8Array;
}
const sources = new Map<string, Source>();
/** Tint layers by image name (see the top of the file). */
const tintLayers = new Map<string, ImageData>();
let loading: Promise<void> | null = null;

/** Load every property image (safe to call more than once). */
export function loadProps(): Promise<void> {
  loading ??= Promise.all(
    Object.entries(urls).map(async ([path, url]) => {
      const key = path.replace(/^.*\//, '').replace('.png', '');
      const img = new Image();
      img.src = url;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, cv.width, cv.height);
      if (key.endsWith('-tint')) {
        tintLayers.set(key.slice(0, -5), data);
        return;
      }
      const px = data.data;
      const blue = new Uint8Array(cv.width * cv.height);
      for (let i = 0; i < blue.length; i++) {
        const [r, g, b] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
        blue[i] = b > r + 40 && b > g + 12 ? 1 : 0;
      }
      sources.set(key, { data, blue });
    }),
  ).then(() => undefined);
  return loading;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** The lightness of the art's own blue, so recolored parts keep their shading. */
const BLUE_L = 0.55;
/** The middle grey of a tint layer: it becomes exactly the player's color. */
const TINT_L = 0.5;
const tinted = new Map<string, HTMLCanvasElement>();

/** A property image with its blue parts in `color` (cached per color). */
export function propCanvas(key: PropKey, color: string): HTMLCanvasElement | null {
  const ck = `${key}|${color}`;
  const hit = tinted.get(ck);
  if (hit) return hit;
  const src = sources.get(key);
  if (!src) return null;
  const n = parseInt(color.slice(1), 16);
  const [th, ts, tl] = rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
  const out = new ImageData(new Uint8ClampedArray(src.data.data), src.data.width, src.data.height);
  const px = out.data;
  const layer = tintLayers.get(key);
  if (layer) {
    // Colorize the grey layer and draw it over the image.
    const tp = layer.data;
    for (let i = 0; i < tp.length; i += 4) {
      const a = tp[i + 3] / 255;
      if (!a) continue;
      const [, , l] = rgbToHsl(tp[i], tp[i + 1], tp[i + 2]);
      const c = hslToRgb(th, ts, Math.max(0, Math.min(1, l - TINT_L + tl)));
      // Near-white details (stars, highlights) stay white.
      const keep = Math.max(0, Math.min(1, (l - 0.8) / 0.15));
      for (let k = 0; k < 3; k++) c[k] += (tp[i + k] - c[k]) * keep;
      const under = px[i + 3] / 255;
      const outA = a + under * (1 - a);
      for (let k = 0; k < 3; k++) px[i + k] = (c[k] * a + px[i + k] * under * (1 - a)) / outA;
      px[i + 3] = outA * 255;
    }
  } else {
    for (let i = 0; i < src.blue.length; i++) {
      if (!src.blue[i]) continue;
      const [, , l] = rgbToHsl(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
      const [r, g, b] = hslToRgb(th, ts, Math.max(0, Math.min(1, l - BLUE_L + tl)));
      px[i * 4] = r;
      px[i * 4 + 1] = g;
      px[i * 4 + 2] = b;
    }
  }
  const cv = document.createElement('canvas');
  cv.width = out.width;
  cv.height = out.height;
  cv.getContext('2d')!.putImageData(out, 0, 0);
  tinted.set(ck, cv);
  return cv;
}

const iconURLs = new Map<string, string>();

/** A property image as a data URL for buttons (recolored like on the board). */
export function propIconURL(key: PropKey, color: string): string {
  const ck = `${key}|${color}`;
  let url = iconURLs.get(ck);
  if (!url) {
    url = propCanvas(key, color)?.toDataURL() ?? '';
    if (url) iconURLs.set(ck, url);
  }
  return url;
}

/** Property images fill this much of their box (bottom-aligned), leaving a little room. */
const PROP_SCALE = 0.9;

/**
 * Draw a property image fitted into a `w` x `h` box centered on (x, y), its bottom on the box's
 * bottom edge. Returns false if the images are not loaded yet.
 */
export function drawProp(
  ctx: CanvasRenderingContext2D,
  key: PropKey,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  const cv = propCanvas(key, color);
  if (!cv) return false;
  const k = Math.min(w / cv.width, h / cv.height) * PROP_SCALE;
  const dw = cv.width * k;
  const dh = cv.height * k;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cv, x - dw / 2, y + h / 2 - dh, dw, dh);
  ctx.restore();
  return true;
}
