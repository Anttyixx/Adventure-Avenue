import { K } from './constants';
import { districtStartingValues } from './property-values';
import { BOARDS } from './boards/builtin';
import { buildDeck } from './cards';
import { rand, shuffle } from './rng';
import { computeRows, netWorth, shareOffsets } from './rules';
import type { CpuStyle, GameState, Market, MatchOptions, Player, Square } from './types';

/** Player colors: one more than the most players, so players can swap colors in game setup. */
export const PLAYER_COLORS = ['#e5484d', '#3e7bfa', '#30a46c', '#a855f7', '#f76b15', '#d6409f'];

/** Players per match (humans and CPUs). */
export const MAX_PLAYERS = 5;

/**
 * Each seat's color, in seat order: the color it asked for when that is valid and no earlier seat
 * has it, otherwise the first color nobody has. With no wishes this is 0, 1, 2...
 */
export function seatColors(wants: (number | null | undefined)[]): number[] {
  const out: number[] = [];
  const used = new Set<number>();
  wants.forEach((c, i) => {
    if (c != null && Number.isInteger(c) && c >= 0 && c < PLAYER_COLORS.length && !used.has(c)) {
      out[i] = c;
      used.add(c);
    }
  });
  wants.forEach((_, i) => {
    if (out[i] != null) return;
    const free = PLAYER_COLORS.findIndex((_, k) => !used.has(k));
    out[i] = free;
    used.add(free);
  });
  return out;
}

export function newGame(opts: MatchOptions): GameState {
  const board = opts.board ?? BOARDS[opts.boardId ?? 'town'];
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const pricing = districtStartingValues(board);
  // Every property starts as a shop; vacant plots are picked later (`choosePlots`).
  const nodes: Square[] = board.squares.map((s, id) => {
    return {
      id,
      x: s.x,
      y: s.y,
      t: s.t,
      nb: [],
      d: s.d ?? -1,
      g: -1,
      base: pricing.values[id],
      value: pricing.values[id],
      owner: -1,
      b: null,
      lv: 0,
      toll: K.toll0,
      ...(s.t === 'jackpot' ? { pot: 0 } : {}),
      link: s.t === 'warp' || s.t === 'portal' ? (s.link ?? -1) : -1,
      channel: s.channel,
      toBank: s.toBank,
    };
  });
  for (const [a, b] of board.edges) {
    nodes[a].nb.push(b);
    nodes[b].nb.push(a);
  }
  // Portal links: neighbors through a tile side, wherever they are on the board.
  for (const { a, b, sa, sb, oneWay } of board.portalLinks ?? []) {
    if (!nodes[a] || !nodes[b] || a === b) continue;
    // A road (or another portal) may already join these tiles. Keep every visible endpoint.
    if (!nodes[a].nb.includes(b)) nodes[a].nb.push(b);
    if (!nodes[b].nb.includes(a)) nodes[b].nb.push(a);
    (nodes[a].portals ??= []).push({ to: b, side: sa, toSide: sb, way: oneWay ? 'in' : 'both' });
    (nodes[b].portals ??= []).push({ to: a, side: sb, toSide: sa, way: oneWay ? 'out' : 'both' });
    // Out of an exit there's no way back in.
    if (oneWay) (nodes[b].noGo ??= []).push(a);
  }
  // One-way links: no stepping from `to` back to `from`.
  for (const [a, b] of board.oneWay ?? []) if (nodes[a]?.nb.includes(b)) (nodes[b].noGo ??= []).push(a);
  const colors = seatColors(opts.seats.map((seat) => seat.color));
  // Each CPU's play style comes from its own generator off the seed, so rolling it never changes
  // the game's other randomness.
  const styleOf = (i: number): CpuStyle => {
    const r = { rng: (seed ^ Math.imul(i + 1, 0x9e3779b1)) | 0 };
    return { risk: rand(r), stocks: rand(r), trader: rand(r) };
  };
  const players: Player[] = opts.seats.map((seat, i) => ({
    id: i,
    slot: i,
    name: seat.name,
    ch: seat.ch,
    color: colors[i],
    cpu: seat.cpu,
    ...(seat.cpu ? { cpuLevel: seat.level ?? 'normal', style: styleOf(i) } : {}),
    cash: K.startCash,
    level: 1,
    suits: [false, false, false, false],
    wild: 0,
    shares: board.districts.map(() => 0),
    node: board.bank,
    prev: -1,
    onBreak: false,
    closed: false,
    boon: 0,
    boost: 1,
    bankrupt: false,
    stats: { feesEarned: 0, feesPaid: 0, salary: 0, dividends: 0, commission: 0 },
  }));
  const G: GameState = {
    version: 1,
    rules: opts.rules,
    target: opts.target,
    roundCap: opts.roundCap,
    round: 1,
    turn: 0,
    order: [],
    boardId: board.id,
    boardName: board.name,
    layout: board.layout ?? 'square',
    cols: board.cols,
    rows: board.rows,
    nodes,
    groups: [],
    districts: board.districts.map((d) => ({ ...d })),
    factor: board.districts.map(() => 1),
    changeSuit: 0,
    vg: { cards: [], owner: [] },
    hist: [],
    log: [],
    over: false,
    winner: -1,
    endReason: '',
    players,
    rng: seed | 0,
    plots: opts.rules === 'standard' ? (opts.plots ?? 'few') : 'none',
    stocks: opts.stocks ?? 'dynamic',
  };
  if (opts.rules === 'standard') choosePlots(G);
  if (opts.rules === 'standard') {
    G.groups = board.districts.map((_, d) => nodes.filter((s) => s.d === d).map((s) => s.id));
  } else {
    G.groups = computeRows(G);
  }
  G.groups.forEach((grp, g) => grp.forEach((id) => (nodes[id].g = g)));
  G.order = shuffle(
    G,
    players.map((p) => p.id),
  );
  resetVentureGrid(G);
  G.market = newMarket(G);
  G.market.offset = shareOffsets(G);
  G.hist.push(players.map((p) => netWorth(G, p)));
  return G;
}

/** Pick the configured number of vacant plots independently in each district, using the game RNG. */
function choosePlots(G: GameState) {
  const setting = G.plots ?? 'few';
  const count = K.plotsPerDistrict[setting];
  if (!count) return;
  for (let d = 0; d < G.districts.length; d++) {
    const properties = G.nodes.filter((s) => s.t === 'shop' && s.d === d);
    const chosen = shuffle(G, properties).slice(0, setting === 'all' ? properties.length : count);
    for (const sq of chosen) {
      sq.t = 'plot';
      sq.value = 0;
    }
  }
}

export function resetVentureGrid(G: GameState) {
  const deck = buildDeck(G.rules);
  const cards: string[] = [];
  // Every card appears at least twice, the rest are random picks from the deck.
  while (cards.length < 64) {
    const batch = shuffle(G, deck.slice());
    cards.push(...batch.slice(0, 64 - cards.length));
  }
  G.vg = { cards: shuffle(G, cards), owner: new Array(64).fill(-1) };
}

/** Deep copy, used for saves and snapshots. The state is plain JSON. */
export function cloneState(G: GameState): GameState {
  return JSON.parse(JSON.stringify(G));
}

/** A fresh stock market: each district's volatility rolled with the game's random numbers. */
export function newMarket(G: GameState): Market {
  const n = G.districts.length;
  return {
    vol: G.districts.map(() => +(K.volMin + rand(G) * (K.volMax - K.volMin)).toFixed(3)),
    cut: new Array(n).fill(0),
    sold: new Array(n).fill(0),
    turnCut: new Array(n).fill(0),
  };
}
