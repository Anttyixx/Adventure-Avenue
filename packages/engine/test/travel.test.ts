import { describe, expect, it } from 'vitest';
import { makeGame } from './helpers';
import type { GameEvent } from '../src/events';

const warps = (events: GameEvent[]) =>
  events.filter((e): e is Extract<GameEvent, { type: 'warp' }> => e.type === 'warp');

describe('warp events say what carried the player', () => {
  it('marks a cannon shot with where it came from', async () => {
    const { G, game, events } = makeGame();
    const [p, q] = G.players;
    p.node = 0;
    q.node = 5;
    await game.cannon(p);
    const w = warps(events)[0];
    expect(w).toMatchObject({ pid: p.id, to: q.node, from: 0, how: 'cannon' });
  });

  it('flies both players of a swap in one go: the second warp is marked swapBack', async () => {
    const { G, game, events } = makeGame();
    const [p, q] = G.players;
    p.node = 1;
    q.node = 6;
    await game.swap(p);
    const [first, second] = warps(events);
    expect(first).toMatchObject({ pid: p.id, to: 6, from: 1, how: 'swap', other: q.id });
    expect(second).toMatchObject({ pid: q.id, to: 1, how: 'swapBack' });
    expect([p.node, q.node]).toEqual([6, 1]);
  });

  it('defaults to a warp, and the outcome is the same whatever the ride', async () => {
    const { G, game, events } = makeGame();
    const p = G.players[0];
    await game.warp(p, 3);
    expect(warps(events)[0].how).toBe('warp');
    expect(p.node).toBe(3);
    expect(p.prev).toBe(-1);
  });
});

describe('every transport arrival collects suits', () => {
  it.each(['cannon', 'taxi', 'balloon', 'warp', 'portal', 'card', 'swap', 'swapBack'] as const)(
    '%s awards a suit as soon as travel finishes',
    async (how) => {
      for (const type of ['spade', 'heart', 'diamond', 'club', 'change'] as const) {
        const { G, game, events } = makeGame();
        const p = G.players[0];
        const dest = G.nodes.find((n) => n.t === 'spade')!;
        dest.t = type;
        p.suits.fill(false);
        G.changeSuit = 2;
        await game.warp(p, dest.id, how);
        expect(p.suits[type === 'change' ? 2 : ['spade', 'heart', 'diamond', 'club'].indexOf(type)]).toBe(
          true,
        );
        expect(events.findIndex((e) => e.type === 'suit')).toBeGreaterThan(
          events.findIndex((e) => e.type === 'warp'),
        );
        game.venture = async () => {};
        await game.landAfterWarp(p);
        expect(events.filter((e) => e.type === 'suit')).toHaveLength(1);
        if (type === 'change') expect(G.changeSuit).toBe(3);
      }
    },
  );
  it('collects for both players in a swap, including the player who did not choose it', async () => {
    const { G, game } = makeGame('standard', (r) => (r.kind === 'swapTarget' ? 1 : undefined));
    const [a, b] = G.players;
    a.node = G.nodes.find((n) => n.t === 'heart')!.id;
    b.node = G.nodes.find((n) => n.t === 'club')!.id;
    a.suits.fill(false);
    b.suits.fill(false);
    await game.swap(a);
    expect(a.suits[3]).toBe(true);
    expect(b.suits[1]).toBe(true);
  });
});

it('a taxi skips suits along the road but collects its destination suit', async () => {
  const { G, game } = makeGame('standard', (r) => (r.kind === 'pickSquare' ? 2 : undefined));
  G.nodes = G.nodes.slice(0, 3);
  const [start, passing, dest] = G.nodes;
  start.t = 'taxi';
  passing.t = 'heart';
  dest.t = 'club';
  start.nb = [1];
  passing.nb = [0, 2];
  dest.nb = [1];
  const p = G.players[0];
  p.node = start.id;
  p.suits.fill(false);
  game.venture = async () => {};
  await game.taxi(p);
  expect(p.node).toBe(dest.id);
  expect(p.suits).toEqual([false, false, false, true]);
});
