/** Shared surfaces for whole locations: adjacent cells have no separately drawn tile borders. */
import type { GameState } from '@aa/engine';
import { SCENERY_SET, drawStamp, propCanvas } from './props';
import {
  DECOR_CELL,
  FRAME_CELL,
  townBoardFrame,
  townParkTheme,
  townWalks,
  terrainContours,
  townTerrainCells,
  townTerrainFeatures,
  townBackgroundFeatures,
  type TerrainKind,
  type TerrainFeature,
} from './town-terrain';

const WORLD = 800,
  LIMIT = 256,
  MAX_BYTES = 128 * 1024 * 1024;
const chunks = new WeakMap<GameState, Map<string, HTMLCanvasElement>>();
const kinds: TerrainKind[] = ['park', 'court', 'water'];

function surfacePath(
  cells: ReturnType<typeof townTerrainCells>,
  kind: TerrainKind,
  step = DECOR_CELL,
  radius = 24,
) {
  const path = new Path2D();
  for (const loop of terrainContours(cells, kind)) {
    const last = loop.at(-1)!,
      first = loop[0];
    path.moveTo(((last.x + first.x) * step) / 2, ((last.y + first.y) * step) / 2);
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i],
        next = loop[(i + 1) % loop.length];
      path.arcTo(p.x * step, p.y * step, ((p.x + next.x) * step) / 2, ((p.y + next.y) * step) / 2, radius);
    }
    path.closePath();
  }
  return path;
}
function chunk(G: GameState, x: number, y: number, PIXELS: number) {
  let cache = chunks.get(G);
  if (!cache) {
    cache = new Map();
    chunks.set(G, cache);
  }
  const key = `${x},${y},${PIXELS}`,
    saved = cache.get(key);
  if (saved) {
    cache.delete(key);
    cache.set(key, saved);
    return saved;
  }
  const cv = Object.assign(document.createElement('canvas'), { width: PIXELS, height: PIXELS });
  const ctx = cv.getContext('2d')!;
  const left = x * WORLD,
    top = y * WORLD;
  ctx.setTransform(PIXELS / WORLD, 0, 0, PIXELS / WORLD, (-left * PIXELS) / WORLD, (-top * PIXELS) / WORLD);
  const cells = townTerrainCells(G, left, top, left + WORLD, top + WORLD);
  // Overscan the masks before blurring so cached chunk borders never become visible seams.
  const pad = Math.ceil((48 * PIXELS) / 512),
    extent = PIXELS + pad * 2,
    scale = PIXELS / WORLD;
  const layer = Object.assign(document.createElement('canvas'), { width: extent, height: extent });
  const mask = Object.assign(document.createElement('canvas'), { width: extent, height: extent });
  const lctx = layer.getContext('2d')!,
    mctx = mask.getContext('2d')!;
  const paint = (path: Path2D, kind: TerrainKind, blur: number, bank = false) => {
    lctx.resetTransform();
    lctx.clearRect(0, 0, extent, extent);
    mctx.resetTransform();
    mctx.clearRect(0, 0, extent, extent);
    lctx.setTransform(scale, 0, 0, scale, -left * scale + pad, -top * scale + pad);
    mctx.setTransform(scale, 0, 0, scale, -left * scale + pad, -top * scale + pad);
    mctx.fillStyle = '#fff';
    mctx.fill(path);
    if (bank) {
      mctx.lineWidth = 18;
      mctx.strokeStyle = '#fff';
      mctx.stroke(path);
    }
    lctx.fillStyle = bank
      ? '#b5cb80'
      : kind === 'water'
        ? '#22b9c9'
        : kind === 'court'
          ? '#e5c998'
          : '#91c34b';
    const box = [left - pad / scale, top - pad / scale, extent / scale, extent / scale] as const;
    lctx.fillRect(...box);
    const image = !bank && propCanvas(`terrain-${kind}`, '#808080');
    const pattern = image && lctx.createPattern(image, 'repeat');
    if (pattern) {
      pattern.setTransform(
        new DOMMatrix().scale(
          SCENERY_SET === 'terrain' && kind !== 'water'
            ? kind === 'court'
              ? 0.125
              : 0.25
            : kind === 'court'
              ? 0.25
              : 0.5,
        ),
      );
      lctx.fillStyle = pattern;
      lctx.globalAlpha = kind === 'water' ? 0.48 : 0.45;
      lctx.fillRect(...box);
      lctx.globalAlpha = 1;
    }
    lctx.resetTransform();
    lctx.globalCompositeOperation = 'destination-in';
    lctx.filter = `blur(${blur * scale}px)`;
    lctx.drawImage(mask, 0, 0);
    lctx.filter = 'none';
    lctx.globalCompositeOperation = 'source-over';
    ctx.save();
    if (bank) ctx.globalAlpha = 0.7;
    ctx.drawImage(layer, pad, pad, PIXELS, PIXELS, left, top, WORLD, WORLD);
    ctx.restore();
  };
  for (const kind of kinds) {
    const path = surfacePath(cells, kind);
    if (kind === 'water') paint(path, kind, 7, true);
    paint(path, kind, kind === 'water' ? 3 : kind === 'court' ? 6 : 8);
  }
  if (SCENERY_SET === 'connected') {
    const hedge = (path: Path2D, width: number) => {
      ctx.strokeStyle = 'rgba(57,91,29,.2)';
      ctx.lineWidth = width + 5;
      ctx.stroke(path);
      const image = propCanvas('terrain-hedge', '#808080');
      const pattern = image && ctx.createPattern(image, 'repeat');
      pattern?.setTransform(new DOMMatrix().scale(0.1));
      ctx.strokeStyle = pattern || '#83b638';
      ctx.lineWidth = width;
      ctx.stroke(path);
      ctx.strokeStyle = 'rgba(200,235,99,.38)';
      ctx.lineWidth = 2;
      ctx.stroke(path);
    };
    // A small planted garden boundary shares the same cells and concave curves as its terrain.
    const gardens = cells.filter((c) => c.kind === 'park' && townParkTheme(c.x, c.y) === 'garden');
    hedge(surfacePath(gardens, 'park'), 11);
    const paths = townWalks(G, cells);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const route of paths) {
      ctx.beginPath();
      ctx.moveTo(route[0].x, route[0].y);
      for (let i = 1; i < route.length - 1; i++) {
        const p = route[i],
          next = route[i + 1];
        ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
      }
      ctx.lineTo(route.at(-1)!.x, route.at(-1)!.y);
      ctx.strokeStyle = 'rgba(176,151,103,.3)';
      ctx.lineWidth = 19;
      ctx.stroke();
      ctx.strokeStyle = '#dbc493';
      ctx.lineWidth = 13;
      ctx.stroke();
    }
    const frame = townBoardFrame(G);
    ctx.save();
    for (const p of frame.gates) {
      if (p.x < left - 50 || p.x > left + WORLD + 50 || p.y < top - 50 || p.y > top + WORLD + 50) continue;
      const gateMask = new Path2D();
      gateMask.rect(left - 200, top - 200, WORLD + 400, WORLD + 400);
      gateMask.moveTo(p.x + 48, p.y);
      gateMask.arc(p.x, p.y, 48, 0, Math.PI * 2);
      ctx.clip(gateMask, 'evenodd');
    }
    hedge(surfacePath(frame.cells, 'park', FRAME_CELL, 15), 9);
    ctx.restore();
  }
  const features = SCENERY_SET === 'terrain' ? [] : townTerrainFeatures(G, cells);
  for (const p of features.filter((p) => p.clearing)) {
    ctx.save();
    ctx.translate(p.x, p.y + 18);
    ctx.scale(1, 0.65);
    const worn = ctx.createRadialGradient(0, 0, 10, 0, 0, 72);
    worn.addColorStop(0, 'rgba(218,201,137,.5)');
    worn.addColorStop(1, 'rgba(218,201,137,0)');
    ctx.fillStyle = worn;
    ctx.fillRect(-73, -73, 146, 146);
    ctx.restore();
  }
  for (const p of features) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle ?? 0);
    drawStamp(ctx, p.key, '#808080', 0, 0, p.size, p.size);
    ctx.restore();
  }
  cache.set(key, cv);
  let bytes = [...cache.values()].reduce((n, c) => n + c.width * c.height * 4, 0);
  while (cache.size > LIMIT || bytes > MAX_BYTES) {
    const first = cache.keys().next().value!,
      old = cache.get(first)!;
    bytes -= old.width * old.height * 4;
    cache.delete(first);
  }
  return cv;
}

/** Cached, camera-stable connected parks, courtyards and ponds around every bend of the board. */
export function paintTownTerrain(
  ctx: CanvasRenderingContext2D,
  G: GameState,
  left: number,
  top: number,
  right: number,
  bottom: number,
) {
  const transform = ctx.getTransform();
  const pixels =
    WORLD *
    (Math.hypot(transform.a, transform.b) <= 0.5
      ? 0.5
      : Math.min(2, Math.ceil(Math.hypot(transform.a, transform.b))));
  for (let y = Math.floor(top / WORLD); y < Math.ceil(bottom / WORLD); y++)
    for (let x = Math.floor(left / WORLD); x < Math.ceil(right / WORLD); x++)
      ctx.drawImage(chunk(G, x, y, pixels), x * WORLD, y * WORLD, WORLD, WORLD);
  if (SCENERY_SET === 'terrain') {
    const features: TerrainFeature[] = [];
    for (let y = Math.floor((top - 80) / WORLD); y < Math.ceil((bottom + 80) / WORLD); y++)
      for (let x = Math.floor((left - 80) / WORLD); x < Math.ceil((right + 80) / WORLD); x++)
        features.push(...backgroundFeatures(G, x, y));
    features.sort((a, b) => a.y - b.y);
    for (const p of features)
      if (p.x > left - 80 && p.x < right + 80 && p.y > top - 80 && p.y < bottom + 80)
        drawStamp(ctx, p.key, '#808080', p.x, p.y, p.size, p.size);
  }
}

const featurePlans = new WeakMap<GameState, Map<string, TerrainFeature[]>>();
/** Cache placement data, leaving the PNGs to draw at the display's actual resolution. */
function backgroundFeatures(G: GameState, x: number, y: number) {
  let cache = featurePlans.get(G);
  if (!cache) {
    cache = new Map();
    featurePlans.set(G, cache);
  }
  const key = `${x},${y}`;
  let saved = cache.get(key);
  if (!saved) {
    const left = x * WORLD,
      top = y * WORLD;
    saved = townBackgroundFeatures(G, townTerrainCells(G, left, top, left + WORLD, top + WORLD)).filter(
      (p) => p.x >= left && p.x < left + WORLD && p.y >= top && p.y < top + WORLD,
    );
    cache.set(key, saved);
    if (cache.size > 128) cache.delete(cache.keys().next().value!);
  }
  return saved;
}
