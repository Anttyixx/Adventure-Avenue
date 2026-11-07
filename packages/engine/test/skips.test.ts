import { describe, expect, it } from 'vitest';
import { K } from '../src/constants';
import { at, makeGame } from './helpers';

/** The newest log line. */
const lastLog = (G: { log: { text: string }[] }) => G.log[0]?.text ?? '';

describe('skipped choices go in the game log', () => {
  it('logs passing on an unowned shop', async () => {
    const { G, game } = makeGame('standard', (req) => (req.kind === 'buyShop' ? false : undefined));
    const p = G.players[0];
    const shop = at(G, 7, 3);
    p.cash = 5000;
    await game.landShop(p, shop);
    expect(shop.owner).toBe(-1);
    expect(lastLog(G)).toBe(`${p.name} passed on buying a shop for ${shop.value}G.`);
  });

  it("logs passing on a rival's buyout, naming the owner", async () => {
    const { G, game } = makeGame('standard', (req) => (req.kind === 'buyout' ? false : undefined));
    const p = G.players[0];
    const owner = G.players[1];
    const shop = at(G, 7, 3);
    shop.owner = owner.id;
    p.cash = 99999;
    await game.offerBuyout(p, shop);
    expect(shop.owner).toBe(owner.id);
    expect(lastLog(G)).toBe(
      `${p.name} passed on buying out ${owner.name}'s shop for ${shop.value * K.buyoutX}G.`,
    );
    expect(G.log[0].involves).toEqual([owner.id]);
  });

  it('logs passing on buying stock', async () => {
    const { G, game } = makeGame('standard', (req) => (req.kind === 'buyStock' ? null : undefined));
    const p = G.players[0];
    p.cash = 1000;
    await game.buyStockFlow(p, 0);
    expect(lastLog(G)).toBe(`${p.name} passed on buying stock.`);
  });

  it('logs choosing not to invest', async () => {
    const { G, game } = makeGame('standard', (req) => (req.kind === 'invest' ? null : undefined));
    const p = G.players[0];
    const shop = at(G, 7, 3);
    shop.owner = p.id;
    p.cash = 1000;
    await game.investFlow(p, [shop]);
    expect(lastLog(G)).toBe(`${p.name} chose not to invest.`);
  });

  it('does not log a pass when the player buys', async () => {
    const { G, game } = makeGame('standard', (req) => (req.kind === 'buyShop' ? true : undefined));
    const p = G.players[0];
    p.cash = 5000;
    await game.landShop(p, at(G, 7, 3));
    expect(G.log.some((l) => l.text.includes('passed on'))).toBe(false);
  });
});
