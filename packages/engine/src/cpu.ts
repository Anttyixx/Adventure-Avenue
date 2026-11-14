/**
 * CPU players. Every CPU has a level (easy, normal, hard or master) and a play style rolled at the
 * start of the game (`Player.style`). The level sets what the CPU knows how to do and how well it
 * judges it (`CPU_SKILL`); the style tilts its choices (cash cushion, shops or shares, trading).
 *
 * What the levels add, from the simulated tournaments (scripts/tournament.ts):
 * - easy: buys shops and collects suits, but often carelessly; invests and buys shares a little
 *   at random, never trades and wastes money on buyouts;
 * - normal: steady greedy play with a fixed cash cushion (the old CPU);
 * - hard: values shops by what they will earn (district counts, domination), invests where fees
 *   and its own shares grow most, keeps a cushion sized to the fees ahead, counts its shares as
 *   spare cash, buys shares in its own districts, trades for district pieces and sells shares
 *   before a dangerous roll;
 * - master: all of that judged more sharply, plus blocking rivals: it bids, trades and buys to
 *   stop a rival dominating a district, crashes the leader's shares and races for the bank.
 */
import { K } from './constants';
import type { DebtAsset, DecisionAnswer, DecisionKind, DecisionRequest, TradeOffer } from './decisions';
import { pick, rand, randInt, weighted } from './rng';
import {
  buildingAvailable,
  canPromote,
  confidence,
  dynamicStocks,
  investRoom,
  isShopLike,
  linesThrough,
  market,
  maxValue,
  netWorth,
  nextSteps,
  ownedCount,
  ownedSquares,
  salary,
  shopBase,
  shopFee,
  squareFee,
  stockPrice,
  stockPriceExact,
  stockValue,
} from './rules';
import {
  SUITS,
  type BuildingKey,
  type CpuLevel,
  type CpuStyle,
  type GameState,
  type Player,
  type Square,
} from './types';

const C = K.cpu;

// ------------------------------------------------------------------ levels and styles

/** What a level knows how to do, and how well. */
export interface CpuSkill {
  /** Chance a choice is made carelessly (a random path, a missed purchase...). */
  mistakes: number;
  /** How much paths weigh money (fees, purchases, investing) next to suits: 0..1. */
  pathSense: number;
  /** Measures the way to its next suit as it must walk it (no turning back), not as the crow flies. */
  plansAhead: boolean;
  /** How strongly it heads for its next suit (x the salary share per square, K.cpu.pathGoalStep). */
  goalPull: number;
  /** The cash cushion it keeps (before its style), and whether it grows with the fees ahead. */
  cushion: number;
  dangerCushion: boolean;
  /** Counts this share of its stock as spare cash (it can sell shares before a rough landing). */
  liquidStock: number;
  /** Values shops by what they will earn (district counts, domination) when buying or bidding. */
  valuesShops: boolean;
  /** Chance it invests when it can, and the share of its spare cash it puts in. */
  investChance: number;
  investShare: number;
  /** Picks the shop where investing earns most (fees, its own shares), not just the roomiest. */
  investSmart: boolean;
  /** Invests past its cash when its shares could cover it (it sells shares at the end of the turn). */
  investOnShares: boolean;
  /** Chance it buys shares at the bank, the share of spare cash it spends, and how well it picks. */
  stockChance: number;
  stockShare: number;
  stockSmart: boolean;
  /** Uses the before-roll actions: selling shares for cash, renovating, trading, auctioning. */
  preRoll: boolean;
  /** Chance per turn it looks for a trade (before its style). */
  tradeChance: number;
  /** Judges trades by what the shops earn and who they help (not just their values). */
  tradeSense: boolean;
  /** Buys out rivals only when it pays (else whenever it can afford one in a district it has). */
  buyoutSense: boolean;
  /** Bid limit at auctions as a multiple of what the shop is worth to it. */
  bidShare: number;
  /** Stops rivals: blocks dominations, crashes the leader's shares, avoids feeding the leader. */
  blocks: boolean;
  /** Plays the arcade games well (bets by style, sprints when it pays, spreads treasure picks). */
  arcadeSense: boolean;
}

/**
 * Every level's skill. Exported (and plain numbers) so the tournament script can switch parts off
 * to measure what each is worth; the game itself never changes it.
 */
export const CPU_SKILL: Record<CpuLevel, CpuSkill> = {
  easy: {
    mistakes: 0.3,
    pathSense: 0.15,
    plansAhead: false,
    goalPull: 1,
    cushion: 120,
    dangerCushion: false,
    liquidStock: 0,
    valuesShops: false,
    investChance: 0.35,
    investShare: 0.35,
    investSmart: false,
    investOnShares: false,
    stockChance: 0.35,
    stockShare: 0.3,
    stockSmart: false,
    preRoll: false,
    tradeChance: 0,
    tradeSense: false,
    buyoutSense: false,
    bidShare: 1,
    blocks: false,
    arcadeSense: false,
  },
  normal: {
    mistakes: 0.08,
    pathSense: 0.5,
    plansAhead: false,
    goalPull: 1,
    cushion: 300,
    dangerCushion: false,
    liquidStock: 0,
    valuesShops: false,
    investChance: 0.75,
    investShare: 0.6,
    investSmart: false,
    investOnShares: false,
    stockChance: 0.8,
    stockShare: 0.5,
    stockSmart: false,
    preRoll: true,
    tradeChance: 0.04,
    tradeSense: false,
    buyoutSense: false,
    bidShare: 1.2,
    blocks: false,
    arcadeSense: false,
  },
  hard: {
    mistakes: 0.03,
    pathSense: 0.85,
    plansAhead: true,
    goalPull: 1,
    cushion: 250,
    dangerCushion: true,
    liquidStock: 0.3,
    valuesShops: true,
    investChance: 0.95,
    investShare: 0.75,
    investSmart: true,
    investOnShares: false,
    stockChance: 1,
    stockShare: 0.6,
    stockSmart: true,
    preRoll: true,
    tradeChance: 0.15,
    tradeSense: true,
    buyoutSense: true,
    bidShare: 1,
    blocks: false,
    arcadeSense: true,
  },
  master: {
    mistakes: 0,
    pathSense: 1,
    plansAhead: true,
    goalPull: 1,
    cushion: 200,
    dangerCushion: true,
    liquidStock: 0.85,
    valuesShops: true,
    investChance: 1,
    investShare: 1,
    investSmart: true,
    investOnShares: true,
    stockChance: 1,
    stockShare: 0.9,
    stockSmart: true,
    preRoll: true,
    tradeChance: 0.25,
    tradeSense: true,
    buyoutSense: true,
    bidShare: 1.1,
    blocks: true,
    arcadeSense: true,
  },
};

/** A middle-of-the-road style, for old saves and for players a CPU stands in for. */
const PLAIN: CpuStyle = { risk: 0.5, stocks: 0.5, trader: 0.5 };

interface Brain {
  p: Player;
  s: CpuSkill;
  st: CpuStyle;
}

function brain(G: GameState, p: Player): Brain {
  return { p, s: CPU_SKILL[p.cpuLevel ?? 'normal'], st: p.style ?? PLAIN };
}

/** A careless moment (more often on easier levels). */
function careless(G: GameState, b: Brain): boolean {
  return b.s.mistakes > 0 && rand(G) < b.s.mistakes;
}

/** The style's cushion multiplier: 1.5 for the most careful CPU, 0.5 for the boldest. */
function caution(b: Brain): number {
  return 1.5 - b.st.risk;
}

/** How a level reads: "Master". */
export function cpuLevelName(level: CpuLevel | undefined): string {
  const l = level ?? 'normal';
  return l[0].toUpperCase() + l.slice(1);
}

/** A CPU's style in a few words, e.g. "Bold investor" or "Careful shopkeeper". */
export function cpuStyleName(style: CpuStyle | undefined): string {
  const s = style ?? PLAIN;
  const mood = s.risk > 0.66 ? 'Bold' : s.risk < 0.34 ? 'Careful' : 'Steady';
  const kind =
    s.trader > 0.75
      ? 'dealer'
      : s.stocks > 0.66
        ? 'investor'
        : s.stocks < 0.34
          ? 'shopkeeper'
          : 'all-rounder';
  return `${mood} ${kind}`;
}

// ------------------------------------------------------------------ the board

/** Breadth-first distance (ignoring direction) from `from` to every square. */
function distances(G: GameState, from: number): number[] {
  const dist = new Array(G.nodes.length).fill(Infinity);
  dist[from] = 0;
  const q = [from];
  while (q.length) {
    const n = q.shift()!;
    for (const m of G.nodes[n].nb) {
      if (dist[m] === Infinity) {
        dist[m] = dist[n] + 1;
        q.push(m);
      }
    }
  }
  return dist;
}

/** The squares the CPU is heading for: the bank if it can promote or win, else missing suits. */
export function goals(G: GameState, p: Player): number[] {
  const bank = G.nodes.filter((s) => s.t === 'bank').map((s) => s.id);
  if (canPromote(p) || netWorth(G, p) >= G.target) return bank;
  const out = G.nodes
    .filter((s) => {
      const si = (SUITS as string[]).indexOf(s.t);
      return (si >= 0 && !p.suits[si]) || s.t === 'change' || s.t === 'randomSuit';
    })
    .map((s) => s.id);
  return out.length ? out : bank;
}

function goalDistance(G: GameState, p: Player, node: number): number {
  const d = distances(G, node);
  return Math.min(...goals(G, p).map((g) => d[g]));
}

/** The goals once `held` suits are in hand (the bank once it has all four, or has won). */
function goalsWith(G: GameState, p: Player, held: boolean[]): Set<number> {
  const full = held.filter(Boolean).length + p.wild >= 4 || netWorth(G, p) >= G.target;
  const out = new Set<number>();
  for (const s of G.nodes) {
    if (full) {
      if (s.t === 'bank') out.add(s.id);
      continue;
    }
    const at = si(s);
    if ((at >= 0 && !held[at]) || s.t === 'change' || s.t === 'randomSuit') out.add(s.id);
  }
  if (!out.size) for (const s of G.nodes) if (s.t === 'bank') out.add(s.id);
  return out;
}

/**
 * Steps to the nearest goal walking as the rules allow: forward only (no turning back, one-way
 * roads), through portals, from `node` having come from `prev`. Passing a goal counts.
 */
function walkDistance(G: GameState, node: number, prev: number, goalSet: Set<number>): number {
  const n = G.nodes.length;
  const seen = new Set<number>([node * (n + 1) + prev + 1]);
  let frontier: [number, number][] = [[node, prev]];
  for (let dist = 1; dist <= 80 && frontier.length; dist++) {
    const next: [number, number][] = [];
    for (const [at, from] of frontier) {
      for (const nx of nextSteps(G.nodes[at], from)) {
        if (goalSet.has(nx)) return dist;
        const sq = G.nodes[nx];
        const target = sq.t === 'portal' ? (sq.link ?? -1) : -1;
        const state: [number, number] = target >= 0 && target !== nx ? [target, -1] : [nx, at];
        if (goalSet.has(state[0])) return dist;
        const key = state[0] * (n + 1) + state[1] + 1;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(state);
      }
    }
    frontier = next;
  }
  return 80;
}

/** How far through the game we are: the best net worth as a share of the goal (0..1). */
function progress(G: GameState): number {
  const best = Math.max(...G.players.filter((q) => !q.bankrupt).map((q) => netWorth(G, q)));
  return Math.max(0, Math.min(1, best / Math.max(1, G.target)));
}

/** Roughly how many times rivals will still land on one square this game. */
function visitsLeft(G: GameState): number {
  return C.visits * Math.max(0.15, 1 - progress(G));
}

/** The biggest fee `p` could have to pay on a square within one roll of where it stands. */
function dangerAhead(G: GameState, p: Player): number {
  const d = distances(G, p.node);
  let worst = 0;
  for (const sq of G.nodes) {
    if (sq.owner < 0 || sq.owner === p.id || d[sq.id] < 1 || d[sq.id] > K.dieSides) continue;
    worst = Math.max(worst, squareFee(G, sq, p));
  }
  return worst;
}

/** The cash a CPU wants to keep after spending. */
function cushion(G: GameState, b: Brain): number {
  let c = b.s.cushion;
  if (b.s.dangerCushion) c = Math.max(c * 0.5, dangerAhead(G, b.p) * C.dangerShare);
  return c * caution(b);
}

/** Cash plus the share of its stock the CPU treats as spare cash. */
function means(G: GameState, b: Brain): number {
  return b.p.cash + (b.s.liquidStock ? stockValue(G, b.p) * b.s.liquidStock : 0);
}

/** What `p` can spend now and still keep its cushion. */
function spare(G: GameState, b: Brain): number {
  return means(G, b) - cushion(G, b);
}

/** The leader among the others, if they are ahead of `p`. */
function leaderAhead(G: GameState, p: Player): Player | null {
  let best: Player | null = null;
  for (const q of G.players) {
    if (q.id === p.id || q.bankrupt) continue;
    if (!best || netWorth(G, q) > netWorth(G, best)) best = q;
  }
  return best && netWorth(G, best) > netWorth(G, p) ? best : null;
}

// ------------------------------------------------------------------ what shops are worth

function groupSize(G: GameState, g: number): number {
  return Math.max(1, G.groups[g]?.length ?? 4);
}

/** The fee multiplier for owning `k` of a group of `size` (dominated with all of them). */
function feeMult(k: number, size: number): number {
  if (k <= 0) return 0;
  return K.mult[Math.min(4, k)] * (k >= size ? K.domFee : 1);
}

/**
 * What owning `sq` is worth to `p` on top of its value: the fees rivals will pay there for the
 * rest of the game, what it adds to its other shops in the group (higher fees, growth) and, for a
 * CPU that blocks, keeping a rival from dominating the group.
 */
function ownValue(G: GameState, p: Player, sq: Square, blocks: boolean): number {
  if (!isShopLike(sq) && sq.t !== 'plot') return 0;
  const g = sq.g;
  if (g < 0) return sq.value * K.feeRate * visitsLeft(G);
  const size = groupSize(G, g);
  const mine = G.groups[g].map((id) => G.nodes[id]).filter((s) => s.owner === p.id && s.id !== sq.id);
  const before = mine.length;
  const after = before + 1;
  const visits = visitsLeft(G);
  let v = isShopLike(sq) ? sq.value * K.feeRate * feeMult(after, size) * visits : K.plotCost * 0.5;
  for (const s of mine) {
    if (!isShopLike(s)) continue;
    // Its other shops grow (expansion) and earn more per visit.
    const grow = Math.min(maxValue(G, s) - s.value, shopBase(s) * (after >= size ? K.expandDom : K.expand));
    v += Math.max(0, grow);
    v += s.value * K.feeRate * (feeMult(after, size) - feeMult(before, size)) * visits;
  }
  if (blocks) {
    for (const q of G.players) {
      if (q.id === p.id || q.bankrupt || q.id === sq.owner) continue;
      if (ownedCount(G, q.id, g) === size - 1) v += sq.value * C.blockValue;
    }
  }
  return v;
}

/** What `p` loses by giving up `sq`: its earnings there and what it adds to the group. */
function loseValue(G: GameState, p: Player, sq: Square): number {
  const g = sq.g;
  if (g < 0) return sq.value * K.feeRate * visitsLeft(G);
  const size = groupSize(G, g);
  const before = ownedCount(G, p.id, g);
  const visits = visitsLeft(G);
  let v = isShopLike(sq) ? sq.value * K.feeRate * feeMult(before, size) * visits : 0;
  for (const id of G.groups[g]) {
    const s = G.nodes[id];
    if (s.owner !== p.id || s.id === sq.id || !isShopLike(s)) continue;
    v += s.value * K.feeRate * (feeMult(before, size) - feeMult(before - 1, size)) * visits;
  }
  return v;
}

/** What handing `sq` to `q` is worth to `q` (used to avoid feeding a rival a domination). */
function gainFor(G: GameState, q: Player, sq: Square): number {
  return ownValue(G, q, sq, false);
}

// ------------------------------------------------------------------ stocks

/**
 * How good a district's stock looks to buy, like a player would judge it: growth the owners there
 * can still invest (their own shops' room, limited by their spare cash; the CPU's own shops count
 * fully since it will invest in them), dividends from the fees rivals pay there, a dented price
 * that should recover, and (dynamic stocks) how strongly shares move it. Per 1G of share price.
 */
export function stockAppeal(G: GameState, p: Player, d: number): number {
  const shops = G.nodes.filter((s) => s.d === d && isShopLike(s));
  if (!shops.length) return -Infinity;
  const price = Math.max(1, stockPrice(G, d));
  const rate = dynamicStocks(G) ? K.growthRate : K.stockRate;
  let growth = 0;
  let fees = 0;
  for (const q of G.players) {
    if (q.bankrupt) continue;
    const mine = shops.filter((s) => s.owner === q.id);
    if (!mine.length) continue;
    const room = mine.reduce((t, s) => t + investRoom(G, s), 0);
    const spareCash = Math.max(0, q.cash - C.investFloor);
    growth += Math.min(room, spareCash) * (q.id === p.id ? 1 : C.stockRivalInvest);
    // Dividends are paid by the bank on every fee rivals pay there, its own shops' fees included.
    fees += mine.reduce((t, s) => t + shopFee(G, s), 0);
  }
  let appeal =
    ((growth / shops.length) * rate + (fees / shops.length / K.divDivisor) * C.stockDividendVisits) / price;
  if (dynamicStocks(G)) {
    appeal += (1 - confidence(G, d)) * C.stockDentBonus;
    appeal += (market(G).vol[d] - 1) * C.stockVolBonus;
  }
  return appeal;
}

/** The district a CPU would buy stock in (a careless or simple CPU just picks a fair one). */
function stockPick(G: GameState, b: Brain): number {
  const p = b.p;
  if (!b.s.stockSmart && careless(G, b)) return randInt(G, G.districts.length);
  let best = -1;
  let score = -Infinity;
  G.districts.forEach((_, d) => {
    let a = stockAppeal(G, p, d);
    if (b.s.stockSmart) {
      // Dividends add up over the game: a sharp CPU weighs the fees paid there more.
      const shops = G.nodes.filter((s) => s.d === d && isShopLike(s) && s.owner >= 0);
      const fees = shops.reduce((t, s) => t + shopFee(G, s), 0);
      a +=
        ((fees / K.divDivisor / Math.max(1, stockPrice(G, d))) * C.stockSmartDividends * visitsLeft(G)) /
        C.visits;
      // Its own districts first: its investing there lifts its shares too. Keep adding to a
      // holding rather than spreading thin (every share it holds lifts the price of the rest).
      a += ownedCount(G, p.id, d) * C.stockOwnBonus + Math.min(1, p.shares[d] / 200) * C.stockHoldBonus;
      // A leader with a big holding there gains from every share bought: a blocker avoids it.
      const lead = b.s.blocks ? leaderAhead(G, p) : null;
      if (lead && lead.shares[d] > p.shares[d]) a -= C.stockLeaderPenalty;
    }
    if (a > score) {
      score = a;
      best = d;
    }
  });
  return best >= 0 ? best : randInt(G, G.districts.length);
}

/**
 * A stock dump to stop a rival: when a rival ahead of the CPU is within C.dumpNear of the goal,
 * sell all the CPU's shares (K.sellOff or more) of the district where that rival holds the most
 * stock value (at least C.dumpRivalValue), crashing it.
 */
function stockDump(G: GameState, p: Player): { act: 'sellStock'; d: number; n: number } | null {
  const mine = netWorth(G, p);
  let best: { act: 'sellStock'; d: number; n: number } | null = null;
  let hurt = 0;
  for (const q of G.players) {
    if (q.id === p.id || q.bankrupt) continue;
    const worth = netWorth(G, q);
    if (worth < G.target * C.dumpNear || worth <= mine) continue;
    p.shares.forEach((n, d) => {
      if (n < K.sellOff) return;
      const v = q.shares[d] * stockPrice(G, d);
      if (v >= C.dumpRivalValue && v > hurt) {
        hurt = v;
        best = { act: 'sellStock', d, n };
      }
    });
  }
  return best;
}

/**
 * Shares to sell for cash before a rough roll: from the holding where selling hurts least, never
 * enough to set off a sell-off in that district this turn.
 */
function cashSale(G: GameState, b: Brain, need: number): { d: number; n: number } | null {
  const p = b.p;
  const m = dynamicStocks(G) ? market(G) : null;
  let best: { d: number; n: number } | null = null;
  let bestScore = -Infinity;
  p.shares.forEach((held, d) => {
    if (!held) return;
    const price = Math.max(1, stockPrice(G, d));
    const room = m ? Math.max(0, K.sellOff - 1 - m.sold[d]) : held;
    const n = Math.min(held, room, Math.ceil(need / price));
    if (n <= 0) return;
    // Prefer districts it has no shops in, and bigger sales (fewer needed).
    const score = n * price - ownedCount(G, p.id, d) * 200;
    if (score > bestScore) {
      bestScore = score;
      best = { d, n };
    }
  });
  return best;
}

// ------------------------------------------------------------------ venture grid

/**
 * Where a CPU flips a venture panel: the free panel that best extends its own lines (a line of
 * 4+ pays now), with room to grow a line through it as a tiebreaker; random among equals.
 */
function venturePick(G: GameState, pid: number, owner: number[]): number {
  const free = owner.map((o, i) => (o < 0 ? i : -1)).filter((i) => i >= 0);
  const score = (i: number) => {
    const x0 = i % 8;
    const y0 = Math.floor(i / 8);
    let s = 0;
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ]) {
      // Own panels joined to this one, and the open stretch (own or free) it sits in.
      let run = 1;
      let open = 1;
      for (const k of [1, -1]) {
        let joined = true;
        for (
          let x = x0 + dx * k, y = y0 + dy * k;
          x >= 0 && x < 8 && y >= 0 && y < 8;
          x += dx * k, y += dy * k
        ) {
          const o = owner[y * 8 + x];
          if (o !== pid && o >= 0) break;
          open++;
          if (joined && o === pid) run++;
          else joined = false;
        }
      }
      if (open >= K.lineBonusMin) s += run * run + open / 8;
    }
    // A line of 4+ pays right away.
    const now = linesThrough(
      owner.map((o, j) => (j === i ? pid : o)),
      i,
      pid,
    );
    return s + now.length * 100;
  };
  let best: number[] = [];
  let top = -Infinity;
  for (const i of free) {
    const v = score(i);
    if (v > top + 1e-9) {
      top = v;
      best = [i];
    } else if (Math.abs(v - top) <= 1e-9) best.push(i);
  }
  return pick(G, best);
}

// ------------------------------------------------------------------ trades

function tradeWorth(G: GameState, cpu: Player, ids: number[], giving: boolean): number {
  return ids.reduce((s, id) => {
    const sq = G.nodes[id];
    let k = ownedCount(G, cpu.id, sq.g);
    if (giving && sq.owner === cpu.id) k -= 1;
    return s + sq.value * (1 + C.tradeGroupBonus * Math.max(0, k));
  }, 0);
}

/**
 * How a CPU weighs a trade offered to it: what it receives and what it gives up, in gold. Simple
 * CPUs go by the shops' values (more for a group they already have); sharper ones count what the
 * shops will earn, and blockers add what the deal hands the other side (a domination is costly).
 */
function tradeSides(G: GameState, b: Brain, o: TradeOffer): { receives: number; gives: number } {
  const cpu = b.p;
  if (!b.s.tradeSense)
    return {
      receives: tradeWorth(G, cpu, o.give, false) + o.cashGive,
      gives: tradeWorth(G, cpu, o.get, true) + o.cashGet,
    };
  let receives = o.cashGive;
  let gives = o.cashGet;
  for (const id of o.give) receives += G.nodes[id].value + ownValue(G, cpu, G.nodes[id], false);
  for (const id of o.get) gives += G.nodes[id].value + loseValue(G, cpu, G.nodes[id]);
  if (b.s.blocks) {
    const other = G.players[o.from];
    for (const id of o.get) {
      const sq = G.nodes[id];
      if (ownedCount(G, other.id, sq.g) + 1 >= groupSize(G, sq.g))
        gives += gainFor(G, other, sq) * C.blockTrade;
    }
  }
  return { receives, gives };
}

/** Whether CPU `o.to` accepts this trade as it is. */
export function cpuAcceptsTrade(G: GameState, o: TradeOffer): boolean {
  const b = brain(G, G.players[o.to]);
  const { receives, gives } = tradeSides(G, b, o);
  return receives >= C.tradeAccept * gives + C.tradeAcceptPlus && b.p.cash >= o.cashGet;
}

/**
 * The CPU's answer to an offer: accept, or (sharper CPUs, when the deal is close) send back the
 * same swap asking for the gold that would make it worth it, or decline.
 */
function answerTrade(G: GameState, b: Brain, o: TradeOffer, canCounter: boolean) {
  if (cpuAcceptsTrade(G, o)) return true;
  if (!canCounter || !b.s.tradeSense) return false;
  const { receives, gives } = tradeSides(G, b, o);
  const want = C.tradeAccept * gives + C.tradeAcceptPlus;
  const short = Math.ceil((want - receives) / 10) * 10;
  const from = G.players[o.from];
  if (short <= 0 || receives < want * C.tradeCounterNear || o.cashGive + short > from.cash) return false;
  // The counter is from the CPU's side: it gives what was asked of it and gets the rest.
  return {
    counter: {
      from: o.to,
      to: o.from,
      give: o.get,
      get: o.give,
      cashGive: o.cashGet,
      cashGet: o.cashGive + short,
    },
  };
}

/**
 * A trade the CPU would like to offer before rolling: buy a rival's lone shop in a group where the
 * CPU has more (paying in gold, or swapping a lone shop of its own in a group the rival is
 * building), so the CPU gets closer to dominating. Offered only when it pays the CPU and the other
 * side would likely take it.
 */
function tradeIdea(G: GameState, b: Brain): TradeOffer | null {
  const p = b.p;
  let best: { offer: TradeOffer; gain: number } | null = null;
  const lead = b.s.blocks ? leaderAhead(G, p) : null;
  for (const want of G.nodes) {
    if (want.owner < 0 || want.owner === p.id || want.g < 0 || !isShopLike(want)) continue;
    const q = G.players[want.owner];
    if (q.bankrupt) continue;
    // A blocker never pays the leader.
    if (lead && q.id === lead.id) continue;
    const mineThere = ownedCount(G, p.id, want.g);
    const theirs = ownedCount(G, q.id, want.g);
    if (mineThere < 2 || theirs > 1) continue;
    const value = want.value + ownValue(G, p, want, b.s.blocks);
    // What the owner would want for it (as a fair CPU would judge it), plus a sweetener.
    const ask = (want.value + loseValue(G, q, want)) * C.tradeOfferPay;
    // A swap: one of its lone shops in a group the other side is building.
    const swap = ownedSquares(G, p.id).find(
      (s) => s.g >= 0 && s.g !== want.g && ownedCount(G, p.id, s.g) === 1 && ownedCount(G, q.id, s.g) >= 2,
    );
    if (swap) {
      const cost = swap.value + loseValue(G, p, swap);
      const back = Math.max(0, Math.ceil((ask - swap.value - gainFor(G, q, swap)) / 10) * 10);
      const gain = value - cost - back;
      if (gain > 0 && back <= spare(G, b) && back <= p.cash && (!best || gain > best.gain))
        best = {
          offer: { from: p.id, to: q.id, give: [swap.id], get: [want.id], cashGive: back, cashGet: 0 },
          gain,
        };
      continue;
    }
    const pay = Math.ceil(ask / 10) * 10;
    const gain = value - pay;
    if (gain > 0 && pay <= spare(G, b) && pay <= p.cash && (!best || gain > best.gain))
      best = { offer: { from: p.id, to: q.id, give: [], get: [want.id], cashGive: pay, cashGet: 0 }, gain };
  }
  return best && best.gain >= C.tradeMinGain ? best.offer : null;
}

// ------------------------------------------------------------------ auctions and buyouts

/**
 * The most a CPU will bid for a square at auction. Simple CPUs: its value x 1.25 (x 1.6 with a
 * square in that group already), keeping 200G. Sharper ones: what it is worth to them (value plus
 * earnings, plus blocking a rival's domination) times their level's bid share, keeping their
 * cushion and counting the shares they could sell.
 */
export function cpuBidLimit(G: GameState, pid: number, sqId: number): number {
  const p = G.players[pid];
  const sq = G.nodes[sqId];
  const b = brain(G, p);
  if (!b.s.valuesShops) {
    const limit = sq.value * (ownedCount(G, p.id, sq.g) > 0 ? C.bidMaxGroup : C.bidMax) * b.s.bidShare;
    return Math.floor(Math.min(limit, p.cash - C.bidKeep * caution(b)));
  }
  const worth = (sq.value + ownValue(G, p, sq, b.s.blocks) * C.bidEarnings) * b.s.bidShare;
  // It can bid past its cash when shares could cover it (the game lets players bid with assets).
  return Math.floor(Math.min(worth, spare(G, b)));
}

/**
 * Whether a buyout pays: buying out costs 5x the value and the owner keeps 3x, so the CPU's net
 * worth drops by 4x the value. Worth it only for what the shop then earns and adds to the group
 * (a domination), or for keeping the leader from one.
 */
function buyoutPays(G: GameState, b: Brain, sq: Square, price: number): boolean {
  const p = b.p;
  if (!b.s.buyoutSense) return ownedCount(G, p.id, sq.g) > 0 && p.cash - price >= C.buyoutKeep * caution(b);
  if (means(G, b) - price < cushion(G, b)) return false;
  const loss = price - sq.value;
  let gain = ownValue(G, p, sq, b.s.blocks);
  // Taking a shop from the leader also takes its earnings from them.
  const owner = G.players[sq.owner];
  if (b.s.blocks && owner && leaderAhead(G, p)?.id === owner.id) gain += loseValue(G, owner, sq);
  return gain > loss * C.buyoutMargin;
}

// ------------------------------------------------------------------ before rolling

/** A renovation that pays: an idle building turned into a 3-Star Shop when there is cash to spare. */
function renovation(G: GameState, b: Brain): { sq: number; b: BuildingKey } | null {
  const cost = K.star3Cost + K.renovate;
  if (spare(G, b) < cost || b.p.cash < cost) return null;
  if (!buildingAvailable(G, 'star3')) return null;
  const idle = ownedSquares(G, b.p.id).find(
    (s) => s.t === 'plot' && (s.b === 'balloon' || s.b === 'agency' || s.b === 'motel' || s.b === 'home'),
  );
  return idle ? { sq: idle.id, b: 'star3' } : null;
}

/** A lone shop to auction when cash is short and nothing else can be sold (beats the bank's 75%). */
function auctionIdea(G: GameState, b: Brain): number | null {
  const p = b.p;
  if (p.cash >= cushion(G, b) * 0.4 || stockValue(G, p) > 0) return null;
  if (dangerAhead(G, p) <= p.cash) return null;
  const lone = ownedSquares(G, p.id)
    .filter((s) => isShopLike(s) && s.g >= 0 && ownedCount(G, p.id, s.g) === 1)
    .sort((a, c) => a.value - c.value);
  return lone.length ? lone[0].id : null;
}

function preRoll(G: GameState, b: Brain, req: Extract<DecisionRequest, { kind: 'preRoll' }>) {
  const p = b.p;
  const roll = { act: 'roll' as const };
  if (req.canStock) {
    const dump = stockDump(G, p);
    if (dump && (b.s.preRoll || p.shares.some((n) => n >= K.sellOff))) return dump;
  }
  if (!b.s.preRoll) return roll;
  // Raise cash before a roll that could land on a big fee (selling shares beats the bank's 75%).
  if (req.canStock && b.s.liquidStock) {
    const danger = dangerAhead(G, p);
    if (danger > p.cash) {
      const sale = cashSale(G, b, danger - p.cash + 50);
      if (sale) return { act: 'sellStock' as const, ...sale };
    }
  }
  if (req.canRenovate && b.s.valuesShops) {
    const r = renovation(G, b);
    if (r) return { act: 'renovate' as const, ...r };
  }
  if (req.canTrade && b.s.tradeChance > 0 && rand(G) < b.s.tradeChance * (0.5 + b.st.trader)) {
    const offer = tradeIdea(G, b);
    if (offer) return { act: 'trade' as const, offer };
  }
  if (req.canAuction && b.s.valuesShops) {
    const sq = auctionIdea(G, b);
    if (sq != null) return { act: 'auction' as const, sq };
  }
  return roll;
}

// ------------------------------------------------------------------ paths

/**
 * How good stopping at the end of `route` looks to `p`, in gold (higher is better). Suits count as
 * a share of the next salary (a quarter each, the whole salary for reaching the bank with all
 * four, less a little per square still to go to the next one); money counts as itself, weighed by
 * the level's path sense.
 */
function routeValue(G: GameState, b: Brain, route: { node: number; path: number[] }): number {
  const p = b.p;
  const sq = G.nodes[route.node];
  const pay = salary(G, p);
  let suits = 0;
  const held = p.suits.slice();
  const worth = netWorth(G, p);
  for (const [index, id] of route.path.entries()) {
    const c = G.nodes[id];
    const at = si(c);
    if (at >= 0 && !held[at]) {
      held[at] = true;
      suits += pay * C.pathSuit;
    }
    if (c.t === 'bank') {
      if (worth >= G.target) suits += 100000;
      else if (held.filter(Boolean).length + p.wild >= 4) suits += pay;
    }
    if (c.t === 'jackpot' && index < route.path.length - 1) suits -= K.jackpotPass;
    if (c.t === 'plot' && c.b === 'checkpoint' && c.owner >= 0 && c.owner !== p.id) suits -= c.toll;
  }
  // How far the next goal is from here (as the crow flies, or as it must walk).
  if (b.s.plansAhead) {
    const last = route.path.length >= 2 ? route.path[route.path.length - 2] : p.node;
    const prev = G.nodes[last]?.t === 'portal' ? -1 : last;
    suits -= walkDistance(G, route.node, prev, goalsWith(G, p, held)) * pay * C.pathGoalStep * b.s.goalPull;
  } else suits -= goalDistance(G, p, route.node) * pay * C.pathGoalStep * b.s.goalPull;
  // Money: fees to pay, shops to buy, investing in its own, cards and bonuses.
  let money = 0;
  if (sq.owner >= 0 && sq.owner !== p.id) {
    const fee = squareFee(G, sq, p);
    money -= fee;
    // A fee it can't pay forces sales at a loss.
    if (fee > p.cash) money -= (fee - p.cash) * C.pathDebtPain;
    // Paying the leader is worse than paying someone behind.
    if (b.s.blocks && leaderAhead(G, p)?.id === sq.owner) money -= fee * 0.3;
  } else if (sq.owner === p.id && isShopLike(sq)) {
    if (spare(G, b) > 100) money += Math.min(spare(G, b), K.investCap) * C.pathInvest;
  } else if ((sq.t === 'shop' || sq.t === 'plot') && sq.owner < 0) {
    const price = sq.value || K.plotCost;
    if (spare(G, b) >= price) money += b.s.valuesShops ? ownValue(G, p, sq, b.s.blocks) * 0.5 : 60;
  }
  if (sq.t === 'jackpot') money += sq.pot ?? 0;
  if (sq.t === 'venture' || (si(sq) >= 0 && !p.suits[si(sq)])) money += C.pathVenture;
  if (sq.t === 'arcade') money += C.pathVenture;
  if (sq.t === 'boon' || sq.t === 'boom') money += Math.min(200, ownedSquares(G, p.id).length * 15);
  if (sq.t === 'break') money -= Math.min(200, ownedSquares(G, p.id).length * 20);
  if (sq.t === 'broker' && G.rules === 'standard' && spare(G, b) > 300) money += 30;
  return suits + money * b.s.pathSense;
}

function si(sq: Square): number {
  return (SUITS as string[]).indexOf(sq.t);
}

/** Where a jump (cannon, swap) lands best: near its goals and not on a rival's big fee. */
function placeValue(G: GameState, b: Brain, node: number): number {
  const sq = G.nodes[node];
  let v = -goalDistance(G, b.p, node) * salary(G, b.p) * C.pathGoalStep;
  if (sq.owner >= 0 && sq.owner !== b.p.id) v -= squareFee(G, sq, b.p) * b.s.pathSense * 0.2;
  return v;
}

// ------------------------------------------------------------------ the decisions

export function cpuDecide<T extends DecisionKind>(G: GameState, req: DecisionRequest<T>): DecisionAnswer<T> {
  return decide(G, req as DecisionRequest) as DecisionAnswer<T>;
}

function decide(G: GameState, req: DecisionRequest): unknown {
  const p = G.players[req.pid];
  const b = brain(G, p);
  switch (req.kind) {
    case 'preRoll':
      return preRoll(G, b, req);

    case 'path': {
      if (careless(G, b)) return pick(G, req.dests).node;
      let best = req.dests[0].node;
      let bestScore = -Infinity;
      for (const r of req.dests) {
        // A little noise (more on easier levels) so equal routes don't always go the same way.
        const s = routeValue(G, b, r) + rand(G) * (5 + b.s.mistakes * 400);
        if (s > bestScore) {
          bestScore = s;
          best = r.node;
        }
      }
      return best;
    }

    case 'buyShop': {
      const sq = G.nodes[req.sq];
      if (careless(G, b)) return false;
      // Buying from the bank costs no net worth: it is only a question of keeping enough cash.
      // Sharper CPUs lower their cushion for a shop that earns well (and may count their shares).
      let keep = cushion(G, b);
      if (b.s.valuesShops) keep -= Math.min(keep * 0.6, ownValue(G, p, sq, b.s.blocks) * C.buyEager);
      else if (ownedCount(G, p.id, sq.g) > 0) keep = 0;
      return means(G, b) - req.price >= keep && p.cash >= req.price * (b.s.liquidStock ? 0.5 : 1);
    }

    case 'build': {
      const can = (k: BuildingKey) => req.options.some((o) => o.b === k);
      const cost = (k: BuildingKey) => req.options.find((o) => o.b === k)?.cost ?? K.plotCost;
      if (b.s.valuesShops) {
        // A 3-Star Shop counts toward the district and earns like a shop: the best use of cash.
        if (can('star3') && spare(G, b) - cost('star3') >= 0 && p.cash >= cost('star3')) return 'star3';
        if (spare(G, b) < K.plotCost * 0.5) return null;
        const late = progress(G) > 0.5;
        const order: BuildingKey[] = late
          ? ['tax', 'circus', 'checkpoint', 'motel', 'balloon', 'agency']
          : ['circus', 'checkpoint', 'tax', 'motel', 'balloon', 'agency'];
        const pickB = order.find((k) => can(k) && p.cash >= cost(k));
        return pickB ?? null;
      }
      if (can('star3') && p.cash - K.star3Cost >= C.star3Keep && rand(G) < C.star3Chance) return 'star3';
      if (p.cash - K.plotCost < C.buildKeep * caution(b)) return null;
      const w: Record<string, number> = {};
      for (const [k, n] of Object.entries(C.buildWeights))
        if (can(k as BuildingKey)) w[k] = careless(G, b) ? 1 : n;
      if (!Object.keys(w).length) return null;
      return weighted(G, w);
    }

    case 'invest': {
      if (rand(G) >= b.s.investChance) return null;
      const budget = Math.min(req.max, (b.s.investOnShares ? means(G, b) : p.cash) - cushion(G, b));
      if (budget <= 0) return null;
      let opt = req.shops.slice().sort((a, c) => c.room - a.room)[0];
      if (b.s.investSmart) {
        // Where 1G invested earns most: the fee multiplier there, and its own shares in the district.
        let top = -Infinity;
        for (const o of req.shops) {
          const sq = G.nodes[o.sq];
          const size = groupSize(G, sq.g);
          let s = K.feeRate * feeMult(ownedCount(G, p.id, sq.g), size) * visitsLeft(G);
          if (G.rules === 'standard' && sq.d >= 0 && p.shares[sq.d]) {
            const before = stockPriceExact(G, sq.d);
            sq.value += 100;
            const after = stockPriceExact(G, sq.d);
            sq.value -= 100;
            s += ((after - before) * p.shares[sq.d]) / 100;
          }
          if (s > top) {
            top = s;
            opt = o;
          }
        }
      }
      // A stock-minded CPU invests a little less, a bold one more.
      const share = b.s.investShare * (1.15 - b.st.stocks * 0.3) * (0.8 + b.st.risk * 0.4);
      const amount = Math.floor(Math.min(opt.room, budget, Math.max(0, budget) * Math.min(1, share)));
      return amount >= C.investMin ? { sq: opt.sq, amount } : null;
    }

    case 'buyout': {
      if (careless(G, b)) return rand(G) < 0.5 && p.cash - req.price >= 0;
      return buyoutPays(G, b, G.nodes[req.sq], req.price);
    }

    case 'circusUpgrade':
      return p.cash - req.cost >= Math.max(C.circusKeep * 0.5, cushion(G, b));

    case 'buyStock': {
      if (rand(G) >= b.s.stockChance) return null;
      const d = stockPick(G, b);
      const unit = Math.max(1, stockPrice(G, d) * (1 - req.discount));
      // A stock-minded CPU puts more of its spare cash in shares.
      const share = b.s.stockShare * (0.6 + b.st.stocks * 0.8);
      const budget = Math.min(req.maxSpend, (p.cash - cushion(G, b)) * Math.min(1, share));
      const n = Math.min(K.maxBuy, Math.floor(budget / unit));
      return n >= C.stockMin ? { d, n } : null;
    }

    case 'sellStock': {
      // A card's sale above market: sell the biggest holding.
      let best = -1;
      let v = 0;
      p.shares.forEach((n, d) => {
        const val = n * stockPrice(G, d);
        if (val > v) {
          v = val;
          best = d;
        }
      });
      return best >= 0 ? { d: best, n: p.shares[best] } : null;
    }

    case 'ventureRead':
      return true;
    case 'venturePanel':
      return careless(G, b)
        ? pick(
            G,
            req.owner.map((o, i) => (o < 0 ? i : -1)).filter((i) => i >= 0),
          )
        : venturePick(G, p.id, req.owner);

    case 'reels': {
      const best = req.symbols.reduce((a, c) =>
        req.symbols.filter((s) => s === a).length >= req.symbols.filter((s) => s === c).length ? a : c,
      );
      return {
        collect: new Set(req.symbols).size === 1 || new Set(req.symbols).size === 5,
        locked: req.symbols.map((s) => s === best),
      };
    }

    case 'arcadeChoice': {
      if (!b.s.arcadeSense)
        return { choice: randInt(G, req.options.length), stake: Math.min(20, req.maxBet ?? 0) };
      if (req.game === 'Lucky Wheel') {
        // Every bet is even money on average: a bold CPU bets big, a careful one small.
        const max = req.maxBet ?? 0;
        const stake = Math.min(max, Math.round((max * (0.1 + b.st.risk * 0.9)) / 10) * 10);
        return { choice: b.st.risk > 0.6 ? 2 + randInt(G, 3) : randInt(G, 2), stake };
      }
      if (req.game === 'Coin Derby') {
        // The winner's bonus grows with level; grabbing coins is a sure thing.
        const sprint = p.level >= 2 || b.st.risk > 0.5 || req.round > 1;
        return { choice: sprint ? 0 : 1 };
      }
      // Treasure Split: others crowd the big chest, so spread the picks.
      return { choice: Number(weighted(G, { '0': 0.2, '1': 0.35, '2': 0.45 })) };
    }

    case 'memory':
      return randInt(G, 9);

    case 'cannonTarget':
    case 'swapTarget': {
      if (careless(G, b) || !req.options.length) return pick(G, req.options);
      return req.options
        .slice()
        .sort((a, c) => placeValue(G, b, G.players[c].node) - placeValue(G, b, G.players[a].node))[0];
    }

    case 'motelStop':
      return req.left >= C.motelMinCarry && p.cash - req.fee >= C.motelCashReserve * caution(b) * 0.8;

    case 'pickSquare': {
      if (req.purpose === 'balloon' || req.purpose === 'zoom') {
        const targets = goals(G, p).filter((id) => req.options.includes(id));
        if (!targets.length) return req.optional ? null : pick(G, req.options);
        const d = distances(G, p.node);
        return targets.sort((a, c) => d[a] - d[c])[0];
      }
      if (req.purpose === 'taxi') {
        // A missing suit first, then a venture card, else anywhere.
        const want = goals(G, p).filter((id) => req.options.includes(id) && G.nodes[id].t !== 'bank');
        if (want.length) return pick(G, want);
        const venture = req.options.filter((id) => G.nodes[id].t === 'venture');
        return pick(G, venture.length ? venture : req.options);
      }
      if (req.purpose === 'agency') {
        // Buy a shop from anywhere: the one worth most to it that it can afford.
        const opts = req.options.filter(
          (id) => spare(G, b) - G.nodes[id].value >= 0 && p.cash >= G.nodes[id].value,
        );
        if (!opts.length) return null;
        return opts.sort(
          (a, c) => ownValue(G, p, G.nodes[c], b.s.blocks) - ownValue(G, p, G.nodes[a], b.s.blocks),
        )[0];
      }
      // forcedBuyout
      const opts = req.options
        .filter((id) => buyoutPays(G, b, G.nodes[id], G.nodes[id].value * K.buyoutX))
        .sort((a, c) => shopFee(G, G.nodes[c]) - shopFee(G, G.nodes[a]));
      return opts.length ? opts[0] : null;
    }

    case 'pickDistrict': {
      if (req.purpose === 'up20') {
        const held = req.options.map((d) => p.shares[d] * stockPrice(G, d) + ownedCount(G, p.id, d) * 50);
        const max = Math.max(...held);
        return req.options[held.indexOf(max)];
      }
      if (req.purpose === 'down20') {
        // Hurt rivals' holdings the most (the leader's most of all), sparing its own.
        const lead = b.s.blocks ? leaderAhead(G, p) : null;
        const hurt = (d: number) =>
          G.players.reduce((s, q) => s + (q.id === p.id ? -2 : q.id === lead?.id ? 2 : 1) * q.shares[d], 0) *
          stockPrice(G, d);
        return req.options.reduce((a, c) => (hurt(c) > hurt(a) ? c : a));
      }
      if (req.purpose === 'free20') {
        const d = stockPick(G, b);
        return req.options.includes(d) ? d : req.options[0];
      }
      return req.options[0];
    }

    case 'answerTrade':
      return answerTrade(G, b, req.offer, req.canCounter);

    case 'auction': {
      // Without a screen the live auction plays out as an ascending auction: the bidder willing
      // to go highest wins, paying one step above the next highest (never under the opening bid).
      const limits = req.bidders
        .map((pid) => ({ pid, limit: cpuBidLimit(G, pid, req.sq) }))
        .filter((x) => x.limit >= req.opening)
        .sort((x, y) => y.limit - x.limit);
      if (!limits.length) return { winner: -1, price: 0 };
      const [top, next] = limits;
      let price = req.opening;
      if (next) price = req.opening + (Math.floor((next.limit - req.opening) / req.step) + 1) * req.step;
      return { winner: top.pid, price: Math.min(price, top.limit) };
    }

    case 'debt':
      return debtChoice(G, b, req.assets);
  }
  return null;
}

/**
 * What to sell to get out of debt. Shares first: sharper CPUs sell just what they need, from the
 * holding they care least about and short of a sell-off; then the property it will miss least.
 */
function debtChoice(G: GameState, b: Brain, assets: DebtAsset[]): number | { d: number; n: number } {
  const p = b.p;
  const stock = assets.findIndex((a) => a.kind === 'stock');
  if (stock >= 0) {
    if (b.s.liquidStock) {
      const sale = cashSale(G, b, -p.cash);
      if (sale) return sale;
    }
    return stock;
  }
  let best = 0;
  let bestLoss = Infinity;
  assets.forEach((a, i) => {
    const sq = G.nodes[a.id];
    const loss = b.s.valuesShops ? sq.value - a.amount + loseValue(G, p, sq) : a.amount;
    if (loss < bestLoss) {
      bestLoss = loss;
      best = i;
    }
  });
  return best;
}
