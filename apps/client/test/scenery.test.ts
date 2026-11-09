import { describe, expect, it } from 'vitest';
import { BUILT_IN_BOARDS } from '../../../packages/engine/src/boards/builtin';
import { newGame } from '../../../packages/engine/src/setup';
import { cpuSeats } from '../../../packages/engine/src/headless';
import { cellCenter, sideVector, tileTop, worldSize } from '../src/geometry';
import { sceneryBeyondBoard, sceneryForBoard } from '../src/scenery';

const state = (board = BUILT_IN_BOARDS[0]) =>
  newGame({
    rules: 'standard',
    target: 10000,
    roundCap: 0,
    seats: cpuSeats(2),
    board,
    seed: 42,
  });

describe('decorative scenery', () => {
  it('keeps every built-in board, its roads and its portal rings clear', () => {
    for (const board of BUILT_IN_BOARDS) {
      const G = state(board);
      const before = JSON.stringify(G);
      const stamps = sceneryForBoard(G);
      expect(stamps.length, board.name).toBeGreaterThan(0);
      expect(sceneryForBoard(G)).toEqual(stamps);
      expect(JSON.stringify(G)).toBe(before);
      const world = worldSize(G);
      for (const p of stamps) {
        expect(p.x - p.size / 2).toBeGreaterThanOrEqual(0);
        expect(p.y - p.size / 2).toBeGreaterThanOrEqual(0);
        expect(p.x + p.size / 2).toBeLessThanOrEqual(world.w);
        expect(p.y + p.size / 2).toBeLessThanOrEqual(world.h);
        for (const n of G.nodes) {
          const c = cellCenter(G.layout, n.x, n.y);
          const overlap =
            Math.abs(p.x - c.x) < p.size / 2 + 43 && Math.abs(p.y - c.y) < p.size / 2 + tileTop(G.layout, 43);
          expect(overlap, `${board.name}: decoration over tile ${n.id}`).toBe(false);
          for (const gate of n.portals ?? []) {
            const v = sideVector(G.layout, n.x, n.y, gate.side);
            expect(Math.hypot(p.x - c.x - v.x * 0.72, p.y - c.y - v.y * 0.72)).toBeGreaterThan(
              p.size / 2 + 27,
            );
          }
          for (const id of n.nb) {
            if (n.portals?.some((gate) => gate.to === id)) continue;
            const b = cellCenter(G.layout, G.nodes[id].x, G.nodes[id].y);
            const dx = b.x - c.x,
              dy = b.y - c.y;
            const t = Math.max(
              0,
              Math.min(1, ((p.x - c.x) * dx + (p.y - c.y) * dy) / (dx * dx + dy * dy || 1)),
            );
            expect(Math.hypot(p.x - c.x - t * dx, p.y - c.y - t * dy)).toBeGreaterThan(p.size / 2 + 14);
          }
        }
      }
    }
  });

  it('continues outside the board and keeps pieces fixed when the camera moves', () => {
    const G = state();
    const before = JSON.stringify(G);
    const world = worldSize(G);
    const wide = sceneryBeyondBoard(G, -1500, -1200, 3000, 2200);
    const close = sceneryBeyondBoard(G, -1000, -800, 2500, 1800);
    expect(wide.length).toBeGreaterThan(0);
    for (const p of wide) {
      expect(
        p.x + p.size / 2 < 0 ||
          p.y + p.size / 2 < 0 ||
          p.x - p.size / 2 > world.w ||
          p.y - p.size / 2 > world.h,
      ).toBe(true);
    }
    for (const p of close) expect(wide).toContainEqual(p);
    expect(JSON.stringify(G)).toBe(before);
  });
});
