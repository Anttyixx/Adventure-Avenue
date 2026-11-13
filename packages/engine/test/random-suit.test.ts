import { describe, expect, it, vi } from 'vitest';
import { makeGame } from './helpers';
import { boardFromFile, boardToFile, validateBoard } from '../src/boards/format';
import { BUILT_IN_BOARDS } from '../src/boards/builtin';
import { goals } from '../src/cpu';

describe('Random suit tile', () => {
  function setup(seed = 7) {
    const made = makeGame('standard', () => undefined, seed);
    const sq = made.G.nodes.find((s) => s.t === 'spade')!;
    sq.t = 'randomSuit';
    const p = made.G.players[0];
    p.suits = [true, false, true, false];
    made.game.venture = vi.fn(async () => {});
    return { ...made, sq, p };
  }

  it('gives exactly one missing suit on passing, without a venture card or wild card', async () => {
    const { game, events, sq, p } = setup();
    await game.passSquare(p, sq);
    expect(p.suits.filter(Boolean)).toHaveLength(3);
    expect(p.suits[0] && p.suits[2]).toBe(true);
    expect(p.wild).toBe(0);
    expect(events.filter((e) => e.type === 'suit')).toEqual([
      expect.objectContaining({ pid: p.id, passing: true }),
    ]);
    expect(game.venture).not.toHaveBeenCalled();
  });

  it('can choose either missing suit, using the seeded game RNG', async () => {
    const picked = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const { game, sq, p } = setup(seed);
      await game.collectSuit(p, sq);
      picked.add(p.suits[1] ? 1 : 3);
      const same = setup(seed);
      await same.game.collectSuit(same.p, same.sq);
      expect(same.p.suits).toEqual(p.suits);
    }
    expect([...picked].sort()).toEqual([1, 3]);
  });

  it('gives the suit immediately on landing, then draws one venture card', async () => {
    const { game, sq, p, events } = setup();
    game.venture = vi.fn(async () => {
      expect(p.suits.filter(Boolean)).toHaveLength(3);
      expect(events.filter((e) => e.type === 'suit')).toHaveLength(1);
    });
    await game.land(p, sq);
    expect(game.venture).toHaveBeenCalledOnce();
  });

  it.each([false, true])('does not award anything with all four suits (landing: %s)', async (land) => {
    const { game, G, sq, p, events } = setup();
    p.suits.fill(true);
    const before = { cash: p.cash, wild: p.wild, rng: G.rng };
    if (land) await game.land(p, sq);
    else await game.passSquare(p, sq);
    expect(p.suits).toEqual([true, true, true, true]);
    expect({ cash: p.cash, wild: p.wild, rng: G.rng }).toEqual(before);
    expect(events.filter((e) => e.type === 'suit' || e.type === 'money')).toHaveLength(0);
    expect(game.venture).toHaveBeenCalledTimes(land ? 1 : 0);
  });

  it('awards the last missing suit even when the player holds wild cards', async () => {
    const { game, sq, p } = setup();
    p.suits = [true, true, false, true];
    p.wild = 2;
    await game.passSquare(p, sq);
    expect(p.suits).toEqual([true, true, true, true]);
    expect(p.wild).toBe(2);
  });

  it.each(['cannon', 'taxi', 'balloon', 'warp', 'portal', 'card', 'swap', 'swapBack'] as const)(
    '%s arrival gives only one suit even when landing is processed afterward',
    async (how) => {
      const { game, sq, p, events } = setup();
      await game.warp(p, sq.id, how);
      expect(p.suits.filter(Boolean)).toHaveLength(3);
      await game.landAfterWarp(p);
      expect(p.suits.filter(Boolean)).toHaveLength(3);
      expect(events.filter((e) => e.type === 'suit')).toHaveLength(1);
      expect(game.venture).toHaveBeenCalledOnce();
    },
  );

  it('awards a suit while walking past without stopping movement', async () => {
    const { game, G, p } = setup();
    G.nodes = G.nodes.slice(0, 3);
    G.nodes.forEach((s, i) => {
      s.t = i === 1 ? 'randomSuit' : 'break';
      s.nb = i === 1 ? [0, 2] : [1];
    });
    p.node = 0;
    p.prev = -1;
    await game.move(p, 2);
    expect(p.node).toBe(2);
    expect(p.suits.filter(Boolean)).toHaveLength(3);
    expect(game.venture).not.toHaveBeenCalled();
  });

  it('counts as a CPU suit goal and scores routes without changing the RNG', () => {
    const { game, G, sq, p } = setup();
    expect(goals(G, p)).toContain(sq.id);
    const rng = G.rng;
    expect(game.routeScore(p, [sq.id])).toBe(100);
    expect(G.rng).toBe(rng);
  });

  it('can supply all suits on a valid custom board and survives export/import', () => {
    const board = structuredClone(BUILT_IN_BOARDS[0]);
    let first = true;
    for (const sq of board.squares) {
      if (['spade', 'heart', 'diamond', 'club', 'change'].includes(sq.t)) {
        sq.t = first ? 'randomSuit' : 'roll';
        first = false;
      }
    }
    expect(validateBoard(board).errors).toEqual([]);
    const loaded = boardFromFile(boardToFile(board), 'random-suit-test');
    expect(loaded.error).toBeUndefined();
    expect(loaded.board?.squares.some((s) => s.t === 'randomSuit')).toBe(true);
  });
});
