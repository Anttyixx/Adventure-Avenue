/** Connected terrain cells; only boundaries between locations are drawn, never tile seams. */
import type { GameState } from '@aa/engine';
import { cellCenter, sideVector, tileTop } from './geometry';
import { landscapeRandom } from './scenery';

export const DECOR_CELL = 80;
export type TerrainKind = 'park' | 'water' | 'court';
export interface TerrainCell {
  x: number;
  y: number;
  kind: TerrainKind;
}
export const TOWN_TERRAIN_KEYS = [
  'terrain-hedge',
  'garden-bed',
  'orchard-apple',
  'orchard-orange',
  'pond-reeds',
  'pond-rocks',
  'pond-lilies',
  'pond-bridge',
  'garden-planter',
  'terrain-park',
  'terrain-water',
  'terrain-court',
  'park-tree',
  'park-flowers',
  'park-bench',
  'park-fountain',
  'park-gazebo',
  'park-picnic',
] as const;
export type DecorationKey = (typeof TOWN_TERRAIN_KEYS)[number];
interface Point {
  x: number;
  y: number;
}
interface Edge {
  a: Point;
  b: Point;
  dir: number;
  used?: boolean;
}
const key = (p: Point) => `${p.x},${p.y}`;
const caches = new WeakMap<
  GameState,
  {
    cells: Map<string, TerrainKind | null>;
    anchors: Map<string, Point | null>;
    clearings: Map<string, Point | null>;
    clearingAreas: Map<string, Point[]>;
    blocked: (x: number, y: number) => boolean;
    near: (x: number, y: number) => boolean;
    plaza: (x: number, y: number) => boolean;
  }
>();

function noise(x: number, y: number, salt: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    u = x - ix,
    v = y - iy;
  const sx = u * u * (3 - 2 * u),
    sy = v * v * (3 - 2 * v);
  const a = landscapeRandom(ix + salt, iy - salt)(),
    b = landscapeRandom(ix + 1 + salt, iy - salt)();
  const c = landscapeRandom(ix + salt, iy + 1 - salt)(),
    d = landscapeRandom(ix + 1 + salt, iy + 1 - salt)();
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
function cacheFor(G: GameState) {
  let cache = caches.get(G);
  if (cache) return cache;
  const nodes = G.nodes.map((n) => cellCenter(G.layout, n.x, n.y));
  const gates = G.nodes.flatMap((n) =>
    (n.portals ?? []).map((p) => {
      const c = nodes[n.id],
        v = sideVector(G.layout, n.x, n.y, p.side);
      return { x: c.x + v.x * 0.72, y: c.y + v.y * 0.72 };
    }),
  );
  const roads = G.nodes.flatMap((n) =>
    n.nb
      .filter((id) => id > n.id && !n.portals?.some((p) => p.to === id))
      .map((id) => ({ a: nodes[n.id], b: nodes[id] })),
  );
  const half = DECOR_CELL / 2,
    tileY = tileTop(G.layout, 43);
  const blocked = (x: number, y: number) => {
    if (nodes.some((p) => Math.abs(x - p.x) < half + 55 && Math.abs(y - p.y) < half + tileY + 12))
      return true;
    if (gates.some((p) => Math.hypot(x - p.x, y - p.y) < half * Math.SQRT2 + 40)) return true;
    return roads.some(({ a, b }) => {
      const dx = b.x - a.x,
        dy = b.y - a.y,
        t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(x - a.x - t * dx, y - a.y - t * dy) < half * Math.SQRT2 + 30;
    });
  };
  const bank = G.nodes.find((n) => n.t === 'bank');
  const b = bank ? nodes[bank.id] : null;
  cache = {
    cells: new Map(),
    anchors: new Map(),
    clearings: new Map(),
    clearingAreas: new Map(),
    blocked,
    near: (x, y) => nodes.some((p) => Math.hypot(x - p.x, y - p.y) < 220),
    plaza: (x, y) => !!b && Math.hypot(x - b.x, y - b.y) < 210,
  };
  caches.set(G, cache);
  return cache;
}

/** Deterministic terrain beneath one cell, respecting the actual board's bends and openings. */
export function townTerrainAt(G: GameState, x: number, y: number): TerrainKind | null {
  const cache = cacheFor(G),
    k = `${x},${y}`;
  if (cache.cells.has(k)) return cache.cells.get(k)!;
  const px = (x + 0.5) * DECOR_CELL,
    py = (y + 0.5) * DECOR_CELL;
  let kind: TerrainKind | null = null;
  if (!cache.blocked(px, py)) {
    const park = noise(x / 6, y / 6, 901) * 0.75 + noise(x / 3, y / 3, 127) * 0.25;
    if (park > 0.36 || cache.near(px, py)) {
      const water = noise((x + 11) / 5, (y - 7) / 5, 331);
      const court = noise((x - 19) / 5, (y + 23) / 5, 617);
      kind = water > 0.66 ? 'water' : cache.plaza(px, py) || court > 0.7 ? 'court' : 'park';
    }
  }
  if (
    kind === 'water' &&
    ![
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => {
      const nx = x + dx,
        ny = y + dy,
        npx = (nx + 0.5) * DECOR_CELL,
        npy = (ny + 0.5) * DECOR_CELL;
      return (
        !cache.blocked(npx, npy) &&
        noise((nx + 11) / 5, (ny - 7) / 5, 331) > 0.66 &&
        (cache.near(npx, npy) || noise(nx / 6, ny / 6, 901) * 0.75 + noise(nx / 3, ny / 3, 127) * 0.25 > 0.36)
      );
    })
  )
    kind = cache.plaza(px, py) ? 'court' : 'park';
  cache.cells.set(k, kind);
  if (cache.cells.size > 30000) cache.cells.delete(cache.cells.keys().next().value!);
  return kind;
}

/** A visible patch plus its neighbors, so chunk edges cannot create false shorelines. */
export function townTerrainCells(
  G: GameState,
  left: number,
  top: number,
  right: number,
  bottom: number,
): TerrainCell[] {
  const out: TerrainCell[] = [];
  for (let y = Math.floor(top / DECOR_CELL) - 2; y <= Math.ceil(bottom / DECOR_CELL) + 2; y++)
    for (let x = Math.floor(left / DECOR_CELL) - 2; x <= Math.ceil(right / DECOR_CELL) + 2; x++) {
      const kind = townTerrainAt(G, x, y);
      if (kind) out.push({ x, y, kind });
    }
  return out;
}

/** Cancel shared edges, then trace region contours (including holes and concave bends). */
export function terrainContours(cells: TerrainCell[], kind: TerrainKind): Point[][] {
  const members = new Set(cells.filter((c) => c.kind === kind).map(key)),
    edges: Edge[] = [],
    starts = new Map<string, Edge[]>();
  const add = (a: Point, b: Point, dir: number) => {
    const e = { a, b, dir };
    edges.push(e);
    const k = key(a);
    starts.set(k, [...(starts.get(k) ?? []), e]);
  };
  for (const c of cells) {
    if (c.kind !== kind) continue;
    const { x, y } = c;
    if (!members.has(`${x},${y - 1}`)) add({ x, y }, { x: x + 1, y }, 0);
    if (!members.has(`${x + 1},${y}`)) add({ x: x + 1, y }, { x: x + 1, y: y + 1 }, 1);
    if (!members.has(`${x},${y + 1}`)) add({ x: x + 1, y: y + 1 }, { x, y: y + 1 }, 2);
    if (!members.has(`${x - 1},${y}`)) add({ x, y: y + 1 }, { x, y }, 3);
  }
  const loops: Point[][] = [];
  for (const first of edges) {
    if (first.used) continue;
    const loop: Point[] = [],
      origin = key(first.a);
    let e: Edge | undefined = first;
    while (e && !e.used) {
      e.used = true;
      loop.push(e.a);
      if (key(e.b) === origin) break;
      const dir: number = e.dir;
      const rank = (next: Edge): number => [1, 0, 3, 2].indexOf((next.dir - dir + 4) % 4);
      e = (starts.get(key(e.b)) ?? []).filter((next) => !next.used).sort((a, b) => rank(a) - rank(b))[0];
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}

/** One center per connected courtyard, including courtyards spanning cache chunks. */
function courtAnchor(G: GameState, cell: Point): Point | null {
  const memo = cacheFor(G).anchors,
    origin = key(cell);
  if (memo.has(origin)) return memo.get(origin)!;
  const queue: Point[] = [cell],
    seen = new Set([origin]);
  for (let i = 0; i < queue.length && queue.length < 2048; i++) {
    const p = queue[i];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const q = { x: p.x + dx, y: p.y + dy },
        k = key(q);
      if (!seen.has(k) && townTerrainAt(G, q.x, q.y) === 'court') {
        seen.add(k);
        queue.push(q);
      }
    }
  }
  let anchor: Point | null = null;
  if (queue.length < 2048) {
    const cx = queue.reduce((n, p) => n + p.x, 0) / queue.length,
      cy = queue.reduce((n, p) => n + p.y, 0) / queue.length;
    const candidates = queue.filter((p) =>
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].every(([dx, dy]) => townTerrainAt(G, p.x + dx, p.y + dy) === 'court'),
    );
    candidates.sort(
      (a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy) || a.y - b.y || a.x - b.x,
    );
    anchor = candidates[0] ?? null;
  }
  for (const p of queue) memo.set(key(p), anchor);
  return anchor;
}

/** A small activity area inside continuous parkland, occupying two-by-two clear cells. */
function rawParkClearing(G: GameState, bx: number, by: number): Point | null {
  const memo = cacheFor(G).clearings,
    k = `${bx},${by}`;
  if (memo.has(k)) return memo.get(k)!;
  const choices: Point[] = [];
  for (let y = by * 6; y < by * 6 + 6; y++)
    for (let x = bx * 6; x < bx * 6 + 6; x++)
      if (
        [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ].every(([dx, dy]) => townTerrainAt(G, x + dx, y + dy) === 'park')
      )
        choices.push({ x: x + 0.5, y: y + 0.5 });
  const score = (p: Point) =>
    Math.hypot(p.x - (bx * 6 + 3), p.y - (by * 6 + 3)) + landscapeRandom(p.x * 2, p.y * 2)() * 0.4;
  choices.sort((a, b) => score(a) - score(b) || a.y - b.y || a.x - b.x);
  const chosen = choices[0] ?? null;
  memo.set(k, chosen);
  return chosen;
}
function parkClearingsNear(G: GameState, c: Point): Point[] {
  const bx = Math.floor(c.x / 6),
    by = Math.floor(c.y / 6),
    k = `${bx},${by}`;
  const memo = cacheFor(G).clearingAreas;
  if (memo.has(k)) return memo.get(k)!;
  const out: Point[] = [];
  for (let yy = by - 1; yy <= by + 1; yy++)
    for (let xx = bx - 1; xx <= bx + 1; xx++) {
      const a = rawParkClearing(G, xx, yy);
      if (!a) continue;
      let conflict = false;
      for (let ny = yy - 1; ny <= yy + 1; ny++)
        for (let nx = xx - 1; nx <= xx + 1; nx++) {
          if (ny > yy || (ny === yy && nx >= xx)) continue;
          const other = rawParkClearing(G, nx, ny);
          if (other && Math.abs(a.x - other.x) < 2 && Math.abs(a.y - other.y) < 2) conflict = true;
        }
      if (!conflict) out.push(a);
    }
  memo.set(k, out);
  return out;
}

export interface TerrainFeature {
  key: DecorationKey;
  x: number;
  y: number;
  size: number;
  clearing?: boolean;
  angle?: number;
  amenity?: boolean;
}
/** Furniture belongs to clearings; trees and flowers belong to the continuous park surface. */
export function townTerrainFeatures(G: GameState, cells: TerrainCell[]): TerrainFeature[] {
  const out: TerrainFeature[] = [];
  const paths = townWalks(G, cells);
  for (const c of cells) {
    const r = landscapeRandom(c.x - 313, c.y + 709),
      pick = r();
    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const same = neighbors.filter(([dx, dy]) => townTerrainAt(G, c.x + dx, c.y + dy) === c.kind).length;
    const x = (c.x + 0.5) * DECOR_CELL,
      y = (c.y + 0.5) * DECOR_CELL;
    if (c.kind === 'water') {
      const bridge = townBridgeAt(G, c.x, c.y);
      if (bridge !== null) out.push({ key: 'pond-bridge', x, y, size: 112, angle: bridge });
      else if (same === 4 && pick > 0.83) out.push({ key: 'pond-lilies', x, y, size: 38 });
    } else if (
      c.kind === 'court' &&
      same === 4 &&
      courtAnchor(G, c)?.x === c.x &&
      courtAnchor(G, c)?.y === c.y
    ) {
      out.push({ key: pick > 0.94 ? 'park-gazebo' : 'park-fountain', x, y, size: 68 });
    } else if (c.kind === 'court' && same < 4 && pick > 0.87) {
      out.push({ key: 'garden-planter', x, y, size: 38 });
    } else if (c.kind === 'park') {
      const clearing = parkClearingsNear(G, c).find(
        (a) => Math.abs(c.x - a.x) <= 0.5 && Math.abs(c.y - a.y) <= 0.5,
      );
      if (clearing) {
        if (c.x === Math.floor(clearing.x) && c.y === Math.floor(clearing.y)) {
          const cx = (clearing.x + 0.5) * DECOR_CELL,
            cy = (clearing.y + 0.5) * DECOR_CELL;
          const choice = landscapeRandom(c.x + 137, c.y - 283)();
          out.push({
            key: choice < 0.45 ? 'park-picnic' : choice < 0.82 ? 'park-gazebo' : 'park-fountain',
            x: cx,
            y: cy,
            size: choice < 0.45 ? 74 : 88,
            clearing: true,
          });
          out.push({ key: 'park-bench', x: cx + 48, y: cy + 28, size: 40 });
          out.push({ key: 'park-flowers', x: cx - 48, y: cy + 24, size: 42, amenity: true });
          out.push({ key: 'park-tree', x: cx - 40, y: cy - 32, size: 50, amenity: true });
        }
        continue;
      }
      const theme = townParkTheme(c.x, c.y),
        wooded = theme === 'grove';
      if (neighbors.some(([dx, dy]) => townTerrainAt(G, c.x + dx, c.y + dy) === 'water') && pick > 0.4) {
        out.push({ key: pick > 0.7 ? 'pond-reeds' : 'pond-rocks', x, y, size: 42 });
        continue;
      }
      if (same === 4 && theme === 'orchard' && (c.x + c.y) % 2 === 0) {
        out.push({ key: c.x % 3 ? 'orchard-apple' : 'orchard-orange', x, y, size: 70 });
        continue;
      }
      if (same === 4 && theme === 'garden' && (c.x + c.y) % 2 === 0) {
        out.push({ key: 'garden-bed', x, y, size: 54 });
        continue;
      }
      if (wooded && same === 4 && pick > 0.5) out.push({ key: 'park-tree', x, y, size: 76 });
      else if (same < 4 && (c.x + c.y) % 3 === 0 && pick > 0.22)
        out.push({ key: 'park-flowers', x, y, size: 46 });
      else if (neighbors.some(([dx, dy]) => townTerrainAt(G, c.x + dx, c.y + dy) === 'court') && pick > 0.6)
        out.push({ key: 'park-bench', x, y, size: 48 });
      else if (!wooded && same === 4 && pick > 0.975) out.push({ key: 'park-picnic', x, y, size: 60 });
    }
  }
  return out
    .filter((p) => {
      if (
        p.clearing ||
        p.amenity ||
        ['park-bench', 'park-fountain', 'park-gazebo', 'park-picnic', 'pond-bridge', 'pond-lilies'].includes(
          p.key,
        )
      )
        return true;
      return !paths.some((route) =>
        route.slice(1).some((b, i) => {
          const a = route[i],
            dx = b.x - a.x,
            dy = b.y - a.y,
            t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
          return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < p.size * 0.35 + 9;
        }),
      );
    })
    .sort((a, b) => a.y - b.y);
}

/** Broad planting themes span several cells rather than changing at every tile. */
export function townParkTheme(x: number, y: number): 'garden' | 'orchard' | 'grove' | 'meadow' {
  const n = noise(x / 7, y / 7, 178);
  return n > 0.67 ? 'orchard' : n > 0.48 ? 'grove' : n < 0.32 ? 'garden' : 'meadow';
}

/** Bridges only cross narrow water with solid land at both ends. */
export function townBridgeAt(G: GameState, x: number, y: number): number | null {
  if (townTerrainAt(G, x, y) !== 'water' || landscapeRandom(x + 84, y - 91)() < 0.55) return null;
  const land = (xx: number, yy: number) => ['park', 'court'].includes(townTerrainAt(G, xx, yy) ?? '');
  if (land(x - 1, y) && land(x + 1, y)) return 0;
  if (land(x, y - 1) && land(x, y + 1)) return Math.PI / 2;
  return null;
}

const walks = new WeakMap<GameState, Map<string, Point[][]>>();
/** Short walks join neighboring activity clearings through real parkland, never across the board. */
export function townWalks(G: GameState, cells: TerrainCell[]): Point[][] {
  let memo = walks.get(G);
  if (!memo) {
    memo = new Map();
    walks.set(G, memo);
  }
  const blocks = new Set<string>();
  for (const c of cells)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) blocks.add(`${Math.floor(c.x / 6) + dx},${Math.floor(c.y / 6) + dy}`);
  const out: Point[][] = [];
  for (const block of blocks) {
    if (!memo.has(block)) {
      const [bx, by] = block.split(',').map(Number);
      const start = rawParkClearing(G, bx, by);
      const routes: Point[][] = [];
      if (start && parkClearingsNear(G, start).some((p) => key(p) === key(start))) {
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
        ]) {
          const end = rawParkClearing(G, bx + dx, by + dy);
          if (!end || !parkClearingsNear(G, end).some((p) => key(p) === key(end))) continue;
          const a = { x: Math.floor(start.x), y: Math.floor(start.y) },
            b = { x: Math.floor(end.x), y: Math.floor(end.y) };
          const queue = [a],
            previous = new Map<string, Point | null>([[key(a), null]]);
          for (let i = 0; i < queue.length && queue.length < 180; i++) {
            const p = queue[i];
            if (key(p) === key(b)) break;
            for (const [sx, sy] of [
              [1, 0],
              [0, 1],
              [-1, 0],
              [0, -1],
            ]) {
              const q = { x: p.x + sx, y: p.y + sy };
              const kind = townTerrainAt(G, q.x, q.y);
              const alongBridge = (cell: Point) => {
                if (townTerrainAt(G, cell.x, cell.y) !== 'water') return true;
                const angle = townBridgeAt(G, cell.x, cell.y);
                return angle !== null && (angle === 0 ? sy === 0 : sx === 0);
              };
              if (!alongBridge(p) || !alongBridge(q)) continue;
              if (previous.has(key(q)) || !kind || (kind === 'water' && townBridgeAt(G, q.x, q.y) === null))
                continue;
              if (Math.abs(q.x - a.x) > 12 || Math.abs(q.y - a.y) > 12) continue;
              previous.set(key(q), p);
              queue.push(q);
            }
          }
          if (!previous.has(key(b))) continue;
          const route: Point[] = [];
          let p: Point | null = b;
          while (p) {
            route.push({ x: (p.x + 0.5) * DECOR_CELL, y: (p.y + 0.5) * DECOR_CELL });
            p = previous.get(key(p)) ?? null;
          }
          route.reverse();
          route[0] = { x: (start.x + 0.5) * DECOR_CELL, y: (start.y + 0.5) * DECOR_CELL };
          route[route.length - 1] = { x: (end.x + 0.5) * DECOR_CELL, y: (end.y + 0.5) * DECOR_CELL };
          routes.push(route);
        }
      }
      memo.set(block, routes);
    }
    out.push(...memo.get(block)!);
  }
  return out;
}

export const FRAME_CELL = 20;
const frames = new WeakMap<GameState, { cells: TerrainCell[]; gates: Point[] }>();
/** One shared silhouette around tiles and approach roads, including inside corners. */
export function townBoardFrame(G: GameState) {
  const saved = frames.get(G);
  if (saved) return saved;
  const occupied = new Map<string, TerrainCell>();
  const add = (
    left: number,
    top: number,
    right: number,
    bottom: number,
    inside: (x: number, y: number) => boolean,
  ) => {
    for (let y = Math.floor(top / FRAME_CELL); y <= Math.ceil(bottom / FRAME_CELL); y++)
      for (let x = Math.floor(left / FRAME_CELL); x <= Math.ceil(right / FRAME_CELL); x++)
        if (inside((x + 0.5) * FRAME_CELL, (y + 0.5) * FRAME_CELL))
          occupied.set(`${x},${y}`, { x, y, kind: 'park' });
  };
  const centers = G.nodes.map((n) => cellCenter(G.layout, n.x, n.y));
  const gates: Point[] = [];
  for (const n of G.nodes) {
    const a = centers[n.id],
      h = tileTop(G.layout, 62);
    add(
      a.x - 62,
      a.y - h,
      a.x + 62,
      a.y + h,
      (x, y) =>
        G.layout === 'square' || Math.abs(y - a.y) < h - (Math.max(0, Math.abs(x - a.x) - 31) * h) / 62,
    );
    for (const portal of n.portals ?? []) {
      const v = sideVector(G.layout, n.x, n.y, portal.side);
      gates.push({ x: a.x + v.x * 0.72, y: a.y + v.y * 0.72 });
    }
    for (const id of n.nb) {
      if (id < n.id || n.portals?.some((p) => p.to === id)) continue;
      const b = centers[id],
        dx = b.x - a.x,
        dy = b.y - a.y;
      add(
        Math.min(a.x, b.x) - 35,
        Math.min(a.y, b.y) - 35,
        Math.max(a.x, b.x) + 35,
        Math.max(a.y, b.y) + 35,
        (x, y) => {
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
          return Math.hypot(x - a.x - t * dx, y - a.y - t * dy) < 35;
        },
      );
    }
  }
  const result = {
    cells: [...occupied.values()],
    gates: [...new Map(gates.map((p) => [key(p), p])).values()],
  };
  frames.set(G, result);
  return result;
}
