/**
 * The game's data types. `GameState` is the whole match as one plain, serializable object
 * (saved to localStorage and copied between devices online), so it holds no classes, Maps or
 * functions. Fields added later are optional so old saves keep loading.
 */
export type RuleSet = 'standard' | 'easy';

export type SuitType = 'spade' | 'heart' | 'diamond' | 'club';
export const SUITS: SuitType[] = ['spade', 'heart', 'diamond', 'club'];

export type SquareType =
  | 'shop'
  | 'plot'
  | 'bank'
  | 'venture'
  | SuitType
  | 'change'
  | 'roll'
  | 'break'
  | 'boon'
  | 'boom'
  | 'broker'
  | 'portal'
  | 'arcade'
  | 'cannon'
  /** Price Up: the lander's fees are K.hike times higher until their next turn. */
  | 'hike'
  /** Taxi: ride to any special square and use it. */
  | 'taxi'
  /** Swap: trade places with any other player. */
  | 'swap'
  /** Landing here moves the player to the square in `link` (detached areas). */
  | 'warp';

/** How many properties start as vacant plots (Standard rules), chosen at game setup. */
export type PlotSetting = 'none' | 'few' | 'some' | 'lot' | 'all';
/**
 * How share prices work: 'classic' (every trade of 10+ shares moves the price 10%) or
 * 'dynamic' (prices follow total shares held, with volatility and sell-off confidence).
 */
export type StockSystem = 'classic' | 'dynamic';

/** 'home' is retired (replaced by the motel): it is only found in older saves. */
export type BuildingKey = 'checkpoint' | 'circus' | 'balloon' | 'tax' | 'home' | 'motel' | 'agency' | 'star3';

export interface Square {
  id: number;
  x: number;
  y: number;
  t: SquareType;
  /** Neighbor square ids (graph edges). */
  nb: number[];
  /** Neighbors players can't step to from here: the wrong way down a one-way road. */
  noGo?: number[];
  /** Portal links leaving this square: the neighbor `to`, reached through this tile's `side`. */
  portals?: { to: number; side: number }[];
  /** District index 0-6 for shops and plots, else -1. */
  d: number;
  /** Group index used for expansion and domination, else -1. */
  g: number;
  base: number;
  /** Current value. Plots: money spent on the current building (0 when vacant). */
  value: number;
  owner: number;
  /** Plots only: building, circus tier and checkpoint toll. */
  b: BuildingKey | null;
  lv: number;
  toll: number;
  /** Warp squares: where landing here takes you (-1 otherwise; missing in older saves). */
  link?: number;
  /** Transport color/pair slot (0–4). */
  channel?: number;
  /** Portals can lead directly to the bank instead of their matching portal. */
  toBank?: boolean;
}

/** Which character a player plays as: an id from the client's character list (e.g. "farmer"). */
export type CharId = string;

export interface Stats {
  feesEarned: number;
  feesPaid: number;
  salary: number;
  dividends: number;
  commission: number;
}

export interface Player {
  id: number;
  slot: number;
  name: string;
  ch: CharId;
  /** Index into PLAYER_COLORS. */
  color: number;
  cpu: boolean;
  cash: number;
  level: number;
  suits: [boolean, boolean, boolean, boolean];
  wild: number;
  shares: number[];
  node: number;
  /** Square the player came from; -1 = may move in any direction. */
  prev: number;
  onBreak: boolean;
  closed: boolean;
  boon: number;
  boost: number;
  bankrupt: boolean;
  stats: Stats;
}

export type LogKind =
  'move' | 'money' | 'property' | 'card' | 'suit' | 'stock' | 'arcade' | 'effect' | 'alert';

export interface LogLine {
  text: string;
  /** The player the line is about (their color), if any. */
  color?: number;
  /** Turn the line belongs to: the round and the index into `order` of the player taking it. */
  round?: number;
  turn?: number;
  kind?: LogKind;
  /** Other players affected by this action. */
  involves?: number[];
}

export interface Market {
  /** How strongly shares move each district's price (K.volMin..K.volMax). */
  vol: number[];
  /** How much sell-offs have cut each district's price (confidence = 1 - cut), 0..1 - K.confMin. */
  cut: number[];
  /** Shares of each district sold this turn, and the dent that has caused this turn. */
  sold: number[];
  turnCut: number[];
  /** Games saved before the sell-off rework: whole 5% dents (read once into `cut`). */
  dents?: number[];
}

export interface District {
  name: string;
  color: string;
  /** Omit to use the default average based on walking distance from the bank. */
  startingValue?: number;
}

export interface GameState {
  version: 1;
  rules: RuleSet;
  /** The vacant plot setting the game started with (older saves: undefined, treated as 'few'). */
  plots?: PlotSetting;
  target: number;
  roundCap: number;
  round: number;
  turn: number;
  order: number[];
  boardId: string;
  /** Board name and grid size (older saves predate these: Town, 12 x 7). */
  boardName?: string;
  layout?: BoardLayout;
  cols?: number;
  rows?: number;
  nodes: Square[];
  groups: number[][];
  districts: District[];
  factor: number[];
  /** Which stock rules this game uses (older saves predate the choice: classic). */
  stocks?: StockSystem;
  /** Dynamic stocks' state per district (see market() in rules). */
  market?: Market;
  changeSuit: number;
  vg: { cards: string[]; owner: number[] };
  /** Arcade games (by index) played since every game was last played (older saves: none). */
  arcadePlayed?: number[];
  /** Net worth of every player at the start of each round (and at the end of the match). */
  hist: number[][];
  log: LogLine[];
  over: boolean;
  winner: number;
  endReason: string;
  players: Player[];
  /** Seeded RNG state; all randomness flows through it. */
  rng: number;
}

export interface SeatConfig {
  name: string;
  cpu: boolean;
  ch: CharId;
}

export interface MatchOptions {
  rules: RuleSet;
  target: number;
  roundCap: number;
  seats: SeatConfig[];
  seed?: number;
  boardId?: string;
  /** A custom board to play on; overrides `boardId`. */
  board?: BoardDef;
  /** Standard rules: how many properties start as vacant plots (default 'few'). */
  plots?: PlotSetting;
  /** Standard rules: the stock system (default 'dynamic'). */
  stocks?: StockSystem;
}

export interface BoardSquareDef {
  x: number;
  y: number;
  t: SquareType;
  /** District index for shops and plots. */
  d?: number;
  /** Legacy per-property price in older board files; new games use district averages. */
  base?: number;
  /** Legacy Auto flag, retained when importing older board files. */
  autoBase?: boolean;
  /** Legacy board hint; new games pick vacant plots randomly from the game setting. */
  plot?: boolean;
  /** Warp squares: the index of the square landing here takes you to. */
  link?: number;
  /** Transport color/pair slot (0–4). */
  channel?: number;
  /** Portals can lead directly to the bank instead of their matching portal. */
  toBank?: boolean;
}

/**
 * How cells sit on the grid. `square`: a plain grid, 4 neighbors per cell. `hex`: pointy-top
 * hexagons in offset rows (every odd row shifted half a cell right), 6 neighbors per cell.
 */
export type BoardLayout = 'square' | 'hex';

/**
 * A portal link between squares `a` and `b`: players leave `a` through its side `sa` and come
 * out of `b`'s side `sb` (and back the same way), as if the tiles were neighbors. A side is an
 * index into `neighborCells` (square: right, left, down, up; hex: right, left, up-left, up-right,
 * down-left, down-right) and must face an empty cell.
 */
export interface PortalLink {
  a: number;
  b: number;
  sa: number;
  sb: number;
}
/** A board as data: squares on a grid, districts and the connections between squares. */
export interface BoardDef {
  id: string;
  name: string;
  author?: string;
  /** Grid shape; boards without one are square. */
  layout?: BoardLayout;
  cols: number;
  rows: number;
  districts: District[];
  squares: BoardSquareDef[];
  /** Pairs of indices into `squares` that are connected. */
  edges: [number, number][];
  /**
   * One-way links: [from, to] pairs (each a road in `edges` or a portal link) players may only
   * take from -> to.
   */
  oneWay?: [number, number][];
  /** Portal links: a side of one tile opening onto a side of a tile elsewhere on the board. */
  portalLinks?: PortalLink[];
  /** Index of the bank square (start position). */
  bank: number;
}
