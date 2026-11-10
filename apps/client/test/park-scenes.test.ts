import { describe, expect, it } from 'vitest';
import { BUILT_IN_BOARDS, neighborCells } from '@aa/engine';
import { newGame } from '../../../packages/engine/src/setup';
import { cpuSeats } from '../../../packages/engine/src/headless';
import { cellCenter, sideVector } from '../src/geometry';
import { composePark, parkScenes } from '../src/park-scenes';
import { parkBoundary } from '../src/park-scenes-art';
const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;

describe('recombinable park pieces', () => {
  it('uses the same kit on different concave footprints and keeps only shared outside walls', () => {
    const shapes = [
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
        [0, 2],
        [1, 2],
        [2, 2],
      ],
    ];
    for (const cells of shapes) {
      const footprint = cells.map(([x, y]) => ({ x, y })),
        a = composePark('square', footprint, 21),
        b = composePark('square', footprint, 22);
      expect(a.pieces.map(({ x, y }) => ({ x, y }))).toEqual(footprint);
      expect(a).not.toEqual(b);
      const loops = parkBoundary(a);
      expect(loops).toHaveLength(1);
      expect(loops[0].length).toBe(cells.length === 3 ? 8 : 16);
      const members = new Set(footprint.map(key));
      for (const p of a.walk) expect(members.has(key(p))).toBe(true);
    }
  });
  it('joins actual hex edges, including staggered odd and negative rows', () => {
    for (const y of [-1, 0, 1]) {
      const [x2, y2] = neighborCells('hex', 0, y)[0];
      const a = composePark(
        'hex',
        [
          { x: 0, y },
          { x: x2, y: y2 },
        ],
        11,
      );
      expect(parkBoundary(a)).toHaveLength(1);
      expect(parkBoundary(a)[0]).toHaveLength(10);
    }
  });
  it('fits complete connected groups around every map without blocking tiles or portal mouths', () => {
    for (const board of BUILT_IN_BOARDS) {
      const G = newGame({
          rules: 'standard',
          target: 10000,
          roundCap: 0,
          seats: cpuSeats(2),
          board,
          seed: 42,
        }),
        before = JSON.stringify(G),
        scenes = parkScenes(G);
      expect(scenes.length).toBeGreaterThan(0);
      const used = new Set<string>();
      for (const scene of scenes) {
        expect(scene.pieces.length).toBeGreaterThanOrEqual(3);
        const members = new Set(scene.pieces.map(key)),
          reached = new Set([key(scene.pieces[0])]),
          queue = [scene.pieces[0]];
        for (let i = 0; i < queue.length; i++)
          for (const [x, y] of neighborCells(G.layout, queue[i].x, queue[i].y))
            if (members.has(`${x},${y}`) && !reached.has(`${x},${y}`)) {
              reached.add(`${x},${y}`);
              queue.push({ x, y });
            }
        expect(reached.size).toBe(members.size);
        for (const p of scene.pieces) {
          expect(used.has(key(p))).toBe(false);
          used.add(key(p));
          const c = cellCenter(G.layout, p.x, p.y);
          for (const n of G.nodes) {
            const a = cellCenter(G.layout, n.x, n.y);
            expect(Math.hypot(c.x - a.x, c.y - a.y)).toBeGreaterThanOrEqual(95);
            for (const gate of n.portals ?? []) {
              const v = sideVector(G.layout, n.x, n.y, gate.side);
              expect(Math.hypot(c.x - a.x - v.x * 0.72, c.y - a.y - v.y * 0.72)).toBeGreaterThanOrEqual(105);
            }
          }
        }
      }
      expect(parkScenes(G)).toBe(scenes);
      expect(JSON.stringify(G)).toBe(before);
    }
  });
});
