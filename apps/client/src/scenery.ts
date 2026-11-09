/** Cosmetic scenery placement only; never consumes the rules engine's random stream. */
import { neighborCells, type GameState } from '@aa/engine';
import { cellCenter, sideVector, tileTop, worldSize } from './geometry';
import { streamDistance } from './park-geometry';

export const SCENERY_KEYS = [
  'scenery-bench',
  'scenery-shrubs',
  'scenery-rocks',
  'scenery-planter',
  'scenery-fence',
  'scenery-sapling',
  'scenery-mushrooms',
  'scenery-lilies',
  'scenery-picnic',
] as const;

export interface SceneryStamp {
  key: (typeof SCENERY_KEYS)[number] | 'scenery-tree';
  x: number;
  y: number;
  size: number;
}

/** A stable local stream for one world coordinate, including coordinates below zero. */
export function landscapeRandom(x: number, y: number) {
  let seed = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ 0x51ed270b;
  return () => {
    seed = Math.imul(seed ^ (seed >>> 16), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    seed ^= seed >>> 16;
    return (seed >>> 0) / 4294967296;
  };
}

/** Small decorative pieces in free cells and along the margin, kept clear of gameplay. */
export function sceneryForBoard(G: GameState, park = false): SceneryStamp[] {
  const nodes = G.nodes.map((n) => cellCenter(G.layout, n.x, n.y));
  const used = new Set(G.nodes.map((n) => `${n.x},${n.y}`));
  const portals = new Set(
    G.nodes.flatMap((n) =>
      (n.portals ?? []).map((p) => {
        const [x, y] = neighborCells(G.layout, n.x, n.y)[p.side] ?? [n.x, n.y];
        return `${x},${y}`;
      }),
    ),
  );
  const gates = G.nodes.flatMap((n) =>
    (n.portals ?? []).map((p) => {
      const v = sideVector(G.layout, n.x, n.y, p.side);
      const c = cellCenter(G.layout, n.x, n.y);
      return { x: c.x + v.x * 0.72, y: c.y + v.y * 0.72 };
    }),
  );
  const roads = G.nodes.flatMap((n) =>
    n.nb
      .filter((id) => id > n.id && !n.portals?.some((p) => p.to === id))
      .map((id) => ({
        a: nodes[n.id],
        b: nodes[id],
      })),
  );
  const world = worldSize(G);
  const result: SceneryStamp[] = [];
  const halfTileY = tileTop(G.layout, 43);
  const reserved =
    G.boardId === 'town'
      ? [
          { x: 350, y: 250, w: 300, h: 150 },
          { x: 650, y: 550, w: 120, h: 110 },
        ]
      : [];
  const add = (x: number, y: number, size: number, key: SceneryStamp['key']) => {
    const half = size / 2;
    if (x - half < 3 || y - half < 3 || x + half > world.w - 3 || y + half > world.h - 3) return;
    if (nodes.some((p) => Math.abs(x - p.x) < 43 + half + 8 && Math.abs(y - p.y) < halfTileY + half + 8))
      return;
    if (gates.some((p) => Math.hypot(x - p.x, y - p.y) < half * Math.SQRT2 + 30)) return;
    if (
      reserved.some((p) => Math.abs(x - p.x) < p.w / 2 + half + 8 && Math.abs(y - p.y) < p.h / 2 + half + 8)
    )
      return;
    // Nonlocal roads can cross otherwise empty cells, so test the whole segment too.
    if (
      roads.some(({ a, b }) => {
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        return Math.hypot(x - a.x - t * dx, y - a.y - t * dy) < half * Math.SQRT2 + 22;
      })
    )
      return;
    if (
      result.some(
        (p) => Math.abs(x - p.x) < (size + p.size) / 2 + 8 && Math.abs(y - p.y) < (size + p.size) / 2 + 8,
      )
    )
      return;
    result.push({ key, x, y, size });
  };
  for (let y = 0; y < (G.rows ?? 7); y++) {
    for (let x = 0; x < (G.cols ?? 12); x++) {
      if (used.has(`${x},${y}`) || portals.has(`${x},${y}`)) continue;
      const p = cellCenter(G.layout, x, y);
      const r = landscapeRandom(x + 71, y + 113);
      const near = nodes.some((n) => Math.hypot(n.x - p.x, n.y - p.y) < 230);
      if (r() > (park ? (near ? 0.4 : 0.22) : near ? 0.5 : 0.22)) continue;
      const key = SCENERY_KEYS[Math.floor(r() * SCENERY_KEYS.length)];
      add(p.x + (r() - 0.5) * 14, p.y + (r() - 0.5) * 14, 54 + r() * 20, key);
    }
  }
  if (park) return result.sort((a, b) => a.y - b.y);
  // Tiny accents around the outside still fit inside the transparent board cache.
  const small = ['scenery-shrubs', 'scenery-rocks', 'scenery-mushrooms'] as const;
  const rim = (x: number, y: number) => {
    const r = landscapeRandom(Math.round(x), Math.round(y));
    if (r() < 0.72) add(x, y, 30 + r() * 10, small[Math.floor(r() * small.length)]);
  };
  for (let x = 80; x < world.w - 50; x += 140) {
    rim(x, 26);
    rim(x + 30, world.h - 26);
  }
  for (let y = 110; y < world.h - 50; y += 140) {
    rim(26, y);
    rim(world.w - 26, y + 20);
  }
  return result.sort((a, b) => a.y - b.y);
}

/** Grove and garden groups rather than evenly sprinkled individual ornaments. */
export function parkSceneryBeyondBoard(
  G: GameState,
  left: number,
  top: number,
  right: number,
  bottom: number,
): SceneryStamp[] {
  const world = worldSize(G);
  const result: SceneryStamp[] = [];
  const step = 420;
  const add = (key: SceneryStamp['key'], x: number, y: number, size: number) => {
    const half = size / 2;
    if (!(x + half < -25 || y + half < -25 || x - half > world.w + 25 || y - half > world.h + 25)) return;
    if (streamDistance(G, x, y) < half + 100) return;
    result.push({ key, x, y, size });
  };
  for (let y = Math.floor(top / step) - 1; y <= Math.ceil(bottom / step); y++) {
    for (let x = Math.floor(left / step) - 1; x <= Math.ceil(right / step); x++) {
      const r = landscapeRandom(x + 811, y - 407);
      const px = x * step + step / 2 + (r() - 0.5) * 170;
      const py = y * step + step / 2 + (r() - 0.5) * 170;
      const kind = r();
      if (kind < 0.62) {
        const count = 3 + Math.floor(r() * 3);
        for (let i = 0; i < count; i++) {
          const a = r() * Math.PI * 2,
            radius = 25 + r() * 95;
          add(
            i === 0 ? 'scenery-sapling' : 'scenery-tree',
            px + Math.cos(a) * radius,
            py + Math.sin(a) * radius,
            105 + r() * 80,
          );
        }
        add('scenery-shrubs', px - 90, py + 85, 80);
        add('scenery-mushrooms', px + 65, py + 110, 55);
      } else if (kind < 0.88) {
        add(kind < 0.75 ? 'scenery-picnic' : 'scenery-bench', px, py, 100);
        add('scenery-planter', px + 85, py + 30, 65);
        add('scenery-shrubs', px - 80, py + 45, 75);
        add('scenery-sapling', px - 60, py - 75, 130);
      } else {
        add('scenery-lilies', px, py, 160);
        add('scenery-rocks', px + 100, py + 50, 65);
        add('scenery-shrubs', px - 90, py + 40, 75);
      }
    }
  }
  return result.sort((a, b) => a.y - b.y);
}

/** Continue small scenery beyond the board bounds when zooming out; never in the builder. */
export function sceneryBeyondBoard(
  G: GameState,
  left: number,
  top: number,
  right: number,
  bottom: number,
): SceneryStamp[] {
  const world = worldSize(G);
  const result: SceneryStamp[] = [];
  const step = 200;
  for (let y = Math.floor(top / step) - 1; y <= Math.ceil(bottom / step); y++) {
    for (let x = Math.floor(left / step) - 1; x <= Math.ceil(right / step); x++) {
      const r = landscapeRandom(x - 373, y + 173);
      const px = x * step + 100 + (r() - 0.5) * 90;
      const py = y * step + 100 + (r() - 0.5) * 90;
      if (px > -55 && px < world.w + 55 && py > -55 && py < world.h + 55) continue;
      const distance = Math.hypot(Math.max(0, -px, px - world.w), Math.max(0, -py, py - world.h));
      if (r() > (distance < 500 ? 0.5 : distance < 1000 ? 0.25 : 0.1)) continue;
      result.push({
        key: SCENERY_KEYS[Math.floor(r() * SCENERY_KEYS.length)],
        x: px,
        y: py,
        size: 54 + r() * 30,
      });
    }
  }
  return result.sort((a, b) => a.y - b.y);
}
