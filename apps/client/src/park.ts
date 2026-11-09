/** Painted ground and a quiet stream surround the playable town without adding game routes. */
import type { GameState } from '@aa/engine';
import { parkStream } from './park-geometry';
import { landscapeRandom, type SceneryStamp } from './scenery';
import { drawStamp, propCanvas } from './props';

const waterPatterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

/** Water and irregular banks extend beyond the visible area in world coordinates. */
export function paintParkStream(ctx: CanvasRenderingContext2D, G: GameState, top: number, right: number) {
  const points = parkStream(G, top, right);
  const edges = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return {
      ...p,
      nx: -(b.y - a.y) / len,
      ny: (b.x - a.x) / len,
      half: 48 + Math.sin(p.x * 0.011 + p.y * 0.007) * 11 + Math.sin(p.x * 0.027 + p.y * 0.017) * 5,
    };
  });
  const ribbon = (extra: number) => {
    const bank = (side: number) =>
      edges.map((p) => {
        const w = p.half + extra * (1 + 0.25 * Math.sin(p.x * 0.019 + p.y * 0.013 + side));
        return { x: p.x + p.nx * w * side, y: p.y + p.ny * w * side };
      });
    const contour = [...bank(1), ...bank(-1).reverse()];
    ctx.beginPath();
    const first = contour[0],
      last = contour.at(-1)!;
    ctx.moveTo((first.x + last.x) / 2, (first.y + last.y) / 2);
    for (let i = 0; i < contour.length; i++) {
      const p = contour[i],
        next = contour[(i + 1) % contour.length];
      ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
    }
    ctx.closePath();
  };
  ctx.save();
  for (const [extra, color] of [
    [28, 'rgba(73,96,60,.1)'],
    [20, 'rgba(106,119,70,.2)'],
    [12, '#b3b18c'],
    [5, '#bbb68e'],
  ] as const) {
    ribbon(extra);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ribbon(0);
  ctx.fillStyle = '#6c9e9f';
  ctx.fill();
  ctx.save();
  ctx.clip();
  let pattern = waterPatterns.get(ctx);
  const water = propCanvas('park-water', '#808080');
  if (!pattern && water) {
    pattern = ctx.createPattern(water, 'repeat') ?? undefined;
    if (pattern) waterPatterns.set(ctx, pattern);
  }
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.globalAlpha = 0.9;
    ctx.fill();
  }
  ctx.restore();
  // Low rocks at changing points along the banks make the edge feel planted rather than stroked.
  for (const p of edges) {
    const r = landscapeRandom(Math.round(p.x), Math.round(p.y));
    if (r() > 0.42) continue;
    const side = r() < 0.5 ? -1 : 1;
    const offset = (p.half + 19) * side;
    drawStamp(
      ctx,
      'scenery-rocks',
      '#808080',
      p.x + p.nx * offset,
      p.y + p.ny * offset,
      24 + r() * 18,
      24 + r() * 18,
    );
  }
  ctx.restore();
}

/** A faint soil/contact shadow under scenery helps objects belong to the terrain. */
export function paintParkScenery(ctx: CanvasRenderingContext2D, p: SceneryStamp) {
  ctx.save();
  ctx.translate(p.x, p.y + p.size * 0.25);
  ctx.scale(1, 0.3);
  const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 0.48);
  shadow.addColorStop(0, 'rgba(53,68,37,.16)');
  shadow.addColorStop(0.55, 'rgba(66,78,42,.08)');
  shadow.addColorStop(1, 'rgba(66,78,42,0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
  ctx.restore();
  drawStamp(ctx, p.key, '#808080', p.x, p.y, p.size, p.size);
}
