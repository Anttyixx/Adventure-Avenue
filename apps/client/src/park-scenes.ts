/** Reusable park pieces: the neighborhood supplies borders and paths, not a fixed scene image. */
import { neighborCells, type BoardLayout, type GameState } from '@aa/engine';
import { cellCenter, sideVector } from './geometry';
import { landscapeRandom } from './scenery';

export const PARK_MODULES = [
  'module-fountain',
  'module-gazebo',
  'module-picnic',
  'module-grove',
  'module-orchard',
  'module-garden',
  'module-hedge',
  'module-corner',
  'module-bridge',
] as const;
export type ParkModule = (typeof PARK_MODULES)[number];
export interface ParkPiece {
  x: number;
  y: number;
  water?: boolean;
  module?: ParkModule;
  focus?: boolean;
}
export interface ParkScene {
  layout?: BoardLayout;
  pieces: ParkPiece[];
  walk: { x: number; y: number }[];
}
const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
const memo = new WeakMap<GameState, ParkScene[]>();
const neighbors = (layout: BoardLayout | undefined, p: { x: number; y: number }) =>
  neighborCells(layout, p.x, p.y).map(([x, y]) => ({ x, y }));

/** Compose any connected footprint from the same interchangeable planted / activity pieces. */
export function composePark(
  layout: BoardLayout | undefined,
  footprint: { x: number; y: number }[],
  seed: number,
): ParkScene {
  const r = landscapeRandom(seed, 971),
    members = new Set(footprint.map(key));
  const cx = footprint.reduce((n, p) => n + p.x, 0) / footprint.length,
    cy = footprint.reduce((n, p) => n + p.y, 0) / footprint.length;
  const ordered = [...footprint].sort(
    (a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy) || a.y - b.y || a.x - b.x,
  );
  const focus = ordered[0],
    type = Math.floor(r() * 4);
  const pieces: ParkPiece[] = footprint.map((p) => ({ ...p }));
  // Water grows as a connected patch inside a scene, sharing banks across piece boundaries.
  if (type === 3 && pieces.length >= 6) {
    const water = new Set<string>(),
      queue = [ordered.at(-1)!];
    for (let i = 0; i < queue.length && water.size < Math.floor(pieces.length * 0.4); i++) {
      const p = queue[i];
      if (key(p) === key(focus) || water.has(key(p))) continue;
      water.add(key(p));
      queue.push(...neighbors(layout, p).filter((q) => members.has(key(q)) && !water.has(key(q))));
    }
    for (const p of pieces) p.water = water.has(key(p));
  }
  const land = new Set(pieces.filter((p) => !p.water).map(key));
  const boundary = ordered.filter(
    (p) => land.has(key(p)) && neighbors(layout, p).some((q) => !members.has(key(q))),
  );
  const walk: ParkScene['walk'] = [];
  for (const start of [boundary[0], boundary.at(-1)]) {
    if (!start) continue;
    const queue = [start],
      prev = new Map<string, { x: number; y: number } | null>([[key(start), null]]);
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      if (key(p) === key(focus)) break;
      for (const q of neighbors(layout, p))
        if (land.has(key(q)) && !prev.has(key(q))) {
          prev.set(key(q), p);
          queue.push(q);
        }
    }
    if (!prev.has(key(focus))) continue;
    const path: typeof walk = [];
    let p: { x: number; y: number } | null = focus;
    while (p) {
      path.push(p);
      p = prev.get(key(p)) ?? null;
    }
    if (!walk.length) walk.push(...path.reverse());
    else walk.push(...path.slice(1));
  }
  const walkSet = new Set(walk.map(key));
  for (const p of pieces) {
    if (p.water) continue;
    if (key(p) === key(focus)) {
      p.focus = true;
      p.module = ['module-fountain', 'module-gazebo', 'module-picnic', 'module-garden'][type] as ParkModule;
    } else if (!walkSet.has(key(p)))
      p.module =
        type === 1
          ? r() < 0.55
            ? 'module-orchard'
            : 'module-garden'
          : r() < 0.55
            ? 'module-grove'
            : 'module-garden';
  }
  const bridge = pieces.find(
    (p) => p.water && neighbors(layout, p).filter((q) => land.has(key(q))).length >= 2,
  );
  if (bridge) bridge.module = 'module-bridge';
  return { layout, pieces, walk };
}

/** Place complete connected groups on the actual board grid, without changing game state. */
export function parkScenes(G: GameState): ParkScene[] {
  const saved = memo.get(G);
  if (saved) return saved;
  if (!G.nodes.length) return [];
  const points = G.nodes.map((n) => cellCenter(G.layout, n.x, n.y));
  const gates = G.nodes.flatMap((n) =>
    (n.portals ?? []).map((p) => {
      const c = points[n.id],
        v = sideVector(G.layout, n.x, n.y, p.side);
      return { x: c.x + v.x * 0.72, y: c.y + v.y * 0.72 };
    }),
  );
  const roads = G.nodes.flatMap((n) =>
    n.nb
      .filter((id) => id > n.id && !n.portals?.some((p) => p.to === id))
      .map((id) => ({ a: points[n.id], b: points[id] })),
  );
  const left = Math.min(...G.nodes.map((n) => n.x)) - 4,
    right = Math.max(...G.nodes.map((n) => n.x)) + 4,
    top = Math.min(...G.nodes.map((n) => n.y)) - 4,
    bottom = Math.max(...G.nodes.map((n) => n.y)) + 4;
  const available = new Set<string>(),
    cells: { x: number; y: number }[] = [];
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      const p = cellCenter(G.layout, x, y);
      if (
        points.some((c) => Math.hypot(p.x - c.x, p.y - c.y) < 95) ||
        gates.some((c) => Math.hypot(p.x - c.x, p.y - c.y) < 105)
      )
        continue;
      if (
        roads.some(({ a, b }) => {
          const dx = b.x - a.x,
            dy = b.y - a.y,
            t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
          return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < 83;
        })
      )
        continue;
      cells.push({ x, y });
      available.add(`${x},${y}`);
    }
  // Fill board pockets first; keep distinct parks apart by one quiet grass cell.
  const distance = (p: { x: number; y: number }) =>
    Math.min(...G.nodes.map((n) => Math.hypot(p.x - n.x, p.y - n.y)));
  cells.sort(
    (a, b) => distance(a) - distance(b) || landscapeRandom(a.x, a.y)() - landscapeRandom(b.x, b.y)(),
  );
  const scenes: ParkScene[] = [];
  for (const start of cells) {
    if (!available.has(key(start))) continue;
    const r = landscapeRandom(start.x + 93, start.y - 401),
      wanted = 5 + Math.floor(r() * 9),
      footprint = [start],
      seen = new Set([key(start)]);
    for (let i = 0; i < footprint.length && footprint.length < wanted; i++) {
      const next = neighbors(G.layout, footprint[i])
        .filter((p) => available.has(key(p)) && !seen.has(key(p)))
        .sort((a, b) => landscapeRandom(a.x + 121, a.y - 71)() - landscapeRandom(b.x + 121, b.y - 71)());
      for (const p of next) {
        if (footprint.length >= wanted) break;
        seen.add(key(p));
        footprint.push(p);
      }
    }
    if (footprint.length < 3) {
      available.delete(key(start));
      continue;
    }
    scenes.push(composePark(G.layout, footprint, start.x * 149 + start.y * 71));
    for (const p of footprint) {
      available.delete(key(p));
      for (const q of neighbors(G.layout, p)) available.delete(key(q));
    }
  }
  memo.set(G, scenes);
  return scenes;
}
