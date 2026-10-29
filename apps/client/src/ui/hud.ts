/**
 * Dark-glass overlays floating over the board: info chip, toolbar, action bar (the status line
 * when no options are up), Game log button (expands into the log), player cards, stock market and
 * menu pop-ups,
 * tooltip, modals and banners.
 */
import {
  PLAYER_COLORS,
  K,
  SUITS,
  canPromote,
  dominated,
  isClosed,
  maxValue,
  netWorth,
  ranking,
  squareFee,
  stockPrice,
  type GameState,
  type Player,
} from '@aa/engine';
import type { BoardView } from '../board';
import { soundControls } from './soundpanel';
import { squareInfo, squareName } from '../names';
import { boonIconURL, suitIconURL, wildIconURL } from '../icons';
import { portraitURL } from '../sprites';
import { clear, fmt, h } from './dom';
import { kindIcon, logView, namesInColor, type IconKind } from './log';
import { marketView } from './market';

export interface PromptButton<T> {
  label: string;
  value: T;
  main?: boolean;
  disabled?: boolean;
  secondary?: boolean;
  hover?: (on: boolean) => void;
  /** A picture above the label (e.g. a building), making it a picture button. */
  icon?: string;
  /** Shown on hover: what the option does. */
  title?: string;
  /** A red button (saying no to something costly). */
  danger?: boolean;
  /** A small line under a picture button's label (e.g. its price). */
  note?: string;
}

export interface HudCallbacks {
  onToggleFast(): void;
  /** Leave the game (already confirmed by the player). */
  onQuit(): void;
  onRules(): void;
  /** The menu opened (true) or closed: returns whether the game is paused while it is open. */
  onPause?(open: boolean): boolean;
  /** The question to confirm quitting with, or null to quit without asking (game over). */
  quitQuestion?(): string | null;
}

export class Hud {
  root: HTMLElement;
  toolbar = h('div', { class: 'toolbar' });
  /** Current zoom; tapping it zooms back in on the player. */
  zoomChip = h('button', { class: 'zoom-chip', title: 'Zoom: scroll, pinch or - / +. Tap to reset.' });
  /** The Game log button above the player cards; tapping it morphs it into the game log. */
  logButton = h('div', {
    class: 'log-btn glass',
    role: 'button',
    tabindex: '0',
    'aria-expanded': 'false',
  });
  logWrap = h('div', { class: 'lb-wrap' }, this.logButton);
  private logLabel = h('div', { class: 'lb-label' }, 'Game log');
  private lastAction: { text: string; kind?: IconKind } | null = null;
  private waiting: { text: string; kind?: IconKind } | null = null;
  /** The Game log button's place while folded (it is hidden while the log is open). */
  private lineRect = { top: 0, left: 0, right: 0, width: 0, height: 0 };
  /** How many log lines the open log last showed, so new ones can fade in. */
  private logSeen = -1;
  /** The action bar morphing between sizes (status line, options). */
  private askAnim: Animation | null = null;
  /** Round, target and rules, shown at the top of the game menu. */
  gameInfo = h('div', { class: 'gm-info' });
  /** The current player's options, centered near the bottom of the board. */
  ask = h('div', { class: 'prompt-center glass' });
  cardsWrap = h('div', { class: 'cards-wrap' });
  cards = h('div', { class: 'cards' });
  /** The game log inside the status line, shown while it is expanded. */
  logBox = h('div', { class: 'sb-log' });
  logOpen = false;
  /**
   * The info chip, top left: the game's name, the board, the round, the goal and (online) the
   * room code button.
   */
  infoChip = h('div', { class: 'info-chip glass' });
  private chipBoard = h('span', { class: 'gc-tag' });
  private chipGoal = h('span', { class: 'gc-tag' });
  private chipRound = h('span', { class: 'gc-tag' });
  roomBtn = h('button', { class: 'btn small ghost gc-room', hidden: true }, 'Room');
  /** Holds the status line just above the player cards, as wide as them. */
  logDock = h('div', { class: 'log-dock' });
  tooltip = h('div', { class: 'tooltip glass' });
  modalLayer = h('div', { class: 'modal-layer' });
  bannerLayer = h('div', { class: 'banner-layer' });
  G!: GameState;
  activePid = -1;
  /** This device's player in an online game (their card goes at the bottom), or -1. */
  myPid = -1;
  /** Extra space covered on the left (e.g. the UI Lab panel). */
  leftInset = 0;
  private shown = new Map<number, { nw: number; cash: number }>();
  private ranks = new Map<number, number>();
  /** Money popups currently floating beside each card (to stack them). */
  private pops = new Map<number, number>();
  private cardEls = new Map<number, HTMLElement>();
  /** What each card last showed, to skip rebuilding cards that did not change. */
  private cardSigs = new Map<number, string>();
  private promptResolve: ((v: any) => void) | null = null;
  private mainButton: HTMLButtonElement | null = null;
  fastBtn = h('button', { class: 'btn small' });

  constructor(
    parent: HTMLElement,
    public board: BoardView,
    cb: HudCallbacks,
  ) {
    this.root = h('div', { class: 'hud' });
    this.logButton.append(this.logBox, this.logLabel);
    this.logDock.append(this.logWrap);
    this.cardsWrap.append(this.cards);
    this.infoChip.append(
      h('span', { class: 'gc-title' }, 'Adventure Avenue'),
      this.chipBoard,
      this.chipRound,
      this.chipGoal,
      this.roomBtn,
    );
    // While it is the log, only its Close button folds it back.
    this.logButton.onclick = () => {
      if (!this.logOpen) this.toggleLog(true);
    };
    this.logButton.onkeydown = (e) => {
      if (e.target === this.logButton && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this.toggleLog();
      }
    };
    this.root.append(
      this.toolbar,
      h('div', { class: 'top-left' }, this.infoChip, this.marketBox),
      this.ask,
      this.cardsWrap,
      this.logDock,
      this.tooltip,
      this.modalLayer,
      this.bannerLayer,
    );
    parent.append(this.root);

    this.cb = cb;
    this.fastBtn.onclick = cb.onToggleFast;
    this.zoomChip.onclick = () => (board.zoomOut = 0);
    board.onZoom = (pct) => (this.zoomChip.textContent = `${pct}%`);
    this.menuBtn.onclick = () => this.toggleMenu();
    this.marketBox.append(this.marketLabel, this.marketBody);
    this.marketBox.onclick = () => this.toggleMarket(true);
    this.marketBox.onkeydown = (e) => {
      if (e.target === this.marketBox && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this.toggleMarket(true);
      }
    };
    this.toolbar.append(this.zoomChip, this.menuBtn);
    this.buildMenu();
    window.addEventListener('keydown', this.onKey);
    board.onHover = (id, x, y) => this.showTooltip(id, x, y);
    const resize = new ResizeObserver(() => this.updateInsets());
    resize.observe(this.root);
    resize.observe(this.cardsWrap);
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }

  // ------------------------------------------------------------ game menu

  private cb: HudCallbacks;
  menuBtn = h(
    'button',
    { class: 'btn small menu-toggle', 'aria-haspopup': 'true', 'aria-expanded': 'false' },
    '☰ Menu',
  );
  /** The menu's contents, shown in a pop-up in the middle of the screen. */
  menu = h('div', { class: 'game-menu', role: 'menu' });
  private menuModal: { close(): void } | null = null;
  /** Shown in the menu while it has paused the game (games on this device). */
  private pausedNote = h('div', { class: 'gm-paused', hidden: true }, 'Game paused');
  /**
   * The Stock market button under the info chip (Standard rules only): tapping it morphs it into
   * the stock market panel in the top-left corner, and Close morphs it back.
   */
  marketBox = h('div', {
    class: 'market-box glass',
    role: 'button',
    tabindex: '0',
    'aria-expanded': 'false',
  });
  private marketLabel = h('div', { class: 'mb-label' }, 'Stock market');
  private marketBody = h('div', { class: 'mb-body' });
  marketOpen = false;
  /** The top-left corner's bottom edge with the market folded (opening it never moves the board). */
  private topLeftBottom = 0;

  /** The menu behind the Menu button: rules, settings and quit. */
  private buildMenu() {
    const item = (label: string, onclick: () => void, cls = '') =>
      h('button', { class: `gm-item ${cls}`, role: 'menuitem', onclick }, label);
    const close = (f: () => void) => () => {
      this.toggleMenu(false);
      f();
    };
    this.fastBtn.className = 'gm-item gm-toggle';
    this.menu.append(
      this.pausedNote,
      this.gameInfo,
      item(
        'Resume',
        close(() => {}),
        'resume',
      ),
      // Rules open over the menu, so the game stays paused while they are read.
      item('Rules', this.cb.onRules),
      this.fastBtn,
    );
    if (document.fullscreenEnabled) this.menu.append(item('Full screen', toggleFullscreen));
    this.menu.append(
      h('div', { class: 'gm-sound' }, h('div', { class: 'gm-label' }, 'Sound'), soundControls()),
      item('Quit game', () => this.confirmQuit(), 'danger'),
    );
  }

  /**
   * Open or close the menu: a pop-up in the middle of the screen, over everything. A game on this
   * device pauses while it is open.
   */
  toggleMenu(open = !this.menuModal) {
    if (open === !!this.menuModal) return;
    this.menuBtn.setAttribute('aria-expanded', String(open));
    this.menuBtn.classList.toggle('on', open);
    if (open) {
      const m = this.modal('Menu', this.menu, { onClose: () => this.toggleMenu(false) });
      m.el.classList.add('menu-modal');
      m.el.parentElement!.classList.add('menu-wrap');
      // Tapping outside the box closes it.
      m.el.parentElement!.addEventListener('pointerdown', (e) => {
        if (e.target === m.el.parentElement) this.toggleMenu(false);
      });
      this.menuModal = m;
    } else {
      this.menuModal?.close();
      this.menuModal = null;
    }
    this.pausedNote.hidden = !(this.cb.onPause?.(open) ?? false) || !open;
  }

  // ------------------------------------------------------------ stock market

  /** Morph the Stock market button into the market panel (top left), or back. */
  toggleMarket(open = !this.marketOpen) {
    if (open === this.marketOpen || (open && !this.G)) return;
    const box = this.marketBox;
    const from = { width: box.offsetWidth, height: box.offsetHeight };
    this.marketOpen = open;
    box.classList.toggle('open', open);
    box.setAttribute('aria-expanded', String(open));
    this.renderMarket();
    const to = { width: box.offsetWidth, height: box.offsetHeight };
    if (from.width && to.width && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      box.animate(
        [
          { width: `${from.width}px`, height: `${from.height}px` },
          { width: `${to.width}px`, height: `${to.height}px` },
        ],
        { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    }
  }

  /** Fill the open market panel (kept up to date as the game goes on). */
  private renderMarket() {
    const keep = this.marketBody.scrollTop;
    clear(this.marketBody);
    if (!this.marketOpen) return;
    this.marketBody.append(
      h(
        'div',
        { class: 'drawer-head' },
        h('h3', null, 'Stock market'),
        h(
          'button',
          {
            class: 'btn small ghost',
            onclick: (e: MouseEvent) => {
              // Keep the click from reaching the box, which would open it again.
              e.stopPropagation();
              this.toggleMarket(false);
            },
          },
          'Close',
        ),
      ),
      marketView(this.G, null),
    );
    this.marketBody.scrollTop = keep;
  }

  /** Ask before quitting, in a dialog over the menu. */
  confirmQuit() {
    const question = this.cb.quitQuestion?.() ?? 'Quit to the main menu?';
    if (question === null) return this.cb.onQuit();
    const m = this.modal(
      'Quit game?',
      h(
        'div',
        { class: 'quit-confirm' },
        h('p', null, question),
        h(
          'div',
          { class: 'btn-row' },
          h(
            'button',
            {
              class: 'btn danger',
              onclick: () => {
                m.close();
                this.toggleMenu(false);
                this.cb.onQuit();
              },
            },
            'Quit',
          ),
          h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Keep playing'),
        ),
      ),
    );
    m.el.classList.add('quit-modal');
  }

  private onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (e.key === 'Escape' && this.menuModal && !this.modalLayer.querySelector('.quit-modal')) {
      this.toggleMenu(false);
      return;
    }
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if ((e.key === 'Enter' || e.key === ' ') && !this.modalLayer.childElementCount && this.mainButton) {
      e.preventDefault();
      this.mainButton.click();
    }
  };

  setFastLabel(fast: boolean) {
    this.fastBtn.textContent = fast ? 'Fast CPU: on' : 'Fast CPU: off';
    this.fastBtn.classList.toggle('on', fast);
  }

  /** Tell the board which parts of the screen the overlays cover. */
  updateInsets() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const portraitStack = this.root.classList.contains('upright');
    // Where the action bar sits once shown (layout box, so the slide animation does not count).
    const a = this.ask;
    const ask = a.classList.contains('show') ? { top: a.offsetTop, height: a.offsetHeight } : null;
    // The status line (and the log it opens into) sits on the player cards, as wide as them.
    const cards = this.cardsWrap.getBoundingClientRect();
    this.root.style.setProperty('--cards-w', `${cards.width}px`);
    this.root.style.setProperty('--dock-b', `${H - cards.top + 6}px`);
    // Only the folded status line counts, so opening the log never moves anything.
    if (!this.logOpen) {
      const r = this.logButton.getBoundingClientRect();
      this.lineRect = { top: r.top, left: r.left, right: r.right, width: r.width, height: r.height };
    }
    const lineTop = this.lineRect.height ? this.lineRect.top : cards.top;
    // Upright phones: the options sit above the cards and the status line.
    if (portraitStack) this.root.style.setProperty('--cards-h', `${H - lineTop + 6}px`);
    const tools = this.toolbar.getBoundingClientRect();
    if (!this.marketOpen) this.topLeftBottom = this.infoChip.parentElement!.getBoundingClientRect().bottom;
    this.root.style.setProperty('--top-free', `${tools.bottom + 6}px`);
    let right = 0;
    if (!portraitStack && cards.width) right = Math.min(W * 0.4, W - cards.left + 8);
    const top = Math.min(ask ? ask.top : Infinity, portraitStack ? lineTop : Infinity);
    const bottom = H - top + 4;
    this.board.insets = {
      top: Math.max(tools.bottom, this.topLeftBottom) + 6,
      right,
      bottom: Math.max(0, bottom),
      left: this.leftInset,
    };
    // Center the options between the left edge (or lab panel) and the player cards.
    this.root.style.setProperty('--free-left', `${this.leftInset}px`);
    this.root.style.setProperty('--free-right', `${right}px`);
  }

  // ------------------------------------------------------------ state rendering

  render(G: GameState) {
    this.G = G;
    const roundText = G.roundCap
      ? `Round ${Math.min(G.round, G.roundCap)} / ${G.roundCap}`
      : `Round ${G.round}`;
    clear(this.gameInfo);
    this.gameInfo.append(
      h('span', null, roundText),
      h('span', null, `Target ${fmt(G.target)}`),
      h('span', null, G.rules === 'standard' ? 'Standard' : 'Easy'),
    );
    this.marketBox.hidden = G.rules !== 'standard';
    this.chipBoard.textContent = G.boardName ?? 'Town';
    clear(this.chipRound);
    this.chipRound.append(
      'Round ',
      h('b', null, G.roundCap ? `${Math.min(G.round, G.roundCap)} / ${G.roundCap}` : String(G.round)),
    );
    clear(this.chipGoal);
    this.chipGoal.append('Goal ', h('b', null, fmt(G.target)));
    this.renderCards();
    if (this.marketOpen) this.renderMarket();
    if (this.logOpen) this.renderLog();
  }

  renderCards() {
    const G = this.G;
    // Turn order, top to bottom. Online, the order is turned round so this device's player is
    // at the bottom, where they can always find their card; turns still go top to bottom.
    const ids = G.order.slice();
    const mine = ids.indexOf(this.myPid);
    if (mine >= 0) ids.push(...ids.splice(0, mine + 1));
    const order = ids.map((id) => G.players[id]);
    // Ranking by net worth (ties share a place).
    const ranked = ranking(G);
    this.ranks = new Map();
    ranked.forEach((p, i) => {
      const prev = ranked[i - 1];
      const same = prev && netWorth(G, prev) === netWorth(G, p);
      this.ranks.set(p.id, same ? this.ranks.get(prev.id)! : i + 1);
    });
    for (const p of order) {
      let el = this.cardEls.get(p.id);
      if (!el) {
        el = h('div', { class: 'pcard' });
        this.cardEls.set(p.id, el);
        this.cards.append(el);
      }
      this.fillCard(el, p);
    }
  }

  private fillCard(el: HTMLElement, p: Player) {
    const G = this.G;
    const nw = netWorth(G, p);
    const prev = this.shown.get(p.id) ?? { nw, cash: p.cash };
    const color = PLAYER_COLORS[p.color];
    el.style.setProperty('--pc', color);
    el.classList.toggle('active', p.id === this.activePid && !G.over);
    el.classList.toggle('bankrupt', p.bankrupt);
    const tags: string[] = [];
    if (p.boost > 1) tags.push('Fees +30%');
    if (p.bankrupt) tags.push('Bankrupt');
    // Reached the target: net worth and portrait pulse and glow (they win at the bank).
    const canWin = !p.bankrupt && nw >= G.target && !G.over;
    el.classList.toggle('can-win', canWin);
    el.title = canWin ? `${p.name} can win! Get to the bank.` : '';
    const rank = this.ranks.get(p.id);
    // Only rebuild the card when something on it changed: rebuilding restarts its animations
    // (the hopping suits) and reloads its images, which makes the card twitch.
    const sig = JSON.stringify([
      p.name,
      p.ch,
      p.level,
      p.suits,
      p.wild,
      p.boon,
      p.bankrupt,
      rank,
      tags,
      nw,
      p.cash,
    ]);
    if (this.cardSigs.get(p.id) === sig) return;
    this.cardSigs.set(p.id, sig);
    clear(el);
    const nwEl = h('span', { class: 'nw' }, plain(prev.nw));
    const cashEl = h('span', { class: 'cash' }, plain(prev.cash));
    const extras = tags.map((t) => h('span', { class: 'tag' }, t));
    const pct = Math.max(0, Math.min(100, (nw / G.target) * 100));
    el.append(
      h('div', { class: 'pc-side' }, h('img', { class: 'portrait', src: portraitURL(p.ch), alt: '' })),
      h(
        'div',
        { class: 'pc-main' },
        h(
          'div',
          { class: 'pc-row pc-top' },
          h('span', { class: 'lvl', title: `Level ${p.level}` }, `Lv ${p.level}`),
          h('span', { class: 'pname' }, p.name),
          // An active Boon or Boom shows as its symbol, like on the board.
          p.boon > 0
            ? h('img', {
                class: 'boon-ico',
                src: boonIconURL(p.boon === K.boom ? 'boom' : 'boon'),
                alt: p.boon === K.boom ? 'Boom' : 'Boon',
                title: `${p.boon === K.boom ? 'Boom' : 'Boon'}: ${Math.round(p.boon * 100)}% commission on every fee paid until their next turn`,
              })
            : null,
          // Suits (and wild cards) at the top right; they drop below a very long name.
          h(
            'span',
            {
              class: `suits ${canPromote(p) && !p.bankrupt ? 'ready' : ''}`,
              title: canPromote(p) ? 'All four suits: back to the bank to level up!' : null,
            },
            p.wild
              ? h(
                  'span',
                  { class: 'wild', title: `${p.wild} Suit Yourself card${p.wild > 1 ? 's' : ''}` },
                  h('img', { src: wildIconURL(), alt: 'Wild' }),
                  p.wild > 1 ? h('span', { class: 'wild-n' }, `x${p.wild}`) : null,
                )
              : null,
            ...SUITS.map((_, i) => h('img', { src: suitIconURL(i, p.suits[i]), alt: SUITS[i] })),
          ),
        ),
        extras.length ? h('div', { class: 'pc-row' }, ...extras) : null,
        // Progress toward the target net worth.
        h(
          'div',
          { class: 'bar-track', title: `${Math.round(pct)}% of the ${fmt(G.target)} target` },
          h('div', { class: 'bar-fill', style: `width:${pct}%` }),
        ),
        h(
          'div',
          { class: 'pc-row money' },
          // A coin in front of the cash, the player's place in front of their net worth.
          h(
            'span',
            { class: 'm-cash', title: 'Cash' },
            h('span', { class: 'gc', 'aria-hidden': 'true' }),
            cashEl,
          ),
          h(
            'span',
            { class: 'm-nw', title: 'Net worth' },
            rank && !p.bankrupt
              ? h('span', { class: `rank r${rank}`, title: `Rank ${rank}` }, ordinal(rank))
              : null,
            nwEl,
          ),
        ),
      ),
    );
    const delta = p.cash - prev.cash;
    if (delta && this.shown.has(p.id)) this.moneyPop(el, p.id, delta);
    countUp(nwEl, prev.nw, nw, plain);
    countUp(cashEl, prev.cash, p.cash, plain);
    this.shown.set(p.id, { nw, cash: p.cash });
  }

  /** "+120G" / "-50G" floating out beside a player's card. */
  private moneyPop(card: HTMLElement, pid: number, delta: number) {
    const r = card.getBoundingClientRect();
    if (!r.width) return;
    const host = this.root.getBoundingClientRect();
    const n = this.pops.get(pid) ?? 0;
    this.pops.set(pid, n + 1);
    const pop = h(
      'div',
      {
        class: `money-pop ${delta > 0 ? 'up' : 'down'}`,
        style: `right:${host.right - r.left + 8}px;top:${r.top - host.top + r.height / 2 - 14 + (n % 3) * 18}px`,
      },
      `${delta > 0 ? '+' : '-'}${fmt(Math.abs(delta))}`,
    );
    this.root.append(pop);
    setTimeout(() => {
      pop.remove();
      this.pops.set(pid, Math.max(0, (this.pops.get(pid) ?? 1) - 1));
    }, 2200);
  }

  // ------------------------------------------------------------ status line and log

  /** Show the last thing that happened on the status line (it ends any wait). */
  tick(text: string, kind?: IconKind) {
    this.lastAction = { text, kind };
    this.waiting = null;
    this.showStatus();
    if (this.logOpen) this.renderLog();
  }

  /** Online games: a button showing the room code, for anyone who needs to rejoin. */
  setRoom(code: string, link: string) {
    this.roomBtn.hidden = false;
    this.roomBtn.textContent = `Room ${code}`;
    this.roomBtn.onclick = () => {
      let copied = false;
      const copy = h('button', { class: 'btn' }, 'Copy invite link') as HTMLButtonElement;
      copy.onclick = async () => {
        try {
          if (navigator.share && 'ontouchstart' in window)
            await navigator.share({ title: 'Adventure Avenue', url: link });
          else await navigator.clipboard.writeText(link);
          copied = true;
          copy.textContent = copied ? 'Copied!' : copy.textContent;
        } catch {
          /* cancelled */
        }
      };
      const m = this.modal(
        'Room code',
        h(
          'div',
          { class: 'room-modal' },
          h('div', { class: 'room-code' }, h('small', null, 'Room code'), h('b', null, code)),
          h(
            'p',
            { class: 'hint' },
            'Anyone who drops out can rejoin: open the game, type this code in Join on the main menu and use the same name.',
          ),
          h(
            'div',
            { class: 'btn-row' },
            copy,
            h('button', { class: 'btn main', onclick: () => m.close() }, 'Close'),
          ),
        ),
      );
    };
  }

  /** Show what is going on now: the wait if the game is waiting, else the last action. */
  /**
   * When no options are up, the action bar is the status line: what is going on now (the wait
   * if the game is waiting, else the last action), easing to the new size.
   */
  private showStatus() {
    if (this.promptResolve) return;
    const from = this.askSize();
    this.fillStatus();
    this.morphAsk(from);
  }

  private fillStatus() {
    const a = this.ask;
    const cur = this.waiting ?? this.lastAction;
    clear(a);
    a.classList.remove('stacked');
    a.classList.add('status');
    a.style.removeProperty('--pc');
    a.classList.toggle('show', !!cur);
    if (cur) {
      a.append(
        h(
          'div',
          { class: 'prompt-text ask-status rise' },
          kindIcon(cur.kind),
          h('span', { class: 'tick-text' }, ...namesInColor(this.G, cur.text)),
        ),
      );
    }
  }

  /** The action bar's size now (mid-morph if one is running), or null while it is hidden. */
  private askSize() {
    const a = this.ask;
    const size = a.classList.contains('show') ? { w: a.offsetWidth, h: a.offsetHeight } : null;
    this.askAnim?.cancel();
    return size;
  }

  /** Ease the action bar from its old size to the size of its new content. */
  private morphAsk(from: { w: number; h: number } | null) {
    const a = this.ask;
    this.updateInsets();
    if (!from || !a.classList.contains('show') || matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    const to = { w: a.offsetWidth, h: a.offsetHeight };
    if (Math.abs(to.w - from.w) < 2 && Math.abs(to.h - from.h) < 2) return;
    a.classList.add('morphing');
    const anim = a.animate(
      [
        { width: `${from.w}px`, height: `${from.h}px`, minHeight: '0px' },
        { width: `${to.w}px`, height: `${to.h}px`, minHeight: '0px' },
      ],
      { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
    this.askAnim = anim;
    const end = () => {
      if (this.askAnim !== anim) return;
      this.askAnim = null;
      a.classList.remove('morphing');
      this.updateInsets();
    };
    anim.onfinish = end;
    anim.oncancel = end;
  }

  /** Expand the Game log button into the game log, or fold it back, morphing between the sizes. */
  toggleLog(open = !this.logOpen) {
    if (open === this.logOpen) return;
    const box = this.logButton;
    // Layout sizes, so the hover zoom does not count.
    const from = { width: box.offsetWidth, height: box.offsetHeight };
    this.logOpen = open;
    this.logWrap.classList.toggle('open', open);
    box.setAttribute('aria-expanded', String(open));
    this.logSeen = -1;
    this.renderLog(true);
    this.updateInsets();
    const to = { width: box.offsetWidth, height: box.offsetHeight };
    if (from.width && to.width && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      box.animate(
        [
          { width: `${from.width}px`, height: `${from.height}px` },
          { width: `${to.width}px`, height: `${to.height}px` },
        ],
        { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    }
  }

  private renderLog(toBottom = false) {
    if (!this.logOpen || !this.G) {
      clear(this.logBox);
      return;
    }
    const old = this.logBox.querySelector('.log-list');
    // Stay at the newest entries unless the reader scrolled up.
    const atBottom = !old || old.scrollHeight - old.scrollTop - old.clientHeight < 40;
    const keep = old?.scrollTop ?? 0;
    clear(this.logBox);
    const G = this.G;
    // Lines added since the last render fade in (in place of the waiting line they answer).
    const fresh = this.logSeen < 0 ? 0 : Math.max(0, G.log.length - this.logSeen);
    this.logSeen = G.log.length;
    const list = logView(G, `${G.round}:${G.turn}`, { waiting: this.waiting ?? undefined, fresh });
    this.logBox.append(
      h(
        'div',
        { class: 'drawer-head' },
        h('h3', null, 'Game log'),
        h(
          'button',
          {
            class: 'btn small ghost',
            onclick: (e: MouseEvent) => {
              e.stopPropagation();
              this.toggleLog(false);
            },
          },
          'Close',
        ),
      ),
      list,
    );
    list.scrollTop = toBottom || atBottom ? list.scrollHeight : keep;
  }

  // ------------------------------------------------------------ tooltip

  showTooltip(id: number | null, x: number, y: number) {
    if (id == null || !this.G) {
      this.tooltip.classList.remove('show');
      return;
    }
    const G = this.G;
    const sq = G.nodes[id];
    clear(this.tooltip);
    const owner = sq.owner >= 0 ? G.players[sq.owner] : null;
    const dColor = sq.d >= 0 ? (G.districts[sq.d]?.color ?? '#ccc') : '#8a94a8';
    const box = (label: string, value: string, cls = '') =>
      h('div', { class: `tt-box ${cls}` }, h('span', null, label), h('b', null, value));
    const boxes: HTMLElement[] = [];
    const extra: HTMLElement[] = [];
    if (sq.t === 'shop' || sq.t === 'plot') {
      if (sq.t === 'shop' || sq.b) boxes.push(box('Value', fmt(sq.value)));
      if (owner && sq.b !== 'agency') {
        const fee = sq.b === 'tax' ? '10% NW' : fmt(squareFee(G, sq));
        boxes.push(box(isClosed(owner) ? 'Fee (closed)' : 'Fee', fee, 'fee'));
      }
      if (sq.t === 'shop' || sq.b === 'star3') {
        boxes.push(box('Max value', fmt(maxValue(G, sq))));
        if (owner) boxes.push(box('Buyout (5x)', fmt(sq.value * K.buyoutX)));
        else boxes.push(box('Price', fmt(sq.value), 'fee'));
      }
      if (G.rules === 'standard' && sq.d >= 0) boxes.push(box('Stock', `${fmt(stockPrice(G, sq.d))}/share`));
      if (sq.g >= 0) {
        // Who owns the rest of the district, as dots in the owners' colors.
        const grp = G.groups[sq.g];
        const label = G.rules === 'standard' ? (G.districts[sq.d]?.name ?? 'District') : 'Row';
        extra.push(
          h(
            'div',
            { class: 'tt-district' },
            h('span', null, label),
            h(
              'span',
              { class: 'tt-dots' },
              ...grp.map((gid) => {
                const o = G.nodes[gid].owner;
                return h('i', { style: o >= 0 ? `background:${PLAYER_COLORS[G.players[o].color]}` : '' });
              }),
            ),
            owner && dominated(G, owner.id, sq.g) ? h('em', null, 'Dominated') : null,
          ),
        );
      }
    } else if (sq.t === 'change') {
      boxes.push(box('Offers', SUITS[G.changeSuit]));
    }
    this.tooltip.style.setProperty('--dc', dColor);
    this.tooltip.append(
      h('div', { class: 'tt-title' }, squareName(G, sq)),
      sq.t === 'shop' || sq.t === 'plot'
        ? h(
            'div',
            { class: 'tt-owner', style: owner ? `--pc:${PLAYER_COLORS[owner.color]}` : '' },
            owner
              ? [h('img', { src: portraitURL(owner.ch), alt: '' }), `Owned by ${owner.name}`]
              : 'For sale',
          )
        : '',
      boxes.length ? h('div', { class: 'tt-grid' }, ...boxes) : '',
      ...extra,
      sq.t === 'shop' || sq.t === 'plot' ? '' : h('p', { class: 'tt-info' }, squareInfo(G, sq)),
    );
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.tooltip.classList.add('show');
    // Below and right of the pointer; flip above or left when it would run off the screen.
    const tw = this.tooltip.offsetWidth;
    const th = this.tooltip.offsetHeight;
    const left = x + 14 + tw > W - 8 ? x - 14 - tw : x + 14;
    const top = y + 14 + th > H - 8 ? y - 14 - th : y + 14;
    this.tooltip.style.left = `${Math.max(8, Math.min(W - 8 - tw, left))}px`;
    this.tooltip.style.top = `${Math.max(8, Math.min(H - 8 - th, top))}px`;
  }

  // ------------------------------------------------------------ action bar

  /**
   * Show the current player's options in the action bar: a row centered at the bottom of the
   * screen, as wide as its content, sliding in and out. It keeps one height, growing up to 75%
   * taller when the content needs it. `text` may be rich content (a title and a strip of facts).
   */
  prompt<T>(text: string | Node, buttons: PromptButton<T>[], color?: number): Promise<T> {
    this.cancelPrompt();
    // The bar morphs from whatever it showed (the status line or other options) to these.
    const from = this.askSize();
    clear(this.ask);
    this.ask.classList.remove('status');
    this.ask.classList.add('show');
    // Picture buttons need the width: the question goes on one line above them.
    this.ask.classList.toggle(
      'stacked',
      buttons.some((b) => b.icon),
    );
    const head = h('div', { class: 'prompt-text rise' });
    if (color != null) {
      head.append(h('span', { class: 'dot', style: `background:${PLAYER_COLORS[color]}` }));
      this.ask.style.setProperty('--pc', PLAYER_COLORS[color]);
    }
    head.append(text);
    if (typeof text !== 'string') head.classList.add('rich');
    const row = h('div', { class: 'btn-row' });
    this.ask.append(head, row);
    this.mainButton = null;
    return new Promise<T>((resolve) => {
      this.promptResolve = resolve;
      for (const b of buttons) {
        const el = h(
          'button',
          {
            class: `btn ${b.main ? 'main nudge' : ''} ${b.secondary ? 'ghost' : ''} ${b.icon ? 'pic' : ''} ${b.danger ? 'no' : ''}`,
            disabled: !!b.disabled,
            title: b.title ?? null,
          },
          b.icon ? h('img', { src: b.icon, alt: '' }) : null,
          b.icon ? h('span', null, b.label) : b.label,
          b.icon && b.note ? h('small', { class: 'pic-note' }, b.note) : null,
        );
        el.onclick = () => {
          this.finishPrompt();
          resolve(b.value);
        };
        if (b.hover) {
          el.onmouseenter = () => b.hover!(true);
          el.onmouseleave = () => b.hover!(false);
          el.onfocus = () => b.hover!(true);
          el.onblur = () => b.hover!(false);
        }
        if (b.main) this.mainButton = el;
        row.append(el);
      }
      this.morphAsk(from);
    });
  }

  /** Resolve a pending prompt from outside (e.g. a click on the board). */
  resolvePrompt<T>(v: T) {
    const r = this.promptResolve;
    this.finishPrompt();
    r?.(v);
  }

  private finishPrompt() {
    this.promptResolve = null;
    this.mainButton = null;
    // Back to the status line.
    this.showStatus();
  }

  cancelPrompt() {
    this.promptResolve = null;
    this.mainButton = null;
  }

  /**
   * Show what the game is waiting on, e.g. "Rosa is buying stocks...". It stays until the next
   * action or wait replaces it, so the line never drops back to an older action in between.
   */
  status(text: string, kind?: IconKind) {
    // Repeats (e.g. one per step of a walk) leave the line as it is.
    if (this.waiting?.text === text && this.waiting.kind === kind) return;
    this.waiting = { text, kind };
    this.showStatus();
    if (this.logOpen) this.renderLog();
  }

  // ------------------------------------------------------------ modals and banners

  modal(title: string, body: Node, opts: { wide?: boolean | 'xl'; onClose?: () => void } = {}) {
    const box = h('div', {
      class: `modal glass ${opts.wide ? 'wide' : ''} ${opts.wide === 'xl' ? 'xl' : ''}`,
    });
    const head = h('div', { class: 'modal-head' }, h('h2', null, title));
    if (opts.onClose)
      head.append(h('button', { class: 'btn small ghost', onclick: () => opts.onClose!() }, 'Close'));
    box.append(head, body);
    const wrap = h('div', { class: 'modal-wrap' }, box);
    // Dialogs opened from the menu (quit, rules) go over it.
    if (this.menuModal) wrap.classList.add('over-menu');
    this.modalLayer.append(wrap);
    return {
      el: box,
      body,
      close: () => wrap.remove(),
    };
  }

  /** A blocking "pass the device" screen for hot-seat play. */
  passDevice(p: Player): Promise<void> {
    return new Promise((resolve) => {
      const btn = h('button', { class: 'btn main' }, `I'm ${p.name}`);
      const m = this.modal(
        'Pass the device',
        h(
          'div',
          { class: 'pass' },
          h('img', { class: 'portrait big', src: portraitURL(p.ch, 8), alt: '' }),
          h(
            'p',
            null,
            `Pass the device to `,
            h('b', { style: `color:${PLAYER_COLORS[p.color]}` }, p.name),
            '.',
          ),
          btn,
        ),
      );
      btn.onclick = () => {
        m.close();
        resolve();
      };
      btn.focus();
    });
  }

  banner(text: string, color?: string, ms = 1400) {
    const el = h('div', { class: 'banner', style: color ? `--bc:${color}` : '' }, text);
    this.bannerLayer.append(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 500);
  }
}

/** A number with thousands separators and no coin (the cards put the coin or rank in front). */
const plain = (n: number) => Math.round(n).toLocaleString('en-US');

function countUp(el: HTMLElement, from: number, to: number, f = fmt) {
  if (from === to) {
    el.textContent = f(to);
    return;
  }
  el.classList.add(to > from ? 'up' : 'down');
  const t0 = performance.now();
  const dur = 600;
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    el.textContent = f(from + (to - from) * k);
    if (k < 1) requestAnimationFrame(tick);
    else el.classList.remove('up', 'down');
  };
  requestAnimationFrame(tick);
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

function ordinal(n: number) {
  const s =
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${s}`;
}
