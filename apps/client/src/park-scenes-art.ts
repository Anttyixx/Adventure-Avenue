/** Assemble compatible grid pieces into one miniature park, with only shared outer boundaries. */
import type { GameState } from '@aa/engine';
import { cellCenter } from './geometry';
import { propCanvas, drawStamp } from './props';
import { parkScenes, type ParkPiece, type ParkScene } from './park-scenes';

type Point = { x: number; y: number };
const pointKey = (p: Point) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
/** Remove shared polygon edges on either grid; retain inner and outer corners of the assembly. */
export function parkBoundary(scene: ParkScene, pieces: ParkPiece[] = scene.pieces): Point[][] {
  const edges = new Map<string, { a: Point; b: Point }>();
  for (const p of pieces) {
    const c = cellCenter(scene.layout, p.x, p.y);
    const vertices =
      scene.layout === 'hex'
        ? Array.from({ length: 6 }, (_, i) => {
            const a = ((-90 + i * 60) * Math.PI) / 180;
            return {
              x: c.x + (100 / Math.sqrt(3)) * Math.cos(a),
              y: c.y + (100 / Math.sqrt(3)) * Math.sin(a),
            };
          })
        : [
            { x: c.x - 50, y: c.y - 50 },
            { x: c.x + 50, y: c.y - 50 },
            { x: c.x + 50, y: c.y + 50 },
            { x: c.x - 50, y: c.y + 50 },
          ];
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i],
        b = vertices[(i + 1) % vertices.length],
        forward = `${pointKey(a)}:${pointKey(b)}`,
        reverse = `${pointKey(b)}:${pointKey(a)}`;
      if (edges.has(reverse)) edges.delete(reverse);
      else edges.set(forward, { a, b });
    }
  }
  const starts = new Map<string, { a: Point; b: Point }[]>();
  for (const e of edges.values()) starts.set(pointKey(e.a), [...(starts.get(pointKey(e.a)) ?? []), e]);
  const unused = new Set(edges.values()),
    loops: Point[][] = [];
  for (const first of edges.values()) {
    if (!unused.has(first)) continue;
    const loop: Point[] = [];
    let e: typeof first | undefined = first;
    while (e && unused.delete(e)) {
      loop.push(e.a);
      if (pointKey(e.b) === pointKey(first.a)) break;
      e = starts.get(pointKey(e.b))?.find((n) => unused.has(n));
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
function pathFor(loops: Point[][]) {
  const path = new Path2D();
  for (const loop of loops) {
    const first = loop[0],
      last = loop.at(-1)!;
    path.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i],
        next = loop[(i + 1) % loop.length];
      path.arcTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2, 12);
    }
    path.closePath();
  }
  return path;
}
const images = new WeakMap<
  ParkScene,
  { canvas: HTMLCanvasElement; left: number; top: number; width: number; height: number }
>();
function render(scene: ParkScene) {
  const cached = images.get(scene);
  if (cached) return cached;
  const centers = scene.pieces.map((p) => cellCenter(scene.layout, p.x, p.y)),
    left = Math.floor(Math.min(...centers.map((p) => p.x)) - 72),
    top = Math.floor(Math.min(...centers.map((p) => p.y)) - 80),
    width = Math.ceil(Math.max(...centers.map((p) => p.x)) + 72 - left),
    height = Math.ceil(Math.max(...centers.map((p) => p.y)) + 80 - top);
  const canvas = Object.assign(document.createElement('canvas'), { width: width * 2, height: height * 2 }),
    ctx = canvas.getContext('2d')!;
  ctx.setTransform(2, 0, 0, 2, -left * 2, -top * 2);
  const loops = parkBoundary(scene),
    surface = pathFor(loops);
  ctx.shadowColor = 'rgba(61,100,27,.18)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#a8d34c';
  ctx.fill(surface);
  ctx.shadowColor = 'transparent';
  ctx.save();
  ctx.clip(surface);
  const grass = propCanvas('terrain-park', '#808080'),
    pattern = grass && ctx.createPattern(grass, 'repeat');
  if (pattern) {
    pattern.setTransform(new DOMMatrix().scale(0.4));
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = pattern;
    ctx.fill(surface);
    ctx.globalAlpha = 1;
  }
  const water = scene.pieces.filter((p) => p.water);
  if (water.length) {
    const bank = pathFor(parkBoundary(scene, water));
    ctx.fillStyle = '#e0cf96';
    ctx.strokeStyle = '#e0cf96';
    ctx.lineWidth = 10;
    ctx.stroke(bank);
    ctx.fill(bank);
    ctx.fillStyle = '#24bccb';
    ctx.fill(bank);
    const waterArt = propCanvas('terrain-water', '#808080'),
      ripple = waterArt && ctx.createPattern(waterArt, 'repeat');
    if (ripple) {
      ripple.setTransform(new DOMMatrix().scale(0.35));
      ctx.fillStyle = ripple;
      ctx.globalAlpha = 0.3;
      ctx.fill(bank);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(165,248,234,.7)';
    ctx.lineWidth = 3;
    ctx.stroke(bank);
  }
  if (scene.walk.length) {
    ctx.beginPath();
    const start = cellCenter(scene.layout, scene.walk[0].x, scene.walk[0].y);
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < scene.walk.length; i++) {
      const a = cellCenter(scene.layout, scene.walk[i].x, scene.walk[i].y);
      ctx.lineTo(a.x, a.y);
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 25;
    ctx.strokeStyle = '#c8ac75';
    ctx.stroke();
    ctx.lineWidth = 20;
    ctx.strokeStyle = '#eed6a3';
    ctx.stroke();
  }
  // Every wall piece shares an endpoint; the same wall pieces turn through different scene outlines.
  ctx.strokeStyle = '#79a933';
  ctx.lineWidth = 22;
  ctx.stroke(surface);
  for (const loop of loops)
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i],
        b = loop[(i + 1) % loop.length],
        length = Math.hypot(b.x - a.x, b.y - a.y),
        steps = Math.ceil(length / 20),
        angle = Math.atan2(b.y - a.y, b.x - a.x);
      for (let j = 0; j < steps; j++) {
        const t = (j + 0.5) / steps;
        ctx.save();
        ctx.translate(
          a.x + (b.x - a.x) * t - ((b.y - a.y) / length) * 9,
          a.y + (b.y - a.y) * t + ((b.x - a.x) / length) * 9,
        );
        ctx.rotate(angle);
        drawStamp(ctx, 'module-hedge', '#808080', 0, 0, 45, 96);
        ctx.restore();
      }
    }
  // Water details are shared with the existing cartoon kit; no private floor pads or tile rims.
  for (const p of scene.pieces) {
    const c = cellCenter(scene.layout, p.x, p.y);
    if (!p.module && !p.water) {
      drawStamp(ctx, 'park-bench', '#808080', c.x + 24, c.y - 24, 43, 43);
      drawStamp(ctx, 'garden-planter', '#808080', c.x - 28, c.y + 24, 29, 29);
    }
    if (p.module) {
      const clearance = Math.min(
        ...loops.flatMap((loop) =>
          loop.map((a, i) => {
            const b = loop[(i + 1) % loop.length],
              dx = b.x - a.x,
              dy = b.y - a.y,
              t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
            return Math.hypot(c.x - a.x - t * dx, c.y - a.y - t * dy);
          }),
        ),
      );
      const size = Math.min(p.focus ? 138 : 101, clearance * 1.8);
      drawStamp(ctx, p.module, '#808080', c.x, c.y, size, size);
    }
    if (p.water) {
      drawStamp(
        ctx,
        (p.x + p.y) % 3 === 0 ? 'pond-lilies' : 'pond-reeds',
        '#808080',
        c.x + 12,
        c.y + 8,
        38,
        38,
      );
    }
  }
  ctx.restore();
  const result = { canvas, left, top, width, height };
  images.set(scene, result);
  return result;
}
/** Reusable in the Lab, including an exploded view that makes the puzzle-piece joins visible. */
export function paintParkScene(ctx: CanvasRenderingContext2D, scene: ParkScene, exploded = false) {
  const image = render(scene);
  if (!exploded) {
    ctx.drawImage(image.canvas, image.left, image.top, image.width, image.height);
    return;
  }
  const center = {
    x: scene.pieces.reduce((n, p) => n + p.x, 0) / scene.pieces.length,
    y: scene.pieces.reduce((n, p) => n + p.y, 0) / scene.pieces.length,
  };
  for (const piece of scene.pieces) {
    ctx.save();
    ctx.translate((piece.x - center.x) * 13, (piece.y - center.y) * 13);
    ctx.clip(pathFor(parkBoundary(scene, [piece])));
    ctx.drawImage(image.canvas, image.left, image.top, image.width, image.height);
    ctx.strokeStyle = 'rgba(31,55,27,.4)';
    ctx.lineWidth = 1;
    ctx.stroke(pathFor(parkBoundary(scene, [piece])));
    ctx.restore();
  }
}
/** Actual grid-aligned groups are stable while panning and never obstruct gameplay. */
export function paintParkScenes(
  ctx: CanvasRenderingContext2D,
  G: GameState,
  left: number,
  top: number,
  right: number,
  bottom: number,
) {
  for (const scene of parkScenes(G)) {
    const cs = scene.pieces.map((p) => cellCenter(scene.layout, p.x, p.y));
    if (
      cs.every((p) => p.x < left - 80) ||
      cs.every((p) => p.x > right + 80) ||
      cs.every((p) => p.y < top - 80) ||
      cs.every((p) => p.y > bottom + 80)
    )
      continue;
    paintParkScene(ctx, scene);
  }
}
