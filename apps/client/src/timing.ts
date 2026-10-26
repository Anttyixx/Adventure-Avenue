/**
 * Pacing of a turn, in milliseconds. Tune these to make turns easier to follow or quicker.
 * Most things that happen get about a second to themselves so players can take them in.
 * The Fast CPU toggle multiplies everything by FAST_CPU_SPEED during CPU turns.
 */
export const TIMING = {
  /** Walking one square. */
  step: 420,
  /** Pause after a destination is chosen, before the token starts walking. */
  afterChoice: 500,
  /** Flying to a square (warps, cannon, balloon, backstreet). */
  warp: 750,
  /** Die tumbling, then how long the result stays before moving. */
  dieRoll: 900,
  dieHold: 650,
  /** Pause after landing so players see where the token stopped. */
  land: 1000,
  /** The end of a turn, before the next player's turn starts. */
  turnEnd: 1000,

  /** Start of a turn: banner time, and the pause before CPU / human turns continue. */
  turnBanner: 1300,
  turnStartCpu: 1200,
  turnStartHuman: 700,
  roundBanner: 1400,

  /** A beat after deciding to buy, before the coins fly to the bank. */
  beforePay: 1000,
  /** Money moving, a square changing owner or value, a suit picked up. */
  money: 1000,
  owner: 1100,
  value: 1000,
  suit: 1000,
  promote: 1800,
  promoteBanner: 2200,
  bankrupt: 1600,
  bankruptBanner: 2400,
  /** Shops closing: the zoom out to the whole board (and back), each shutter, the gap between
   * shutters, and how long the closed board stays before zooming back. */
  closeZoom: 900,
  closeShutter: 450,
  closeStagger: 160,
  closeHold: 1000,
  gameOver: 900,

  /** CPU "thinking" beats: showing the route it picked, before rolling, before other choices. */
  cpuPath: 1100,
  cpuPreRoll: 800,
  cpuDecision: 1100,

  /** Venture card flip, and how long CPU results stay on screen before closing. */
  ventureFlip: 450,
  cpuResult: 2300,
  memoryReveal: 600,

  /** How long a player has to raise in an auction before it counts as a pass. */
  auctionBid: 12000,
} as const;

export const FAST_CPU_SPEED = 0.3;
