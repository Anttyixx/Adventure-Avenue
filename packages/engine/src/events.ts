/**
 * Events the engine emits as the state changes. Clients animate them; the online server
 * would broadcast them. The state has already been updated when an event arrives.
 */
import type { MemoryPrize, ReelSymbol, TradeOffer } from './decisions';

export type GameEvent =
  | { type: 'turnStart'; pid: number; round: number }
  | { type: 'roundStart'; round: number }
  | { type: 'roll'; pid: number; value: number }
  | { type: 'step'; pid: number; from: number; to: number; left: number }
  | { type: 'warp'; pid: number; to: number }
  | { type: 'land'; pid: number; sq: number }
  | { type: 'money'; from: number; to: number; amount: number; reason: string }
  | { type: 'owner'; sq: number; owner: number }
  | { type: 'value'; sqs: number[] }
  | { type: 'suit'; pid: number; suit: number }
  | { type: 'promote'; pid: number; level: number; salary: number }
  | { type: 'venture'; pid: number; panel: number; card: string; title: string; text: string; line: number }
  | { type: 'reels'; pid: number; result: ReelSymbol[]; prize: string }
  | { type: 'memory'; pid: number; prizes: MemoryPrize[]; picked: number; prize: string }
  | {
      type: 'derby';
      backers: number[];
      frames: number[][];
      coins: number[];
      winner: number;
    }
  | { type: 'auctionEnd'; sq: number; winner: number; price: number }
  | { type: 'trade'; offer: TradeOffer; accepted: boolean }
  | { type: 'bankrupt'; pid: number }
  | { type: 'gameOver'; winner: number; reason: string }
  | { type: 'log'; text: string; color?: number }
  | { type: 'notice'; text: string; pid?: number };
