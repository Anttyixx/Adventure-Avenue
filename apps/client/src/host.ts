/**
 * Hot-seat host: runs the rules engine locally and answers its decision requests from the UI
 * (humans) or the CPU rules, and turns engine events into animations.
 */
import {
  Game,
  PLAYER_COLORS,
  cpuDecide,
  stockPrice,
  type DecisionAnswer,
  type DecisionKind,
  type DecisionRequest,
  type GameEvent,
  type GameIO,
  type GameState,
} from '@aa/engine';
import { BoardView } from './board';
import { squareName } from './names';
import { clearSave, saveGame } from './save';
import { SUIT_CHARS } from './icons';
import { FAST_CPU_SPEED, TIMING as T } from './timing';
import { fmt, h } from './ui/dom';
import { DerbyView, MemoryView, ReelsView, VentureView } from './ui/games';
import { Hud, type PromptButton } from './ui/hud';
import {
  answerTradeModal,
  auctionPickModal,
  buildModal,
  debtModal,
  investModal,
  renovateModal,
  rulesModal,
  stockModal,
  tradeModal,
} from './ui/modals';
import { showResults } from './ui/results';

const VIEW_KEY = 'adventure-avenue-view';
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

  constructor(
    parent: HTMLElement,
    public G: GameState,
    private onExit: () => void,
    /** Test plays from the board editor do not touch the saved game. */
    private saving = true,
  ) {
    this.root = h('div', { class: 'game' });
    parent.append(this.root);
    const boardHost = h('div', { class: 'board-host' });
    this.root.append(boardHost);
    this.board = new BoardView(boardHost);
    this.hud = new Hud(this.root, this.board, {
      onToggleView: () => this.toggleView(),
      onToggleFast: () => this.toggleFast(),
      onQuit: () => this.quit(),
      onRules: () => rulesModal(this.hud, this.G),
    });
    this.game = new Game(G, this);
    this.board.setState(G);
    this.hud.render(G);
    const view = readPref(VIEW_KEY) === 'full' ? 'full' : 'follow';
    this.board.setMode(view);
    this.hud.setViewLabel(view);
    this.fast = readPref(FAST_KEY) === '1';
    this.hud.setFastLabel(this.fast);
    window.addEventListener('keydown', this.onKey);
    this.setupOrientation();
  }

  get humans() {
    return this.G.players.filter((p) => !p.cpu && !p.bankrupt).length;
  }

  async start() {
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
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.checkOrientation);
    this.board.destroy();
    this.hud.destroy();
    this.root.remove();
  }

  private onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'v' || e.key === 'V') this.toggleView();
  };

  toggleView() {
    const m = this.board.mode === 'follow' ? 'full' : 'follow';
    this.board.setMode(m);
    this.hud.setViewLabel(m);
    writePref(VIEW_KEY, m);
  }

  toggleFast() {
    this.fast = !this.fast;
    this.hud.setFastLabel(this.fast);
    writePref(FAST_KEY, this.fast ? '1' : '0');
    this.updateSpeed();
  }

  updateSpeed() {
    const p = this.game.current;
    this.speed = this.fast && p?.cpu ? FAST_CPU_SPEED : 1;
    this.board.speed = this.speed;
  }

  quit() {
    if (
      !this.G.over &&
      !window.confirm('Quit to the start screen? The game is saved at the start of each turn.')
    )
      return;
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

  wait(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms * this.speed));
  }

  refresh() {
    this.board.dirty = true;
    this.board.snapTokens();
    this.hud.render(this.G);
  }

  playerPos(pid: number) {
    return pid < 0 ? this.board.bankPos() : this.board.tokenPos(pid);
  }

  // ------------------------------------------------------------ decisions

  async decide<T extends DecisionKind>(req: DecisionRequest<T>): Promise<DecisionAnswer<T>> {
    if (this.dead) return never();
    const p = this.G.players[req.pid];
    if (p.cpu) {
      const ans = cpuDecide(this.G, req);
      await this.showCpu(req as DecisionRequest, ans);
      if (this.dead) return never();
      return ans;
    }
    if (this.humans > 1 && this.holder !== p.id) {
      this.hud.status('');
      await this.hud.passDevice(p);
      this.holder = p.id;
    }
    this.holder = p.id;
    const ans = await this.human(req as DecisionRequest);
    if (this.dead) return never();
    return ans as DecisionAnswer<T>;
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
        this.hud.status(`${p.name} is thinking...`, p.color);
        await this.wait(T.cpuPreRoll);
        break;
      case 'venturePanel':
      case 'reels':
      case 'memory':
      case 'pickRacer':
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
          const buttons: PromptButton<string>[] = [{ label: 'Roll', value: 'roll', main: true }];
          if (req.canStock) buttons.push({ label: 'Sell stock', value: 'sell' });
          if (req.canTrade) buttons.push({ label: 'Trade', value: 'trade' });
          if (req.canAuction) buttons.push({ label: 'Auction', value: 'auction' });
          if (req.canRenovate) buttons.push({ label: 'Renovate', value: 'renovate' });
          const a = await hud.prompt(`${p.name}, it's your turn.`, buttons, color);
          if (a === 'roll') return { act: 'roll' };
          if (a === 'sell') {
            const r = await stockModal(hud, G, p, 'sell');
            if (r) return { act: 'sellStock', ...r };
          } else if (a === 'trade') {
            const offer = await tradeModal(hud, G, p);
            if (offer) return { act: 'trade', offer };
          } else if (a === 'auction') {
            const sq = await auctionPickModal(hud, G, p);
            if (sq != null) return { act: 'auction', sq };
          } else if (a === 'renovate') {
            const r = await renovateModal(hud, G, p);
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
          `Buy this ${squareName(G, G.nodes[req.sq])} for ${fmt(req.price)}? (You have ${fmt(p.cash)})`,
          [
            { label: 'Buy', value: true, main: true },
            { label: 'Pass', value: false, secondary: true },
          ],
          color,
        );

      case 'build':
        return buildModal(hud, req.options, `Build on the vacant plot (you have ${fmt(p.cash)})`);

      case 'invest':
        return investModal(hud, G, req.shops, req.max);

      case 'buyout':
        return hud.prompt(
          `Buy out ${G.players[G.nodes[req.sq].owner].name}'s shop for ${fmt(req.price)}?`,
          [
            { label: 'Buy out', value: true },
            { label: 'No thanks', value: false, main: true },
          ],
          color,
        );

      case 'circusUpgrade':
        return hud.prompt(
          `Upgrade your circus for ${fmt(req.cost)}?`,
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
        this.board.setChoices(req.options, PLAYER_COLORS[color], (id) => hud.resolvePrompt(id));
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
        return hud.prompt(
          'The cannon! Pick a player to fly to.',
          req.options.map((id) => ({ label: G.players[id].name, value: id })),
          color,
        );

      case 'pickDistrict': {
        const text = {
          free20: 'Pick a district for 20 free shares.',
          up20: 'Pick a district whose stock rises 20%.',
          down20: 'Pick a district whose stock falls 20%.',
        }[req.purpose];
        return hud.prompt(
          text,
          req.options.map((d) => ({ label: `${G.districts[d].name} ${fmt(stockPrice(G, d))}`, value: d })),
          color,
        );
      }

      case 'answerTrade':
        return answerTradeModal(hud, G, req.offer);

      case 'bid': {
        const sq = G.nodes[req.sq];
        const high =
          req.highBidder >= 0 ? ` High bid: ${fmt(req.high)} by ${G.players[req.highBidder].name}.` : '';
        return hud.prompt(
          `Auction: ${squareName(G, sq)} (value ${fmt(sq.value)}).${high} Bid ${fmt(req.bid)}?`,
          [
            { label: `Bid ${fmt(req.bid)}`, value: true, main: true },
            { label: 'Pass', value: false, secondary: true },
          ],
          color,
        );
      }

      case 'debt':
        return debtModal(hud, G, p, req.assets);
    }
  }

  // ------------------------------------------------------------ events

  async emit(e: GameEvent): Promise<void> {
    if (this.dead) return never();
    const G = this.G;
    const board = this.board;
    const hud = this.hud;
    switch (e.type) {
      case 'turnStart': {
        if (this.saving) saveGame(G);
        const p = G.players[e.pid];
        board.activePid = e.pid;
        board.followPid = e.pid;
        board.walkTarget = -1;
        hud.activePid = e.pid;
        this.updateSpeed();
        this.refresh();
        hud.banner(`${p.name}'s turn`, PLAYER_COLORS[p.color], T.turnBanner);
        hud.status(`${p.name}'s turn`, p.color);
        await this.wait(p.cpu ? T.turnStartCpu : T.turnStartHuman);
        break;
      }
      case 'roundStart':
        hud.banner(`Round ${e.round}`, '#ffd166', T.roundBanner);
        this.refresh();
        break;
      case 'roll':
        await board.rollDie(e.value);
        break;
      case 'step':
        await board.step(e.pid, e.to, e.left);
        if (e.left === 0) board.walkTarget = -1;
        break;
      case 'warp':
        await board.warp(e.pid, e.to);
        this.refresh();
        break;
      case 'land':
        board.ring(e.sq, '#ffffff');
        board.walkTarget = -1;
        await this.wait(T.land);
        break;
      case 'money': {
        const from = this.playerPos(e.from);
        const to = this.playerPos(e.to);
        board.coins(from, to, Math.ceil(e.amount / 50));
        if (e.to >= 0) board.floatText(to.x, to.y, `+${fmt(e.amount)}`, '#7cf29a');
        if (e.from >= 0) board.floatText(from.x, from.y + 22, `-${fmt(e.amount)}`, '#ff8a8a');
        this.refresh();
        await this.wait(T.money);
        break;
      }
      case 'owner':
        if (e.owner >= 0) board.ring(e.sq, '#ffd166', true);
        this.refresh();
        await this.wait(T.owner);
        break;
      case 'value':
        for (const id of e.sqs) board.ring(id, '#ffd166', true);
        this.refresh();
        await this.wait(T.value);
        break;
      case 'suit': {
        const pos = board.tokenPos(e.pid);
        board.floatText(
          pos.x,
          pos.y,
          e.suit >= 0 ? SUIT_CHARS[e.suit] : 'Wild card!',
          e.suit === 1 || e.suit === 2 ? '#ff6b6b' : '#ffffff',
        );
        this.refresh();
        await this.wait(T.suit);
        break;
      }
      case 'promote': {
        const p = G.players[e.pid];
        board.confetti(e.pid);
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
        const view = this.venture ?? new VentureView(hud, G, e.pid);
        this.venture = null;
        await view.reveal(e.panel, e.title, e.text, e.line, !p.cpu, this.speed);
        this.refresh();
        break;
      }
      case 'reels': {
        const p = G.players[e.pid];
        const view = this.reels ?? new ReelsView(hud, [e.result, e.result, e.result], p.name);
        this.reels = null;
        await view.show(e.result, e.prize, !p.cpu, this.speed);
        this.refresh();
        break;
      }
      case 'memory': {
        const p = G.players[e.pid];
        const view = this.memory ?? new MemoryView(hud, e.prizes, p.name);
        this.memory = null;
        if (p.cpu) await view.hide(this.speed);
        await view.show(e.picked, e.prize, !p.cpu, this.speed);
        this.refresh();
        break;
      }
      case 'derby': {
        const lander = G.players[this.game.current.id];
        const view = this.derby ?? new DerbyView(hud, G, lander.name);
        this.derby = null;
        await view.race(e.backers, e.frames, e.coins, e.winner, this.humans > 0, this.speed);
        this.refresh();
        break;
      }
      case 'auctionEnd':
      case 'trade':
        this.refresh();
        break;
      case 'bankrupt': {
        const p = G.players[e.pid];
        hud.banner(`${p.name} went bankrupt!`, '#e5484d', T.bankruptBanner);
        this.refresh();
        await this.wait(T.bankrupt);
        break;
      }
      case 'gameOver':
        if (this.saving) clearSave();
        board.activePid = -1;
        this.refresh();
        await this.wait(T.gameOver);
        showResults(hud, G, () => {
          this.destroy();
          this.onExit();
        });
        break;
      case 'log':
        hud.tick(e.text, e.color);
        break;
      case 'notice':
        hud.tick(e.text, e.pid);
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
