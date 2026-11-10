/**
 * Pacing of a turn, in milliseconds. Tune these to make turns easier to follow or quicker.
 * Most things that happen get about a second to themselves so players can take them in.
 * The Fast CPU toggle multiplies everything by FAST_CPU_SPEED during CPU turns.
 */
export const TIMING = {
  /** Walking one square. */
  step: 420,
  /** Pull into a portal, disappear briefly, then launch onto the destination tile. */
  portalStep: 720,
  /** Pause after a destination is chosen, before the token starts walking. */
  afterChoice: 500,
  /** Flying to a square (warps, cannon, balloon, portal). */
  warp: 750,
  /** Die tumbling, then how long the result stays before moving. */
  dieRoll: 900,
  dieHold: 1000,
  /** The die shrinking beside the player after a roll, before they start walking. */
  dieShrink: 420,
  /** Pause after landing so players see where the token stopped. */
  land: 1000,
  /** Everyone gets reading time before the bar can return to low-priority activity. */
  actionResult: 1000,
  /** Shorter reading slots when several events arrive together; UI time is never CPU-scaled. */
  actionBurst: 800,
  /** Quiet buffer before returning to movement/waiting text. */
  actionIdleGrace: 1200,
  actionQueueLimit: 6,
  /** The end of a turn, before the next player's turn starts. */
  turnEnd: 1000,
  /** Extra time for a smooth camera handoff between players. */
  turnPanExtra: 1000,
  /** Camera glide: the previous ~0.6 seconds plus one extra second. */
  turnCamera: 1600,

  /** Start of a turn: banner time, and the pause before CPU / human turns continue. */
  turnBanner: 1300,
  turnStartCpu: 1200,
  turnStartHuman: 700,
  roundBanner: 1400,

  /** A beat after deciding to buy, before the coins fly to the bank. */
  beforePay: 500,
  /** Money moving, a square changing owner or value, a suit picked up. */
  money: 1000,
  owner: 1100,
  value: 1000,
  suit: 0,
  promote: 1800,
  /** A district's stock rising: the zoom to its squares (and back), then the banner and arrows. */
  stockZoom: 600,
  /** Tapping a portal: how long the camera shows it and where it leads before going back. */
  portalShow: 2000,
  stockRise: 1700,
  promoteBanner: 2200,
  bankrupt: 1600,
  bankruptBanner: 2400,
  /** Shops closing: the zoom out to the whole board (and back), each shutter, the gap between
   * shutters, and how long the closed board stays before zooming back. */
  closeZoom: 900,
  closeShutter: 450,
  closeStagger: 70,
  closeHold: 1000,
  /** Collapsed player cards: the old front card dropping down and rising in at the back. */
  cardCycle: 750,
  /** Player cards gathering into a stack (collapse) or fanning back out (expand). */
  cardStack: 504,
  /** The wait between one card and the next as they gather or fan out (a ripple). */
  cardStackStagger: 26,
  /** Banners (the round chip, whose turn it is) gliding up when the one above them leaves. */
  bannerShift: 360,
  /** A stack tapped open into a list: how long it stays open. */
  stackOpen: 3000,
  /** Smart stack: how long a card that changed stays out of the stack after its last change. */
  cardPop: 2800,
  /** The winner dancing under confetti before the results. */
  victory: 6500,
  gameOver: 900,

  /** CPU "thinking" beats: showing the route it picked, before rolling, before other choices. */
  cpuPath: 1100,
  cpuPreRoll: 800,
  cpuDecision: 1100,

  /** Venture card flip, and how long CPU results stay on screen before closing. */
  ventureFlip: 450,
  /** Between tiles of a bonus line flipping over one after another. */
  ventureLineStep: 140,
  /** How long the card stays up for the player who drew it before the board closes by itself. */
  ventureResult: 10000,
  cpuResult: 2300,
  memoryReveal: 600,
  arcadeRoll: 350,
  arcadeWheel: 2800,
  arcadeRace: 1800,
  arcadeResult: 3500,

  /** A live auction ends this long after the last bid (or after it opens, with no bids). */
  auctionWindow: 5000,
  /** How long a CPU waits before bidding or passing in a live auction (a random time between). */
  auctionCpuMin: 700,
  auctionCpuMax: 2000,
} as const;

export const FAST_CPU_SPEED = 0.3;
