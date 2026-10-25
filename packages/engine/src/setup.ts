import { K } from './constants';
import { BOARDS } from './boards/builtin';
import { buildDeck } from './cards';
import { shuffle } from './rng';
import { computeRows, netWorth } from './rules';
import type { GameState, MatchOptions, Player, Square } from './types';

export const PLAYER_COLORS = ['#e5484d', '#3e7bfa', '#30a46c', '#f0b429'];
export const PLAYER_COLOR_NAMES = ['red', 'blue', 'green', 'gold'];

export function newGame(opts: MatchOptions): GameState {
  const board = opts.board ?? BOARDS[opts.boardId ?? 'town'];
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const nodes: Square[] = board.squares.map((s, id) => {
    const isPlot = !!s.plot && opts.rules === 'standard';
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
  };
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
