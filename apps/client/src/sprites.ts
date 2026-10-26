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

/** Facing for a move by (dx, dy) on screen. */
export function facingFor(dx: number, dy: number): Facing {
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? Facing.Left : Facing.Right;
  return dy < 0 ? Facing.Up : Facing.Down;
}

/** A head-and-shoulders portrait as a data URL, for player cards and lists. */
const portraits = new Map<string, string>();
export function portraitURL(ch: unknown, scale = 4): string {
  const def = charDef(ch);
  const key = `${def.id}|${scale}`;
  const hit = portraits.get(key);
  if (hit) return hit;
  const s = sheets.get(def.id);
  // 4:3 like the portrait frames in the interface.
  const W = 28;
  const H = 21;
  const cv = document.createElement('canvas');
  cv.width = W * scale;
  cv.height = H * scale;
  if (!s) return cv.toDataURL();
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s.idle, (FRAME_W - W) / 2, def.face, W, H, 0, 0, W * scale, H * scale);
  const url = cv.toDataURL();
  portraits.set(key, url);
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
