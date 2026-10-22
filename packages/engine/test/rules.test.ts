import { describe, expect, it } from 'vitest';
import { K } from '../src/constants';
import {
  canPromote,
  dominated,
  expand,
  lineBonus,
  lineThrough,
  maxValue,
  netWorth,
  salary,
  shopFee,
  squareFee,
  stockPrice,
} from '../src/rules';
import { at, makeGame } from './helpers';

describe('board', () => {
  it('has 44 squares, 26 properties and two forks', () => {
    const { G } = makeGame();
    expect(G.nodes).toHaveLength(44);
    expect(G.nodes.filter((s) => s.t === 'shop' || s.t === 'plot')).toHaveLength(26);
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
  it('charges value x 0.2 x M[k], rounded up to 5', () => {
    const { G } = makeGame();
    const a = at(G, 6, 0); // Bay Market 200
    a.owner = 0;
    expect(shopFee(G, a)).toBe(40);
    a.value = 213;
    expect(shopFee(G, a)).toBe(45); // 42.6 -> 45
  });

  it('expands 10% of base for a 2nd square, 30% when dominating, and raises the fee', () => {
    const { G } = makeGame();
    const sqs = G.groups[at(G, 11, 1).g].map((id) => G.nodes[id]); // Greenway, 3 shops, no plot
    sqs[0].owner = 0;
    sqs[1].owner = 0;
    expand(G, 0, sqs[0].g);
    expect(sqs[0].value).toBe(sqs[0].base * 1.1);
    expect(shopFee(G, sqs[0])).toBe(Math.ceil((sqs[0].value * 0.2 * 1.3) / 5) * 5);
    sqs[2].owner = 0;
    expect(dominated(G, 0, sqs[0].g)).toBe(true);
    const before = sqs[2].value;
    expand(G, 0, sqs[0].g);
    expect(sqs[2].value).toBe(before + sqs[2].base * 0.3);
    expect(shopFee(G, sqs[2])).toBe(Math.ceil((sqs[2].value * 0.2 * 1.6 * 1.4) / 5) * 5);
  });

  it('applies the Price Hike boost', () => {
    const { G } = makeGame();
    const a = at(G, 6, 0);
    a.owner = 1;
    G.players[1].boost = K.boostRate;
    expect(shopFee(G, a)).toBe(55); // 40 * 1.3 = 52 -> 55
  });

  it('caps value at base x (1 + k), x 1.5 when dominated', () => {
    const { G } = makeGame();
    const sqs = G.groups[at(G, 11, 1).g].map((id) => G.nodes[id]);
    sqs[0].owner = 0;
    expect(maxValue(G, sqs[0])).toBe(sqs[0].base * 2);
    sqs.forEach((s) => (s.owner = 0));
    expect(maxValue(G, sqs[0])).toBe(sqs[0].base * 4 * 1.5);
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
    // Plaza: 320 / 340 / 360, average 340, x 0.04 = 13.6 -> 14
    expect(stockPrice(G, 6)).toBe(14);
    G.factor[6] = 2;
    expect(stockPrice(G, 6)).toBe(27);
  });

  it('ignores vacant plots and non-shop buildings in the average', () => {
    const { G } = makeGame();
    // Brick Row: shops 160, 200, 220 (180 is a vacant plot)
    expect(stockPrice(G, 0)).toBe(Math.round(((160 + 200 + 220) / 3) * 0.04));
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
