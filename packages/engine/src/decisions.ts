/**
 * Decision requests the engine raises and the answers it expects. The host (hot-seat client,
 * server or CPU) answers each one; the engine validates answers before applying them.
 */
import type { BuildingKey } from './types';

export interface Route {
  node: number;
  path: number[];
}

export type ReelSymbol = 'seven' | 'coin' | 'wild' | 'stock';

export type MemoryPrize = 'shopsUp' | 'gold' | 'wild' | 'shopsDown' | 'small';

export interface TradeOffer {
  from: number;
  to: number;
  give: number[];
  get: number[];
  cashGive: number;
  cashGet: number;
}

export type PreRollAction =
  | { act: 'roll' }
  | { act: 'sellStock'; d: number; n: number }
  | { act: 'trade'; offer: TradeOffer }
  | { act: 'auction'; sq: number }
  | { act: 'renovate'; sq: number; b: BuildingKey };

export interface DebtAsset {
  kind: 'stock' | 'square';
  /** District for stock, square id for squares. */
  id: number;
  amount: number;
}

export type SquarePurpose = 'balloon' | 'zoom' | 'agency' | 'forcedBuyout';
export type DistrictPurpose = 'free20' | 'up20' | 'down20';

/** Map of decision kind -> [request payload, answer]. */
export interface DecisionMap {
  preRoll: [
    { canStock: boolean; canAuction: boolean; canRenovate: boolean; canTrade: boolean },
    PreRollAction,
  ];
  path: [{ dests: Route[]; steps: number }, number];
  buyShop: [{ sq: number; price: number }, boolean];
  build: [
    { sq: number; options: { b: BuildingKey; cost: number }[]; renovate?: boolean },
    BuildingKey | null,
  ];
  invest: [{ shops: { sq: number; room: number }[]; max: number }, { sq: number; amount: number } | null];
  buyout: [{ sq: number; price: number }, boolean];
  circusUpgrade: [{ sq: number; cost: number; tier: number }, boolean];
  buyStock: [{ discount: number; maxSpend: number }, { d: number; n: number } | null];
  sellStock: [{ premium: number }, { d: number; n: number } | null];
  venturePanel: [{ owner: number[] }, number];
  reels: [{ strips: ReelSymbol[][] }, number[]];
  memory: [{ prizes: MemoryPrize[] }, number];
  pickRacer: [{ count: number }, number];
  pickSquare: [{ purpose: SquarePurpose; options: number[]; optional: boolean }, number | null];
  cannonTarget: [{ options: number[] }, number];
  pickDistrict: [{ purpose: DistrictPurpose; options: number[] }, number];
  answerTrade: [{ offer: TradeOffer }, boolean];
  bid: [{ sq: number; bid: number; high: number; highBidder: number; seller: number }, boolean];
  debt: [{ assets: DebtAsset[] }, number];
}

export type DecisionKind = keyof DecisionMap;

export type DecisionRequest<T extends DecisionKind = DecisionKind> = {
  [P in T]: { kind: P; pid: number } & DecisionMap[P][0];
}[T];

export type DecisionAnswer<T extends DecisionKind> = DecisionMap[T][1];
