/**
 * Pacing of a turn, in milliseconds. Tune these to make turns easier to follow or quicker.
 * The Fast CPU toggle multiplies everything by FAST_CPU_SPEED during CPU turns.
 */
export const TIMING = {
  /** Walking one square. */
  step: 380,
  /** Pause after a destination is chosen, before the token starts walking. */
  afterChoice: 250,
  /** Flying to a square (warps, cannon, balloon, backstreet). */
  warp: 750,
  /** Die tumbling, then how long the result stays before moving. */
  dieRoll: 900,
  dieHold: 650,
  /** Pause after landing so players see where the token stopped. */
  land: 350,

  /** Start of a turn: banner time, and the pause before CPU / human turns continue. */
  turnBanner: 1300,
  turnStartCpu: 1000,
  turnStartHuman: 500,
  roundBanner: 1400,

  /** Money moving, a square changing owner or value, a suit picked up. */
  money: 450,
  owner: 550,
  value: 450,
  suit: 500,
  promote: 1400,
  promoteBanner: 2200,
  bankrupt: 1200,
  bankruptBanner: 2400,
  gameOver: 900,

  /** CPU "thinking" beats: showing the route it picked, before rolling, before other choices. */
  cpuPath: 1100,
  cpuPreRoll: 600,
  cpuDecision: 700,

  /** Venture card flip, and how long CPU results stay on screen before closing. */
  ventureFlip: 450,
  cpuResult: 2300,
  memoryReveal: 600,
} as const;

export const FAST_CPU_SPEED = 0.3;
