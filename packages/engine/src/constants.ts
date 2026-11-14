/**
 * Balance constants. Every tunable number in the game lives here so playtests can
 * tune match length and economy without touching rules code.
 */
export const K = {
  startCash: 2000,
  /** Each player contributes this much to an unowned jackpot when passing it. */
  jackpotPass: 10,
  defaultTarget: 10000,
  /** The target net worth is picked in steps of targetStep, up to targetMax. */
  targetStep: 1000,
  targetMax: 90000,
  /** The die has faces 1 to dieSides. */
  dieSides: 7,
  /** Random vacant plots per four-property district at game creation (Standard rules). */
  plotsPerDistrict: { none: 0, few: 1, some: 2, lot: 3, all: 4 },
  /** Most copies of each vacant-plot building, unless the plot setting is 'all'. */
  buildingLimit: 3,
  roundCapOptions: [0, 15, 20, 30],

  // Shops
  /** District starting averages: distance-based defaults, picker limits and nearest/farthest spread. */
  districtProperty: {
    defaultMin: 100,
    defaultMax: 500,
    step: 10,
    minAverage: 80,
    maxAverage: 1970,
    spread: 30,
  },
  /** A shop's basic fee: this share of its value (before the ownership multipliers). */
  feeRate: 0.18,
  /** Fee multiplier by squares owned in the group (index = count, capped at 4). */
  mult: [0, 1, 1.2, 1.45, 1.7],
  /** Owning the whole district: fees x domFee on top of mult (x2.21 in all), max value x domMax. */
  domFee: 1.3,
  domMax: 1.5,
  /** Each further property in a district grows your shops there by this much of base; domination by expandDom. */
  expand: 0.075,
  expandDom: 0.2,
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
   * Dynamic stocks. Shop growth (value above the shops' base) counts at growthRate instead of
   * stockRate: a 50% rise in average shop value adds 25% to the underlying share price.
   */
  growthRate: 0.02,
  /**
   * Dynamic stocks' demand: the price rises in a straight line with the total shares all players
   * hold in a district: boost = 1 + shareSlope x held x volatility. At volatility 1 (the calmest),
   * every 100 shares add 8.5% of the price (+0.85 for a 10G stock); at the wildest (volMax), 16%. No cap.
   */
  shareSlope: 0.00085,
  /**
   * Dynamic stocks' starting prices: the cheapest district's shares start at shareStartMin, the
   * most expensive at shareStartMax, the rest in between by their shops' average value. A whole
   * number of gold taken off each district's price for the whole game does this (Market.offset).
   */
  shareStartMin: 4,
  shareStartMax: 11,
  /** Dynamic stocks: no share price ever goes below this. */
  sharePriceMin: 3,
  /**
   * Each district's volatility, rolled evenly at game start: how strongly shares move its price.
   * The lowest third of the range shows as Calm, the middle as Normal, the top as Wild.
   */
  volMin: 1,
  /** 16% / 8.5%: the wildest district's 100 shares add 16%. */
  volMax: 1.882,
  /**
   * Sell-offs: selling sellOff+ shares of one district in a turn (by anyone) dents its price by
   * `dent`; each further sellOff shares add dentDecay x the previous step, scaled smoothly
   * (75: -12%, 150: -21.6%, 300: -35.4%, capped at -50%). Dents stack across turns
   * down to confMin at most. The seller is paid before the dent lands.
   */
  sellOff: 75,
  dent: 0.12,
  dentDecay: 0.8,
  confMin: 0.5,
  /** Each share bought back (by anyone, over any rounds) repairs this much of a dent... */
  repairPerShare: 0.001,
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
  /** Price Up squares: the lander's fees are multiplied by this until their next turn. */
  hike: 1.1,

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
  /** Motel: base lodging fee for a normal rival landing or an optional check-in. */
  motelFee: 100,
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
  // Lucky Reels: rerolls after the first roll, and the prize per set (x level) in REEL_PRIZES order:
  // no set, pair, two pairs, three matching, five different, full house, four matching, five matching.
  reels: { rerolls: 2, prizes: [0, 10, 15, 30, 50, 50, 80, 200] },
  memory: { gold: 60, small: 20, shopsUp: 0.1, shopsDown: 0.05 },
  // Coin Derby: a race down a track of spaces over a few legs. Each leg every racer either sprints
  // (moves further) or grabs coins (moves less, earns coins). Furthest after the last leg wins.
  derby: {
    legs: 3,
    track: 15,
    sprint: [3, 5],
    grab: [1, 3],
    grabCoins: 30,
    winner: 100,
  },
  wheel: { maxBet: 100, step: 10, spaces: 12 },
  treasure: { rounds: 2, chests: [60, 100, 150] },

  // CPU
  cpu: {
    buyKeep: 150,
    star3Chance: 0.5,
    star3Keep: 500,
    buildKeep: 150,
    buildWeights: { tax: 3, checkpoint: 2, circus: 2, motel: 2, agency: 1, balloon: 1 } as Record<
      string,
      number
    >,
    investChance: 0.8,
    investAbove: 900,
    investFloor: 600,
    /** Check in only with meaningful carryover and enough cash left after lodging. */
    motelMinCarry: 2,
    motelCashReserve: 600,
    investShare: 0.6,
    buyoutKeep: 600,
    stockAbove: 900,
    stockFloor: 650,
    stockShare: 0.55,
    stockMin: 10,
    /** Stock picks: how much of rivals' room to invest a CPU expects them to fill... */
    stockRivalInvest: 0.6,
    /** ...fee visits it counts on for dividends, and how much a dent or volatility adds. */
    stockDividendVisits: 3,
    stockDentBonus: 0.5,
    stockVolBonus: 0.05,
    /**
     * Stock dumps: before rolling, a CPU sells all its shares of a district (at least
     * K.sellOff) to crash it when a rival is this close to the goal and holds at least
     * dumpRivalValue of stock there.
     */
    dumpNear: 0.85,
    dumpRivalValue: 500,
    circusKeep: 500,
    agencyKeep: 300,
    tradeGroupBonus: 0.35,
    tradeAccept: 1.15,
    tradeAcceptPlus: 20,
    bidMax: 1.25,
    bidMaxGroup: 1.6,
    bidKeep: 200,
    // The levelled CPUs (cpu.ts CPU_SKILL); tuned with scripts/tournament.ts.
    /** Rival landings a square still gets over a whole game (scaled down as the game goes on). */
    visits: 6,
    /** The cushion a CPU sized to danger keeps: this share of the biggest fee within one roll. */
    dangerShare: 0.8,
    /** Keeping a rival from dominating a group: worth this many times the shop's value. */
    blockValue: 1.5,
    /** ...and in a trade, this share of what the shop would earn the rival. */
    blockTrade: 1,
    /** Stock picks for sharp CPUs: per shop it owns in the district, for a holding it keeps
     * adding to, and against a district where the leader holds more than it does. */
    stockSmartDividends: 3,
    stockOwnBonus: 0.04,
    stockHoldBonus: 0.08,
    stockLeaderPenalty: 0.05,
    /** Trades: what a CPU offers for a shop (x what the owner loses), the least it must gain,
     * and how close an offer must be before it sends back a counter-offer. */
    tradeOfferPay: 1.25,
    tradeMinGain: 60,
    tradeCounterNear: 0.75,
    /** Auction bids: how much of a shop's future earnings a sharp CPU will pay. */
    bidEarnings: 0.6,
    /** A buyout must earn this many times the net worth it costs. */
    buyoutMargin: 1.2,
    /** Paths: share of salary lost per square to the next goal, gained per new suit; how much
     * worse a fee it can't pay is; share of spare cash a stop at its own shop is worth; and a
     * venture card or arcade stop. */
    pathGoalStep: 0.03,
    pathSuit: 0.25,
    pathDebtPain: 0.5,
    pathInvest: 0.05,
    pathVenture: 40,
    /** Buying: how much of a shop's earnings a sharp CPU lets eat into its cushion. */
    buyEager: 0.5,
    /** The smallest investment worth making. */
    investMin: 50,
  },
} as const;
