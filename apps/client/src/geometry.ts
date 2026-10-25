/**
 * Where cells sit in board space for each grid layout. Square cells are 100 units apart. Hex
 * cells are pointy-top hexagons 100 units wide; rows are 86.6 units apart and every odd row is
 * shifted half a cell right. Every board has a 50-unit margin all round.
 */
import type { BoardLayout } from '@aa/engine';

export const CELL = 100;
const HEX_ROW = (CELL * Math.sqrt(3)) / 2; // 86.6
const HEX_TALL = (CELL * 2) / Math.sqrt(3); // 115.5, point to point

export function cellCenter(layout: BoardLayout | undefined, x: number, y: number) {
  if (layout === 'hex')
    return { x: 50 + x * CELL + (y & 1) * (CELL / 2) + CELL / 2, y: 50 + y * HEX_ROW + HEX_TALL / 2 };
  return { x: 50 + x * CELL + CELL / 2, y: 50 + y * CELL + CELL / 2 };
}

/** World size for a board grid. */
export function worldSize(G: { layout?: BoardLayout; cols?: number; rows?: number } | null) {
  const cols = G?.cols ?? 12;
  const rows = G?.rows ?? 7;
  if (G?.layout === 'hex')
    return { w: cols * CELL + CELL / 2 + 100, h: (rows - 1) * HEX_ROW + HEX_TALL + 100 };
  return { w: cols * CELL + 100, h: rows * CELL + 100 };
}

/** The cell under a board-space point, or null. */
export function cellAt(layout: BoardLayout | undefined, cols: number, rows: number, px: number, py: number) {
  if (layout !== 'hex') {
    const x = Math.floor((px - 50) / CELL);
    const y = Math.floor((py - 50) / CELL);
    return x >= 0 && y >= 0 && x < cols && y < rows ? { x, y } : null;
  }
  // Check the nearest rows and pick the closest center.
  const r0 = Math.floor((py - 50 - HEX_TALL / 2) / HEX_ROW);
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = r0 - 1; y <= r0 + 2; y++) {
    if (y < 0 || y >= rows) continue;
    const x = Math.round((px - 50 - CELL / 2 - (y & 1) * (CELL / 2)) / CELL);
    for (const xx of [x - 1, x, x + 1]) {
      if (xx < 0 || xx >= cols) continue;
      const c = cellCenter('hex', xx, y);
      const d = Math.hypot(c.x - px, c.y - py);
      if (d < bestD) {
        bestD = d;
        best = { x: xx, y };
      }
    }
  }
  return bestD <= HEX_TALL / 2 ? best : null;
}

/**
 * Trace a tile outline centered on (cx, cy): a rounded square, or a rounded pointy-top hexagon
 * whose flat sides are `half` from the center.
 */
export function tileShape(
  ctx: CanvasRenderingContext2D,
  layout: BoardLayout | undefined,
  cx: number,
  cy: number,
  half: number,
  radius: number,
) {
  ctx.beginPath();
  if (layout !== 'hex') {
    const x = cx - half;
    const y = cy - half;
    const w = half * 2;
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + w, radius);
    ctx.arcTo(x + w, y + w, x, y + w, radius);
    ctx.arcTo(x, y + w, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    return;
  }
  const R = (half * 2) / Math.sqrt(3);
  const pts = Array.from({ length: 6 }, (_, k) => {
    const a = ((-90 + 60 * k) * Math.PI) / 180;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  });
  const r = Math.min(radius * 0.7, R / 3);
  const mid = (i: number) => {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % 6];
    return [(ax + bx) / 2, (ay + by) / 2];
  };
  const [sx, sy] = mid(5);
  ctx.moveTo(sx, sy);
  for (let i = 0; i < 6; i++) {
    const [vx, vy] = pts[i];
    const [nx, ny] = mid(i);
    ctx.arcTo(vx, vy, nx, ny, r);
  }
  ctx.closePath();
}

/** Height of a tile's top edge above its center (the point of a hex is higher). */
export const tileTop = (layout: BoardLayout | undefined, half: number) =>
  layout === 'hex' ? (half * 2) / Math.sqrt(3) : half;
