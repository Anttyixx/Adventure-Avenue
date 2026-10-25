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
  | 'back'
  | 'arcade'
  | 'cannon';

export type BuildingKey = 'checkpoint' | 'circus' | 'balloon' | 'tax' | 'home' | 'agency' | 'star3';

export interface Square {
  id: number;
  x: number;
  y: number;
  t: SquareType;
  /** Neighbor square ids (graph edges). */
  nb: number[];
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
}

export interface CharLook {
  head: number;
  hair: number;
  skin: number;
  accent: number;
}

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
  ch: CharLook;
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

export interface District {
  name: string;
  color: string;
}

export interface GameState {
  version: 1;
  rules: RuleSet;
  target: number;
  roundCap: number;
  round: number;
  turn: number;
  order: number[];
  boardId: string;
  /** Board name and grid size (older saves predate these: Town, 12 x 7). */
  boardName?: string;
  cols?: number;
  rows?: number;
  nodes: Square[];
  groups: number[][];
  districts: District[];
  factor: number[];
  changeSuit: number;
  vg: { cards: string[]; owner: number[] };
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
  ch: CharLook;
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
}

export interface BoardSquareDef {
  x: number;
  y: number;
  t: SquareType;
  /** District index for shops and plots. */
  d?: number;
  base?: number;
  /** Standard rules: this district square starts as a vacant plot. */
  plot?: boolean;
}

/** A board as data: squares on a grid, districts and the connections between squares. */
export interface BoardDef {
  id: string;
  name: string;
  author?: string;
  cols: number;
  rows: number;
  districts: District[];
  squares: BoardSquareDef[];
  /** Pairs of indices into `squares` that are connected. */
  edges: [number, number][];
  /** Index of the bank square (start position). */
  bank: number;
}
