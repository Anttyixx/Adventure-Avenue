import { K } from './constants';
import { BOARDS } from './boards/builtin';
import { buildDeck } from './cards';
import { shuffle } from './rng';
import { computeRows, netWorth } from './rules';
import type { BoardSquareDef, GameState, MatchOptions, Player, Square } from './types';

export const PLAYER_COLORS = ['#e5484d', '#3e7bfa', '#30a46c', '#a855f7', '#f76b15'];

/** Players per match (humans and CPUs). */
export const MAX_PLAYERS = PLAYER_COLORS.length;
export const PLAYER_COLOR_NAMES = ['red', 'blue', 'green', 'purple', 'orange'];

export function newGame(opts: MatchOptions): GameState {
  const board = opts.board ?? BOARDS[opts.boardId ?? 'town'];
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const nodes: Square[] = board.squares.map((s, id) => {
    const isPlot = false;
    return {
      id,
      x: s.x,
      y: s.y,
      t: isPlot ? 'plot' : s.t,
      nb: [],
      d: s.d ?? -1,
      g: -1,
      base: s.base ?? 0,
      value: isPlot ? 0 : (s.base ?? 0),
      owner: -1,
      b: null,
      lv: 0,
      toll: K.toll0,
      link: s.t === 'warp' ? (s.link ?? -1) : -1,
    };
  });
  for (const [a, b] of board.edges) {
    nodes[a].nb.push(b);
    nodes[b].nb.push(a);
  }
  const players: Player[] = opts.seats.map((seat, i) => ({
    id: i,
    slot: i,
    name: seat.name,
    ch: seat.ch,
    color: i,
    cpu: seat.cpu,
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
  };
  if (opts.rules === 'standard') choosePlots(G, board.squares);
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
  G.hist.push(players.map((p) => netWorth(G, p)));
  return G;
}

/**
 * Turn some properties into vacant plots, as many as the game's plot setting asks for (at most
 * K.plotMax unless 'all'). Squares the board marks as plots go first; the rest are random,
 * spread evenly over the districts, and no district is left without a shop unless 'all'.
 */
function choosePlots(G: GameState, defs: BoardSquareDef[]) {
  const setting = G.plots ?? 'few';
  const props = G.nodes.filter((s) => s.t === 'shop');
  const want =
    setting === 'all' ? props.length : Math.min(K.plotMax, Math.round(props.length * K.plotShare[setting]));
  if (!want) return;
  const order = shuffle(G, props.slice()).sort(
    (a, b) => Number(!!defs[b.id].plot) - Number(!!defs[a.id].plot),
  );
  const perDistrict = new Map<number, number>();
  const size = (d: number) => props.filter((s) => s.d === d).length;
  const chosen: Square[] = [];
  while (chosen.length < want) {
    // The district with the fewest plots so far, taking marked and earlier-shuffled squares first.
    const next = order
      .filter((s) => !chosen.includes(s))
      .filter((s) => setting === 'all' || (perDistrict.get(s.d) ?? 0) < size(s.d) - 1)
      .sort((a, b) => (perDistrict.get(a.d) ?? 0) - (perDistrict.get(b.d) ?? 0))[0];
    if (!next) break;
    chosen.push(next);
    perDistrict.set(next.d, (perDistrict.get(next.d) ?? 0) + 1);
  }
  for (const s of chosen) {
    s.t = 'plot';
    s.value = 0;
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
