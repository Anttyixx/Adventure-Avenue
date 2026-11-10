import { describe, expect, it } from 'vitest';
import { BUILT_IN_BOARDS } from '../../../packages/engine/src/boards/builtin';
import { newGame } from '../../../packages/engine/src/setup';
import { cpuSeats } from '../../../packages/engine/src/headless';
import { cellCenter, sideVector, tileTop } from '../src/geometry';
import {
  DECOR_CELL,
  FRAME_CELL,
  townBoardFrame,
  townBridgeAt,
  townWalks,
  terrainContours,
  townTerrainAt,
  townTerrainCells,
  townTerrainFeatures,
  type TerrainCell,
} from '../src/town-terrain';
const state = (board = BUILT_IN_BOARDS[0]) =>
  newGame({ rules: 'standard', target: 10000, roundCap: 0, seats: cpuSeats(2), board, seed: 42 });

describe('connected cartoon terrain', () => {
  it('removes shared edges and keeps concave shapes, holes and separate diagonal locations', () => {
    const cells: TerrainCell[] = [
      { x: 0, y: 0, kind: 'water' },
      { x: 1, y: 0, kind: 'water' },
      { x: 0, y: 1, kind: 'water' },
    ];
    const l = terrainContours(cells, 'water');
    expect(l).toHaveLength(1);
    expect(l[0]).toHaveLength(8);
    expect(l[0]).toContainEqual({ x: 1, y: 1 });
    const rect = terrainContours(cells.slice(0, 2), 'water')[0];
    expect(rect).toHaveLength(6);
    expect(rect.some((p, i) => p.x === 1 && rect[(i + 1) % rect.length].x === 1)).toBe(false);
    const ring: TerrainCell[] = [];
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) if (x !== 1 || y !== 1) ring.push({ x, y, kind: 'park' });
    expect(terrainContours(ring, 'park')).toHaveLength(2);
    expect(
      terrainContours(
        [
          { x: 0, y: 0, kind: 'park' },
          { x: 1, y: 1, kind: 'park' },
        ],
        'park',
      ),
    ).toHaveLength(2);
  });
  it('keeps terrain cells clear of playable tiles and portal openings on every map', () => {
    for (const board of BUILT_IN_BOARDS) {
      const G = state(board),
        before = JSON.stringify(G),
        cells = townTerrainCells(G, 0, 0, 1800, 1100);
      for (const c of cells) {
        const x = (c.x + 0.5) * DECOR_CELL,
          y = (c.y + 0.5) * DECOR_CELL;
        for (const n of G.nodes) {
          const p = cellCenter(G.layout, n.x, n.y);
          expect(
            Math.abs(x - p.x) < DECOR_CELL / 2 + 43 &&
              Math.abs(y - p.y) < DECOR_CELL / 2 + tileTop(G.layout, 43),
          ).toBe(false);
          for (const gate of n.portals ?? []) {
            const v = sideVector(G.layout, n.x, n.y, gate.side);
            expect(Math.hypot(x - p.x - v.x * 0.72, y - p.y - v.y * 0.72)).toBeGreaterThan(
              DECOR_CELL / 2 + 26,
            );
          }
        }
      }
      expect(JSON.stringify(G)).toBe(before);
    }
  });
  it('builds large connected irregular ponds instead of isolated picture tiles', () => {
    const G = state(),
      cells = townTerrainCells(G, -1200, -1200, 3000, 2400),
      water = new Set(cells.filter((c) => c.kind === 'water').map((c) => `${c.x},${c.y}`));
    let irregular = false;
    for (const start of [...water]) {
      if (!water.delete(start)) continue;
      const points = [start.split(',').map(Number)];
      for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i];
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ])
          if (water.delete(`${x + dx},${y + dy}`)) points.push([x + dx, y + dy]);
      }
      const xs = points.map((p) => p[0]),
        ys = points.map((p) => p[1]);
      const area = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
      if (points.length >= 6 && area > points.length) irregular = true;
    }
    expect(irregular).toBe(true);
  });
  it('keeps surfaces and region features fixed when the camera patch changes', () => {
    const G = state(),
      wide = townTerrainCells(G, -1600, -1200, 3200, 2400),
      close = townTerrainCells(G, -400, -400, 1800, 1300);
    for (const c of close) expect(townTerrainAt(G, c.x, c.y)).toBe(c.kind);
    const all = townTerrainFeatures(G, wide);
    for (const feature of townTerrainFeatures(G, close)) expect(all).toContainEqual(feature);
    expect(all.some((p) => p.key === 'park-tree')).toBe(true);
    expect(all.some((p) => p.key === 'park-fountain' || p.key === 'park-gazebo')).toBe(true);
  });
  it('joins clearings with cosmetic walks that avoid gameplay and only cross water on bridges', () => {
    const G = state(),
      cells = townTerrainCells(G, -1600, -1200, 3200, 2400);
    const routes = townWalks(G, cells);
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes)
      for (const p of route) {
        const x = Math.floor(p.x / DECOR_CELL),
          y = Math.floor(p.y / DECOR_CELL);
        expect(townTerrainAt(G, x, y)).not.toBe(null);
        if (townTerrainAt(G, x, y) === 'water') expect(townBridgeAt(G, x, y)).not.toBe(null);
      }
    const frame = townBoardFrame(G);
    for (const n of G.nodes) {
      const p = cellCenter(G.layout, n.x, n.y);
      expect(
        frame.cells.some((c) => c.x === Math.floor(p.x / FRAME_CELL) && c.y === Math.floor(p.y / FRAME_CELL)),
      ).toBe(true);
    }
  });
  it('puts useful amenity groups in clear park areas instead of growing trees through them', () => {
    const G = state(),
      features = townTerrainFeatures(G, townTerrainCells(G, -1600, -1200, 3200, 2400));
    const clearings = features.filter((p) => p.clearing);
    expect(clearings.length).toBeGreaterThan(0);
    for (const p of clearings) {
      expect(['park-gazebo', 'park-picnic', 'park-fountain']).toContain(p.key);
      expect(features.some((q) => q.key === 'park-bench' && Math.hypot(q.x - p.x, q.y - p.y) < 80)).toBe(
        true,
      );
      expect(features.some((q) => q.key === 'park-flowers' && Math.hypot(q.x - p.x, q.y - p.y) < 80)).toBe(
        true,
      );
      for (const [dx, dy] of [
        [-60, -60],
        [60, -60],
        [-60, 60],
        [60, 60],
      ])
        expect(
          townTerrainAt(G, Math.floor((p.x + dx) / DECOR_CELL), Math.floor((p.y + dy) / DECOR_CELL)),
        ).toBe('park');
    }
    for (const p of features) {
      const x = Math.floor(p.x / DECOR_CELL),
        y = Math.floor(p.y / DECOR_CELL);
      if (townTerrainAt(G, x, y) === 'water') {
        expect(['pond-bridge', 'pond-lilies']).toContain(p.key);
        if (p.key === 'pond-bridge') expect(townBridgeAt(G, x, y)).toBe(p.angle);
      }
    }
  });
});
