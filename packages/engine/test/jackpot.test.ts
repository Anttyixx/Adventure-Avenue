import { describe, expect, it, vi } from 'vitest';
import { makeGame } from './helpers';
import { Game } from '../src/engine';
import { K } from '../src/constants';
import { cpuDecide } from '../src/cpu';
import { newGame, cloneState } from '../src/setup';
import { cpuSeats } from '../src/headless';
import { BUILT_IN_BOARDS } from '../src/boards/builtin';
import { boardFromFile, boardToFile } from '../src/boards/format';

describe('Jackpot tile', () => {
  function setup(rules: 'standard' | 'easy' = 'standard') {
    const made = makeGame(rules);
    const sq = made.G.nodes.find((s) => s.t === 'venture')!;
    sq.t = 'jackpot';
    sq.pot = 0;
    const p = made.G.players[0];
    return { ...made, sq, p };
  }

  it.each(['standard', 'easy'] as const)(
    'holds each passer’s 10G without giving money to anyone (%s)',
    async (rules) => {
      const { G, game, events, sq } = setup(rules);
      const before = G.players.map((p) => p.cash);
      for (const p of G.players) await game.passSquare(p, sq);
      expect(sq.pot).toBe(G.players.length * K.jackpotPass);
      expect(G.players.map((p) => p.cash)).toEqual(before.map((cash) => cash - K.jackpotPass));
      expect(sq.owner).toBe(-1);
      expect(events.filter((e) => e.type === 'money')).toHaveLength(G.players.length);
      for (const event of events.filter((e) => e.type === 'money'))
        expect(event).toMatchObject({ to: -1, amount: 10, reason: 'Jackpot contribution', sq: sq.id });
    },
  );

  it('pays the entire pot to the lander, resets it, and never charges for stopping', async () => {
    const { G, game, events, asked, sq, p } = setup();
    const total = G.players.reduce((n, q) => n + q.cash, 0);
    for (let i = 0; i < 5; i++) await game.passSquare(G.players[i % 4], sq);
    const before = p.cash;
    await game.land(p, sq);
    expect(p.cash).toBe(before + 50);
    expect(sq.pot).toBe(0);
    expect(events.filter((e) => e.type === 'money' && e.reason === 'Jackpot payout')).toEqual([
      expect.objectContaining({ from: -1, to: p.id, amount: 50, sq: sq.id }),
    ]);
    expect(G.players.reduce((n, q) => n + q.cash, 0)).toBe(total);
    expect(asked).toEqual([]);
    expect(G.log.find((l) => l.text.includes('collected 50G from the jackpot'))).toMatchObject({
      sq: sq.id,
      parent: expect.any(String),
    });
  });

  it('does nothing on an empty or legacy pot, then starts accumulating from zero', async () => {
    const { game, events, sq, p } = setup();
    delete sq.pot;
    const before = p.cash;
    await game.land(p, sq);
    expect(p.cash).toBe(before);
    expect(sq.pot).toBe(0);
    expect(events.filter((e) => e.type === 'money')).toEqual([]);
    await game.passSquare(p, sq);
    expect(p.cash).toBe(before - 10);
    expect(sq.pot).toBe(10);
  });

  it('has independent pots, and contributions ignore boosts, Boon, closure and stocks', async () => {
    const { G, game, sq, p } = setup();
    const other = G.nodes.find((s) => s.t === 'roll')!;
    other.t = 'jackpot';
    other.pot = 70;
    p.boost = 4;
    p.onBreak = true;
    G.players[1].boon = 0.5;
    G.players[1].shares.fill(100);
    const before = G.players.map((q) => q.cash);
    await game.passSquare(p, sq);
    expect(sq.pot).toBe(10);
    expect(other.pot).toBe(70);
    expect(G.players.map((q) => q.cash)).toEqual(before.map((cash, i) => cash - (i === 0 ? 10 : 0)));
    expect(p.stats.feesPaid).toBe(0);
    expect(G.players[1].stats.commission).toBe(0);
    await game.land(G.players[2], other);
    expect(other.pot).toBe(0);
    expect(sq.pot).toBe(10);
    expect(G.players[2].cash).toBe(before[2] + 70);
  });

  it('uses normal debt rules when a passer has less than 10G', async () => {
    const { game, sq, p } = setup();
    p.cash = 3;
    await game.passSquare(p, sq);
    expect(p.cash).toBe(-7);
    expect(sq.pot).toBe(10);
  });

  it.each(['cannon', 'taxi', 'balloon', 'warp', 'portal', 'card', 'swap', 'swapBack'] as const)(
    '%s arrivals collect once even if landing is processed afterward',
    async (how) => {
      const { game, events, sq, p } = setup();
      sq.pot = 80;
      const before = p.cash;
      await game.warp(p, sq.id, how);
      await game.landAfterWarp(p);
      expect(sq.pot).toBe(0);
      expect(p.cash).toBe(before + 80);
      expect(events.filter((e) => e.type === 'money')).toHaveLength(1);
    },
  );

  it.each([1, 2])('a portal arrival handles stopping/passing correctly with %s moves', async (moves) => {
    const { G, game, p } = setup();
    G.nodes = G.nodes.slice(0, 4);
    G.nodes.forEach((s, i) => {
      s.t = i === 1 ? 'portal' : i === 2 ? 'jackpot' : 'break';
      s.nb = i === 0 ? [1] : i === 1 ? [0] : i === 2 ? [3] : [2];
    });
    G.nodes[1].link = 2;
    G.nodes[2].pot = 80;
    p.node = 0;
    p.prev = -1;
    const before = p.cash;
    await game.move(p, moves);
    expect(p.node).toBe(moves === 1 ? 2 : 3);
    expect(p.cash).toBe(before + (moves === 1 ? 80 : -10));
    expect(G.nodes[2].pot).toBe(moves === 1 ? 0 : 90);
  });

  it('charges only while passing on an ordinary walking route', async () => {
    const { G, game, p } = setup();
    G.nodes = G.nodes.slice(0, 3);
    G.nodes.forEach((s, i) => {
      s.t = i === 1 ? 'jackpot' : 'break';
      s.nb = i === 1 ? [0, 2] : [1];
    });
    G.nodes[1].pot = 40;
    p.node = 0;
    p.prev = -1;
    const before = p.cash;
    await game.move(p, 2);
    expect(p.node).toBe(2);
    expect(p.cash).toBe(before - 10);
    expect(G.nodes[1].pot).toBe(50);
  });

  it('preserves a saved pot and does not credit it to anyone until the next landing', async () => {
    const { G, sq } = setup();
    sq.pot = 90;
    const saved = cloneState(G);
    const emit = vi.fn();
    const game = new Game(saved, { decide: async () => undefined as never, emit });
    const before = saved.players[1].cash;
    await game.land(saved.players[1], saved.nodes[sq.id]);
    expect(saved.players[1].cash).toBe(before + 90);
    expect(saved.nodes[sq.id].pot).toBe(0);
    expect(sq.pot).toBe(90);
  });

  it('can be exported/imported as a board tile, but every fresh game starts its pot empty', () => {
    const board = structuredClone(BUILT_IN_BOARDS[0]);
    const i = board.squares.findIndex((s) => s.t === 'venture');
    board.squares[i].t = 'jackpot';
    Object.assign(board.squares[i], { pot: 999 });
    const loaded = boardFromFile(boardToFile(board), 'jackpot-test');
    expect(loaded.error).toBeUndefined();
    const G = newGame({
      rules: 'standard',
      target: 5000,
      roundCap: 0,
      seats: cpuSeats(4),
      seed: 7,
      board: loaded.board!,
    });
    expect(G.nodes[i]).toMatchObject({ t: 'jackpot', owner: -1, d: -1, pot: 0 });
  });

  it('lets the CPU prefer a funded pot and accounts for contributions in route scoring', () => {
    const { G, game, p } = setup();
    G.nodes = G.nodes.slice(0, 3);
    G.nodes[0].t = 'bank';
    G.nodes[0].nb = [1, 2];
    G.nodes[1].t = G.nodes[2].t = 'jackpot';
    G.nodes[1].nb = G.nodes[2].nb = [0];
    G.nodes[1].pot = 100;
    G.nodes[2].pot = 0;
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
    expect(game.routeScore(p, [1])).toBe(100);
    expect(game.routeScore(p, [1, 2])).toBe(-10);
  });
});
