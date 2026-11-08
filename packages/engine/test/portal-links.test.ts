import { describe, expect, it } from 'vitest';
import { boardFromFile, boardToFile, validateBoard } from '../src/boards/format';
import { Game } from '../src/engine';
import { cpuSeats } from '../src/headless';
import { computeRows } from '../src/rules';
import { newGame } from '../src/setup';
import type { BoardDef, GameState } from '../src/types';
import { TEST_TOWN } from './helpers';

const at = (G: GameState, x: number, y: number) => G.nodes.find((s) => s.x === x && s.y === y)!;
const idx = (b: BoardDef, x: number, y: number) => b.squares.findIndex((s) => s.x === x && s.y === y);

/** Test Town with a portal link from the bottom of (5,0) to the top of (5,6), across the park. */
function portalTown(): BoardDef {
  const b = structuredClone(TEST_TOWN);
  b.portalLinks = [{ a: idx(b, 5, 0), b: idx(b, 5, 6), sa: 2, sb: 3 }];
  return b;
}

function play(board: BoardDef) {
  const G = newGame({ rules: 'easy', target: 5000, roundCap: 0, seats: cpuSeats(2), seed: 3, board });
  const game = new Game(G, { decide: async () => undefined as never, emit: async () => {} });
  return { G, game };
}

describe('portal links', () => {
  it('lets players step through as if the tiles were neighbors', () => {
    const { G, game } = play(portalTown());
    const p = G.players[0];
    p.node = at(G, 5, 0).id;
    p.prev = at(G, 4, 0).id;
    const one = game.destinations(p, 1).map((r) => r.node);
    expect(one).toContain(at(G, 5, 6).id);
    expect(one).toContain(at(G, 6, 0).id);
    expect(at(G, 5, 0).portals).toEqual([{ to: at(G, 5, 6).id, side: 2, way: 'both' }]);
    // Coming back through the portal counts as turning back.
    p.node = at(G, 5, 6).id;
    p.prev = at(G, 5, 0).id;
    expect(game.destinations(p, 1).map((r) => r.node)).not.toContain(at(G, 5, 0).id);
  });

  it('can be one way: an entrance leads to an exit, with no way back', () => {
    const b = portalTown();
    b.portalLinks![0].oneWay = true;
    const { G, game } = play(b);
    const p = G.players[0];
    expect(at(G, 5, 0).portals).toEqual([{ to: at(G, 5, 6).id, side: 2, way: 'in' }]);
    expect(at(G, 5, 6).portals).toEqual([{ to: at(G, 5, 0).id, side: 3, way: 'out' }]);
    p.node = at(G, 5, 0).id;
    p.prev = at(G, 4, 0).id;
    expect(game.destinations(p, 1).map((r) => r.node)).toContain(at(G, 5, 6).id);
    p.node = at(G, 5, 6).id;
    p.prev = at(G, 4, 6).id;
    expect(game.destinations(p, 1).map((r) => r.node)).not.toContain(at(G, 5, 0).id);
    expect(validateBoard(b).errors).toEqual([]);
  });

  it('lets several entrances lead to one exit, but an entrance to only one exit', () => {
    const b = portalTown();
    // A second entrance: the bottom of (6,0) also leads out of (5,6)'s top.
    b.portalLinks = [
      { a: idx(b, 5, 0), b: idx(b, 5, 6), sa: 2, sb: 3, oneWay: true },
      { a: idx(b, 6, 0), b: idx(b, 5, 6), sa: 2, sb: 3, oneWay: true },
    ];
    expect(validateBoard(b).errors).toEqual([]);
    const { G, game } = play(b);
    const p = G.players[0];
    p.node = at(G, 6, 0).id;
    p.prev = at(G, 7, 0).id;
    expect(game.destinations(p, 1).map((r) => r.node)).toContain(at(G, 5, 6).id);
    // One entrance to two exits is a problem.
    const two = structuredClone(TEST_TOWN);
    two.portalLinks = [
      { a: idx(two, 5, 0), b: idx(two, 5, 6), sa: 2, sb: 3, oneWay: true },
      { a: idx(two, 5, 0), b: idx(two, 6, 6), sa: 2, sb: 3, oneWay: true },
    ];
    expect(validateBoard(two).errors.some((e) => e.includes('more than one exit'))).toBe(true);
    // A two-way portal can't share its side with another link.
    const shared = structuredClone(TEST_TOWN);
    shared.portalLinks = [
      { a: idx(shared, 5, 0), b: idx(shared, 5, 6), sa: 2, sb: 3 },
      { a: idx(shared, 6, 0), b: idx(shared, 5, 6), sa: 2, sb: 3, oneWay: true },
    ];
    expect(validateBoard(shared).errors.some((e) => e.includes('more than one portal link'))).toBe(true);
  });

  it("doesn't join rows of properties", () => {
    const { G } = play(portalTown());
    const rows = computeRows(G);
    const row = (x: number, y: number) => rows.findIndex((r) => r.includes(at(G, x, y).id));
    expect(row(5, 0)).not.toBe(row(5, 6));
  });

  it('is kept by board files and checked', () => {
    const b = portalTown();
    const back = boardFromFile(JSON.parse(JSON.stringify(boardToFile(b))), 'x').board!;
    expect(back.portalLinks).toEqual(b.portalLinks);
    expect(validateBoard(b).errors).toEqual([]);
    // A portal must face an empty cell: (5,0)'s right side is the next tile.
    const blocked = structuredClone(TEST_TOWN);
    blocked.portalLinks = [{ a: idx(blocked, 5, 0), b: idx(blocked, 5, 6), sa: 0, sb: 3 }];
    expect(validateBoard(blocked).errors.some((e) => e.includes('opens onto another tile'))).toBe(true);
    const broken = structuredClone(TEST_TOWN);
    broken.portalLinks = [{ a: 0, b: 0, sa: 0, sb: 1 }];
    expect(validateBoard(broken).errors).toContain('The board has a broken portal link.');
  });
});
