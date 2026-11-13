import { describe, expect, it } from 'vitest';
import { makeGame, at } from './helpers';
import { stat } from '../src/rules';

describe('results stats', () => {
  it('reads 0 for stats a saved game never tracked', () => {
    const { G } = makeGame();
    const p = G.players[0];
    delete p.stats.steps;
    expect(stat(p, 'steps')).toBe(0);
  });

  it('counts squares walked, shops bought and the biggest fee collected', async () => {
    const { G, game } = makeGame('standard', (r) =>
      r.kind === 'buyShop' ? true : r.kind === 'buyout' ? false : undefined,
    );
    const [a, b] = G.players;
    a.cash = 5000;
    await game.move(a, 3);
    expect(stat(a, 'steps')).toBe(3);
    const shop = at(G, 6, 0);
    shop.owner = -1;
    await game.landShop(a, shop);
    expect(stat(a, 'shopsBought')).toBe(1);
    await game.landShop(b, shop);
    expect(stat(a, 'biggestFee')).toBeGreaterThan(0);
    expect(stat(a, 'biggestFee')).toBe(a.stats.feesEarned);
  });
});
