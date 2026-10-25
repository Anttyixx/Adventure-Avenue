/** Small schematic picture of a board, for the board picker and saved-board lists. */
import type { BoardDef } from '@aa/engine';
import { cellCenter, tileShape, worldSize } from '../geometry';

const TYPE_COLOR: Record<string, string> = {
  bank: '#ffd23f',
  venture: '#7b4bd6',
  spade: '#2f3554',
  club: '#2f3554',
  heart: '#e5484d',
  diamond: '#e5484d',
  change: '#8a94a8',
};

export function boardThumb(board: BoardDef, maxW = 220, maxH = 130): HTMLCanvasElement {
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
  const s = cell * 0.78;
  for (const sq of board.squares) {
    const c = pos(sq);
    ctx.fillStyle =
      sq.t === 'shop'
        ? sq.plot
          ? '#ffffff'
          : (board.districts[sq.d ?? -1]?.color ?? '#cccccc')
        : (TYPE_COLOR[sq.t] ?? '#fdfbf5');
    tileShape(ctx, board.layout, c.x, c.y, s / 2, Math.max(1, s * 0.2));
    ctx.fill();
    if (sq.t === 'shop' && sq.plot) {
      ctx.strokeStyle = board.districts[sq.d ?? -1]?.color ?? '#888';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  return cv;
}
