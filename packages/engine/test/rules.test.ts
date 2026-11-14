import { describe, expect, it } from 'vitest';
import { K } from '../src/constants';
import {
  canPromote,
  districtWorth,
  sellOffCut,
  shareOffsets,
  dominated,
  expand,
  lineBonus,
  lineThrough,
  linesThrough,
  market,
  maxValue,
  netWorth,
  salary,
  shareTradePrice,
  shareTradeTotal,
  shopFee,
  squareFee,
  stockPrice,
  stockPriceExact,
} from '../src/rules';
import { at, makeGame } from './helpers';

describe('board', () => {
  it('has 44 squares, 28 properties (4 per district), the bank in the middle and two forks', () => {
    const { G } = makeGame();
    expect(G.nodes).toHaveLength(44);
    expect(G.nodes.filter((s) => s.t === 'shop' || s.t === 'plot')).toHaveLength(28);
    for (let d = 0; d < G.districts.length; d++) expect(G.nodes.filter((s) => s.d === d)).toHaveLength(4);
    expect(at(G, 6, 3).t).toBe('bank');
    expect(G.nodes.filter((s) => s.t === 'plot')).toHaveLength(5);
    expect(at(G, 0, 3).nb).toHaveLength(3);
    expect(at(G, 11, 3).nb).toHaveLength(3);
    expect(G.nodes.filter((s) => s.nb.length === 3)).toHaveLength(2);
  });

  it('easy rules have no plots and use connected rows as groups', () => {
    const { G } = makeGame('easy');
    expect(G.nodes.filter((s) => s.t === 'plot')).toHaveLength(0);
    // (0,1) is cut off from the rest of Brick Row by the spade corner.
    const lone = at(G, 0, 1);
    expect(G.groups[lone.g]).toEqual([lone.id]);
    expect(G.groups[at(G, 1, 0).g]).toHaveLength(3);
  });
});

describe('fees, expansion and max value', () => {
  it('charges value x 0.18 x M[k], rounded up to 5', () => {
    const { G } = makeGame();
    const a = at(G, 6, 0); // Bay Market 200
    a.owner = 0;
    expect(shopFee(G, a)).toBe(40);
    a.value = 230;
    expect(shopFee(G, a)).toBe(45); // 41.4 -> 45
  });

  it('expands 7.5% of base for a 2nd square, 20% when dominating, and raises the fee', () => {
    const { G } = makeGame();
    const sqs = G.groups[at(G, 11, 1).g].map((id) => G.nodes[id]); // Greenway, 4 shops, no plot
    sqs[0].owner = 0;
    sqs[1].owner = 0;
    expand(G, 0, sqs[0].g);
    expect(sqs[0].value).toBe(sqs[0].base + Math.round(sqs[0].base * 0.075));
    expect(shopFee(G, sqs[0])).toBe(Math.ceil((sqs[0].value * 0.18 * 1.2) / 5) * 5);
    sqs[2].owner = 0;
    sqs[3].owner = 0;
    expect(dominated(G, 0, sqs[0].g)).toBe(true);
    const before = sqs[3].value;
    expand(G, 0, sqs[0].g);
    expect(sqs[3].value).toBe(before + Math.round(sqs[3].base * 0.2));
    expect(shopFee(G, sqs[3])).toBe(Math.ceil((sqs[3].value * 0.18 * 1.7 * 1.3) / 5) * 5);
  });

  it('applies the Price Hike boost', () => {
    const { G } = makeGame();
    const a = at(G, 6, 0);
    a.owner = 1;
    G.players[1].boost = K.boostRate;
    expect(shopFee(G, a)).toBe(50); // 36 * 1.3 = 46.8 -> 50
  });

  it('caps value at base x (1 + k), x 1.5 when dominated', () => {
    const { G } = makeGame();
    const sqs = G.groups[at(G, 11, 1).g].map((id) => G.nodes[id]);
    sqs[0].owner = 0;
    expect(maxValue(G, sqs[0])).toBe(sqs[0].base * 2);
    sqs.forEach((s) => (s.owner = 0));
    expect(maxValue(G, sqs[0])).toBe(sqs[0].base * 5 * 1.5);
  });

  it('prices fixed building fees', () => {
    const { G } = makeGame();
    const plot = at(G, 2, 0);
    plot.owner = 1;
    plot.b = 'circus';
    plot.lv = 2;
    expect(squareFee(G, plot)).toBe(1000);
    plot.b = 'home';
    G.players[1].level = 3;
    expect(squareFee(G, plot)).toBe(180);
    plot.b = 'tax';
    expect(squareFee(G, plot, G.players[0])).toBe(Math.ceil((netWorth(G, G.players[0]) * 0.1) / 5) * 5);
  });
});

describe('stocks and salary', () => {
  it('prices stock from the average shop value', () => {
    const { G } = makeGame();
    delete G.market!.offset;
    // Plaza: 320 / 340 / 360 / 380, average 350, x 0.04 = 14
    expect(stockPrice(G, 6)).toBe(14);
    G.factor[6] = 2;
    expect(stockPrice(G, 6)).toBe(28);
  });

  it('ignores vacant plots and non-shop buildings in the average', () => {
    const { G } = makeGame();
    delete G.market!.offset;
    // Brick Row: shops 160, 200, 220 (180 is a vacant plot)
    expect(stockPrice(G, 0)).toBe(Math.round(((160 + 200 + 220) / 3) * 0.04));
  });

  it.each([
    // Base 8G +/- 100G average growth x 0.02, x the 200-share boost (1 + 0.00085 x 200 x 1.5).
    [300, 10 * 1.255],
    [-300, 6 * 1.255],
  ])(
    'prices a %iG change in shop value with gentler growth and the same demand boost',
    (change, expected) => {
      const { G } = makeGame();
      G.stocks = 'dynamic';
      delete market(G).offset;
      const shops = G.nodes.filter((s) => s.d === 0 && s.t === 'shop');
      expect(shops).toHaveLength(3);
      shops.forEach((s) => {
        s.base = 200;
        s.value = 200;
      });
      G.players[0].shares[0] = 100;
      G.players[1].shares[0] = 100;
      market(G).vol[0] = 1.5;
      expect(stockPriceExact(G, 0)).toBeCloseTo(8 * 1.255);
      // Spread the change across the district so the shrink case keeps every shop positive.
      shops.forEach((s) => {
        s.value += change / shops.length;
      });
      expect(stockPriceExact(G, 0)).toBeCloseTo(expected);
      // Another 100 shares still adds the same demand multiplier: 1.255 -> 1.3825.
      G.players[1].shares[0] += 100;
      expect(stockPriceExact(G, 0) / expected).toBeCloseTo(1.3825 / 1.255);
    },
  );

  it('starts the cheapest district at 4G and the most expensive at 11G, the rest in between', () => {
    const { G } = makeGame();
    G.stocks = 'dynamic';
    const worth = G.districts.map((_, d) => districtWorth(G, d));
    const start = G.districts.map((_, d) => stockPriceExact(G, d));
    const lo = worth.indexOf(Math.min(...worth));
    const hi = worth.indexOf(Math.max(...worth));
    // Whole-gold offsets: within half a gold of the target.
    expect(Math.abs(start[lo] - K.shareStartMin)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(start[hi] - K.shareStartMax)).toBeLessThanOrEqual(0.5);
    for (const [d, w] of worth.entries()) {
      const target = 4 + (7 * (w - worth[lo])) / (worth[hi] - worth[lo]);
      expect(Math.abs(start[d] - target)).toBeLessThanOrEqual(0.5);
      expect(Number.isInteger(market(G).offset![d])).toBe(true);
    }
  });

  it('keeps the offset fixed: demand moves the price by the same gold as without it', () => {
    const { G } = makeGame();
    G.stocks = 'dynamic';
    const d = 0;
    const off = market(G).offset![d];
    G.players[0].shares[d] = 200;
    const shifted = stockPriceExact(G, d);
    delete market(G).offset;
    expect(stockPriceExact(G, d) - shifted).toBeCloseTo(off);
  });

  it('never prices a dynamic share below 3G', () => {
    const { G } = makeGame();
    G.stocks = 'dynamic';
    G.factor[0] = K.factorMin;
    market(G).cut[0] = 1 - K.confMin;
    expect(stockPriceExact(G, 0)).toBe(K.sharePriceMin);
  });

  it('gives every district the minimum start when all are worth the same', () => {
    const { G } = makeGame();
    G.stocks = 'dynamic';
    for (const s of G.nodes) if (s.t === 'shop') s.base = s.value = 200;
    const off = shareOffsets(G);
    G.districts.forEach((_, d) => expect(districtWorth(G, d) - off[d]).toBeCloseTo(K.shareStartMin, 0));
  });

  it('keeps Classic growth tied to total shop value', () => {
    const { G } = makeGame();
    G.stocks = 'classic';
    const shops = G.nodes.filter((s) => s.d === 0 && s.t === 'shop');
    shops.forEach((s) => {
      s.base = 200;
      s.value = 300;
    });
    G.players[0].shares[0] = 200;
    expect(stockPriceExact(G, 0)).toBeCloseTo(12);
  });

  it('pays salary 600 + 250 x level + 15% of shop value', () => {
    const { G } = makeGame();
    const p = G.players[0];
    at(G, 6, 0).owner = 0;
    at(G, 8, 0).owner = 0;
    expect(salary(G, p)).toBe(600 + 250 + Math.floor(0.15 * 440));
  });
});

describe('venture line bonus', () => {
  it('counts the longest straight line through the panel', () => {
    const owner = new Array(64).fill(-1);
    for (let x = 0; x < 5; x++) owner[3 * 8 + x] = 1;
    expect(lineThrough(owner, 3 * 8 + 2, 1)).toBe(5);
    for (let i = 0; i < 8; i++) owner[i * 9] = 2;
    expect(lineThrough(owner, 0, 2)).toBe(8);
    expect(lineBonus(3)).toBe(0);
    expect(lineBonus(5)).toBe(50);
    expect(lineBonus(8)).toBe(200);
  });
});

describe('promotion', () => {
  it('counts wild cards toward the four suits', () => {
    const { G } = makeGame();
    const p = G.players[0];
    p.suits = [true, true, true, false];
    expect(canPromote(p)).toBe(false);
    p.wild = 1;
    expect(canPromote(p)).toBe(true);
  });
});

describe('venture line bonus', () => {
  it('counts every line of 4+ through the new panel', () => {
    const owner = new Array(64).fill(-1);
    // Row 0 panels 0-3 and column 0 panels 0, 8, 16, 24 belong to player 1.
    for (const i of [0, 1, 2, 3, 8, 16, 24]) owner[i] = 1;
    const lines = linesThrough(owner, 0, 1);
    expect(lines.map((l) => l.length).sort()).toEqual([4, 4]);
    expect(lines.reduce((s, l) => s + lineBonus(l.length), 0)).toBe(80);
    expect(linesThrough(owner, 2, 1)).toHaveLength(1);
  });
});

// Balance examples use whole district growth and sell-off amounts, before market multipliers.
describe('dynamic stock balance', () => {
  it('makes sell-offs stronger while retaining the 75-share threshold', () => {
    expect(sellOffCut(74)).toBe(0);
    expect(sellOffCut(75)).toBeCloseTo(0.12);
    expect(sellOffCut(150)).toBeCloseTo(0.216);
    expect(sellOffCut(300)).toBeCloseTo(0.35424);
  });
  it('makes 50% shop growth add 25% to the underlying dynamic share price', () => {
    const { G } = makeGame();
    G.stocks = 'dynamic';
    const shops = G.nodes.filter((n) => n.d === 6 && n.t === 'shop');
    expect(shops.length).toBeGreaterThan(0);
    shops.forEach((n) => {
      n.base = 200;
      n.value = 200;
    });
    const before = districtWorth(G, 6);
    shops.forEach((n) => {
      n.value += 100;
    });
    expect(districtWorth(G, 6) / before).toBeCloseTo(1.25);
    G.stocks = 'classic';
    expect(districtWorth(G, 6)).toBeCloseTo(300 * K.stockRate);
  });
});

describe('share trade totals', () => {
  it('charges a whole number of gold per share: 10 shares at a listed 20G cost 200G', () => {
    const { G } = makeGame();
    const d = 0;
    // Make the exact price a little under 20 (it shows as 20G).
    G.market!.offset![d] = 0;
    const base = stockPriceExact(G, d);
    G.market!.offset![d] = base - 19.6;
    expect(stockPrice(G, d)).toBe(20);
    expect(shareTradeTotal(G, d, 10, true)).toBe(200);
    expect(shareTradeTotal(G, d, 10, false)).toBe(200);
    // Deals round up when buying and down when selling, with no float slips.
    expect(shareTradeTotal(G, d, 10, true, 0.3)).toBe(140);
    expect(shareTradeTotal(G, d, 10, false, 0.2)).toBe(240);
  });

  it('never buys under or sells over the listed price', () => {
    const { G } = makeGame();
    for (let d = 0; d < G.districts.length; d++) {
      for (const n of [1, 10, 99]) {
        expect(shareTradePrice(G, d, n, true)).toBeGreaterThanOrEqual(stockPrice(G, d));
        expect(shareTradePrice(G, d, n, false)).toBeLessThanOrEqual(stockPrice(G, d));
      }
    }
  });
});
