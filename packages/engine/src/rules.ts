/**
 * Derived values and pure state helpers. Nothing here asks for a decision or talks to the UI.
 */
import { K } from './constants';
import type { GameState, Market, Player, Square, BuildingKey } from './types';

export const ceil5 = (n: number) => Math.ceil(n / 5) * 5;

/** True when a square counts as a shop for fees, expansion, salary and stock price. */
export function isShopLike(sq: Square): boolean {
  return sq.t === 'shop' || (sq.t === 'plot' && sq.b === 'star3');
}

/** True for any property square that can be owned. */
export function isProperty(sq: Square): boolean {
  return sq.t === 'shop' || sq.t === 'plot';
}

export function ownedCount(G: GameState, pid: number, g: number): number {
  if (g < 0) return 0;
  return G.groups[g].filter((id) => G.nodes[id].owner === pid).length;
}

export function dominated(G: GameState, pid: number, g: number): boolean {
  if (g < 0) return false;
  const grp = G.groups[g];
  return grp.length >= 2 && grp.every((id) => G.nodes[id].owner === pid);
}

export function isClosed(p: Player): boolean {
  return p.onBreak || p.closed;
}

/** Base used for max value: plots with a 3-Star Shop use the building cost. */
export function shopBase(sq: Square): number {
  return sq.t === 'plot' ? K.star3Cost : sq.base;
}

export function maxValue(G: GameState, sq: Square): number {
  if (sq.owner < 0) return shopBase(sq);
  const k = Math.min(4, ownedCount(G, sq.owner, sq.g));
  return Math.round(shopBase(sq) * (1 + k) * (dominated(G, sq.owner, sq.g) ? K.domMax : 1));
}

export function investRoom(G: GameState, sq: Square): number {
  return Math.max(0, maxValue(G, sq) - sq.value);
}

/** Shop fee a rival would pay right now, ignoring closures. */
export function shopFee(G: GameState, sq: Square): number {
  if (sq.owner < 0) return 0;
  const owner = G.players[sq.owner];
  const k = Math.min(4, ownedCount(G, sq.owner, sq.g));
  const dom = dominated(G, sq.owner, sq.g) ? K.domFee : 1;
  return ceil5(sq.value * K.feeRate * K.mult[k] * dom * owner.boost);
}

/** Fee for any owned square as shown on the board label. Tax Office returns 0 (it depends on the payer). */
export function squareFee(G: GameState, sq: Square, payer?: Player): number {
  if (sq.owner < 0) return 0;
  const owner = G.players[sq.owner];
  if (sq.t === 'shop') return shopFee(G, sq);
  switch (sq.b) {
    case 'star3':
      return shopFee(G, sq);
    case 'checkpoint':
      return ceil5(sq.toll * owner.boost);
    case 'circus':
      return ceil5(K.circus[sq.lv] * owner.boost);
    case 'balloon':
      return ceil5(K.balloonFee * owner.boost);
    case 'home':
      return ceil5(K.homeFee * owner.level * owner.boost);
    case 'tax':
      return payer ? ceil5(Math.max(0, netWorth(G, payer)) * K.taxRate) : 0;
    default:
      return 0;
  }
}

/** The stock market state, filled in with defaults for games saved before it existed. */
export function market(G: GameState): Market {
  const n = G.districts.length;
  G.market ??= {
    vol: new Array(n).fill(1),
    dents: new Array(n).fill(0),
    repair: new Array(n).fill(0),
    sold: new Array(n).fill(0),
    dented: new Array(n).fill(false),
  };
  return G.market;
}

/** Total shares of a district held by all players. */
export function sharesHeld(G: GameState, d: number): number {
  return G.players.reduce((s, p) => s + (p.shares[d] ?? 0), 0);
}

/** True when the game uses dynamic stocks (games saved before the choice are classic). */
export function dynamicStocks(G: GameState): boolean {
  return G.stocks === 'dynamic';
}

/** A district's confidence: 1, less K.dent for each sell-off dent not yet repaired. */
export function confidence(G: GameState, d: number): number {
  if (!dynamicStocks(G)) return 1;
  return Math.max(K.confMin, 1 - market(G).dents[d] * K.dent);
}

/**
 * The exact share price (before rounding): the shops' average value x K.stockRate, times the
 * multiplier and, with dynamic stocks, confidence and the demand boost from `held` shares held.
 */
export function stockPriceExact(G: GameState, d: number, held = sharesHeld(G, d)): number {
  const shops = G.nodes.filter((s) => s.d === d && isShopLike(s));
  if (!shops.length) return 1;
  const avg = shops.reduce((s, q) => s + q.value, 0) / shops.length;
  if (!dynamicStocks(G)) return Math.max(1, avg * K.stockRate * G.factor[d]);
  const boost = shareBoost(held, market(G).vol[d]);
  return Math.max(1, avg * K.stockRate * G.factor[d] * confidence(G, d) * boost);
}

/** Dynamic stocks' demand boost (1 = none) for `held` shares held at volatility `vol`. */
export function shareBoost(held: number, vol: number): number {
  const h = Math.max(0, held);
  const hn = Math.pow(h, K.shareSteep);
  const s = hn / (hn + Math.pow(K.shareMid, K.shareSteep));
  return 1 + (K.shareMax * s + K.shareTail * h) * vol;
}

/** The listed share price, in whole coins. */
export function stockPrice(G: GameState, d: number): number {
  return Math.max(1, Math.round(stockPriceExact(G, d)));
}

/**
 * What `n` shares cost (buying) or fetch (selling). Classic: the listed price. Dynamic: the
 * average of the price before and after the trade, so no one profits from moving it themselves.
 */
export function shareTradeValue(G: GameState, d: number, n: number, buying: boolean): number {
  if (!dynamicStocks(G)) return n * stockPrice(G, d);
  const held = sharesHeld(G, d);
  const after = buying ? held + n : Math.max(0, held - n);
  return (n * (stockPriceExact(G, d, held) + stockPriceExact(G, d, after))) / 2;
}

export function stockValue(G: GameState, p: Player): number {
  if (G.rules === 'easy') return 0;
  return p.shares.reduce((s, n, d) => s + n * stockPrice(G, d), 0);
}

export function propertyValue(G: GameState, p: Player): number {
  return G.nodes.reduce((s, q) => s + (q.owner === p.id ? q.value : 0), 0);
}

export function shopValue(G: GameState, p: Player): number {
  return G.nodes.reduce((s, q) => s + (q.owner === p.id && isShopLike(q) ? q.value : 0), 0);
}

export function netWorth(G: GameState, p: Player): number {
  return p.cash + propertyValue(G, p) + stockValue(G, p);
}

export function salary(G: GameState, p: Player): number {
  return K.salaryBase + K.salaryLevel * p.level + Math.floor(K.salaryShop * shopValue(G, p));
}

export function suitCount(p: Player): number {
  return p.suits.filter(Boolean).length;
}

export function canPromote(p: Player): boolean {
  return suitCount(p) + p.wild >= 4;
}

export function activePlayers(G: GameState): Player[] {
  return G.players.filter((p) => !p.bankrupt);
}

export function ranking(G: GameState): Player[] {
  return activePlayers(G)
    .slice()
    .sort((a, b) => netWorth(G, b) - netWorth(G, a));
}

export function ownedSquares(G: GameState, pid: number): Square[] {
  return G.nodes.filter((s) => s.owner === pid);
}

export function ownedShops(G: GameState, pid: number): Square[] {
  return G.nodes.filter((s) => s.owner === pid && isShopLike(s));
}

/**
 * Expansion: when a player gets a 2nd or later square in a group, each of their shops there
 * gains 10% of base, or 30% if the group is now dominated. Never above max value.
 */
export function expand(G: GameState, pid: number, g: number): number[] {
  if (pid < 0 || g < 0 || ownedCount(G, pid, g) < 2) return [];
  const bonus = dominated(G, pid, g) ? K.expandDom : K.expand;
  const changed: number[] = [];
  for (const id of G.groups[g]) {
    const sq = G.nodes[id];
    if (sq.owner !== pid || !isShopLike(sq)) continue;
    const next = Math.min(maxValue(G, sq), sq.value + Math.round(shopBase(sq) * bonus));
    if (next > sq.value) {
      sq.value = next;
      changed.push(id);
    }
  }
  return changed;
}

/**
 * Whether another `b` can be built: at most K.buildingLimit of each building on the board,
 * unless every property started as a plot. `except` is a square being renovated.
 */
export function buildingAvailable(G: GameState, b: BuildingKey, except = -1): boolean {
  if (G.plots === 'all') return true;
  return G.nodes.filter((s) => s.b === b && s.id !== except).length < K.buildingLimit;
}

/** Classic stocks: a trade of K.bigTrade+ shares moves the district's multiplier 10%. */
export function bumpFactor(G: GameState, d: number, up: boolean, n: number) {
  if (n < K.bigTrade) return;
  const f = G.factor[d] * (up ? K.tradeUp : K.tradeDown);
  G.factor[d] = Math.min(K.factorMax, Math.max(K.factorMin, f));
}

export function clampFactor(G: GameState, d: number) {
  G.factor[d] = Math.min(K.factorMax, Math.max(K.factorMin, G.factor[d]));
}

/** Reset a plot to vacant. */
export function vacate(sq: Square) {
  sq.owner = -1;
  sq.value = 0;
  sq.b = null;
  sq.lv = 0;
  sq.toll = K.toll0;
}

/** Longest straight line of `pid` through panel i of the 8x8 venture grid. */
/**
 * Lines of `pid`'s panels through panel `i` on the 8x8 venture grid, one per direction
 * (horizontal, vertical, both diagonals), as lists of panel indexes. Only lines of at least
 * `min` panels are returned.
 */
export function linesThrough(owner: number[], i: number, pid: number, min = K.lineBonusMin): number[][] {
  const x0 = i % 8;
  const y0 = Math.floor(i / 8);
  const out: number[][] = [];
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ]) {
    const cells = [i];
    for (const s of [1, -1]) {
      let x = x0 + dx * s;
      let y = y0 + dy * s;
      while (x >= 0 && x < 8 && y >= 0 && y < 8 && owner[y * 8 + x] === pid) {
        cells.push(y * 8 + x);
        x += dx * s;
        y += dy * s;
      }
    }
    if (cells.length >= min) out.push(cells.sort((a, b) => a - b));
  }
  return out;
}

export function lineThrough(owner: number[], i: number, pid: number): number {
  const x0 = i % 8;
  const y0 = Math.floor(i / 8);
  let best = 1;
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ]) {
    let n = 1;
    for (const s of [1, -1]) {
      let x = x0 + dx * s;
      let y = y0 + dy * s;
      while (x >= 0 && x < 8 && y >= 0 && y < 8 && owner[y * 8 + x] === pid) {
        n++;
        x += dx * s;
        y += dy * s;
      }
    }
    best = Math.max(best, n);
  }
  return best;
}

export function lineBonus(len: number): number {
  if (len >= 8) return K.lineBonusFull;
  if (len >= K.lineBonusMin) return K.lineBonusPer * len;
  return 0;
}

/** Cash plus what the player's stock and property would raise if sold to cover a debt. */
export function spendable(G: GameState, p: Player): number {
  const props = G.nodes.reduce((s, q) => s + (q.owner === p.id ? Math.floor(q.value * K.debtSale) : 0), 0);
  return p.cash + stockValue(G, p) + props;
}

/**
 * Purchases may take cash below zero when the player could sell stock or property to cover it;
 * they must sell at the end of the turn (see settleDebt).
 */
export function canAfford(G: GameState, p: Player, price: number): boolean {
  return spendable(G, p) >= price;
}

/** Row groups for Easy rules: connected runs of property squares. */
export function computeRows(G: GameState): number[][] {
  const seen = new Set<number>();
  const groups: number[][] = [];
  for (const sq of G.nodes) {
    if (!isProperty(sq) || seen.has(sq.id)) continue;
    const grp: number[] = [];
    const stack = [sq.id];
    seen.add(sq.id);
    while (stack.length) {
      const id = stack.pop()!;
      grp.push(id);
      for (const n of G.nodes[id].nb) {
        if (!seen.has(n) && isProperty(G.nodes[n])) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    groups.push(grp.sort((a, b) => a - b));
  }
  return groups;
}
