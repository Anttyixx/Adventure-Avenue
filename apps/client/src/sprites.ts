/**
 * Player characters: the "Medieval townsfolk" pixel-art pack by Franuka (CC BY 4.0, see the
 * Credits screen). Each character has an idle and a walk sheet of 32 x 48 frames: 4 frames per
 * row, one row per facing (down, left, right, up). Call `loadCharacters()` once before drawing.
 */
import type { CharId } from '@aa/engine';

export const FRAME_W = 32;
export const FRAME_H = 48;
export const FRAMES = 4;

export const enum Facing {
  Down = 0,
  Left = 1,
  Right = 2,
  Up = 3,
}

export interface CharDef {
  id: CharId;
  name: string;
  /** Top row of the portrait crop (hats and heights differ). */
  face: number;
}

export const CHARACTERS: CharDef[] = [
  { id: 'farmer', name: 'Farmer', face: 15 },
  { id: 'fisherman', name: 'Fisherman', face: 14 },
  { id: 'blacksmith', name: 'Blacksmith', face: 16 },
  { id: 'merchant', name: 'Merchant', face: 16 },
  { id: 'alchemist', name: 'Alchemist', face: 13 },
  { id: 'barmaid', name: 'Barmaid', face: 14 },
  { id: 'bartender', name: 'Bartender', face: 16 },
  { id: 'kid01', name: 'Red Cap', face: 19 },
  { id: 'kid02', name: 'Blue Cap', face: 19 },
];

const sheetURLs = import.meta.glob<string>('./assets/townsfolk/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

interface Sheets {
  idle: HTMLImageElement;
  walk: HTMLImageElement;
}
const sheets = new Map<CharId, Sheets>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

let loading: Promise<void> | null = null;

/** Load every character sheet (safe to call more than once). */
export function loadCharacters(): Promise<void> {
  loading ??= Promise.all(
    CHARACTERS.map(async (c) => {
      const [idle, walk] = await Promise.all(
        (['idle', 'walk'] as const).map((k) => loadImage(sheetURLs[`./assets/townsfolk/${c.id}_${k}.png`])),
      );
      sheets.set(c.id, { idle, walk });
    }),
  ).then(() => undefined);
  return loading;
}

/**
 * The character for an id. Anything unknown (games saved before characters were picked, or
 * test seats) maps to a fixed character so it still draws.
 */
export function charDef(ch: unknown): CharDef {
  const hit = CHARACTERS.find((c) => c.id === ch);
  if (hit) return hit;
  const s = JSON.stringify(ch) ?? '';
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return CHARACTERS[n % CHARACTERS.length];
}

/** A random character not in `taken` (any character if all are taken). */
export function freeCharacter(taken: Iterable<unknown>, rand = Math.random): CharId {
  const used = new Set([...taken].map((t) => charDef(t).id));
  const free = CHARACTERS.filter((c) => !used.has(c.id));
  const pool = free.length ? free : CHARACTERS;
  return pool[Math.floor(rand() * pool.length)].id;
}

/** `n` different random characters. */
export function shuffledCharacters(n: number, rand = Math.random): CharId[] {
  const out: CharId[] = [];
  for (let i = 0; i < n; i++) out.push(freeCharacter(out, rand));
  return out;
}

/**
 * Draw one animation frame with its feet's center at (x, y): `scale` device pixels per art
 * pixel. Returns false if the sheets are not loaded yet.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  ch: unknown,
  walking: boolean,
  facing: Facing,
  frame: number,
  x: number,
  y: number,
  scale: number,
): boolean {
  const s = sheets.get(charDef(ch).id);
  if (!s) return false;
  const img = walking ? s.walk : s.idle;
  const f = ((frame % FRAMES) + FRAMES) % FRAMES;
  ctx.drawImage(
    img,
    f * FRAME_W,
    facing * FRAME_H,
    FRAME_W,
    FRAME_H,
    x - (FRAME_W * scale) / 2,
    y - FRAME_H * scale,
    FRAME_W * scale,
    FRAME_H * scale,
  );
  return true;
}

/** Art pixels of soft outline around a character, and the resolution it is built at. */
const GLOW_PAD = 4;
const GLOW_RES = 2;
const glows = new Map<string, HTMLCanvasElement>();

/** A soft dark outline in the shape of one frame (built once per frame, then cached). */
function glowFrame(img: HTMLImageElement, key: string, facing: Facing, f: number): HTMLCanvasElement {
  const hit = glows.get(key);
  if (hit) return hit;
  const W = (FRAME_W + GLOW_PAD * 2) * GLOW_RES;
  const H = (FRAME_H + GLOW_PAD * 2) * GLOW_RES;
  const sil = document.createElement('canvas');
  sil.width = W;
  sil.height = H;
  const sctx = sil.getContext('2d', { willReadFrequently: true })!;
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(
    img,
    f * FRAME_W,
    facing * FRAME_H,
    FRAME_W,
    FRAME_H,
    GLOW_PAD * GLOW_RES,
    GLOW_PAD * GLOW_RES,
    FRAME_W * GLOW_RES,
    FRAME_H * GLOW_RES,
  );
  // A solid black silhouette, leaving out the faint ground shadow drawn into the art.
  const data = sctx.getImageData(0, 0, W, H);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    px[i] = px[i + 1] = px[i + 2] = 0;
    px[i + 3] = px[i + 3] > 160 ? 255 : 0;
  }
  sctx.putImageData(data, 0, 0);
  // Stamp it around a disc, fainter further out, for an outline that fades away.
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const octx = out.getContext('2d')!;
  const R = (GLOW_PAD - 1) * GLOW_RES;
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > R) continue;
      octx.globalAlpha = 0.09 * (1 - d / (R + 1));
      octx.drawImage(sil, dx, dy);
    }
  glows.set(key, out);
  return out;
}

/**
 * Draw the soft dark outline for the frame `drawCharacter` would draw with the same arguments;
 * draw it first, so the character sits on top.
 */
export function drawCharacterGlow(
  ctx: CanvasRenderingContext2D,
  ch: unknown,
  walking: boolean,
  facing: Facing,
  frame: number,
  x: number,
  y: number,
  scale: number,
) {
  const def = charDef(ch);
  const s = sheets.get(def.id);
  if (!s) return;
  const f = ((frame % FRAMES) + FRAMES) % FRAMES;
  const glow = glowFrame(walking ? s.walk : s.idle, `${def.id}|${walking}|${facing}|${f}`, facing, f);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    glow,
    x - (FRAME_W / 2 + GLOW_PAD) * scale,
    y - (FRAME_H + GLOW_PAD) * scale,
    (FRAME_W + GLOW_PAD * 2) * scale,
    (FRAME_H + GLOW_PAD * 2) * scale,
  );
  ctx.restore();
}

/** Facing for a move by (dx, dy) on screen. */
export function facingFor(dx: number, dy: number): Facing {
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? Facing.Left : Facing.Right;
  return dy < 0 ? Facing.Up : Facing.Down;
}

/**
 * A portrait as a data URL, for player cards and lists: the whole head (hats included) near the
 * middle and the body fading out at the bottom, on a transparent background.
 */
export const PORTRAIT_SIZE = 44;
const portraits = new Map<string, string>();
export function portraitURL(ch: unknown, scale = 4): string {
  const def = charDef(ch);
  const key = `${def.id}|${scale}`;
  const hit = portraits.get(key);
  if (hit) return hit;
  const s = sheets.get(def.id);
  const cv = document.createElement('canvas');
  cv.width = cv.height = PORTRAIT_SIZE * scale;
  if (!s) return cv.toDataURL();
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  // A square a little wider than the frame, with the head near the middle and the body down to
  // the hips (clipped to the frame, so short characters just end sooner). The fade only covers
  // the bottom fifth, well below every head.
  const top = def.face - 12;
  const left = (PORTRAIT_SIZE - FRAME_W) / 2;
  const rows = Math.min(PORTRAIT_SIZE, FRAME_H - top);
  ctx.drawImage(s.idle, 0, top, FRAME_W, rows, left * scale, 0, FRAME_W * scale, rows * scale);
  const fade = ctx.createLinearGradient(0, cv.height * 0.8, 0, cv.height);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, cv.width, cv.height);
  const url = cv.toDataURL();
  portraits.set(key, url);
  return url;
}

/**
 * The whole character (first idle frame, facing down) trimmed to its drawn pixels, with no fade:
 * the player cards show the full body.
 */
const bodies = new Map<string, string>();
export function bodyURL(ch: unknown, scale = 4): string {
  const def = charDef(ch);
  const key = `${def.id}|${scale}`;
  const hit = bodies.get(key);
  if (hit) return hit;
  const s = sheets.get(def.id);
  const cv = document.createElement('canvas');
  if (!s) {
    cv.width = FRAME_W * scale;
    cv.height = FRAME_H * scale;
    return cv.toDataURL();
  }
  // Find the drawn pixels of the frame.
  const probe = document.createElement('canvas');
  probe.width = FRAME_W;
  probe.height = FRAME_H;
  const pc = probe.getContext('2d', { willReadFrequently: true })!;
  pc.drawImage(s.idle, 0, 0, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
  const px = pc.getImageData(0, 0, FRAME_W, FRAME_H).data;
  let x0 = FRAME_W,
    y0 = FRAME_H,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < FRAME_H; y++)
    for (let x = 0; x < FRAME_W; x++)
      if (px[(y * FRAME_W + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) [x0, y0, x1, y1] = [0, 0, FRAME_W - 1, FRAME_H - 1];
  const w = x1 - x0 + 1;
  const hgt = y1 - y0 + 1;
  cv.width = w * scale;
  cv.height = hgt * scale;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s.idle, x0, y0, w, hgt, 0, 0, w * scale, hgt * scale);
  const url = cv.toDataURL();
  bodies.set(key, url);
  return url;
}

/** The whole first idle frame (facing down) as a data URL, for the character picker. */
const fulls = new Map<string, string>();
export function characterURL(ch: unknown, scale = 3): string {
  const def = charDef(ch);
  const key = `${def.id}|${scale}`;
  const hit = fulls.get(key);
  if (hit) return hit;
  const s = sheets.get(def.id);
  const cv = document.createElement('canvas');
  cv.width = FRAME_W * scale;
  cv.height = FRAME_H * scale;
  if (!s) return cv.toDataURL();
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s.idle, 0, 0, FRAME_W, FRAME_H, 0, 0, FRAME_W * scale, FRAME_H * scale);
  const url = cv.toDataURL();
  fulls.set(key, url);
  return url;
}
