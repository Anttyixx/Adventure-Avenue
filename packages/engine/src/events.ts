/**
 * Events the engine emits as the state changes. Clients animate them; the online server
 * would broadcast them. The state has already been updated when an event arrives.
 */
import type { MemoryPrize, ReelSymbol, TradeOffer } from './decisions';
import type { LogLine } from './types';

/** What carries a player on a warp event (see `GameEvent` 'warp'). */
export type TravelKind =
  'warp' | 'portal' | 'cannon' | 'taxi' | 'balloon' | 'swap' | 'swapBack' | 'card' | 'home';

export type GameEvent =
  | { type: 'turnStart'; pid: number; round: number }
  | { type: 'roundStart'; round: number }
  | { type: 'roll'; pid: number; value: number; bonus?: number }
  | { type: 'step'; pid: number; from: number; to: number; left: number }
  /**
   * A jump straight to a square (no walking). `from`: the square left; `how`: what carried the
   * player, so the client can show each ride its own way (display only: it changes nothing);
   * `other`: for a swap, the player trading places (their own warp follows as 'swapBack').
   */
  | { type: 'warp'; pid: number; to: number; from?: number; how?: TravelKind; other?: number }
  | { type: 'land'; pid: number; sq: number }
  /** `sq`: the square the money goes into (an investment), when it is not a player or the bank. */
  | { type: 'money'; from: number; to: number; amount: number; reason: string; sq?: number }
  | { type: 'owner'; sq: number; owner: number }
  | { type: 'value'; sqs: number[] }
  | { type: 'suit'; pid: number; suit: number; passing?: boolean }
  | { type: 'promote'; pid: number; level: number; salary: number }
  | {
      type: 'venture';
      pid: number;
      panel: number;
      card: string;
      title: string;
      text: string;
      /** Longest line through the panel. */
      line: number;
      /** Bonus lines (4+ panels) through the panel, as panel indexes. */
      lines: number[][];
      bonus: number;
    }
  /** Lucky Reels' final set; `rolled` marks the slots rerolled since the last choice. */
  | { type: 'reels'; pid: number; result: ReelSymbol[]; rolled: boolean[]; prize: string }
  | { type: 'memory'; pid: number; prizes: MemoryPrize[]; picked: number; prize: string }
  | {
      type: 'arcadeRound';
      title: string;
      detail: string;
      game: 'Coin Derby' | 'Lucky Wheel' | 'Treasure Split';
      /**
       * One row per player: `choice` is the option they picked (-1: skipped a bet), `score` and
       * `previous` are Coin Derby spaces after and before this leg, `amount` the coins won.
       */
      rows: {
        pid: number;
        text: string;
        amount?: number;
        score?: number;
        previous?: number;
        choice?: number;
        /** Treasure Split: coins found so far (handed out after the last round). */
        total?: number;
      }[];
      wheel?: number;
      final: boolean;
    }
  | {
      type: 'auctionStart';
      sq: number;
      /** -1 = the bank (debt sale). */
      seller: number;
      opening: number;
      step: number;
      bidders: number[];
    }
  | { type: 'auctionEnd'; sq: number; winner: number; price: number }
  | { type: 'trade'; offer: TradeOffer; accepted: boolean }
  /** These players' shops just closed until their next turn. */
  | { type: 'closed'; pids: number[] }
  /** These players' shops reopen (at the start of their turn). */
  | { type: 'opened'; pids: number[] }
  | { type: 'bankrupt'; pid: number }
  | { type: 'gameOver'; winner: number; reason: string }
  | ({ type: 'log' } & LogLine)
  | { type: 'notice'; text: string; pid?: number };
