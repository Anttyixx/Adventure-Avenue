import { StatusMessages } from './status-messages';
/**
 * Dark-glass overlays floating over the board: info chip, toolbar (zoom chip, Guide, Menu),
 * action bar (the status line when no options are up), Game log button (expands into the log),
 * player cards, the info pop-up (game, stocks and players), menu pop-up, tooltip, modals
 * and banners. HotSeat (host.ts) drives it; `prompt()` is how most human decisions are asked.
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
import { bodyURL, portraitURL } from '../sprites';
import { clear, fmt, h } from './dom';
import { kindIcon, logView, namesInColor, type IconKind } from './log';
import { InfoPopup, type InfoPage } from './info';

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
  onGuide(): void;
  /** The menu opened (true) or closed: returns whether the game is paused while it is open. */
  onPause?(open: boolean): boolean;
  /** The question to confirm quitting with, or null to quit without asking (game over). */
  quitQuestion?(): string | null;
}

/** The narrowest a centered action bar may get before it moves to the bottom left corner. */
const AB_CENTER_MIN = 520;

/** The zoom chip's tooltip for each zoom mode. */
const ZOOM_TITLES = {
  free: 'Free zoom: scroll, pinch or - / +. Tap to zoom back in.',
  auto: 'Auto zoom: the game is showing part of the board. You can still zoom; tap to reset.',
  locked: 'Locked zoom: the game is showing something. Your zoom comes back in a moment.',
};

export class Hud {
  root: HTMLElement;
  toolbar = h('div', { class: 'toolbar' });
  /** Current zoom; tapping it zooms back in on the player. */
  zoomChip = h('button', { class: 'zoom-chip', title: 'Zoom: scroll, pinch or - / +. Tap to reset.' });
  /**
   * The View board chip: pops in left of the zoom chip while a pop-up (the stock market, the
   * venture board, an arcade game) is up. Tapping it hides the pop-up and shows the whole board;
   * tapping it again brings the pop-up back.
   */
  viewChip = h('button', { class: 'view-chip', hidden: true }, 'View board');
  /** Pop-ups offering the chip, newest last (the info pop-up can open over the stock market). */
  private peekTargets: { el: HTMLElement; onChange?: (peeking: boolean) => void }[] = [];
  private get peekTarget() {
    return this.peekTargets.at(-1) ?? null;
  }
  /** True while the player has hidden a pop-up to look at the board. */
  peeking = false;
  /** The Game log button in the toolbar (between the zoom chip and Guide); it opens the log panel. */
  logBtn = h(
    'button',
    { class: 'btn small log-toggle', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' },
    'Game log',
  );
  /** The game log: a panel in the top right, under the toolbar and above the player cards. */
  logPanel = h('div', { class: 'log-panel glass', role: 'dialog', 'aria-label': 'Game log', hidden: true });
  private messages = new StatusMessages(() => this.showStatus());
  private get waiting() {
    return this.messages.waiting;
  }
  private shownStatus: { text: string; kind?: IconKind } | null = null;
  /** How many log lines the open log last showed, so new ones can fade in. */
  private logSeen = -1;
  /** The action bar morphing between sizes (status line, options). */
  private askAnim: Animation | null = null;
  /** Holds the new content at its final width while the surrounding bar resizes. */
  private askContent: HTMLElement | null = null;
  private resize: ResizeObserver;
  private askChanges: MutationObserver;
  private askFrame = 0;
  /** Window width at which a centered action bar overflowed, so it stays bottom left at this size. */
  private abLeftAt = 0;
  /** Round, target and rules, shown at the top of the game menu. */
  gameInfo = h('div', { class: 'gm-info' });
  /** The current player's options, centered near the bottom of the board. */
  ask = h('div', { class: 'prompt-center glass' });
  cardsWrap = h('div', { class: 'cards-wrap' });
  cards = h('div', { class: 'cards' });
  /**
   * The Info button, right of the info chip: it opens the info pop-up (the game, the stock market
   * and each player), with the page picked in the action bar.
   */
  infoBtn = h(
    'button',
    {
      class: 'info-btn glass',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      title: 'Game, stock and player info',
    },
    h('span', { class: 'info-i', 'aria-hidden': 'true' }, 'i'),
    'Info',
  );
  /** The info pop-up's page while it is open ('game', 'stocks' or a player's id), else null. */
  infoPage: InfoPage | null = null;
  private info: InfoPopup;
  /** A property from a player's info page is being shown on the board. */
  private finding = false;
  /** The game log's contents (title, Close and the list), inside the log panel. */
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
    this.logPanel.append(this.logBox);
    this.cardsWrap.append(this.cards);
    this.infoChip.append(
      h('span', { class: 'gc-title' }, 'Adventure Avenue'),
      this.chipBoard,
      this.chipRound,
      this.chipGoal,
      this.roomBtn,
    );
    this.logBtn.onclick = () => this.toggleLog();
    this.root.append(
      this.toolbar,
      h('div', { class: 'top-left' }, h('div', { class: 'top-row' }, this.infoChip, this.infoBtn)),
      this.ask,
      this.cardsWrap,
      this.logPanel,
      this.tooltip,
      this.modalLayer,
      this.bannerLayer,
    );
    parent.append(this.root);
    this.info = new InfoPopup(this);
    this.infoBtn.onclick = () => this.toggleInfo(this.infoPage == null ? 'game' : null);

    this.cb = cb;
    this.fastBtn.onclick = cb.onToggleFast;
    this.zoomChip.onclick = () => board.resetZoom();
    board.onZoom = (pct, mode) => {
      this.zoomChip.textContent = `${pct}%`;
      // The border shows who controls the zoom: grey free, blue auto, red locked.
      this.zoomChip.dataset.mode = mode;
      this.zoomChip.title = ZOOM_TITLES[mode];
    };
    this.menuBtn.onclick = () => this.toggleMenu();
    this.guideBtn.onclick = () => this.cb.onGuide();
    this.viewChip.onclick = () => this.setPeek(!this.peeking);
    this.toolbar.append(this.viewChip, this.zoomChip, this.logBtn, this.guideBtn, this.menuBtn);
    this.buildMenu();
    window.addEventListener('keydown', this.onKey);
    board.onHover = (id, x, y) => this.showTooltip(id, x, y);
    this.resize = new ResizeObserver(() => {
      // A phone rotation or changed card width can change the space available to the bar.
      const from = this.askSize();
      this.morphAsk(from);
    });
    this.resize.observe(this.root);
    this.resize.observe(this.cardsWrap);
    this.askChanges = new MutationObserver((records) => {
      // Prices, coin icons and form details can change after prompt() has returned.
      // Ignore our own shell/wrapper moves so they cannot trigger an animation loop.
      const changed = records.some(
        ({ target }) =>
          target !== this.ask && !(target instanceof Element && target.classList.contains('ask-content')),
      );
      if (!changed || this.askFrame || !this.ask.classList.contains('show')) return;
      this.askFrame = requestAnimationFrame(() => {
        this.askFrame = 0;
        this.morphAsk(this.askSize());
      });
    });
    this.askChanges.observe(this.ask, { childList: true, characterData: true, subtree: true });
  }

  destroy() {
    this.messages.destroy();
    this.resize.disconnect();
    this.askChanges.disconnect();
    cancelAnimationFrame(this.askFrame);
    this.stopAskMorph();
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }

  // ------------------------------------------------------------ game menu

  private cb: HudCallbacks;
  /** Opens the game guide (rules, stocks, vacant plots), between the zoom chip and Menu. */
  guideBtn = h('button', { class: 'btn small guide-toggle', title: 'How to play' }, '? Guide');
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
    if (e.key === 'Escape' && this.logOpen && !this.modalLayer.childElementCount && this.infoPage == null) {
      this.toggleLog(false);
      return;
    }
    if (e.key === 'Escape' && this.infoPage != null && !this.modalLayer.childElementCount) {
      this.toggleInfo(null);
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
    // The layout viewport (iPad Safari's innerWidth can lag behind it after a resize).
    const W = document.documentElement.clientWidth || window.innerWidth;
    const H = document.documentElement.clientHeight || window.innerHeight;
    const portraitStack = this.root.classList.contains('upright');
    // Where the action bar sits once shown (layout box, so the slide animation does not count).
    const a = this.ask;
    const ask = a.classList.contains('show') ? { top: a.offsetTop, height: a.offsetHeight } : null;
    // The log panel sits between the toolbar and the player cards, as wide as the cards.
    const cards = this.cardsWrap.getBoundingClientRect();
    this.root.style.setProperty('--cards-w', `${cards.width}px`);
    this.root.style.setProperty('--dock-b', `${H - cards.top + 6}px`);
    const lineTop = cards.top;
    // Upright phones: the options sit above the cards.
    if (portraitStack) this.root.style.setProperty('--cards-h', `${H - lineTop + 6}px`);
    const tools = this.toolbar.getBoundingClientRect();
    const topLeftBottom = this.infoChip.getBoundingClientRect().bottom;
    this.root.style.setProperty('--top-free', `${tools.bottom + 6}px`);
    let right = 0;
    if (!portraitStack && cards.width) right = Math.min(W * 0.4, W - cards.left + 8);
    const top = Math.min(ask ? ask.top : Infinity, portraitStack ? lineTop : Infinity);
    const bottom = H - top + 4;
    this.board.insets = {
      top: Math.max(tools.bottom, topLeftBottom) + 6,
      right,
      bottom: Math.max(0, bottom),
      left: this.leftInset,
    };
    // Center the options between the left edge (or lab panel) and the player cards.
    this.root.style.setProperty('--free-left', `${this.leftInset}px`);
    this.root.style.setProperty('--free-right', `${right}px`);
    // Narrow windows (phones in landscape): a bar centered on the window would have to stay
    // clear of the cards on both sides and get squeezed, so it sits bottom left instead and
    // uses all the room up to the cards. Decided by the window, never by what the bar shows.
    const centeredRoom = W - 2 * (Math.max(this.leftInset, right) + 14);
    const narrow = centeredRoom < AB_CENTER_MIN || this.abLeftAt === W;
    this.root.classList.toggle('ab-left', !portraitStack && narrow);
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
    this.chipBoard.textContent = G.boardName ?? 'Town';
    clear(this.chipRound);
    this.chipRound.append(
      'Round ',
      h('b', null, G.roundCap ? `${Math.min(G.round, G.roundCap)} / ${G.roundCap}` : String(G.round)),
    );
    clear(this.chipGoal);
    this.chipGoal.append('Goal ', h('b', null, fmt(G.target)));
    this.renderCards();
    if (this.logOpen) this.renderLog();
    if (this.infoPage != null) this.info.render();
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
        const pid = p.id;
        el = h('div', { class: 'pcard', role: 'button', tabindex: '0' });
        el.onclick = () => this.toggleInfo(this.infoPage === pid ? null : pid);
        el.onkeydown = (e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            e.stopPropagation();
            this.toggleInfo(this.infoPage === pid ? null : pid);
          }
        };
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
      h('div', { class: 'pc-side' }, h('img', { class: 'portrait body', src: bodyURL(p.ch), alt: '' })),
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

  // ------------------------------------------------------------ info pop-up

  /**
   * Open the info pop-up on a page ('game', 'stocks' or a player's id), switch it to that page,
   * or close it (null). While a player's page is up, everyone else's properties are greyed out on
   * the board.
   */
  toggleInfo(page: InfoPage | null) {
    if (!this.G) return;
    if (page === 'stocks' && this.G.rules !== 'standard') page = 'game';
    const was = this.infoPage;
    this.infoPage = page;
    this.infoBtn.classList.toggle('on', page != null);
    this.infoBtn.setAttribute('aria-expanded', String(page != null));
    this.board.focusOwner = typeof page === 'number' ? page : -1;
    if (page == null) {
      if (was != null) this.info.close();
      return;
    }
    if (was == null) this.info.open();
    else this.info.render(true);
  }

  /**
   * A property clicked on a player's page: the pop-up steps aside, the board zooms out with every
   * other tile greyed and that property glowing, and after a few seconds the pop-up returns.
   */
  async findOnBoard(id: number) {
    if (this.finding || typeof this.infoPage !== 'number') return;
    this.finding = true;
    const pid = this.infoPage;
    this.info.stepAside(true);
    this.board.spot = id;
    this.board.spotColor = PLAYER_COLORS[this.G.players[pid].color];
    this.board.peekWhole = true;
    await new Promise((r) => setTimeout(r, FIND_MS));
    this.board.peekWhole = false;
    this.board.spot = -1;
    this.finding = false;
    this.info.stepAside(false);
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
  tick(text: string, kind?: IconKind, holdMs = 0, overlay = false) {
    this.messages.push({ text, kind }, holdMs, overlay);
    if (this.logOpen) this.renderLog();
  }

  /** The action now happening; its boundary clears stale messages from the previous action. */
  action(key: string, text: string, kind?: IconKind) {
    this.messages.phase(key, { text, kind });
    if (this.logOpen) this.renderLog();
  }

  /** Refresh history even when a duplicate announcement is omitted from the action bar. */
  refreshLog() {
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

  /** Let observers read a completed action before replacing it with the pending choice. */
  private currentStatus() {
    return this.messages.current;
  }

  private showStatus() {
    if (this.promptResolve) return;
    const cur = this.currentStatus();
    if (
      this.ask.classList.contains('status') &&
      this.shownStatus?.text === cur?.text &&
      this.shownStatus?.kind === cur?.kind
    )
      return;
    const from = this.askSize();
    this.fillStatus();
    this.morphAsk(from);
    this.revealAskText();
  }

  private fillStatus() {
    const a = this.ask;
    const cur = this.currentStatus();
    this.shownStatus = cur;
    clear(a);
    a.classList.remove('stacked');
    a.classList.add('status');
    a.style.removeProperty('--pc');
    a.classList.toggle('show', !!cur);
    if (cur) {
      a.append(
        h(
          'div',
          { class: 'prompt-text ask-status' },
          kindIcon(cur.kind),
          h('span', { class: 'tick-text' }, ...namesInColor(this.G, cur.text)),
        ),
      );
    }
  }

  /** Reveal the complete laid-out message without moving text or delaying its buttons. */
  private revealAskText() {
    const text = this.ask.querySelector<HTMLElement>('.prompt-text');
    if (!text || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // A JS animation stays on the same timeline when the resize wrapper is removed.
    // Keep the whole message in the DOM for wrapping, selection and screen readers.
    text.animate(
      [
        { clipPath: 'inset(0 100% 0 0)', opacity: 0.6 },
        { clipPath: 'inset(0 0% 0 0)', opacity: 1 },
      ],
      { duration: 220, easing: 'steps(16, end)' },
    );
  }

  /** Release the temporary layout before measuring or replacing the bar's content. */
  private stopAskMorph() {
    const anim = this.askAnim;
    this.askAnim = null;
    // Clear callbacks first: an old cancellation must never finish a newer animation.
    if (anim) {
      anim.onfinish = null;
      anim.oncancel = null;
      anim.cancel();
    }
    if (this.askContent) {
      const focused = this.ask.contains(document.activeElement)
        ? (document.activeElement as HTMLElement)
        : null;
      this.askContent.replaceWith(...this.askContent.childNodes);
      this.askContent = null;
      focused?.focus({ preventScroll: true });
    }
    this.ask.classList.remove('morphing');
  }

  /** Capture the visible size before cancelling, including an interrupted resize. */
  private askSize() {
    const a = this.ask;
    const rect = a.getBoundingClientRect();
    const size = a.classList.contains('show') ? { w: rect.width, h: rect.height } : null;
    this.stopAskMorph();
    return size;
  }

  /** The question text squeezed into a sliver beside the buttons (cut off rather than wrapped). */
  private askTextSqueezed() {
    const t = this.ask.querySelector<HTMLElement>('.prompt-text');
    return !!t && t.clientWidth < 140 && t.scrollWidth > t.clientWidth + 2;
  }

  /** Measure once, then resize the shell without repeatedly rewrapping its text. */
  private morphAsk(from: { w: number; h: number } | null) {
    const a = this.ask;
    this.updateInsets();
    // Safety net: if a centered bar still can't fit its options (a measurement taken mid-animation,
    // an odd browser), move it bottom left for this window size instead of letting buttons spill.
    if (
      a.classList.contains('show') &&
      !this.root.classList.contains('ab-left') &&
      !this.root.classList.contains('upright') &&
      (a.scrollWidth > a.clientWidth + 2 || this.askTextSqueezed())
    ) {
      this.abLeftAt = document.documentElement.clientWidth || window.innerWidth;
      this.updateInsets();
    }
    if (!from || !a.classList.contains('show') || matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    const rect = a.getBoundingClientRect();
    const to = { w: rect.width, h: rect.height };
    if (Math.abs(to.w - from.w) < 1 && Math.abs(to.h - from.h) < 1) return;
    const style = getComputedStyle(a);
    const content = h('div', { class: 'ask-content' });
    // Keep the destination layout, including phone/stacked prompts, for the whole morph.
    Object.assign(content.style, {
      width: `${to.w - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth) - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)}px`,
      height: `${to.h - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)}px`,
      flexDirection: style.flexDirection,
      alignItems: style.alignItems,
      justifyContent: style.justifyContent,
      gap: style.gap,
    });
    const focused = a.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
    content.append(...a.childNodes);
    a.append(content);
    focused?.focus({ preventScroll: true });
    this.askContent = content;
    a.classList.add('morphing');
    const anim = a.animate(
      [
        { width: `${from.w}px`, height: `${from.h}px`, minHeight: '0px' },
        { width: `${to.w}px`, height: `${to.h}px`, minHeight: '0px' },
      ],
      { duration: 740, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
    this.askAnim = anim;
    const end = () => {
      if (this.askAnim !== anim) return;
      this.stopAskMorph();
      this.updateInsets();
    };
    anim.onfinish = end;
    anim.oncancel = end;
  }

  /** Open or close the game log panel (top right, under the toolbar); it pops in from its button. */
  toggleLog(open = !this.logOpen) {
    if (open === this.logOpen) return;
    this.logOpen = open;
    this.logPanel.hidden = !open;
    this.logBtn.classList.toggle('on', open);
    this.logBtn.setAttribute('aria-expanded', String(open));
    this.logSeen = -1;
    this.renderLog(true);
    if (open && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.logPanel.animate(
        [
          { opacity: 0, transform: 'translateY(-8px) scale(0.96)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    }
    if (!open) this.logBtn.focus({ preventScroll: true });
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
    // New lines settle after this (coin icons swap in, fonts finish), which can leave the newest
    // line half hidden: stick to the bottom again once they have.
    if (toBottom || atBottom) {
      const stick = () => (list.scrollTop = list.scrollHeight);
      requestAnimationFrame(stick);
      setTimeout(stick, 120);
    }
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
    this.messages.decision();
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
    const head = h('div', { class: 'prompt-text' });
    this.ask.style.removeProperty('--pc');
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
      this.revealAskText();
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
    // The choice is complete. Never restore its old "deciding" message while effects animate.
    this.messages.decision();
    this.showStatus();
    if (this.logOpen) this.renderLog();
  }

  cancelPrompt() {
    this.messages.decision();
    this.promptResolve = null;
    this.mainButton = null;
  }

  /**
   * Low-priority activity fills quiet gaps after event reading time and an idle grace period.
   */
  status(text: string, kind?: IconKind, _immediate = false) {
    this.messages.fallback({ text, kind });
    if (this.logOpen) this.renderLog();
  }

  // ------------------------------------------------------------ modals and banners

  /**
   * Offer the View board chip while the pop-up `el` is on screen. `onChange` hears when the player
   * hides or brings it back. Returns the function to call when the pop-up closes.
   */
  offerViewBoard(el: HTMLElement, onChange?: (peeking: boolean) => void): () => void {
    if (this.peeking) this.setPeek(false);
    const target = { el, onChange };
    this.peekTargets.push(target);
    if (this.viewChip.hidden) {
      this.viewChip.hidden = false;
      this.viewChip.classList.remove('pop-in');
      void this.viewChip.offsetWidth;
      this.viewChip.classList.add('pop-in');
    }
    return () => {
      const i = this.peekTargets.indexOf(target);
      if (i < 0) return;
      // The pop-up is closing anyway: just put the camera and the chip back (no animations).
      if (this.peeking && i === this.peekTargets.length - 1) {
        this.peeking = false;
        this.board.overviewHold = false;
        this.viewChip.classList.remove('on');
        this.viewChip.textContent = 'View board';
      }
      this.peekTargets.splice(i, 1);
      if (!this.peekTargets.length) this.viewChip.hidden = true;
    };
  }

  /** Hide the offered pop-up to look at the whole board (an auto zoom), or bring it back. */
  setPeek(on: boolean) {
    const t = this.peekTarget;
    if (!t || on === this.peeking) return;
    this.peeking = on;
    this.board.overviewHold = on;
    this.popAnim(t.el, on);
    this.morphViewChip(on);
    // The action bar (e.g. the stock deal turning into "Looking at the board") morphs between
    // its old and new size rather than jumping.
    this.morphChange(() => t.onChange?.(on));
  }

  /**
   * Hide a pop-up with the pop-ups' closing motion (sinking and fading out), or show it again
   * with their opening motion (rising and fading in).
   */
  private popAnim(layer: HTMLElement, hide: boolean) {
    const box = layer.firstElementChild as HTMLElement | null;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    layer.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    const away = { transform: 'translateY(14px) scale(0.97)', opacity: 0 };
    const here = { transform: 'none', opacity: 1 };
    if (!hide) {
      layer.hidden = false;
      if (box && !still) box.animate([away, here], { duration: 220, easing: 'ease-out' });
      return;
    }
    if (!box || still) {
      layer.hidden = true;
      return;
    }
    const anim = box.animate([here, away], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    anim.onfinish = () => {
      if (!this.peeking) return;
      layer.hidden = true;
      anim.cancel();
    };
  }

  /** The View board chip morphs into Back (and back): its width eases while the words cross-fade. */
  private morphViewChip(on: boolean) {
    const chip = this.viewChip;
    const from = chip.getBoundingClientRect().width;
    chip.getAnimations().forEach((a) => a.cancel());
    chip.classList.toggle('on', on);
    const label = h('span', null, on ? 'Back' : 'View board');
    chip.replaceChildren(label);
    chip.title = on ? 'Bring the pop-up back' : 'Hide the pop-up and look at the board';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const to = chip.getBoundingClientRect().width;
    chip.animate([{ width: `${from}px` }, { width: `${to}px` }], {
      duration: 260,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
    label.animate(
      [
        { opacity: 0, transform: 'scale(0.85)' },
        { opacity: 1, transform: 'none' },
      ],
      {
        duration: 220,
        delay: 60,
        easing: 'ease-out',
        fill: 'backwards',
      },
    );
  }

  /** Make a change inside the action bar and morph the bar from its old size to the new one. */
  morphChange(change: () => void) {
    const from = this.askSize();
    change();
    this.morphAsk(from);
    // Our own change is handled: don't let the change watcher restart the morph.
    this.askChanges.takeRecords();
  }

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
/** How long a property found from the player overview is shown on the board. */
const FIND_MS = 3000;
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
