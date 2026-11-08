import { describe, expect, it } from 'vitest';
import { boardFromFile, boardToFile, validateBoard } from '../src/boards/format';
import { Game } from '../src/engine';
import { cpuSeats } from '../src/headless';
import { newGame } from '../src/setup';
import type { BoardDef, GameState } from '../src/types';
import { TEST_TOWN } from './helpers';

const at = (G: GameState, x: number, y: number) => G.nodes.find((s) => s.x === x && s.y === y)!;
const idx = (b: BoardDef, x: number, y: number) => b.squares.findIndex((s) => s.x === x && s.y === y);

/** Test Town with the bottom road's link from (6,6) to (7,6) made one way: east only. */
function oneWayTown(): BoardDef {
  const b = structuredClone(TEST_TOWN);
  b.oneWay = [[idx(b, 6, 6), idx(b, 7, 6)]];
  return b;
}

function play(board: BoardDef) {
  const G = newGame({ rules: 'standard', target: 5000, roundCap: 0, seats: cpuSeats(2), seed: 3, board });
  const game = new Game(G, { decide: async () => undefined as never, emit: async () => {} });
  return { G, game };
}

describe('one-way roads', () => {
  it('only lets players go the allowed way', () => {
    const { G, game } = play(oneWayTown());
    const p = G.players[0];
    // From (7,6), heading back west over the one-way road is not allowed.
    p.node = at(G, 7, 6).id;
    p.prev = at(G, 8, 6).id;
    expect(game.destinations(p, 1).map((r) => r.node)).not.toContain(at(G, 6, 6).id);
    // From (6,6) going east is fine.
    p.node = at(G, 6, 6).id;
    p.prev = at(G, 5, 6).id;
    expect(game.destinations(p, 1).map((r) => r.node)).toEqual([at(G, 7, 6).id]);
  });

  it('turns players around rather than going the wrong way', () => {
    const { G, game } = play(oneWayTown());
    const p = G.players[0];
    // Arriving at (7,6) from the east, the only ways on are back east or the wrong way west.
    p.node = at(G, 7, 6).id;
    p.prev = at(G, 8, 6).id;
    expect(game.destinations(p, 1).map((r) => r.node)).toEqual([at(G, 8, 6).id]);
  });

  it('is kept by board files and checked', () => {
    const b = oneWayTown();
    const back = boardFromFile(JSON.parse(JSON.stringify(boardToFile(b))), 'x').board!;
    expect(back.oneWay).toEqual(b.oneWay);
    expect(validateBoard(b).errors).toEqual([]);
    // A tile whose roads all lead in has no way out.
    const trap = structuredClone(TEST_TOWN);
    const t = idx(trap, 7, 6);
    trap.oneWay = [
      [idx(trap, 6, 6), t],
      [idx(trap, 8, 6), t],
    ];
    expect(validateBoard(trap).errors.some((e) => e.includes('no way out'))).toBe(true);
    // A one-way road that isn't a road is broken.
    const broken = structuredClone(TEST_TOWN);
    broken.oneWay = [[idx(broken, 0, 0), idx(broken, 6, 6)]];
    expect(validateBoard(broken).errors).toContain('The board has a broken one-way road.');
  });
});
