/**
 * Balance constants. Every tunable number in the game lives here so playtests can
 * tune match length and economy without touching rules code.
 */
export const K = {
  startCash: 2000,
  targetOptions: [4000, 5000, 7000, 10000],
  defaultTarget: 5000,
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
  bigTrade: 10,
  tradeUp: 1.1,
  tradeDown: 0.9,
  factorMin: 0.4,
  factorMax: 4,
  maxBuy: 99,

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
    stockAbove: 1100,
    stockFloor: 800,
    stockShare: 0.45,
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
