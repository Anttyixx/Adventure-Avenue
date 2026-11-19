import { describe, expect, it } from 'vitest';
import { makeGame } from './helpers';
import { K } from '../src/constants';
import { cpuDecide } from '../src/cpu';
import { newGame, cloneState } from '../src/setup';
import { cpuSeats } from '../src/headless';
import { BUILT_IN_BOARDS } from '../src/boards/builtin';
import { boardFromFile, boardToFile, PLACEABLE } from '../src/boards/format';
import { fromMap } from '../src/boards/maps';

for (const type of ['gain', 'loss'] as const) {
  const delta = type === 'gain' ? K.cashTile : -K.cashTile;
  const reason = type === 'gain' ? 'Gain tile' : 'Loss tile';
  const setup = (rules: 'standard' | 'easy' = 'standard') => {
    const made = makeGame(rules);
    const sq = made.G.nodes.find((s) => s.t === 'venture')!;
    sq.t = type;
    return { ...made, sq, p: made.G.players[0] };
  };
  describe(`${type} cash tile`, () => {
    it.each(['standard', 'easy'] as const)('moves exactly 10G on stopping only (%s)', async (rules) => {
      const { G, game, events, asked, sq, p } = setup(rules);
      const before = G.players.map((q) => q.cash);
      await game.passSquare(p, sq);
      expect(p.cash).toBe(before[0]);
      expect(events.filter((e) => e.type === 'money')).toEqual([]);
      await game.land(p, sq);
      expect(G.players.map((q) => q.cash)).toEqual(before.map((cash, i) => cash + (i === 0 ? delta : 0)));
      expect(events.filter((e) => e.type === 'money')).toEqual([
        expect.objectContaining({
          from: type === 'gain' ? -1 : p.id,
          to: type === 'gain' ? p.id : -1,
          amount: 10,
          reason,
          sq: sq.id,
        }),
      ]);
      expect(asked).toEqual([]);
      const landing = G.log.find((l) => l.action === 'land' && l.sq === sq.id)!;
      expect(G.log.find((l) => l.text.includes(type === 'gain' ? 'gained 10G' : 'lost 10G'))).toMatchObject({
        sq: sq.id,
        parent: landing.id,
      });
    });
    it('ignores fee boosts, closure, Boon/Boom, stock holdings and repeat visits', async () => {
      const { G, game, sq, p } = setup();
      p.boost = 4;
      p.boon = 0.5;
      p.onBreak = true;
      G.players[1].boon = 0.5;
      G.players[1].shares.fill(100);
      const before = G.players.map((q) => q.cash);
      await game.land(p, sq);
      await game.land(p, sq);
      expect(G.players.map((q) => q.cash)).toEqual(before.map((cash, i) => cash + (i === 0 ? delta * 2 : 0)));
    });
    it.each(['cannon', 'taxi', 'balloon', 'warp', 'portal', 'card', 'swap', 'swapBack'] as const)(
      '%s applies once even when followed by landing',
      async (how) => {
        const { game, events, sq, p } = setup();
        const before = p.cash;
        await game.warp(p, sq.id, how);
        await game.landAfterWarp(p);
        expect(p.cash).toBe(before + delta);
        expect(events.filter((e) => e.type === 'money')).toHaveLength(1);
      },
    );
    it.each([1, 2])('portal stopping/passing with %s movement spaces', async (moves) => {
      const { G, game, p } = setup();
      G.nodes = G.nodes.slice(0, 4);
      G.nodes.forEach((sq, i) => {
        sq.t = i === 1 ? 'portal' : i === 2 ? type : 'blank';
        sq.nb = i === 0 ? [1] : i === 1 ? [0] : i === 2 ? [3] : [2];
      });
      G.nodes[1].link = 2;
      p.node = 0;
      p.prev = -1;
      const before = p.cash;
      await game.move(p, moves);
      expect(p.node).toBe(moves === 1 ? 2 : 3);
      expect(p.cash).toBe(before + (moves === 1 ? delta : 0));
    });
    it.each([1, 2])('walking applies the effect only when the %s-space roll stops on it', async (moves) => {
      const { G, game, p } = setup();
      G.nodes = G.nodes.slice(0, 3);
      G.nodes.forEach((sq, i) => {
        sq.t = i === 1 ? type : 'blank';
        sq.nb = i === 1 ? [0, 2] : [1];
      });
      p.node = 0;
      p.prev = -1;
      const before = p.cash;
      await game.move(p, moves);
      expect(p.cash).toBe(before + (moves === 1 ? delta : 0));
    });
    it('survives board export/import and saved state without extra fields', () => {
      expect(PLACEABLE).toContain(type);
      const board = structuredClone(BUILT_IN_BOARDS[0]);
      const index = board.squares.findIndex((sq) => sq.t === 'venture');
      board.squares[index].t = type;
      const loaded = boardFromFile(boardToFile(board), `${type}-test`);
      expect(loaded.error).toBeUndefined();
      const G = newGame({
        rules: 'standard',
        target: 5000,
        roundCap: 0,
        seats: cpuSeats(4),
        seed: 7,
        board: loaded.board!,
      });
      expect(cloneState(G).nodes[index]).toMatchObject({ t: type, owner: -1, d: -1 });
    });
  });
}

describe('cash tile debt and choices', () => {
  it('uses normal debt handling for an unaffordable loss rather than clamping the loss', async () => {
    const { G, game } = makeGame();
    const p = G.players[0];
    p.cash = 3;
    const sq = G.nodes.find((sq) => sq.t === 'venture')!;
    sq.t = 'loss';
    await game.land(p, sq);
    expect(p.cash).toBe(-7);
    await game.settleDebt(p);
    expect(p.bankrupt).toBe(true);
  });
  it('settles a non-current swapped-in player’s debt', async () => {
    const { G, game } = makeGame();
    const p = G.players[1];
    p.cash = 3;
    const sq = G.nodes.find((sq) => sq.t === 'venture')!;
    sq.t = 'loss';
    await game.warp(p, sq.id, 'swapBack');
    expect(p.bankrupt).toBe(true);
  });
  it('makes bots prefer an otherwise identical gain destination and ignores passed cash tiles', () => {
    const { G, game } = makeGame();
    const p = G.players[0];
    p.cpuLevel = 'master';
    G.nodes = G.nodes.slice(0, 3);
    G.nodes.forEach((sq, i) => {
      sq.t = i === 0 ? 'blank' : i === 1 ? 'gain' : 'loss';
      sq.owner = -1;
      sq.nb = i ? [0] : [1, 2];
      sq.x = sq.y = 0;
    });
    p.node = 0;
    p.prev = -1;
    expect(
      cpuDecide(G, {
        kind: 'path',
        pid: p.id,
        steps: 1,
        dests: [
          { node: 2, path: [2] },
          { node: 1, path: [1] },
        ],
      }),
    ).toBe(1);
    expect(game.routeScore(p, [1])).toBe(10);
    expect(game.routeScore(p, [2])).toBe(-10);
    expect(game.routeScore(p, [1, 0])).toBe(0);
    expect(game.routeScore(p, [2, 0])).toBe(0);
  });
  it('accepts plus/minus map glyphs', () => {
    const board = fromMap({
      id: 'money-map',
      name: 'Money map',
      layout: 'square',
      districts: [],
      map: ['B+-'],
    });
    expect(board.squares.map((sq) => sq.t)).toEqual(['bank', 'gain', 'loss']);
  });
});
