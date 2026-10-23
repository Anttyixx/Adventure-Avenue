/**
 * Generated pixel-art characters: 12 x 14 sprites with two walk frames, built from a head
 * style, hair color, skin tone and accent color. The body uses the player's color.
 */
import type { CharLook } from '@aa/engine';

export const SPRITE_W = 12;
export const SPRITE_H = 14;

export const HAIR = ['#2b1d14', '#6b3e1f', '#c98a3a', '#e8d27a', '#b23a3a', '#5a5f8a'];
export const SKIN = ['#f6d3b3', '#e8b48c', '#c98d62', '#9a6440', '#6e4428'];
export const ACCENT = ['#ffffff', '#ff8fb1', '#7fd1ff', '#ffd166', '#9be37d', '#c49bff'];
export const HEAD_STYLES = 6;

// h = hair, s = skin, e = eye, m = mouth, a = accent
const HEADS: string[][] = [
  [
    '...hhhhhh...',
    '..hhhhhhhh..',
    '..hssssssh..',
    '..ssessess..',
    '..ssssssss..',
    '...ssmmss...',
    '....ssss....',
  ],
  [
    '..h.hh.h.h..',
    '..hhhhhhhh..',
    '..hssssssh..',
    '..ssessess..',
    '..ssssssss..',
    '...ssmmss...',
    '....ssss....',
  ],
  [
    '...aaaaaa...',
    '..aaaaaaaaa.',
    '..hssssssh..',
    '..ssessess..',
    '..ssssssss..',
    '...ssmmss...',
    '....ssss....',
  ],
  [
    '...hhhhhh...',
    '..hhhhhhhh..',
    '.hhsssssshh.',
    '.hssessessh.',
    '.hssssssssh.',
    '.h.ssmmss.h.',
    '....ssss....',
  ],
  [
    '.....hh.....',
    '..hhhhhhhh..',
    '..hssssssh..',
    '..ssessess..',
    '..ssssssss..',
    '...ssmmss...',
    '....ssss....',
  ],
  [
    '...hhhhhh...',
    '..aaaaaaaa..',
    '..hssssssh..',
    '..ssessess..',
    '..ssssssss..',
    '...ssmmss...',
    '....ssss....',
  ],
];
const BODY = ['..cccccccc..', '.cccccccccc.', '.sccccccccs.', '..aaaaaaaa..', '..pppppppp..'];
const LEGS = [
  ['..pp....pp..', '..kk....kk..'],
  ['...pp..pp...', '...kk..kk...'],
];

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(v * f))),
  );
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const cache = new Map<string, HTMLCanvasElement[]>();

/** Two walk frames for a character look in the given body color. */
export function spriteFrames(ch: CharLook, body: string): HTMLCanvasElement[] {
  const key = `${ch.head}|${ch.hair}|${ch.skin}|${ch.accent}|${body}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const skin = SKIN[ch.skin % SKIN.length];
  const colors: Record<string, string> = {
    h: HAIR[ch.hair % HAIR.length],
    s: skin,
    e: '#1d1d2b',
    m: shade(skin, 0.75),
    a: ACCENT[ch.accent % ACCENT.length],
    c: body,
    p: '#2b2d42',
    k: '#3b2a20',
  };
  const frames = LEGS.map((legs) => {
    const rows = [...HEADS[ch.head % HEADS.length], ...BODY, ...legs];
    const cv = document.createElement('canvas');
    cv.width = SPRITE_W;
    cv.height = SPRITE_H;
    const ctx = cv.getContext('2d')!;
    rows.forEach((row, y) => {
      for (let x = 0; x < SPRITE_W; x++) {
        const c = colors[row[x]];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    });
    return cv;
  });
  cache.set(key, frames);
  return frames;
}

/** A small head-and-shoulders portrait as a data URL, for player cards. */
const portraits = new Map<string, string>();
export function portraitURL(ch: CharLook, body: string, scale = 4): string {
  const key = `${ch.head}|${ch.hair}|${ch.skin}|${ch.accent}|${body}|${scale}`;
  const hit = portraits.get(key);
  if (hit) return hit;
  const [frame] = spriteFrames(ch, body);
  const cv = document.createElement('canvas');
  cv.width = SPRITE_W * scale;
  cv.height = 9 * scale;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, 0, 0, SPRITE_W, 9, 0, 0, SPRITE_W * scale, 9 * scale);
  const url = cv.toDataURL();
  portraits.set(key, url);
  return url;
}

export function randomLook(rand = Math.random): CharLook {
  return {
    head: Math.floor(rand() * HEAD_STYLES),
    hair: Math.floor(rand() * HAIR.length),
    skin: Math.floor(rand() * SKIN.length),
    accent: Math.floor(rand() * ACCENT.length),
  };
}
