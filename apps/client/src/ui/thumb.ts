/**
 * Small schematic picture of a board, for the board picker, the board collection and saved-board
 * lists. Not the tiles' full art, but enough to tell them apart at a glance: properties are light
 * tiles outlined in their district's color, the bank is a gold tile with a B, suits show their
 * symbol in their color, venture squares a purple ?, and every other special square a simple mark
 * of its own (`TILE_LOOK`). `thumbKey` lists what a board has, for a key beside the picture.
 */
import type { BoardDef, BoardLayout } from '@aa/engine';
import { boardForPlay } from '../boardstore';
import { cellCenter, tileShape, worldSize } from '../geometry';
import { h } from './dom';

/** The light face of property tiles and most marked tiles. */
const FACE = '#fffaf0';

/** How a tile type looks: its fill, then a letter or symbol (`mark`) or a small drawing. */
interface TileLook {
  /** The name in the key. */
  name: string;
  fill: string;
  /** A letter or symbol drawn in the middle, in `ink`. */
  mark?: string;
  ink?: string;
  /** Drawn instead of a mark (centered on 0,0, `r` = half the tile). */
  draw?: (ctx: CanvasRenderingContext2D, r: number) => void;
}

const dot = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
};

/** A four-pointed star (Warp). */
function star4(ctx: CanvasRenderingContext2D, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const d = i % 2 ? r * 0.28 : r * 0.78;
    ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fill();
}

/** Every tile type but properties (they take their district's color). Colors follow the tiles' art. */
const TILE_LOOK: Record<string, TileLook> = {
  bank: { name: 'Bank', fill: '#ffd23f', mark: 'B', ink: '#5a3d00' },
  venture: { name: 'Venture card', fill: '#7b4bd6', mark: '?', ink: '#ffffff' },
  spade: { name: 'Spade', fill: FACE, mark: '♠', ink: '#2f6fe0' },
  heart: { name: 'Heart', fill: FACE, mark: '♥', ink: '#e5484d' },
  diamond: { name: 'Diamond', fill: FACE, mark: '♦', ink: '#e8a300' },
  club: { name: 'Club', fill: FACE, mark: '♣', ink: '#2f9e57' },
  change: { name: 'Change suit', fill: '#d9dde8', mark: '↻', ink: '#3b4566' },
  randomSuit: {
    name: 'Random suit',
    fill: FACE,
    // The four suit colors in a square.
    draw: (ctx, r) => {
      const d = r * 0.34;
      const s = r * 0.24;
      dot(ctx, -d, -d, s, '#2f6fe0');
      dot(ctx, d, -d, s, '#e5484d');
      dot(ctx, -d, d, s, '#e8a300');
      dot(ctx, d, d, s, '#2f9e57');
    },
  },
  jackpot: {
    name: 'Jackpot',
    fill: '#ffe9a8',
    // A gold coin.
    draw: (ctx, r) => {
      dot(ctx, 0, 0, r * 0.62, '#c98a12');
      dot(ctx, 0, 0, r * 0.48, '#ffd23f');
    },
  },
  gain: { name: 'Gain 10G', fill: '#3e7bfa', mark: '+', ink: '#ffffff' },
  loss: { name: 'Lose 10G', fill: '#e5484d', mark: '−', ink: '#ffffff' },
  roll: {
    name: 'Roll on',
    fill: FACE,
    // Two die pips.
    draw: (ctx, r) => {
      dot(ctx, -r * 0.3, -r * 0.3, r * 0.17, '#1d2a4a');
      dot(ctx, r * 0.3, r * 0.3, r * 0.17, '#1d2a4a');
    },
  },
  break: { name: 'Take a break', fill: '#c9b9a4', mark: 'Z', ink: '#4a3524' },
  boon: { name: 'Boon', fill: '#35b46a', mark: '%', ink: '#ffffff' },
  boom: { name: 'Boom', fill: '#e2569b', mark: '%', ink: '#ffffff' },
  broker: { name: 'Stock broker', fill: FACE, mark: '▲', ink: '#2f9e57' },
  portal: {
    name: 'Portal',
    fill: '#2a2550',
    // A swirling ring.
    draw: (ctx, r) => {
      ctx.strokeStyle = '#b48cff';
      ctx.lineWidth = Math.max(1, r * 0.22);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    },
  },
  warp: { name: 'Warp', fill: '#d8f3ff', draw: (ctx, r) => star4(ctx, r, '#1f9fd6') },
  arcade: { name: 'Arcade', fill: '#e85d75', mark: 'A', ink: '#ffffff' },
  cannon: { name: 'Cannon', fill: '#55607a', mark: 'C', ink: '#ffffff' },
  hike: { name: 'Price Up', fill: '#ffb547', mark: '↑', ink: '#5a3000' },
  taxi: { name: 'Taxi', fill: '#f5c518', mark: 'T', ink: '#2a2a2a' },
  swap: { name: 'Swap', fill: '#4cc3c9', mark: 'S', ink: '#0f3b3d' },
  blank: { name: 'Blank', fill: 'transparent' },
};

/** The key's order: properties first, then the squares players meet most. */
const KEY_ORDER = [
  'shop',
  'plot',
  'bank',
  'venture',
  'spade',
  'heart',
  'diamond',
  'club',
  'change',
  'randomSuit',
  'jackpot',
  'gain',
  'loss',
  'roll',
  'break',
  'boon',
  'boom',
  'broker',
  'arcade',
  'warp',
  'portal',
  'taxi',
  'cannon',
  'swap',
  'hike',
];

/**
 * Draw one tile of a picture: `t` its type, `color` its district color (properties), centered on
 * (cx, cy), `s` wide. The letter or drawing is left out when the tile is too small to read.
 */
function drawTile(
  ctx: CanvasRenderingContext2D,
  layout: BoardLayout | undefined,
  t: string,
  color: string | null,
  cx: number,
  cy: number,
  s: number,
) {
  const r = s / 2;
  const round = Math.max(1, s * 0.2);
  if (t === 'shop' || t === 'plot') {
    // A light tile with a thick outline in the district's color (dashed for a vacant plot, grey
    // for a property with no district yet).
    const line = Math.max(1.5, s * 0.17);
    tileShape(ctx, layout, cx, cy, r - line / 2, round);
    ctx.fillStyle = FACE;
    ctx.fill();
    ctx.strokeStyle = color ?? '#9aa3b8';
    ctx.lineWidth = line;
    if (t === 'plot' || !color) ctx.setLineDash([Math.max(2, s * 0.22), Math.max(1.5, s * 0.14)]);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  const look = TILE_LOOK[t];
  if (!look) {
    tileShape(ctx, layout, cx, cy, r, round);
    ctx.fillStyle = FACE;
    ctx.fill();
    return;
  }
  if (t === 'blank') {
    tileShape(ctx, layout, cx, cy, r - 1, round);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  tileShape(ctx, layout, cx, cy, r, round);
  ctx.fillStyle = look.fill;
  ctx.fill();
  // A thin dark edge keeps light tiles apart from the road.
  ctx.strokeStyle = 'rgba(29, 42, 74, 0.28)';
  ctx.lineWidth = Math.max(0.75, s * 0.05);
  ctx.stroke();
  if (s < 9) return;
  ctx.save();
  ctx.translate(cx, cy);
  if (look.draw) look.draw(ctx, r);
  else if (look.mark) {
    ctx.fillStyle = look.ink ?? '#1d2a4a';
    // Suit symbols and arrows read better a little bigger than letters.
    const big = /[♠♥♦♣↻↑▲]/.test(look.mark);
    ctx.font = `${Math.round(s * (big ? 0.78 : 0.62))}px "Lilita One", "Atkinson Hyperlegible", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(look.mark, 0, s * 0.04);
  }
  ctx.restore();
}

export function boardThumb(full: BoardDef, maxW = 220, maxH = 130): HTMLCanvasElement {
  // Builder boards sit on a large editing grid: picture only the part with tiles.
  const board = boardForPlay(full);
  const cell = Math.max(
    4,
    Math.min(Math.floor(maxW / (board.cols + 1)), Math.floor(maxH / (board.rows + 1))),
  );
  const pad = cell / 2;
  const k = cell / 100;
  const world = worldSize(board);
  const W = (world.w - 100) * k + pad * 2;
  const H = (world.h - 100) * k + pad * 2;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.className = 'thumb';
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#7fc25a';
  ctx.fillRect(0, 0, W, H);
  const pos = (s: { x: number; y: number }) => {
    const c = cellCenter(board.layout, s.x, s.y);
    return { x: pad + (c.x - 50) * k, y: pad + (c.y - 50) * k };
  };
  ctx.strokeStyle = '#efe0b6';
  ctx.lineWidth = Math.max(2, cell * 0.35);
  ctx.lineCap = 'round';
  for (const [a, b] of board.edges) {
    const p = board.squares[a];
    const q = board.squares[b];
    if (!p || !q) continue;
    ctx.beginPath();
    ctx.moveTo(pos(p).x, pos(p).y);
    ctx.lineTo(pos(q).x, pos(q).y);
    ctx.stroke();
  }
  // A little bigger than before, now that tiles carry a mark.
  const s = cell * 0.84;
  for (const sq of board.squares) {
    const c = pos(sq);
    const color = sq.d != null && sq.d >= 0 ? (board.districts[sq.d]?.color ?? null) : null;
    drawTile(ctx, board.layout, sq.t, color, c.x, c.y, s);
  }
  return cv;
}

/** One tile of the key, drawn the same way as on the picture. */
function keyIcon(t: string, color: string | null): HTMLCanvasElement {
  const size = 18;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = size * dpr;
  cv.height = size * dpr;
  cv.style.width = `${size}px`;
  cv.style.height = `${size}px`;
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  drawTile(ctx, 'square', t, color, size / 2, size / 2, size - 1);
  return cv;
}

/**
 * A key to a board's picture: a chip per kind of tile it has (properties first, in one of its
 * district colors), each with the tile as the picture draws it and its name.
 */
export function thumbKey(full: BoardDef): HTMLElement {
  const board = boardForPlay(full);
  const has = new Set(board.squares.map((s) => s.t));
  const firstColor = board.districts.find((d) => d.color)?.color ?? '#f5a524';
  const chips = KEY_ORDER.filter((t) => has.has(t as never)).map((t) =>
    h(
      'span',
      { class: 'thumb-key-item' },
      keyIcon(t, t === 'shop' || t === 'plot' ? firstColor : null),
      t === 'shop' ? 'Property' : t === 'plot' ? 'Vacant plot' : TILE_LOOK[t].name,
    ),
  );
  return h('div', { class: 'thumb-key', 'aria-label': 'What the tiles are' }, ...chips);
}
