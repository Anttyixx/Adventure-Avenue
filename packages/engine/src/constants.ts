/**
 * Balance constants. Every tunable number in the game lives here so playtests can
 * tune match length and economy without touching rules code.
 */
export const K = {
  startCash: 2000,
  defaultTarget: 10000,
  /** The target net worth is picked in steps of targetStep, up to targetMax. */
  targetStep: 1000,
  targetMax: 90000,
  /** The die has faces 1 to dieSides. */
  dieSides: 7,
  /** Share of properties that start as vacant plots for each plot setting (Standard rules). */
  plotShare: { none: 0, few: 0.15, some: 0.3, lot: 0.5, all: 1 },
  /** Most vacant plots on a board, and of each building, unless the setting is 'all'. */
  plotMax: 21,
  buildingLimit: 3,
  roundCapOptions: [0, 15, 20, 30],

  // Shops
  feeRate: 0.2,
  /** Fee multiplier by squares owned in the group (index = count, capped at 4). */
  mult: [0, 1, 1.3, 1.6, 2.0],
  domFee: 1.4,
  domMax: 1.5,
  expand: 0.1,
  expandDom: 0.3,
  investCap: 999,
  buyoutX: 5,
  buyoutOwnerX: 3,
  boostRate: 1.3,

  // Promotion
  salaryBase: 600,
  salaryLevel: 250,
  salaryShop: 0.15,

  // Stocks
  stockRate: 0.04,
  divDivisor: 250,
  /** Classic stocks: a trade of bigTrade+ shares multiplies the price by tradeUp / tradeDown. */
  bigTrade: 10,
  tradeUp: 1.1,
  tradeDown: 0.9,
  /**
   * Dynamic stocks. Demand: the price rises in a straight line with the total shares all players
   * hold in a district: boost = 1 + shareSlope x held x volatility. At volatility 1 (the calmest),
   * every 100 shares add 15% of the base price (+1.5 for a 10G stock); at 2, +3 per 100. No cap.
   */
  shareSlope: 0.0015,
  /**
   * Each district's volatility, rolled evenly at game start: how strongly shares move its price.
   * The lowest third of the range shows as Calm, the middle as Normal, the top as Wild.
   */
  volMin: 1,
  volMax: 2,
  /** Sell-offs: selling this many shares of a district in one turn dents its confidence... */
  sellOff: 50,
  /** ...by this much (once per district per turn), down to confMin at most. */
  dent: 0.05,
  confMin: 0.75,
  /** Each dent is repaired by this many shares bought back (by anyone, over any rounds)... */
  dentRepair: 50,
  /** ...and investing in a shop there counts as this many shares per 1G. */
  investRepair: 0.1,
  /** The Bull and Bear market cards' multiplier range. */
  factorMin: 0.4,
  factorMax: 4,
  maxBuy: 99,
  /** Counter-offers allowed in one trade (each side may send back different terms). */
  tradeCounters: 3,

  // Debt
  debtSale: 0.75,

  // Commission squares
  boon: 0.2,
  boom: 0.5,

  // Vacant plots
  plotCost: 200,
  star3Cost: 1000,
  renovate: 150,
  toll0: 20,
  tollStep: 10,
  circus: [100, 500, 1000, 2000],
  circusUp: [300, 600, 1200],
  balloonFee: 150,
  homeFee: 60,
  taxRate: 0.1,
  taxOwner: 0.05,

  // Venture grid
  lineBonusPer: 10,
  lineBonusMin: 4,
  lineBonusFull: 200,

  // Auctions
  auctionStep: 0.1,
  auctionStepMin: 10,

  // Turn flow
  rollChainMax: 3,

  // Arcade prizes (L = player level)
  reels: { sevens: 300, coins: 100, pair: 20, stockShares: 10, stockEasyCash: 150 },
  memory: { gold: 60, small: 20, shopsUp: 0.1, shopsDown: 0.05 },
  derby: { perCoin: 10, winner: 100 },

  // CPU
  cpu: {
    buyKeep: 150,
    star3Chance: 0.5,
    star3Keep: 500,
    buildKeep: 150,
    buildWeights: { tax: 3, checkpoint: 2, circus: 2, home: 1, agency: 1, balloon: 1 } as Record<
      string,
      number
    >,
    investChance: 0.8,
    investAbove: 900,
    investFloor: 600,
    investShare: 0.6,
    buyoutKeep: 600,
    stockAbove: 900,
    stockFloor: 650,
    stockShare: 0.55,
    stockMin: 10,
    circusKeep: 500,
    agencyKeep: 300,
    tradeGroupBonus: 0.35,
    tradeAccept: 1.15,
    tradeAcceptPlus: 20,
    bidMax: 1.25,
    bidMaxGroup: 1.6,
    bidKeep: 200,
  },
} as const;
