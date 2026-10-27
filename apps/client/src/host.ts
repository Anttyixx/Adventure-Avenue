/**
 * Hot-seat host: runs the rules engine locally and answers its decision requests from the UI
 * (humans) or the CPU rules, and turns engine events into animations.
 */
import {
  Game,
  netWorth,
  K,
  PLAYER_COLORS,
  cpuDecide,
  type DecisionAnswer,
  type DecisionKind,
  type DecisionRequest,
  type GameEvent,
  type GameIO,
  type GameState,
} from '@aa/engine';
import { BoardView, ZOOM_STEP } from './board';
import { shortName, squareName } from './names';
import { clearSave, saveGame } from './save';
import { SUIT_CHARS } from './icons';
import { FAST_CPU_SPEED, TIMING as T } from './timing';
import { fmt, h } from './ui/dom';
import { DerbyView, MemoryView, ReelsView, VentureView } from './ui/games';
import { Hud, type PromptButton } from './ui/hud';
import { buildPrompt, districtStockModal, rulesModal, stockModal } from './ui/modals';
import { showResults } from './ui/results';
import { investOnBoard } from './ui/invest';
import { AuctionView } from './ui/auction';
import { activity, PRE_ROLL_STEPS } from './ui/activity';
import {
  answerTradeOnBoard,
  auctionOnBoard,
  buyoutPrompt,
  cannonOnBoard,
  costChips,
  debtOnBoard,
  question,
  renovateOnBoard,
  tradeOnBoard,
  type PickCtx,
} from './ui/pick';
import { sound } from './audio';
import { closeSoundPopover } from './ui/soundpanel';
import type { GameLink } from './net/link';
import { inviteURL } from './net/protocol';
import { IS_DEV_BUILD } from './build';

const FAST_KEY = 'adventure-avenue-fast';

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
  venture: VentureView | null = null;
  reels: ReelsView | null = null;
  memory: MemoryView | null = null;
  derby: DerbyView | null = null;
  /** Square values as last shown, to animate how much each one changed. */
  values = new Map<number, number>();
  /** The live auction window while an auction runs. */
  auction: AuctionView | null = null;
  /** True while a token is between squares of a walk (passing, not landing). */
  private passing = false;
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
  ) {
    this.root = h('div', { class: 'game' });
    parent.append(this.root);
    const boardHost = h('div', { class: 'board-host' });
    this.root.append(boardHost);
    this.board = new BoardView(boardHost);
    this.hud = new Hud(this.root, this.board, {
      onToggleFast: () => this.toggleFast(),
      onQuit: () => this.quit(),
      quitQuestion: () => this.quitQuestion(),
      onRules: () => rulesModal(this.hud, this.G),
    });
    // Online, this device's own player's card sits at the bottom of the stack.
    if (link) this.hud.myPid = this.G.players.find((p) => this.localHuman(p.id))?.id ?? -1;
    this.game = new Game(G, this);
    if (link) this.hud.setRoom(link.code, inviteURL(link.code));
    // Dev builds expose the running game for automated tests.
    if (IS_DEV_BUILD) (window as unknown as { __aaGame?: HotSeat }).__aaGame = this;
    this.board.setState(G);
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
    this.checkWinReady(true);
    try {
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

  destroy() {
    this.dead = true;
    closeSoundPopover();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.checkOrientation);
    this.board.destroy();
    this.hud.destroy();
    this.root.remove();
  }

  private onKey = (e: KeyboardEvent) => {
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
    sound.music(this.winReady.size ? 'urgent' : 'game');
  }

  wait(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms * this.speed));
  }

  refresh() {
    // Values that changed without a value event (purchases, sales) are not animated.
    for (const n of this.G.nodes) if (!this.values.has(n.id) || n.owner < 0) this.values.set(n.id, n.value);
    this.board.dirty = true;
    this.board.snapTokens();
    this.hud.render(this.G);
    if (!this.dead) this.checkWinReady();
  }

  playerPos(pid: number) {
    return pid < 0 ? this.board.bankPos() : this.board.tokenPos(pid);
  }

  // ------------------------------------------------------------ decisions

  async decide<T extends DecisionKind>(req: DecisionRequest<T>): Promise<DecisionAnswer<T>> {
    if (this.dead) return never();
    const seq = this.seq++;
    if (this.link) return (await this.decideOnline(seq, req as DecisionRequest)) as DecisionAnswer<T>;
    const p = this.G.players[req.pid];
    if (req.kind === 'bid' && !this.localHuman(p.id)) this.auction?.waiting(p.id);
    if (p.cpu) {
      this.spectate(req as DecisionRequest);
      const ans = cpuDecide(this.G, req);
      this.waitOn(req as DecisionRequest);
      await this.showCpu(req as DecisionRequest, ans);
      if (this.dead) return never();
      return ans;
    }
    if (this.humans > 1 && this.holder !== p.id) {
      await this.hud.passDevice(p);
      this.holder = p.id;
    }
    this.holder = p.id;
    const ans = await this.askHuman(req as DecisionRequest);
    if (this.dead) return never();
    return ans as DecisionAnswer<T>;
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
    if (req.kind === 'bid' && who !== 'local') this.auction?.waiting(req.pid);
    if (who !== 'local') this.spectate(req);
    if (link.role === 'host') {
      let ans: unknown;
      if (who === 'local') {
        ans = await this.askHuman(req);
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
      const mine = await this.askHuman(req);
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

  /** Say on the status line (and in the log) what the game is waiting on this player to do. */
  private waitOn(req: DecisionRequest) {
    const a = activity(this.G, req);
    this.hud.status(a.text, a.kind);
  }

  /** A choice for a player on this device. */
  private async askHuman(req: DecisionRequest) {
    this.waitOn(req);
    return this.human(req);
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
        break;
      case 'reels':
        this.reels?.m.close();
        this.reels = new ReelsView(this.hud, req.strips, p.name);
        this.reels.watch(p.name);
        break;
      case 'memory':
        this.memory?.m.close();
        this.memory = new MemoryView(this.hud, req.prizes, p.name);
        this.memory.watch(p.name);
        break;
      case 'pickRacer':
        this.derby?.m.close();
        this.derby = new DerbyView(this.hud, G, p.name);
        this.derby.watch(p.name);
        break;
    }
  }

  /** Give CPU choices a beat so players can follow along. */
  private async showCpu(req: DecisionRequest, ans: unknown) {
    const p = this.G.players[req.pid];
    switch (req.kind) {
      case 'path': {
        this.board.setChoices(
          req.dests.map((d) => d.node),
          PLAYER_COLORS[p.color],
          () => {},
          new Map(req.dests.map((d) => [d.node, d.path])),
        );
        this.board.previewRoute(ans as number);
        await this.wait(T.cpuPath);
        this.board.clearChoices();
        this.board.walkTarget = ans as number;
        this.board.glowColor = PLAYER_COLORS[p.color];
        break;
      }
      case 'preRoll':
        await this.wait(T.cpuPreRoll);
        break;
      case 'venturePanel':
      case 'pickRacer':
        await this.wait(T.cpuDecision);
        break;
      case 'reels':
        // Let the reels spin a moment before the result.
        await this.wait(T.cpuPath);
        break;
      case 'memory':
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
        const node = await hud.prompt<number>(
          `${p.name} rolled ${req.steps}. Tap a glowing square to move there.`,
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
          question(`Buy this ${shortName(G, G.nodes[req.sq])}?`, costChips('Price', req.price, p.cash)),
          [
            { label: 'Buy', value: true, main: true },
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
          question('Upgrade your circus?', costChips('Cost', req.cost, p.cash)),
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
        return this.venture.pick();

      case 'reels':
        this.reels = new ReelsView(hud, req.strips, p.name);
        return this.reels.play();

      case 'memory':
        this.memory = new MemoryView(hud, req.prizes, p.name);
        return this.memory.play();

      case 'pickRacer':
        this.derby = new DerbyView(hud, G, p.name);
        return this.derby.pick();

      case 'pickSquare': {
        const text = {
          balloon: 'Fly to any square.',
          zoom: 'Zoom to any square.',
          agency: 'Pick an unowned shop to buy at its value.',
          forcedBuyout: "Pick a rival's shop to buy for 5x its value.",
        }[req.purpose];
        const price = (id: number) =>
          req.purpose === 'forcedBuyout' ? G.nodes[id].value * K.buyoutX : G.nodes[id].value;
        const labels =
          req.purpose === 'forcedBuyout' || req.purpose === 'agency'
            ? new Map(req.options.map((id) => [id, fmt(price(id))]))
            : undefined;
        this.board.setChoices(req.options, PLAYER_COLORS[color], (id) => hud.resolvePrompt(id), undefined, {
          labels,
        });
        const buttons: PromptButton<number | null>[] =
          req.options.length <= 6
            ? req.options.map((id) => ({ label: squareName(G, G.nodes[id]), value: id }))
            : [];
        if (req.optional) buttons.push({ label: 'Skip', value: null, secondary: true });
        const id = await hud.prompt(`${text} Tap a glowing square.`, buttons, color);
        this.board.clearChoices();
        return id;
      }

      case 'cannonTarget':
        return cannonOnBoard(this.pick, p, req.options);

      case 'pickDistrict':
        // The stock screen with the amount fixed: pick the district on its map or list.
        return districtStockModal(hud, G, p, req.purpose);

      case 'answerTrade':
        return answerTradeOnBoard(this.pick, req.offer, req.canCounter);

      case 'bid': {
        // Bids are made in the live auction window everyone can see.
        if (this.auction) return this.auction.ask(req);
        const sq = G.nodes[req.sq];
        return hud.prompt(
          question(`Bid on the ${shortName(G, sq)}?`, [
            ['Value', fmt(sq.value)],
            ...(req.highBidder >= 0
              ? [[`High bid (${G.players[req.highBidder].name})`, fmt(req.high)] as [string, string]]
              : []),
            ['Your bid', fmt(req.bid), 'big'],
          ]),
          [
            { label: `Bid ${fmt(req.bid)}`, value: true, main: true },
            { label: 'Pass', value: false, secondary: true },
          ],
          color,
        );
      }

      case 'debt':
        return debtOnBoard(this.pick, p, req.assets);
    }
  }

  // ------------------------------------------------------------ events

  async emit(e: GameEvent): Promise<void> {
    if (this.dead) return never();
    if (this.link) this.updateSpeed();
    const G = this.G;
    const board = this.board;
    const hud = this.hud;
    switch (e.type) {
      case 'turnStart': {
        // A beat at the end of the previous turn before the next player starts.
        if (board.activePid >= 0 && board.activePid !== e.pid) await this.wait(T.turnEnd);
        this.link?.turnStart(this.seq, G);
        if (this.saving) saveGame(G, this.link?.saveInfo?.());
        const p = G.players[e.pid];
        board.activePid = e.pid;
        board.followPid = e.pid;
        board.walkTarget = -1;
        hud.activePid = e.pid;
        this.updateSpeed();
        this.refresh();
        if (this.localHuman(p.id)) sound.play('turn');
        hud.banner(`${p.name}'s turn`, PLAYER_COLORS[p.color], T.turnBanner);
        hud.status(`${p.name} is deciding what to do...`, 'wait');
        await this.wait(p.cpu ? T.turnStartCpu : T.turnStartHuman);
        break;
      }
      case 'roundStart':
        sound.play('round');
        hud.banner(`Round ${e.round}`, '#ffd166', T.roundBanner);
        this.refresh();
        break;
      case 'roll':
        hud.status(`${G.players[e.pid].name} is rolling...`, 'move');
        sound.play('roll');
        await board.rollDie(e.value);
        break;
      case 'step':
        // A small sound as the hop starts; the step sounds as the token lands on the square.
        hud.status(`${G.players[e.pid].name} is moving...`, 'move');
        sound.play('hop');
        await board.step(e.pid, e.to, e.left);
        sound.play('step');
        // Mid-walk, tolls and value bumps play as the token passes without stopping it.
        this.passing = e.left > 0;
        if (e.left === 0) board.walkTarget = -1;
        break;
      case 'warp':
        sound.play('warp');
        await board.warp(e.pid, e.to);
        this.refresh();
        break;
      case 'land':
        sound.play('land');
        board.ring(e.sq, '#ffffff');
        board.walkTarget = -1;
        await this.wait(T.land);
        break;
      case 'money': {
        // Buying something: a beat after the choice before the coins go to the bank.
        if (['Purchase', 'Construction', 'Buyout', 'Renovation'].includes(e.reason))
          await this.wait(T.beforePay);
        const from = this.playerPos(e.from);
        const to = this.playerPos(e.to);
        sound.play(e.to >= 0 && (e.from < 0 || !G.players[e.to].cpu) ? 'coin' : 'pay');
        board.coins(from, to, Math.ceil(e.amount / 50));
        if (e.to >= 0) board.floatText(to.x, to.y, `+${fmt(e.amount)}`, '#7cf29a');
        if (e.from >= 0) board.floatText(from.x, from.y + 22, `-${fmt(e.amount)}`, '#ff8a8a');
        this.refresh();
        if (!this.passing) await this.wait(T.money);
        break;
      }
      case 'owner':
        this.values.set(e.sq, G.nodes[e.sq].value);
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
        if (!this.passing) await this.wait(T.value);
        break;
      case 'suit': {
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
        await this.wait(T.suit);
        break;
      }
      case 'promote': {
        const p = G.players[e.pid];
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
        const p = G.players[e.pid];
        sound.play('venture');
        const view = this.venture ?? new VentureView(hud, G, e.pid);
        this.venture = null;
        await view.reveal(e.panel, e.title, e.text, e.lines, e.bonus, this.localHuman(p.id), this.speed);
        this.refresh();
        break;
      }
      case 'reels': {
        const p = G.players[e.pid];
        const view = this.reels ?? new ReelsView(hud, [e.result, e.result, e.result], p.name);
        this.reels = null;
        await view.show(e.result, e.prize, this.localHuman(p.id), this.speed);
        this.refresh();
        break;
      }
      case 'memory': {
        const p = G.players[e.pid];
        const view = this.memory ?? new MemoryView(hud, e.prizes, p.name);
        this.memory = null;
        if (!this.localHuman(p.id)) await view.hide(this.speed);
        await view.show(e.picked, e.prize, this.localHuman(p.id), this.speed);
        this.refresh();
        break;
      }
      case 'derby': {
        const lander = G.players[this.game.current.id];
        const view = this.derby ?? new DerbyView(hud, G, lander.name);
        this.derby = null;
        await view.race(e.backers, e.frames, e.coins, e.winner, this.localHuman(lander.id), this.speed);
        this.refresh();
        break;
      }
      case 'auctionStart':
        this.auction?.end(-1, 0, 0);
        this.auction = new AuctionView(hud, G, e.sq, e.seller, e.opening, e.bidders);
        board.setChoices([e.sq], '#ffd166', () => {}, undefined, { pins: false });
        await this.wait(T.cpuDecision);
        break;
      case 'auctionBid':
        this.auction?.bid(e.pid, e.bid, e.raised);
        await this.wait(T.cpuDecision * 0.6);
        break;
      case 'auctionEnd': {
        const view = this.auction;
        this.auction = null;
        this.refresh();
        await view?.end(e.winner, e.price, T.cpuResult * this.speed);
        board.clearChoices();
        break;
      }
      case 'trade':
        this.refresh();
        break;
      case 'closed': {
        this.refresh();
        const shut = G.nodes.filter((sq) => e.pids.includes(sq.owner)).map((sq) => sq.id);
        await board.closeShops(shut);
        break;
      }
      case 'opened': {
        const open = G.nodes.filter((sq) => e.pids.includes(sq.owner)).map((sq) => sq.id);
        await board.openShops(open);
        this.refresh();
        break;
      }
      case 'bankrupt': {
        const p = G.players[e.pid];
        sound.play('bankrupt');
        hud.banner(`${p.name} went bankrupt!`, '#e5484d', T.bankruptBanner);
        this.refresh();
        await this.wait(T.bankrupt);
        break;
      }
      case 'gameOver':
        if (this.saving) clearSave();
        sound.music(null);
        sound.play('win');
        board.activePid = -1;
        this.refresh();
        await this.wait(T.gameOver);
        showResults(hud, G, () => {
          this.destroy();
          this.onExit();
        });
        break;
      case 'log':
        hud.tick(e.text, e.kind);
        break;
      case 'notice':
        hud.tick(e.text, 'alert');
        break;
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
