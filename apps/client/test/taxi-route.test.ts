import { describe, expect, it } from 'vitest';
import { newGame } from '../../../packages/engine/src/setup';
import { cpuSeats } from '../../../packages/engine/src/headless';
import { TEST_TOWN } from '../../../packages/engine/test/helpers';
import { taxiRoute } from '../src/taxi-route';

const sample = (oneWay = false) => {
  const board = structuredClone(TEST_TOWN);
  board.portalLinks = [{ a: 0, b: 4, sa: 3, sb: 3, oneWay }];
  return newGame({ rules: 'easy', target: 5000, roundCap: 0, seats: cpuSeats(2), board, seed: 42 });
};

describe('taxi route', () => {
  it('follows neighboring squares from start to stop', () => {
    const G = sample();
    const route = taxiRoute(G, 1, 3)!;
    expect(route[0]).toBe(1);
    expect(route.at(-1)).toBe(3);
    for (let i = 1; i < route.length; i++) expect(G.nodes[route[i - 1]].nb).toContain(route[i]);
  });

  it('takes a portal link when it is the shortest way', () => {
    const G = sample();
    expect(taxiRoute(G, 0, 4)).toEqual([0, 4]);
  });

  it('never goes in through an exit-only portal', () => {
    const G = sample(true);
    const route = taxiRoute(G, 4, 0)!;
    expect(route).not.toEqual([4, 0]);
    expect(route.at(-1)).toBe(0);
  });
});
