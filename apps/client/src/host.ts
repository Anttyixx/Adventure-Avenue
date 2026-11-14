/**
 * Hot-seat host: runs the rules engine locally and answers its decision requests from the UI
 * (humans) or the CPU rules, and turns engine events into animations.
 */
import {
  Game,
  SUITS,
  isClosed,
  netWorth,
  stockPrice,
  stockValue,
  dominated,
  K,
  PLAYER_COLORS,
  cpuDecide,
  type DecisionAnswer,
  type DecisionKind,
  type DecisionRequest,
  type GameEvent,
  type Player,
  type GameIO,
  type GameState,
} from '@aa/engine';
import { BoardView, ZOOM_STEP } from './board';
import { shortName, squareName } from './names';
import { clearSave, saveGame } from './save';
import { SUIT_CHARS } from './icons';
import { FAST_CPU_SPEED, TIMING as T } from './timing';
import { fmt, h } from './ui/dom';
import { VentureView } from './ui/games';
import { ArcadeStage, type ArcadeGame } from './ui/arcade';
import { Hud, type PromptButton } from './ui/hud';
import { buildPrompt, districtStockModal, stockModal } from './ui/modals';
import { guideModal } from './ui/guide';
import { showResults } from './ui/results';
import { investOnBoard } from './ui/invest';
import { AuctionView, LiveAuction, type AuctionReq } from './ui/auction';
import { confettiRain, fireworks } from './ui/confetti';
import { activity, paymentActivity, paymentLogMatches, PRE_ROLL_STEPS } from './ui/activity';
import {
  answerTradeOnBoard,
  watchTradeOnBoard,
  auctionOnBoard,
  buyoutPrompt,
  buyOnBoard,
  cannonOnBoard,
  motelPrompt,
  debtOnBoard,
  feeIfOwned,
  question,
  renovateOnBoard,
  tradeOnBoard,
  type PickCtx,
} from './ui/pick';
import { openingDelay } from './game-opening';
import { sound, type Sfx, type Track } from './audio';
import { closeSoundPopover } from './ui/soundpanel';
import type { GameLink } from './net/link';
import { inviteURL } from './net/protocol';
import { IS_DEV_BUILD } from './build';

const FAST_KEY = 'adventure-avenue-fast';

/** Each arcade game's own music. */
const GAME_MUSIC: Record<ArcadeGame, Track> = {
  'Lucky Reels': 'reels',
  'Memory Blocks': 'memory',
  'Coin Derby': 'derby',
  'Lucky Wheel': 'wheel',
  'Treasure Split': 'treasure',
};

const never = <T>() => new Promise<T>(() => {});

export class HotSeat implements GameIO {
  game: Game;
  board: BoardView;
  hud: Hud;
  root: HTMLElement;
  dead = false;
  fast = false;
  speed = 1;
  /** Which human currently holds the device (for "Pass the device" prompts). */
  holder = -1;
  /** The roll being moved, with any saved motel spaces added to it (`bonus`). */
  private movementRoll: { pid: number; value: number; bonus?: number } | null = null;
  venture: VentureView | null = null;
  /** The arcade game being played (its board stays up from the first choice to the last result). */
  arcade: ArcadeStage | null = null;
  /** Square values as last shown, to animate how much each one changed. */
  values = new Map<number, number>();
  /** Each square's owner as last shown, so a purchase is claimed on the board as it is paid for. */
  private owners = new Map<number, number>();
  /** Each district's stock price as last shown, to announce rises. */
  private prices: number[] = [];
  /**
   * Each player's stock value as the player cards show it, and the shares it was worked out
   * for. Buying or selling shares counts at what was paid, so net worth doesn't move on the
   * trade itself; a price change counts only once its rise or fall has been shown.
   */
  private stockShown = new Map<number, { value: number; held: number[] }>();
  /** The share purchase or sale being shown (its money event), for `trackStock`. */
  private stockTrade: Extract<GameEvent, { type: 'money' }> | null = null;
  /** Districts each player dominates ("pid:group"), as last shown; null until first checked. */
  private doms: Set<string> | null = null;
  /** The live auction window while an auction runs. */
  auction: AuctionView | null = null;
  /** True while a token is between squares of a walk (passing, not landing). */
  private passing = false;
  /** Checkpoint toll payment and increase share one immediate arrival sequence. */
  private checkpointArrival = false;
  /** Number of decisions made so far (online games number them to stay in step). */
  seq = 0;

  get pick(): PickCtx {
    return { hud: this.hud, board: this.board, G: this.G };
  }

  constructor(
    parent: HTMLElement,
    public G: GameState,
    private onExit: () => void,
    /** Test plays from the board editor do not touch the saved game. */
    private saving = true,
    /** Online games: who answers each decision and how answers travel. */
    public link: GameLink | null = null,
    /** Fresh matches only; saved games and resyncs already have players on the board. */
    private opening = false,
  ) {
    this.root = h('div', { class: `game${opening ? ' game-opening' : ''}` });
    if (opening) {
      this.root.style.setProperty('--opening-board-ms', `${T.openingBoard}ms`);
      this.root.inert = true;
      this.root.setAttribute('aria-busy', 'true');
      sound.music(null);
    }
    parent.append(this.root);
    const boardHost = h('div', { class: 'board-host' });
    this.root.append(boardHost);
    this.board = new BoardView(boardHost);
    this.board.onGate = (opening) => sound.play(opening ? 'shutterUp' : 'shutterDown');
    this.hud = new Hud(this.root, this.board, {
      onToggleFast: () => this.toggleFast(),
      onQuit: () => this.quit(),
      quitQuestion: () => this.quitQuestion(),
      onGuide: () => guideModal(this.hud, this.G),
      onPause: (open) => this.setPaused(open),
    });
    // The cards show net worth with stock moves counted once they have been announced.
    this.hud.worthOf = (p) => this.shownWorth(p);
    // Online, this device's own player's card sits at the bottom of the stack.
    if (link) this.hud.myPid = this.G.players.find((p) => this.localHuman(p.id))?.id ?? -1;
    this.game = new Game(G, this);
    if (link) this.hud.setRoom(link.code, inviteURL(link.code));
    // Dev builds expose the running game for automated tests.
    if (IS_DEV_BUILD) (window as unknown as { __aaGame?: HotSeat }).__aaGame = this;
    this.board.setState(G);
    if (opening) this.board.prepareOpening();
    this.hud.render(G);
    this.fast = readPref(FAST_KEY) === '1';
    this.hud.setFastLabel(this.fast);
    window.addEventListener('keydown', this.onKey);
    this.setupOrientation();
  }

  /** Humans playing on this device. */
  get humans() {
    return this.G.players.filter((p) => !p.bankrupt && this.localHuman(p.id)).length;
  }

  /** True for a human who plays on this device (not a CPU, not someone online). */
  localHuman(pid: number) {
    return !this.G.players[pid].cpu && (!this.link || this.link.who(pid) === 'local');
  }

  /** Players who have reached the target (they win by getting back to the bank). */
  private winReady = new Set<number>();

  async start() {
    try {
      if (this.opening) await this.playOpening();
      if (this.dead) return;
      this.checkWinReady(true);
      await this.game.run();
    } catch (err) {
      if (!this.dead) {
        console.error(err);
        this.hud.banner(
          'Something went wrong. Your game was saved at the start of this turn.',
          '#e5484d',
          5000,
        );
      }
    }
  }

  private openingAbort = new AbortController();
  private openingPlay: Promise<void> | null = null;

  /** The UI Lab uses the same entrance without starting any engine turns. */
  playOpening(): Promise<void> {
    if (!this.opening) return Promise.resolve();
    return (this.openingPlay ??= (async () => {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      sound.play('gameStart');
      await openingDelay(reduced ? 0 : T.openingBoard, this.openingAbort.signal);
      if (this.dead) return;
      await this.board.playOpening(
        () => sound.play('hop'),
        () => sound.play('land'),
      );
      if (this.dead) return;
      await openingDelay(reduced ? 0 : T.openingSettle, this.openingAbort.signal);
      if (this.dead) return;
      // No game music until the last player is safely on the board.
      sound.music('game');
      this.hud.status("Let's play!", 'move', true);
      this.board.revealOpeningHud();
      this.root.classList.add('game-opening-ui');
      this.root.style.setProperty('--opening-hud-ms', `${T.openingHud}ms`);
      this.root.style.setProperty('--opening-hud-stagger', `${T.openingHudStagger}ms`);
      await openingDelay(reduced ? 0 : T.openingHud + 3 * T.openingHudStagger, this.openingAbort.signal);
      if (this.dead) return;
      this.board.finishOpening();
      this.opening = false;
      this.root.inert = false;
      this.root.removeAttribute('aria-busy');
      this.root.classList.remove('game-opening', 'game-opening-ui');
    })());
  }

  destroy() {
    this.openingAbort.abort();
    this.arcade?.close();
    this.liveAuction?.stop();
    this.dead = true;
    closeSoundPopover();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.checkOrientation);
    this.board.destroy();
    this.hud.destroy();
    this.root.remove();
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.opening) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    // Zoom with the keyboard too: - shows more of the board, + goes back in.
    if (e.key === '-' || e.key === '_') this.board.zoomBy(ZOOM_STEP);
    if (e.key === '=' || e.key === '+') this.board.zoomBy(-ZOOM_STEP);
  };

  toggleFast() {
    this.fast = !this.fast;
    this.hud.setFastLabel(this.fast);
    writePref(FAST_KEY, this.fast ? '1' : '0');
    this.updateSpeed();
  }

  updateSpeed() {
    const p = this.game.current;
    this.speed = this.fast && p?.cpu ? FAST_CPU_SPEED : 1;
    // An online copy that fell behind the host hurries its animations to catch up.
    if (this.link?.behind(this.seq)) this.speed = Math.min(this.speed, 0.12);
    this.board.speed = this.speed;
  }

  /** What the quit dialog asks (null: the game is over, so just leave). */
  quitQuestion(): string | null {
    if (this.G.over) return null;
    return !this.link
      ? 'Quit to the main menu? The game is saved at the start of each turn, so you can continue it later.'
      : this.link.role === 'host'
        ? 'End the online game for everyone? It is saved at the start of each turn, so you can continue it later on this device.'
        : 'Leave the online game? You can rejoin with the same code while the host is still playing.';
  }

  /** Leave the game (the player already confirmed in the quit dialog). */
  quit() {
    this.destroy();
    this.onExit();
  }

  // ------------------------------------------------------------ orientation

  private orient: HTMLElement | null = null;
  private upright = false;

  private setupOrientation() {
    window.addEventListener('resize', this.checkOrientation);
    this.checkOrientation();
  }

  private checkOrientation = () => {
    const portraitPhone = window.innerHeight > window.innerWidth && window.innerWidth < 760;
    this.hud.root.classList.toggle('upright', portraitPhone && this.upright);
    if (portraitPhone && !this.upright) {
      if (!this.orient) {
        this.orient = h(
          'div',
          { class: 'orient' },
          h('div', { class: 'phone-icon' }),
          h('p', null, 'Turn your phone sideways'),
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                this.upright = true;
                this.orient?.remove();
                this.orient = null;
                this.checkOrientation();
              },
            },
            'Play upright anyway',
          ),
        );
        this.root.append(this.orient);
      }
    } else if (this.orient) {
      this.orient.remove();
      this.orient = null;
    }
    this.hud.updateInsets();
  };

  // ------------------------------------------------------------ helpers

  /** Announce players who reach the target net worth, and switch to the urgent music. */
  checkWinReady(quiet = false) {
    const G = this.G;
    if (G.over) return;
    for (const p of G.players) {
      const ready = !p.bankrupt && netWorth(G, p) >= G.target;
      if (ready && !this.winReady.has(p.id)) {
        this.winReady.add(p.id);
        if (!quiet) {
          sound.play('promote');
          this.hud.banner(
            `${p.name} has ${fmt(G.target)}! Back to the bank to win!`,
            PLAYER_COLORS[p.color],
            T.promoteBanner + 600,
          );
          this.hud.tick(`${p.name} can win: they reached the target net worth. Next stop, the bank!`, 'suit');
        }
      } else if (!ready) this.winReady.delete(p.id);
    }
    this.playMusic();
  }

  /** The venture board or an arcade game, while one is up: each has its own music. */
  private scene: Track | null = null;

  private setScene(scene: Track | null) {
    this.scene = scene;
    this.playMusic();
  }

  /** The scene (if any) that was up when an auction started, to go back to after it. */
  private sceneBeforeAuction: Track | null = null;

  /** The scene's music, else the board music (the urgent theme once someone can win). */
  private playMusic() {
    if (this.G.over || this.opening) return;
    sound.music(this.scene ?? (this.winReady.size ? 'urgent' : 'game'));
  }

  async wait(ms: number) {
    await new Promise<void>((r) => setTimeout(r, ms * this.speed));
    await this.pauseGate();
  }

  /** While set, the game is paused (the menu is open in a game on this device). */
  private paused: { done: Promise<void>; resume: () => void } | null = null;

  /** Pause or resume a game on this device; online games never pause. Returns whether paused. */
  private setPaused(on: boolean): boolean {
    if (this.link) return false;
    if (on && !this.paused) {
      let resume = () => {};
      const done = new Promise<void>((r) => (resume = r));
      this.paused = { done, resume };
    } else if (!on && this.paused) {
      this.paused.resume();
      this.paused = null;
    }
    return on;
  }

  /** Hold here while the game is paused: the next event, choice or pause waits for the menu. */
  private async pauseGate() {
    while (this.paused) await this.paused.done;
  }

  refresh() {
    // Values that changed without a value event (purchases, sales) are not animated.
    for (const n of this.G.nodes) if (!this.values.has(n.id) || n.owner < 0) this.values.set(n.id, n.value);
    for (const n of this.G.nodes) if (!this.owners.has(n.id)) this.owners.set(n.id, n.owner);
    this.board.dirty = true;
    this.board.snapTokens();
    this.trackStock();
    this.hud.render(this.G);
    if (!this.dead) this.checkWinReady();
  }

  /** Bring each player's shown stock value up to date with their shares (see `stockShown`). */
  private trackStock() {
    const G = this.G;
    const trade = this.stockTrade;
    this.stockTrade = null;
    for (const p of G.players) {
      const s = this.stockShown.get(p.id);
      if (!s || this.prices.length !== G.districts.length) {
        this.stockShown.set(p.id, { value: stockValue(G, p), held: [...p.shares] });
        continue;
      }
      if (p.shares.every((n, d) => n === s.held[d])) continue;
      if (trade?.reason === 'Stock' && trade.from === p.id) s.value += trade.amount;
      else if (trade?.reason === 'Stock sale' && trade.to === p.id) s.value -= trade.amount;
      // Shares that came another way (a card, a trade) count at the prices shown so far.
      else s.value += p.shares.reduce((v, n, d) => v + (n - (s.held[d] ?? 0)) * (this.prices[d] ?? 0), 0);
      s.held = [...p.shares];
    }
  }

  /** Every player's shown stock value at the prices shown so far (after a price was announced). */
  private syncStock() {
    for (const p of this.G.players)
      this.stockShown.set(p.id, {
        value: p.shares.reduce((v, n, d) => v + n * (this.prices[d] ?? 0), 0),
        held: [...p.shares],
      });
  }

  /** A player's net worth as the player cards show it (stock counted as in `stockShown`). */
  shownWorth(p: Player) {
    const G = this.G;
    const shown = this.stockShown.get(p.id);
    return shown ? netWorth(G, p) - stockValue(G, p) + shown.value : netWorth(G, p);
  }

  playerPos(pid: number) {
    return pid < 0 ? this.board.bankPos() : this.board.tokenPos(pid);
  }

  // ------------------------------------------------------------ decisions

  private summarizedPayments: Extract<GameEvent, { type: 'money' }>[] = [];
  private suitMessage: string | null = null;

  async decide<T extends DecisionKind>(req: DecisionRequest<T>): Promise<DecisionAnswer<T>> {
    if (this.dead) return never();
    await this.pauseGate();
    this.summarizedPayments = [];
    this.checkpointArrival = false;
    const seq = this.seq++;
    if (this.link) return (await this.decideOnline(seq, req as DecisionRequest)) as DecisionAnswer<T>;
    // A live auction is run here for everyone at once (bids from people here and CPUs).
    if (req.kind === 'auction') return (await this.runAuction(seq, req as AuctionReq)) as DecisionAnswer<T>;
    const p = this.G.players[req.pid];
    if (p.cpu) {
      this.spectate(req as DecisionRequest);
      const ans = cpuDecide(this.G, req);
      this.waitOn(req as DecisionRequest);
      await this.showCpu(req as DecisionRequest, ans);
      if (this.dead) return never();
      return ans;
    }
    const ans = await this.oneAtATime(async () => {
      if (this.humans > 1 && this.holder !== p.id) {
        await this.hud.passDevice(p);
        this.holder = p.id;
      }
      this.holder = p.id;
      return this.askHuman(req as DecisionRequest);
    });
    if (this.dead) return never();
    return ans as DecisionAnswer<T>;
  }

  /** The choice on this device being answered now; the next one waits for it. */
  private humanTurn: Promise<unknown> = Promise.resolve();

  /**
   * Party games ask everyone at once. Players elsewhere and CPUs answer side by side, but the
   * people sharing this device take turns with the one action bar.
   */
  private oneAtATime<R>(ask: () => Promise<R>): Promise<R> {
    const run = this.humanTurn.then(ask, ask);
    this.humanTurn = run.catch(() => undefined);
    return run;
  }

  /**
   * Online decisions. The host answers CPU and local seats itself and waits for remote players,
   * then shares every answer (with the RNG state) so all copies of the game stay in step.
   * Guests answer their own seat, send it to the host and use the host's broadcast answer.
   */
  private async decideOnline(seq: number, req: DecisionRequest): Promise<unknown> {
    const link = this.link!;
    const G = this.G;
    const p = G.players[req.pid];
    const who = link.who(req.pid);
    this.updateSpeed();
    if (req.kind === 'auction') return this.auctionOnline(seq, req);
    if (who !== 'local') this.spectate(req);
    if (link.role === 'host') {
      let ans: unknown;
      if (who === 'local') {
        ans = await this.oneAtATime(() => this.askHuman(req));
      } else if (who === 'cpu') {
        ans = cpuDecide(G, req);
        this.waitOn(req);
        await this.showCpu(req, ans);
      } else {
        this.waitOn(req);
        ans = await link.request(seq, req);
        if (this.dead) return never();
        if (req.kind !== 'preRoll') await this.showCpu(req, ans);
      }
      if (this.dead) return never();
      link.publish({ seq, ans, rng: G.rng });
      return ans;
    }
    // Replaying a turn after rejoining: decisions already made aren't asked again.
    if (who === 'local' && !link.known?.(seq)) {
      const mine = await this.oneAtATime(() => this.askHuman(req));
      if (this.dead) return never();
      link.submit(seq, mine);
    } else if (who !== 'local') {
      this.waitOn(req);
    }
    const a = await link.answer(seq);
    if (this.dead) return never();
    G.rng = a.rng;
    if (who !== 'local' && (p.cpu || req.kind !== 'preRoll')) await this.showCpu(req, a.ans);
    if (this.dead) return never();
    return a.ans;
  }

  /** The live auction being run on this device, if any (stopped if the game is left). */
  private liveAuction: LiveAuction | null = null;

  /**
   * Run a live auction here (a game on this device, or the host online): this device's players
   * bid in the action bar, CPUs (and players who dropped) bid by themselves, and online guests'
   * bids arrive through the link. Resolves with the winner and price.
   */
  private async runAuction(seq: number, req: AuctionReq): Promise<{ winner: number; price: number }> {
    const G = this.G;
    const link = this.link;
    const who = (pid: number) => (link ? link.who(pid) : G.players[pid].cpu ? 'cpu' : 'local');
    const view =
      this.auction ?? new AuctionView(this.hud, G, req.sq, req.seller, req.opening, req.step, req.bidders);
    this.auction = view;
    const live = new LiveAuction(G, req, view, {
      cpu: (pid) => who(pid) === 'cpu',
      anyPerson: req.bidders.some((pid) => who(pid) !== 'cpu'),
      speed: this.speed,
      share: link?.auctionShare ? (l) => link.auctionShare!(seq, l) : undefined,
    });
    this.liveAuction = live;
    view.openBar(
      req.bidders.filter((pid) => who(pid) === 'local'),
      (pid, act) => live.act(pid, act),
    );
    if (link)
      link.onAuctionAct = (s, pid, act) => {
        if (s === seq && who(pid) === 'remote') live.act(pid, act);
      };
    const ans = await live.run();
    if (link) link.onAuctionAct = null;
    this.liveAuction = null;
    view.closeBar();
    return ans;
  }

  /** Online live auction: the host runs it and shares the answer; guests bid through the host. */
  private async auctionOnline(seq: number, req: AuctionReq): Promise<unknown> {
    const link = this.link!;
    if (link.role === 'host') {
      const ans = await this.runAuction(seq, req);
      if (this.dead) return never();
      link.publish({ seq, ans, rng: this.G.rng });
      return ans;
    }
    // Guests: draw the host's updates and send this device's bids (not when replaying a turn
    // whose auction is already decided).
    if (!link.known?.(seq)) {
      const view =
        this.auction ??
        new AuctionView(this.hud, this.G, req.sq, req.seller, req.opening, req.step, req.bidders);
      this.auction = view;
      link.onAuctionLive = (s, l) => s === seq && view.show(l);
      view.openBar(
        req.bidders.filter((pid) => link.who(pid) === 'local'),
        (_pid, act) => link.auctionSend?.(seq, act),
      );
    }
    const a = await link.answer(seq);
    link.onAuctionLive = null;
    this.auction?.closeBar();
    if (this.dead) return never();
    this.G.rng = a.rng;
    return a.ans;
  }

  /** Say on the status line (and in the log) what the game is waiting on this player to do. */
  private waitOn(req: DecisionRequest) {
    // Before the roll, arrows on the board show which ways the player can go.
    if (req.kind === 'preRoll') {
      this.board.directionsPid = req.pid;
      if (this.G.players[req.pid].cpu) return;
    }
    const roll = this.movementRoll?.pid === req.pid ? this.movementRoll.value : undefined;
    const a = activity(this.G, req, roll);
    this.hud.status(a.text, a.kind, req.kind === 'path');
  }

  /** A choice for a player on this device. */
  private async askHuman(req: DecisionRequest) {
    // Online rooms may also have several people sharing this device. Keep party choices private.
    if (this.link && req.kind === 'arcadeChoice' && this.humans > 1 && this.holder !== req.pid) {
      await this.hud.passDevice(this.G.players[req.pid]);
      this.holder = req.pid;
    }
    this.waitOn(req);
    return this.human(req);
  }

  /** The board for an arcade game, opening it (and closing any other) the first time. */
  private stage(game: ArcadeGame): ArcadeStage {
    if (this.arcade?.game !== game) {
      this.arcade?.close();
      this.arcade = new ArcadeStage(this.hud, game, this.G);
      this.setScene(GAME_MUSIC[game]);
    }
    return this.arcade;
  }

  /** The player who drew the venture card closed it: the board goes away for everyone. */
  private endVenture() {
    this.venture?.close();
    this.venture = null;
    this.setScene(null);
  }

  private endArcade() {
    this.arcade?.close();
    this.arcade = null;
    this.setScene(null);
  }

  /**
   * How long an arcade result stays up before moving on by itself (Continue skips it): longer
   * when someone on this device played, and sped up by Fast CPU when only CPUs did.
   */
  private readMs(human: boolean) {
    return human ? T.arcadeResult * 2 : T.arcadeResult * this.speed;
  }

  /**
   * Someone else (a CPU or a player on another device) is about to play a venture pick or an
   * arcade game: open the game so everyone here can watch it being played.
   */
  private spectate(req: DecisionRequest) {
    const G = this.G;
    const p = G.players[req.pid];
    switch (req.kind) {
      case 'venturePanel':
        this.venture?.m.close();
        this.venture = new VentureView(this.hud, G, p.id);
        this.venture.watch(p.name);
        this.setScene('venture');
        break;
      case 'reels':
        void this.stage('Lucky Reels').reels(req, p, false);
        break;
      case 'arcadeChoice':
        this.stage(req.game).choosing(req);
        // Everyone chooses at once; the chips over the game show who has locked in.
        this.hud.action(`arcade-choice:${req.game}:${req.round}`, 'Everyone is choosing…', 'arcade');
        break;
      case 'memory':
        void this.stage('Memory Blocks').memoryStart(req.prizes, p.level, this.speed);
        break;
      case 'path':
        // Everyone else sees where the player could land (no zooming out here: only the player
        // choosing gets framed). The chosen route shows once they pick, then they walk it.
        this.board.setChoices(
          req.dests.map((d) => d.node),
          PLAYER_COLORS[p.color],
          () => {},
          new Map(req.dests.map((d) => [d.node, d.path])),
          { fit: false },
        );
        break;
      case 'answerTrade':
        // Everyone else can see the terms being considered.
        this.tradeWatch?.();
        this.tradeWatch = watchTradeOnBoard(this.pick, req.offer);
        break;
    }
  }

  /** Hold domination celebrations until every part of an accepted trade has finished. */
  private tradeAnimating = false;
  /** Takes down the trade terms shown to everyone not deciding. */
  private tradeWatch: (() => void) | null = null;

  /** Give CPU choices a beat so players can follow along. */
  private async showCpu(req: DecisionRequest, ans: unknown) {
    const p = this.G.players[req.pid];
    switch (req.kind) {
      case 'path': {
        // Shown where the camera already is: only the player choosing gets zoomed out.
        this.board.setChoices(
          req.dests.map((d) => d.node),
          PLAYER_COLORS[p.color],
          () => {},
          new Map(req.dests.map((d) => [d.node, d.path])),
          { fit: false },
        );
        this.board.previewRoute(ans as number);
        // A CPU "thinks" for a beat; a person elsewhere has already taken their time.
        await this.wait(p.cpu ? T.cpuPath : T.afterChoice);
        this.board.clearChoices();
        this.board.walkTarget = ans as number;
        this.board.glowColor = PLAYER_COLORS[p.color];
        break;
      }
      case 'preRoll':
        // Only a stock dump is worth a pause; a plain roll goes straight on.
        if ((ans as { act: string }).act !== 'roll') await this.wait(T.cpuPreRoll);
        break;
      case 'venturePanel':
        await this.wait(T.cpuDecision);
        break;
      case 'arcadeChoice':
        // Players lock in one by one (CPUs at slightly different moments), all at the same time.
        if (p.cpu) await this.wait(T.cpuDecision * (0.6 + Math.random() * 0.9));
        this.arcade?.lockIn(p.id);
        break;
      case 'reels':
        // Give the CPU a brief beat to choose its held slots.
        await this.wait(T.cpuPath);
        break;
      case 'memory':
        break;
      case 'answerTrade':
        await this.wait(T.cpuDecision);
        this.tradeWatch?.();
        this.tradeWatch = null;
        break;
      case 'ventureRead':
        // A CPU takes a moment to read its card; a player elsewhere has already closed theirs.
        if (p.cpu) await this.wait(T.cpuResult);
        this.endVenture();
        break;
      default:
        await this.wait(T.cpuDecision);
    }
  }

  private async human(req: DecisionRequest): Promise<unknown> {
    const G = this.G;
    const hud = this.hud;
    const p = G.players[req.pid];
    const color = p.color;
    switch (req.kind) {
      case 'preRoll': {
        while (true) {
          this.waitOn(req);
          const buttons: PromptButton<string>[] = [{ label: 'Roll', value: 'roll', main: true }];
          if (req.canStock) buttons.push({ label: 'Sell stock', value: 'sell' });
          if (req.canTrade) buttons.push({ label: 'Trade', value: 'trade' });
          if (req.canAuction) buttons.push({ label: 'Auction', value: 'auction' });
          if (req.canRenovate) buttons.push({ label: 'Renovate', value: 'renovate' });
          const a = await hud.prompt(`${p.name}, it's your turn.`, buttons, color);
          if (a === 'roll') return { act: 'roll' };
          const step = PRE_ROLL_STEPS[a as keyof typeof PRE_ROLL_STEPS];
          hud.status(`${p.name} is ${step.what}...`, step.kind);
          if (a === 'sell') {
            const r = await stockModal(hud, G, p, 'sell');
            if (r) return { act: 'sellStock', ...r };
          } else if (a === 'trade') {
            const offer = await tradeOnBoard(this.pick, p);
            if (offer) return { act: 'trade', offer };
          } else if (a === 'auction') {
            const sq = await auctionOnBoard(this.pick, p);
            if (sq != null) return { act: 'auction', sq };
          } else if (a === 'renovate') {
            const r = await renovateOnBoard(this.pick, p);
            if (r) return { act: 'renovate', ...r };
          }
        }
      }

      case 'path': {
        const routes = new Map(req.dests.map((d) => [d.node, d.path]));
        this.board.setChoices(
          req.dests.map((d) => d.node),
          PLAYER_COLORS[color],
          (id) => hud.resolvePrompt(id),
          routes,
        );
        // The glowing squares are the choices; the bar only explains what to do.
        // Saved motel spaces are added to the die: say so, rather than calling the total the roll.
        const mr = this.movementRoll?.pid === p.id ? this.movementRoll : null;
        const rolled =
          mr?.bonus && mr.value + mr.bonus === req.steps
            ? `rolled ${mr.value} + ${mr.bonus} saved = ${req.steps} spaces`
            : `rolled ${req.steps}`;
        const node = await hud.prompt<number>(
          `${p.name} ${rolled}. Tap a glowing square to move there.`,
          [],
          color,
        );
        this.board.clearChoices();
        this.board.walkTarget = node;
        await this.wait(T.afterChoice);
        return node;
      }

      case 'buyShop':
        return hud.prompt(
          question(`Buy this ${shortName(G, G.nodes[req.sq])}?`, [
            ['Fee when rivals land here', fmt(feeIfOwned(G, req.sq, p.id))],
          ]),
          [
            // The price is on the button: the question itself no longer repeats it.
            { label: `Buy for ${fmt(req.price)}`, value: true, main: true },
            { label: 'Pass', value: false, secondary: true },
          ],
          color,
        );

      case 'build':
        return buildPrompt(hud, p, req.options, 'What will you build on this plot?');

      case 'invest':
        return investOnBoard(hud, this.board, G, p, req.shops, req.max);

      case 'buyout': {
        this.board.setChoices([req.sq], PLAYER_COLORS[color], () => {}, undefined, { pins: false });
        const yes = await buyoutPrompt(this.pick, p, req.sq, req.price);
        this.board.clearChoices();
        return yes;
      }

      case 'circusUpgrade':
        return hud.prompt(
          question('Upgrade your circus?', [
            ['Cost', fmt(req.cost), 'big'],
            [
              'Fee when rivals land here',
              `${fmt(feeIfOwned(G, req.sq, p.id))} → ${fmt(feeIfOwned(G, req.sq, p.id, req.tier))}`,
            ],
            ...(req.cost > p.cash
              ? ([['More than your cash', 'sell at the end of your turn']] as [string, string][])
              : []),
          ]),
          [
            { label: 'Upgrade', value: true, main: true },
            { label: 'Not now', value: false, secondary: true },
          ],
          color,
        );

      case 'buyStock':
        return stockModal(hud, G, p, 'buy', req.discount);

      case 'sellStock':
        return stockModal(hud, G, p, 'sell', req.premium);

      case 'venturePanel':
        this.venture = new VentureView(hud, G, p.id);
        this.setScene('venture');
        return this.venture.pick();

      case 'ventureRead':
        await this.venture?.read();
        this.endVenture();
        return true;

      case 'reels':
        return this.stage('Lucky Reels').reels(req, p, true);

      case 'arcadeChoice': {
        const stage = this.stage(req.game);
        stage.choosing(req);
        const ans = await stage.choose(req, p);
        stage.lockIn(p.id);
        // Until the round starts: who the game is still waiting for.
        const left = stage.notLockedIn().map((id) => G.players[id].name);
        if (left.length)
          hud.action(
            `arcade-locked:${req.game}:${req.round}:${p.id}`,
            `${p.name} locked in! Waiting for ${left.join(', ')}…`,
            'arcade',
          );
        return ans;
      }

      case 'memory': {
        const stage = this.stage('Memory Blocks');
        void stage.memoryStart(req.prizes, p.level, 1);
        return stage.memoryPick(p);
      }

      case 'pickSquare': {
        const text = {
          balloon: 'Fly to any square.',
          zoom: 'Zoom to any square.',
          agency: 'Pick an unowned shop to buy at its value.',
          forcedBuyout: "Pick a rival's shop to buy for 5x its value.",
          taxi: 'Taxi! Ride to any special square and use it.',
        }[req.purpose];
        const price = (id: number) =>
          req.purpose === 'forcedBuyout' ? G.nodes[id].value * K.buyoutX : G.nodes[id].value;
        const labels =
          req.purpose === 'forcedBuyout' || req.purpose === 'agency'
            ? new Map(req.options.map((id) => [id, fmt(price(id))]))
            : undefined;
        // Buying a shop (a rival's, or an unowned one): tap it on the board, then Buy.
        if (labels)
          return buyOnBoard(
            this.pick,
            p,
            req.options,
            text,
            price,
            req.purpose === 'forcedBuyout',
            req.optional,
          );
        // When nearly every square is a choice, nothing is lit or pinned: tap any square.
        const plain = req.options.length > G.nodes.length * 0.6;
        this.board.setChoices(req.options, PLAYER_COLORS[color], (id) => hud.resolvePrompt(id), undefined, {
          labels,
          plain,
        });
        const buttons: PromptButton<number | null>[] =
          req.options.length <= 6
            ? req.options.map((id) => ({ label: squareName(G, G.nodes[id]), value: id }))
            : [];
        if (req.optional) buttons.push({ label: 'Skip', value: null, secondary: true });
        const id = await hud.prompt(
          `${text} ${plain ? 'Tap a square.' : 'Tap a glowing square.'}`,
          buttons,
          color,
        );
        this.board.clearChoices();
        return id;
      }

      case 'cannonTarget':
        return cannonOnBoard(this.pick, p, req.options);

      case 'swapTarget':
        return cannonOnBoard(this.pick, p, req.options, 'swap');

      case 'motelStop':
        return motelPrompt(this.pick, p, req.sq, req.fee, req.left);

      case 'pickDistrict':
        // The stock screen with the amount fixed: pick the district on its map or list.
        return districtStockModal(hud, G, p, req.purpose);

      case 'answerTrade':
        return answerTradeOnBoard(this.pick, req.offer, req.canCounter);

      case 'debt':
        return debtOnBoard(this.pick, p, req.assets);
    }
  }

  // ------------------------------------------------------------ events

  async emit(e: GameEvent): Promise<void> {
    if (this.dead) return never();
    await this.pauseGate();
    if (this.link) this.updateSpeed();
    const G = this.G;
    const board = this.board;
    const hud = this.hud;
    switch (e.type) {
      case 'turnStart': {
        this.checkpointArrival = false;
        board.directionsPid = -1;
        board.die = null;
        board.savedDie = null;
        board.frameIds = null;
        // A beat at the end of the previous turn before the next player starts.
        const handoff = board.activePid >= 0 && board.activePid !== e.pid;
        if (handoff) await this.wait(T.turnEnd);
        this.link?.turnStart(this.seq, G);
        if (this.saving) saveGame(G, this.link?.saveInfo?.());
        const p = G.players[e.pid];
        board.activePid = e.pid;
        board.followPid = e.pid;
        board.walkTarget = -1;
        hud.activePid = e.pid;
        this.updateSpeed();
        if (handoff) board.handoffTo(e.pid, T.turnCamera * this.speed);
        hud.action(
          `handoff:${G.round}:${G.turn}:${e.pid}`,
          handoff ? `Passing the turn to ${G.players[e.pid].name}...` : `${G.players[e.pid].name}'s turn.`,
          'move',
        );
        this.refresh();
        if (this.localHuman(p.id)) sound.play('turn');
        hud.banner(`${p.name}'s turn`, PLAYER_COLORS[p.color], T.turnBanner);
        this.movementRoll = null;
        await this.wait((p.cpu ? T.turnStartCpu : T.turnStartHuman) + (handoff ? T.turnPanExtra : 0));
        break;
      }
      case 'roundStart':
        sound.play('round');
        hud.banner(`Round ${e.round}`, '#ffd166', T.roundBanner);
        this.refresh();
        break;
      case 'roll': {
        // Rolled: the way they can go is shown by the reachable squares now, not the arrows.
        board.directionsPid = -1;
        this.refresh();
        this.movementRoll = { pid: e.pid, value: e.value, bonus: e.bonus };
        hud.action('rolling', `${G.players[e.pid].name} is rolling...`, 'move');
        sound.play('roll');
        const mover = G.players[e.pid];
        const total = e.value + (e.bonus ?? 0);
        const routes = this.game.destinations(mover, total);
        // A CPU's existing route preview supplies the stationary result beat; don't add a
        // second hold before it. Single-route rolls and human rolls use the die hold.
        const routePreviewHolds = mover.cpu && routes.length > 1;
        await board.rollDie(
          e.value,
          () =>
            hud.action(
              'roll-result',
              e.bonus
                ? `${mover.name} rolled ${e.value} + ${e.bonus} saved = ${total} spaces.`
                : `${mover.name} rolled a ${e.value}.`,
              'move',
            ),
          routePreviewHolds ? 0 : T.dieHold,
          // One way to go: the die shrinks first, then the player walks. With a choice of where
          // to go, the choice comes straight up as before.
          routes.length <= 1,
          // Saved motel spaces pop out of the motel as a second die.
          e.bonus ?? 0,
        );
        // Once the die has landed, zoom out to show the player and every square the roll could
        // take them to: only on the screen of the human who rolled (they pick where to go).
        if (this.localHuman(mover.id)) {
          board.frameIds = [mover.node, ...routes.flatMap((r) => r.path)];
        }
        break;
      }
      case 'step':
        this.checkpointArrival = false;
        // The direction arrows stay up until the player actually moves. Once they do, the
        // camera goes back to the player's own zoom.
        board.directionsPid = -1;
        board.frameIds = null;
        // The step sounds as the token lands on the square. (The 'hop' sound as it lifts off is
        // turned off for now, as a test; it stays in audio.ts.)
        hud.action('moving', `${G.players[e.pid].name} is moving...`, 'move');
        if (G.nodes[e.from]?.portals?.some((q) => q.to === e.to)) {
          // Through a portal link: into one ring, out of the other.
          sound.play('warp');
          await board.portalStep(e.pid, e.from, e.to, e.left);
        } else await board.step(e.pid, e.to, e.left);
        sound.play('step');
        // Mid-walk, tolls and value bumps play as the token passes without stopping it.
        this.passing = e.left > 0;
        if (e.left === 0) board.walkTarget = -1;
        break;
      case 'warp': {
        this.checkpointArrival = false;
        const how = e.how ?? 'warp';
        const who = G.players[e.pid].name;
        // Each ride has its own message, sound and animation (BoardView.travel).
        const ride: Record<string, [string, Sfx | null]> = {
          warp: [`${who} is warping...`, 'warp'],
          home: [`${who} is called home...`, 'warp'],
          portal: [`${who} is going through the portal...`, 'warp'],
          cannon: [`${who} is fired from the cannon!`, 'cannon'],
          taxi: [`${who} is taking a taxi...`, 'honk'],
          balloon: [`${who} is floating away in a balloon...`, 'whoosh'],
          swap: [
            `${who} swaps places with ${e.other != null ? G.players[e.other].name : 'a rival'}!`,
            'whoosh',
          ],
          card: [`${who} zooms off...`, 'warp'],
          swapBack: ['', null],
        };
        const [text, sfx] = ride[how] ?? ride.warp;
        if (text) hud.action(`warping:${how}`, text, 'move');
        board.directionsPid = -1;
        board.frameIds = null;
        if (sfx) sound.play(sfx);
        await board.travel(e.pid, e.to, how, {
          from: e.from,
          other:
            how === 'swap' && e.other != null && e.from != null ? { pid: e.other, to: e.from } : undefined,
        });
        if (how === 'taxi') sound.play('honk');
        this.refresh();
        break;
      }
      case 'land': {
        this.movementRoll = null;
        const sq = G.nodes[e.sq];
        this.checkpointArrival = sq.t === 'plot' && sq.b === 'checkpoint';
        const immediate =
          this.checkpointArrival || sq.t === 'jackpot' || [...SUITS, 'change', 'randomSuit'].includes(sq.t);
        // A motel check-in (only a check-in saves spaces): the die goes into the motel.
        const saved = sq.t === 'plot' && sq.b === 'motel' ? (G.players[e.pid].motelMoves ?? 0) : 0;
        // Let tolls and suits announce themselves as soon as the final step ends.
        if (saved > 0)
          hud.action(
            'landing',
            `${G.players[e.pid].name} checked in and saved ${saved} space${saved === 1 ? '' : 's'}.`,
            'move',
          );
        else if (!immediate)
          hud.action('landing', `${G.players[e.pid].name} landed on ${shortName(G, sq)}.`, 'move');
        board.frameIds = null;
        sound.play('land');
        board.ring(e.sq, '#ffffff');
        board.walkTarget = -1;
        if (saved > 0) await board.dieToMotel(e.pid, e.sq, saved);
        if (!immediate) await this.wait(T.land);
        break;
      }
      case 'money': {
        // A share trade: the cards count the shares at what was paid (see `trackStock`).
        if (e.reason === 'Stock' || e.reason === 'Stock sale') this.stockTrade = e;
        // The engine has committed the payment and property changes already. Announce that
        // result before any pacing delay, so a completed choice never looks undecided.
        const completed = paymentActivity(G, e);
        if (completed) {
          if (!this.summarizedPayments.some((p) => p.reason === e.reason && p.from === e.from)) {
            if (this.passing) hud.tick(completed.text, completed.kind, T.actionResult, true);
            else hud.action(`payment:${e.reason}:${e.from}`, completed.text, completed.kind);
          }
          this.summarizedPayments.push(e);
        }
        // Buying something: a beat after the choice before the coins go to the bank.
        if (['Purchase', 'Construction', 'Buyout', 'Renovation'].includes(e.reason))
          await this.wait(T.beforePay);
        const jackpotPayout = e.reason === 'Jackpot payout' && e.sq != null;
        const from = jackpotPayout ? board.center(G.nodes[e.sq!]) : this.playerPos(e.from);
        // Paying for a property: the buyer claims it as the coins leave, not after.
        if (['Purchase', 'Construction', 'Buyout', 'Auction'].includes(e.reason) && e.from >= 0)
          for (const n of G.nodes)
            if (n.owner === e.from && this.owners.get(n.id) !== e.from) {
              // Shops are open or closed with their owner: a closed shop bought by an open player
              // rolls its gate up; an open one bought by a closed player brings it down.
              const before = this.owners.get(n.id) ?? -1;
              const wasClosed = before >= 0 && isClosed(G.players[before]);
              const nowClosed = isClosed(G.players[e.from]);
              if (wasClosed && !nowClosed) board.openShops([n.id]);
              else if (!wasClosed && nowClosed) board.closeGate(n.id);
              this.owners.set(n.id, e.from);
              this.values.set(n.id, n.value);
              sound.play(e.reason === 'Buyout' ? 'buyout' : 'buy');
              board.ring(n.id, '#ffd166', true);
            }
        // An investment's coins fly into the shop being invested in, not to the bank.
        const to = jackpotPayout
          ? this.playerPos(e.to)
          : e.sq != null
            ? board.center(G.nodes[e.sq])
            : this.playerPos(e.to);
        if (e.reason === 'Stock') sound.play('stockBuy');
        else if (e.reason === 'Stock sale') sound.play('stockSell');
        else sound.play(e.to >= 0 && (e.from < 0 || !G.players[e.to].cpu) ? 'coin' : 'pay');
        board.coins(from, to, Math.ceil(e.amount / 50));
        if (e.to >= 0) board.floatText(to.x, to.y, `+${fmt(e.amount)}`, '#7cf29a');
        if (e.from >= 0) board.floatText(from.x, from.y + 22, `-${fmt(e.amount)}`, '#ff8a8a');
        this.refresh();
        if (!this.passing && !this.checkpointArrival) await this.wait(T.money);
        break;
      }
      case 'owner':
        this.values.set(e.sq, G.nodes[e.sq].value);
        // Already claimed with its payment.
        if (this.owners.get(e.sq) === e.owner) {
          this.refresh();
          break;
        }
        this.owners.set(e.sq, e.owner);
        if (e.owner >= 0) {
          sound.play('buy');
          board.ring(e.sq, '#ffd166', true);
        }
        this.refresh();
        await this.wait(T.owner);
        break;
      case 'value':
        sound.play('grow');
        for (const id of e.sqs) {
          board.ring(id, '#ffd166', true);
          board.valueFx(id, G.nodes[id].value - (this.values.get(id) ?? G.nodes[id].value));
          this.values.set(id, G.nodes[id].value);
        }
        this.refresh();
        if (!this.passing && !this.checkpointArrival) await this.wait(T.value);
        break;
      case 'suit': {
        this.suitMessage = e.suit >= 0 ? `${G.players[e.pid].name} collected the ${SUITS[e.suit]}.` : null;
        if (e.passing)
          hud.tick(
            this.suitMessage ?? `${G.players[e.pid].name} collected a wild card.`,
            'suit',
            T.actionResult,
            true,
          );
        else
          hud.action('suit', this.suitMessage ?? `${G.players[e.pid].name} collected a wild card.`, 'suit');
        sound.play('suit');
        const text = e.suit >= 0 ? SUIT_CHARS[e.suit] : 'Wild card!';
        const color = e.suit === 1 || e.suit === 2 ? '#ff6b6b' : '#ffffff';
        this.refresh();
        if (e.passing) {
          // Collected on the way past: the token keeps walking.
          board.collectFx(e.pid, text, color);
          break;
        }
        const pos = board.tokenPos(e.pid);
        board.floatText(pos.x, pos.y, text, color);
        // Pickup effects run immediately, without a stopped-tile pause.
        break;
      }
      case 'promote': {
        const p = G.players[e.pid];
        hud.action(
          'promotion',
          `${p.name} was promoted to level ${e.level} and earned ${e.salary}G.`,
          'suit',
        );
        sound.play('promote');
        board.confetti(e.pid);
        board.dance(e.pid, T.promote);
        hud.banner(
          `${p.name} reached level ${e.level}! +${fmt(e.salary)}`,
          PLAYER_COLORS[p.color],
          T.promoteBanner,
        );
        this.refresh();
        await this.wait(T.promote);
        break;
      }
      case 'venture': {
        // The board stays up until the player who drew the card closes it (`ventureRead`).
        const view = this.venture ?? new VentureView(hud, G, e.pid);
        this.venture = view;
        this.setScene('venture');
        await view.reveal(e.panel, e.title, e.text, e.lines, e.bonus, this.speed);
        this.refresh();
        break;
      }
      case 'reels': {
        const p = G.players[e.pid];
        hud.action('reels', `${p.name} finished Lucky Reels.`, 'arcade');
        await this.stage('Lucky Reels').reelsResult(
          e.result,
          e.rolled ?? e.result.map(() => false),
          p,
          this.readMs(this.localHuman(p.id)),
        );
        this.endArcade();
        this.refresh();
        break;
      }
      case 'arcadeRound': {
        hud.action(`arcade:${e.title}`, e.title, 'arcade');
        const anyone = G.players.some((p) => !p.bankrupt && this.localHuman(p.id));
        await this.stage(e.game).round(e, this.readMs(anyone));
        if (e.final) this.endArcade();
        this.refresh();
        break;
      }
      case 'memory': {
        const p = G.players[e.pid];
        hud.action('memory', `${p.name} picked a card in Memory Blocks.`, 'arcade');
        const stage = this.stage('Memory Blocks');
        void stage.memoryStart(e.prizes, p.level, this.speed);
        await stage.memoryReveal(
          e.picked,
          e.prizes[e.picked],
          e.prize,
          p,
          this.readMs(this.localHuman(p.id)),
        );
        this.endArcade();
        this.refresh();
        break;
      }
      case 'auctionStart':
        hud.action('auction', 'The auction is starting...', 'property');
        this.auction?.close();
        this.auction = new AuctionView(hud, G, e.sq, e.seller, e.opening, e.step, e.bidders);
        // Auctions have their own music until the gavel falls.
        if (this.scene !== 'auction') this.sceneBeforeAuction = this.scene;
        this.setScene('auction');
        board.setChoices([e.sq], '#ffd166', () => {}, undefined, { pins: false });
        await this.wait(T.cpuDecision);
        break;
      case 'auctionEnd': {
        hud.action(
          'auction-result',
          e.winner >= 0
            ? `${G.players[e.winner].name} won the auction for ${fmt(e.price)}.`
            : 'The auction ended with no sale.',
          'property',
        );
        const view = this.auction;
        this.auction = null;
        this.refresh();
        await view?.end(e.winner, e.price, T.cpuResult * this.speed);
        board.clearChoices();
        this.setScene(this.sceneBeforeAuction);
        this.sceneBeforeAuction = null;
        break;
      }
      case 'trade':
        this.tradeAnimating = false;
        this.refresh();
        break;
      case 'closed': {
        hud.action('shops-closing', 'Shops are closing...', 'effect');
        this.refresh();
        const shut = G.nodes.filter((sq) => e.pids.includes(sq.owner)).map((sq) => sq.id);
        // Each shutter plays its own short sound as it comes down (board.onGate).
        await board.closeShops(shut);
        break;
      }
      case 'opened': {
        hud.action('shops-opening', 'Shops are reopening...', 'effect');
        // In the background: no zoom out and no waiting; the gates roll up while play goes on.
        const open = G.nodes.filter((sq) => e.pids.includes(sq.owner)).map((sq) => sq.id);
        board.openShops(open);
        this.refresh();
        break;
      }
      case 'bankrupt': {
        const p = G.players[e.pid];
        hud.action('bankrupt', `${p.name} went bankrupt.`, 'alert');
        sound.play('bankrupt');
        hud.banner(`${p.name} went bankrupt!`, '#e5484d', T.bankruptBanner);
        this.refresh();
        await this.wait(T.bankrupt);
        break;
      }
      case 'gameOver': {
        hud.action('game-over', `${G.players[e.winner].name} wins!`, 'alert');
        if (this.saving) clearSave();
        sound.music(null);
        sound.play('win');
        this.refresh();
        // Victory: the camera closes in on the winner, who dances under falling confetti,
        // before the results.
        const winner = G.players[e.winner];
        // The celebration plays at full length even if a CPU won in fast mode.
        this.speed = 1;
        board.speed = 1;
        if (winner) {
          board.activePid = winner.id;
          board.followPid = winner.id;
          const at = board.tokenPos(winner.id);
          board.lookAt = { x: at.x, y: at.y - 20, z: board.followZoom() };
          await this.wait(T.stockZoom);
          board.dance(winner.id, T.victory);
          confettiRain(hud.root, T.victory + 600);
          fireworks(hud.root, T.victory - 800);
          hud.banner(`${winner.name} wins!`, PLAYER_COLORS[winner.color], T.victory);
          await this.wait(T.victory);
          board.lookAt = null;
        }
        await this.wait(T.gameOver);
        showResults(hud, G, () => {
          this.destroy();
          this.onExit();
        });
        break;
      }
      case 'log': {
        hud.refreshLog();
        // The landing itself already announced this; the structured log keeps its history.
        if (e.action === 'land') break;
        if (e.text === this.suitMessage) {
          this.suitMessage = null;
          break;
        }
        const payments = this.summarizedPayments.filter((p) => paymentLogMatches(G, p, e.text));
        if (payments.length) {
          this.summarizedPayments = this.summarizedPayments.filter((p) => !payments.includes(p));
          break;
        }
        // The venture card itself was already on screen with the board.
        if (e.text.startsWith('Venture card: ')) break;
        if (e.text.endsWith("'s trade.") && e.text.includes(' accepted ')) this.tradeAnimating = true;
        if (e.text.endsWith("'s trade.") && (e.text.includes(' accepted ') || e.text.includes(' declined ')))
          hud.action('trade', e.text, e.kind);
        else hud.tick(e.text, e.kind, T.actionResult, this.passing);
        break;
      }
      case 'notice':
        hud.tick(e.text, 'alert');
        break;
    }
    // A district's stock moving is shown as soon as it happens, even mid-walk (the walk waits for
    // it). An investment shows the shop's own value rising first: its 'value' event comes next.
    const investing = e.type === 'money' && e.reason === 'Investment';
    if (!investing && e.type !== 'gameOver') await this.announceStockMoves();
    // A new domination is celebrated once the action that made it is over (a trade or purchase
    // ends with its log line), never halfway through it.
    if (!this.tradeAnimating && (e.type === 'log' || e.type === 'trade' || e.type === 'auctionEnd'))
      await this.announceDominations();
  }

  /**
   * Someone now owns every property in a district: the camera frames it, a banner and a fanfare
   * play, and gold rings with sparkles burst from each of its squares.
   */
  private async announceDominations() {
    const G = this.G;
    if (G.over) return;
    const now = new Set<string>();
    G.groups.forEach((grp, g) => {
      const owner = G.nodes[grp[0]]?.owner ?? -1;
      if (owner >= 0 && dominated(G, owner, g)) now.add(`${owner}:${g}`);
    });
    const before = this.doms;
    this.doms = now;
    if (!before) return;
    for (const key of now) {
      if (before.has(key)) continue;
      const [pid, g] = key.split(':').map(Number);
      const p = G.players[pid];
      const ids = G.groups[g];
      const sq = G.nodes[ids[0]];
      const dist = sq.d >= 0 ? G.districts[sq.d] : null;
      const where = dist ? `${dist.name}` : 'a district';
      this.hud.action(
        `dominate:${key}`,
        `${p.name} dominates ${where}! Fees and values there jump up.`,
        'property',
      );
      this.board.lookAt = this.board.frameSquares(ids);
      await this.wait(T.stockZoom);
      sound.play('dominate');
      this.hud.banner(`${p.name} dominates ${where}!`, dist?.color ?? PLAYER_COLORS[p.color], T.stockRise);
      for (const [i, id] of ids.entries()) setTimeout(() => this.board.ring(id, '#ffd166', true), i * 120);
      this.board.stockFx(ids, T.stockRise, true);
      await this.wait(T.stockRise);
      this.board.lookAt = null;
      await this.wait(T.stockZoom);
      if (this.dead) return;
    }
  }

  /**
   * A district's stock price moved (for any reason): the camera frames its squares, a banner
   * (like the turn banner) gives the old and new price, and arrows rise from the squares (or sink,
   * for a fall).
   */
  private async announceStockMoves() {
    const G = this.G;
    if (G.rules !== 'standard' || G.over) return;
    const now = G.districts.map((_, d) => stockPrice(G, d));
    if (this.prices.length !== now.length) {
      this.prices = now;
      this.syncStock();
      return;
    }
    const before = this.prices.slice();
    for (let d = 0; d < now.length; d++) {
      if (now[d] === before[d]) continue;
      const up = now[d] > before[d];
      const ids = G.nodes.filter((s) => s.d === d).map((s) => s.id);
      if (!ids.length) continue;
      const dist = G.districts[d];
      this.hud.action(
        `stock-change:${d}:${now[d]}`,
        `${dist.name} stock ${up ? 'rose' : 'fell'}: ${fmt(before[d])} → ${fmt(now[d])}.`,
        'stock',
      );
      this.board.lookAt = this.board.frameSquares(ids);
      await this.wait(T.stockZoom);
      sound.play(up ? 'grow' : 'pay');
      this.hud.banner(
        `${dist.name} stock ${up ? 'up' : 'down'}! ${fmt(before[d])} → ${fmt(now[d])}`,
        dist.color,
        T.stockRise,
      );
      this.board.stockFx(ids, T.stockRise, up);
      await this.wait(T.stockRise);
      // The new price has been shown: now the shareholders' net worth follows it.
      this.prices[d] = now[d];
      this.syncStock();
      this.hud.render(G);
      this.board.lookAt = null;
      await this.wait(T.stockZoom);
      if (this.dead) return;
    }
  }
}

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}
