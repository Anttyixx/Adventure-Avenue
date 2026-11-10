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
