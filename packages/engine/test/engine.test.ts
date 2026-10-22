import { describe, expect, it } from 'vitest';
import { cpuAcceptsTrade } from '../src/cpu';
import { simulate } from '../src/headless';
import { netWorth, stockPrice } from '../src/rules';
import { at, makeGame } from './helpers';

describe('movement', () => {
  it('never turns back, and a free direction reaches both ways', async () => {
    const { G, game } = makeGame();
    const p = G.players[0];
    const bank = at(G, 6, 6);
    p.node = bank.id;
    p.prev = -1;
    const both = game.destinations(p, 2).map((r) => r.node);
    expect(both).toContain(at(G, 8, 6).id);
    expect(both).toContain(at(G, 4, 6).id);
    p.prev = at(G, 7, 6).id;
    const one = game.destinations(p, 2).map((r) => r.node);
    expect(one).toEqual([at(G, 4, 6).id]);
  });

  it('branches at forks', () => {
    const { G, game } = makeGame();
    const p = G.players[0];
    p.node = at(G, 0, 2).id;
    p.prev = at(G, 0, 1).id;
    const d = game.destinations(p, 2).map((r) => r.node);
    expect(d.sort()).toEqual([at(G, 0, 4).id, at(G, 1, 3).id].sort());
  });

  it('collects a suit when passing and promotes on passing the bank', async () => {
    const { G, game, events } = makeGame();
    const p = G.players[0];
    p.suits = [true, true, false, true];
    p.node = at(G, 11, 5).id;
    p.prev = at(G, 11, 4).id;
    // diamond (11,6) -> ... -> bank (6,6) is 6 steps; walk 7 to pass it.
    await game.move(p, 7);
    expect(events.some((e) => e.type === 'promote')).toBe(true);
    expect(p.level).toBe(2);
    expect(p.suits).toEqual([false, false, false, false]);
  });

  it('pays a rival checkpoint toll when passing, and the toll rises', async () => {
    const { G, game } = makeGame();
    const p = G.players[0];
    const plot = at(G, 4, 6);
    plot.owner = 1;
    plot.b = 'checkpoint';
    plot.value = 200;
    p.node = at(G, 5, 6).id;
    p.prev = at(G, 6, 6).id;
    const cash = p.cash;
    await game.move(p, 2);
    expect(p.cash).toBeLessThanOrEqual(cash - 20);
    expect(plot.toll).toBe(30);
  });
});

describe('fees, dividends and commission', () => {
  it('pays dividends to other shareholders and commission to boon holders', async () => {
    const { G, game } = makeGame();
    const [a, b, c, d] = G.players;
    const shop = at(G, 6, 0);
    shop.owner = b.id;
    c.shares[1] = 50;
    d.boon = 0.5;
    const cash = { a: a.cash, b: b.cash, c: c.cash, d: d.cash };
    await game.chargeFee(a, shop, 40);
    expect(a.cash).toBe(cash.a - 40);
    expect(b.cash).toBe(cash.b + 40);
    expect(c.cash).toBe(cash.c + Math.floor((40 * 50) / 250));
    expect(d.cash).toBe(cash.d + 20);
  });

  it('charges nothing when the owner is on a break', async () => {
    const { G, game } = makeGame('standard', (r) => (r.kind === 'buyout' ? false : undefined));
    const [a, b] = G.players;
    const shop = at(G, 6, 0);
    shop.owner = b.id;
    b.onBreak = true;
    const cash = a.cash;
    await game.landShop(a, shop);
    expect(a.cash).toBe(cash);
  });

  it('buyout pays the owner 3x and the bank keeps 2x', async () => {
    const { G, game } = makeGame('standard', (r) => (r.kind === 'buyout' ? true : undefined));
    const [a, b] = G.players;
    a.cash = 5000;
    const shop = at(G, 6, 0);
    shop.owner = b.id;
    const bCash = b.cash;
    await game.landShop(a, shop);
    expect(shop.owner).toBe(a.id);
    expect(b.cash).toBe(bCash + 40 + 600);
    expect(a.cash).toBe(5000 - 40 - 1000);
  });
});

describe('stocks', () => {
  it('raises the factor on 10+ share buys and lowers it on 10+ share sales', async () => {
    const { G, game } = makeGame('standard', (r) => (r.kind === 'buyStock' ? { d: 6, n: 20 } : undefined));
    const p = G.players[0];
    const price = stockPrice(G, 6);
    await game.buyStockFlow(p, 0);
    expect(p.shares[6]).toBe(20);
    expect(p.cash).toBe(2000 - 20 * price);
    expect(G.factor[6]).toBeCloseTo(1.1);
    await game.sellStock(p, 6, 20, 0);
    expect(G.factor[6]).toBeCloseTo(0.99);
  });
});

describe('debt and bankruptcy', () => {
  it('sells assets until cash is not negative', async () => {
    const { G, game } = makeGame();
    const p = G.players[0];
    p.shares[6] = 10;
    const shop = at(G, 6, 0);
    shop.owner = p.id;
    p.cash = -100;
    await game.settleDebt(p);
    expect(p.cash).toBeGreaterThanOrEqual(0);
    expect(G.over).toBe(false);
  });

  it('goes bankrupt with nothing left to sell and the richest other player wins', async () => {
    const { G, game } = makeGame();
    const p = G.players[0];
    G.players[2].cash = 9000;
    p.cash = -1;
    await game.settleDebt(p);
    expect(p.bankrupt).toBe(true);
    expect(G.over).toBe(true);
    expect(G.winner).toBe(2);
  });
});

describe('win check', () => {
  it('ends the match on a bank visit at the target, after promotion', async () => {
    const { G, game } = makeGame('standard', (r) => (r.kind === 'buyStock' ? null : undefined));
    const p = G.players[0];
    p.cash = 4200; // + 850 salary crosses 5000
    p.suits = [true, true, true, true];
    await game.bankVisit(p, true);
    expect(G.over).toBe(true);
    expect(G.winner).toBe(p.id);
    expect(netWorth(G, p)).toBeGreaterThanOrEqual(5000);
  });
});

describe('auctions and trades', () => {
  it('runs a voluntary auction and pays the seller', async () => {
    const { G, game } = makeGame('standard', (r) => {
      if (r.kind === 'bid') return r.pid === 2 && r.bid <= 300;
      return undefined;
    });
    const seller = G.players[G.order[G.turn]];
    const shop = at(G, 6, 0);
    shop.owner = seller.id;
    const cash = seller.cash;
    await game.voluntaryAuction(seller, shop.id);
    if (seller.id === 2) return; // seller cannot bid on their own shop
    expect(shop.owner).toBe(2);
    expect(seller.cash).toBe(cash + 200);
  });

  it('CPU accepts trades worth 1.15x + 20G to it', () => {
    const { G } = makeGame();
    const shop = at(G, 6, 0);
    shop.owner = 1;
    expect(cpuAcceptsTrade(G, { from: 0, to: 1, give: [], get: [shop.id], cashGive: 250, cashGet: 0 })).toBe(
      true,
    );
    expect(cpuAcceptsTrade(G, { from: 0, to: 1, give: [], get: [shop.id], cashGive: 200, cashGet: 0 })).toBe(
      false,
    );
  });
});

describe('simulation', () => {
  it('finishes 1,000 CPU-only matches without errors', async () => {
    let rounds = 0;
    for (let i = 0; i < 1000; i++) {
      const r = await simulate(i % 2 ? 'easy' : 'standard', i + 1);
      expect(r.winner).toBeGreaterThanOrEqual(0);
      rounds += r.rounds;
    }
    console.log(`average match length: ${(rounds / 1000).toFixed(1)} rounds`);
  }, 60_000);

  it('respects the round limit', async () => {
    const r = await simulate('standard', 3, 10000, 5);
    expect(r.rounds).toBe(6);
    expect(r.reason).toMatch(/Round limit/);
  });
});
