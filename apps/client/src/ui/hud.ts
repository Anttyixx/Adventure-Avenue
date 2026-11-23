import { StatusMessages } from './status-messages';
/**
 * Dark-glass overlays floating over the board: info chip, toolbar (zoom chip, Game log, Music, Menu),
 * action bar (the status line when no options are up), Game log button (expands into the log),
 * player cards, the info pop-up (game, stocks and players), menu pop-up, tooltip, modals
 * and banners. HotSeat (host.ts) drives it; `prompt()` is how most human decisions are asked.
 */
import {
  CARDS,
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
  type Square,
} from '@aa/engine';
import { paintSquare, squareCenter, type BoardView, type PortalGate } from '../board';
import { closeSoundPopover, soundButton } from './soundpanel';
import { BUILDING_INFO, buildingLandingLabel, motelFee, shortName, squareInfo, squareName } from '../names';
import { boonIconURL, suitIconURL, wildIconURL } from '../icons';
import { bodyURL, portraitURL } from '../sprites';
import { nameText } from './marquee';
import { goalText } from './overview';
import { clear, fmt, h } from './dom';
import { coinify } from '../coins';
import { POP_OUT } from './motion';
import { TIMING as T } from '../timing';
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
  /** The people playing on this device, for the menu's Auto play switches (`on`: a bot plays for them). */
  autoPlayers?(): { pid: number; name: string; on: boolean }[];
  /** Turn Auto play on or off for one of them. */
  onToggleAuto?(pid: number): void;
}

/** The narrowest a centered action bar may get before it moves to the bottom left corner. */
const AB_CENTER_MIN = 520;

/** The zoom chip's tooltip for each zoom mode. */
const ZOOM_TITLES = {
  free: 'Free zoom: scroll, pinch or - / +. Tap to zoom back in.',
  auto: 'Auto zoom: the game is showing part of the board. You can still zoom; tap to reset.',
  locked: 'Locked zoom: the game is showing something. Your zoom comes back in a moment.',
};

/** A status line's text with names in their colors; a trailing "..." becomes three bouncing dots. */
function statusText(G: GameState | undefined, text: string): (string | HTMLElement)[] {
  const waiting = text.endsWith('...');
  const parts = namesInColor(G, waiting ? text.slice(0, -3) : text);
  if (waiting) parts.push(h('span', { class: 'ab-dots', 'aria-label': '...' }, h('i'), h('i'), h('i')));
  return parts;
}

/**
 * How long an emptied action bar waits for its next message (most come at once) before morphing
 * to a fresh "Rosa's turn..." line instead: it is never left empty and blank.
 */
const ASK_EMPTY_HOLD = 40;
/** How long the action bar takes to resize (morph) between two contents. */
const ASK_MORPH_MS = 520;
/** How long new action bar text waits while the bar resizes (it is nearly full size by then). */
const ASK_WAVE_WAIT = 200;
/** Buttons wait until the bar has nearly finished resizing, then pop in. */
const ASK_BUTTONS_WAIT = 480;
/** Pieces the wave moves whole, never split into letters. */
const WAVE_UNIT = '.dot, .log-icon, .ab-dots, .gc, .fact, .btn, img, svg, .bp-card';
/** Text that waves in letter by letter. */
const WAVE_TEXT = '.tick-text, .rich-title, .prompt-text:not(.rich), .bp-title';
/** Wrappers the wave looks inside; anything else in the bar moves as one piece. */
const WAVE_OPEN =
  '.ask-content, .prompt-text, .ask-status, .rich-body, .facts, .btn-row, .bp, .bp-info, .bp-cards, .bp-actions';
/** Never animated by the wave (the building picker's tip shows and hides on its own). */
const WAVE_SKIP = '.ask-leaving, .bp-tip';

/**
 * The pieces of the action bar's content in reading order, for the wave: each letter of its text
 * (wrapped in `.wv`, inside a `.wv-word` that keeps words together) and each whole piece (icon,
 * coin, ticket, button: `.wv-unit`). Money is turned into coins first, so "340G" is not split
 * before it can become "340" and a coin.
 */
function waveUnits(root: HTMLElement): Element[] {
  coinify(root);
  const units: Element[] = [];
  const split = (node: Text) => {
    const frag = document.createDocumentFragment();
    for (const part of node.data.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        frag.append(part);
        continue;
      }
      const word = h('span', { class: 'wv-word' });
      for (const ch of part) {
        const s = h('span', { class: 'wv' }, ch);
        word.append(s);
        units.push(s);
      }
      frag.append(word);
    }
    node.replaceWith(frag);
  };
  const visit = (el: Element, text: boolean) => {
    for (const child of [...el.childNodes]) {
      if (child instanceof Text) {
        if (text && child.data.trim()) split(child);
        continue;
      }
      if (!(child instanceof Element) || child.matches(WAVE_SKIP)) continue;
      // Already split (prepared before the bar measured itself): reuse the pieces.
      if (child.classList.contains('wv') || child.classList.contains('wv-unit')) {
        units.push(child);
        continue;
      }
      if (child.matches(WAVE_UNIT)) {
        child.classList.add('wv-unit');
        units.push(child);
      } else if (text || child.matches(WAVE_TEXT)) visit(child, true);
      else if (child.matches(WAVE_OPEN)) visit(child, false);
      else {
        child.classList.add('wv-unit');
        units.push(child);
      }
    }
  };
  visit(root, root.matches(WAVE_TEXT));
  return units;
}

/**
 * New content arrives as a quick bouncy wave: each letter and piece rises in with a small
 * overshoot, one just after another (the whole wave takes at most about 0.35s).
 */
function waveIn(root: HTMLElement, delay = 0, buttonsAt = 0) {
  const units = waveUnits(root);
  if (!units.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const buttons = units.filter((u) => u.matches('.btn'));
  const rest = units.filter((u) => !u.matches('.btn'));
  const step = Math.min(12, 340 / Math.max(1, rest.length));
  // Each piece ends at its own opacity, so a disabled button or a sold-out card is dim from the
  // moment it appears (never bright for a moment, then dimmed).
  const own = (u: Element) => parseFloat(getComputedStyle(u).opacity) || 1;
  rest.forEach((u, i) =>
    u.animate(
      [
        { opacity: 0, transform: 'translateY(6px) scale(0.85)' },
        { opacity: own(u), transform: 'translateY(-2px) scale(1.04)', offset: 0.6 },
        { opacity: own(u), transform: 'none' },
      ],
      {
        duration: 300,
        delay: delay + i * step,
        easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)',
        fill: 'backwards',
      },
    ),
  );
  // Buttons pop in one after another: once the bar is done resizing, or right after the text
  // when it doesn't resize.
  const start = Math.max(buttonsAt, delay + Math.min(rest.length * step, 150));
  buttons.forEach((u, i) =>
    u.animate(
      [
        { opacity: 0, transform: 'translateY(8px) scale(0.6)' },
        { opacity: own(u), transform: 'translateY(-3px) scale(1.08)', offset: 0.6 },
        { opacity: own(u), transform: 'none' },
      ],
      { duration: 340, delay: start + i * 55, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.3)', fill: 'backwards' },
    ),
  );
}

/** Old content leaves as a fast wave (lifting and fading); returns when it is done (ms). */
function waveOut(layer: HTMLElement): number {
  const units = [...layer.querySelectorAll('.wv, .wv-unit')];
  const parts = units.length ? units : [...layer.children];
  const step = Math.min(6, 110 / Math.max(1, parts.length));
  parts.forEach((u, i) =>
    u.animate(
      // Buttons shrink away; letters and other pieces lift and fade.
      u.matches('.btn')
        ? [
            { opacity: 1, transform: 'none' },
            { opacity: 1, transform: 'scale(1.06)', offset: 0.3 },
            { opacity: 0, transform: 'scale(0.6)' },
          ]
        : [
            { opacity: 1, transform: 'none' },
            { opacity: 0, transform: 'translateY(-6px) scale(0.9)' },
          ],
      { duration: u.matches('.btn') ? 170 : 140, delay: i * step, easing: 'ease-in', fill: 'forwards' },
    ),
  );
  return 170 + parts.length * step + 40;
}

/** How long the game log takes to slide lines into their new places, and new lines to come in. */
const LOG_SLIDE_MS = 650;
/** The log's easing: an unhurried ease-out that settles softly, with no snap at the start. */
const LOG_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';
/** When several lines arrive together, each starts this much after the one before. */
const LOG_STAGGER_MS = 110;

/**
 * The action bar's typing reveal, also used by the game log: the text uncovers left to right in
 * quick steps. The whole text stays laid out in place (for wrapping, selection and screen
 * readers); only what shows changes. A JS animation, so it keeps going if a wrapper moves.
 */
function typeIn(el: HTMLElement) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.animate(
    [
      { clipPath: 'inset(0 100% 0 0)', opacity: 0.6 },
      { clipPath: 'inset(0 0% 0 0)', opacity: 1 },
    ],
    { duration: 220, easing: 'steps(16, end)' },
  );
}

/** What the log showed before a redraw: each turn (folded or not), each line, the waiting line's height. */
interface LogBefore {
  cards: Map<string, { folded: boolean }>;
  lines: Set<string>;
  waitH: number;
}

/**
 * Grow or shrink a log element by animating its real height (so what comes after it moves
 * along), clipped while it moves, resumed `elapsed` ms in.
 */
function logGrow(el: HTMLElement, frames: Keyframe[], elapsed: number) {
  el.classList.add('log-moving');
  const a = el.animate(frames, { duration: LOG_SLIDE_MS, easing: LOG_EASE, fill: 'backwards' });
  a.currentTime = elapsed;
  const done = () => el.classList.remove('log-moving');
  a.onfinish = done;
  a.oncancel = done;
}

export class Hud {
  root: HTMLElement;
  toolbar = h('div', { class: 'toolbar' });
  musicBtn = soundButton('btn small music-toggle', 'Music');
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
  /** The Game log button in the toolbar, before Music and Menu; it opens the log panel. */
  logBtn = h(
    'button',
    {
      class: 'btn small log-toggle',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      'aria-label': 'Game log',
    },
    // Phones show the short label.
    h('span', { class: 'tb-long' }, 'Game log'),
    h('span', { class: 'tb-short' }, 'Log'),
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
  private logHeadId: string | undefined;
  /**
   * When each recent log line first appeared (by its `data-line` key). The log redraws several
   * times per action; a line still coming in carries on from where it was instead of restarting
   * or snapping to its end.
   */
  private logBorn = new Map<string, number>();
  /** When each turn last folded or opened, so the change carries on across redraws. */
  private logFold = new Map<string, { t: number; folded: boolean }>();
  /** Earlier turns the reader opened by hand (by turn key); the rest stay folded. */
  private logOpenTurns = new Set<string>();
  /** The action bar morphing between sizes (status line, options). */
  private askAnim: Animation | null = null;
  /** Holds the new content at its final width while the surrounding bar resizes. */
  private askContent: HTMLElement | null = null;
  private resize: ResizeObserver;
  private askChanges: MutationObserver;
  /** Watches pop-ups opening and closing, to lock the rest of the screen (see `updateLock`). */
  private lockWatch: MutationObserver;
  private lockPointerEvents = new AbortController();
  /** Whether a pop-up is up and the screen behind it is locked. */
  locked = false;
  private askFrame = 0;
  /** Window width at which a centered action bar overflowed, so it stays bottom left at this size. */
  private abLeftAt = 0;
  /** The bar's current content (a building picker) needs the bottom-left corner's room. */
  private askLeft = false;
  /** The current player's options, centered near the bottom of the board. */
  ask = h('div', { class: 'prompt-center glass' });
  cardsWrap = h('div', { class: 'cards-wrap' });
  cards = h('div', { class: 'cards' });
  /**
   * The row of chips below the player cards: Stocks (the stock market pop-up, Standard rules
   * only), Properties (the properties pop-up) and, against the right edge, the layout chip.
   */
  cardsBar = h('div', { class: 'cards-bar' });
  /** Opens the stock market pop-up. */
  stocksChip = h(
    'button',
    { class: 'cards-chip glass', 'aria-haspopup': 'dialog', title: 'The stock market' },
    'Stocks',
  );
  /** Opens the properties pop-up. */
  propsChip = h(
    'button',
    { class: 'cards-chip glass', 'aria-haspopup': 'dialog', title: 'Every property on the board' },
    'Properties',
  );
  /**
   * The layout chip: shows the player cards' layout now (List: every card; Stack: only the
   * active player's card in front, but a card that changes on someone else's turn rises out of
   * the stack for a moment). Tapping it switches to the other one.
   */
  modeChip = h('button', { class: 'cards-chip glass cards-mode-chip' });
  /** How the player cards are shown (remembered on this device). */
  cardsMode: CardsMode = loadCardsMode();
  /** Whether the player cards are set to fold into a stack (Stack or Smart). */
  get cardsCollapsed() {
    return this.cardsMode !== 'list';
  }
  /**
   * A stack opened into a list for a moment: by the mouse resting on it (until it leaves) or by a
   * tap (for `T.stackOpen`). While open, tapping a card opens that player's info.
   */
  private opened: 'hover' | 'tap' | null = null;
  private openTimer = 0;
  /** Whether the cards are folded into a stack right now. */
  get stacked() {
    return this.cardsCollapsed && !this.opened;
  }
  /** Smart mode: cards out of the stack for a moment, with the timer that puts each back. */
  private popped = new Map<number, number>();
  /** The player whose card is at the front of the stack. */
  private stackFront = -1;
  /** Older cancelled glides must not finish a newer layout change. */
  private cardGlide = 0;
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
  /** The info pop-up's page while it is open ('game', 'stocks', 'props' or a player's id), else null. */
  infoPage: InfoPage | null = null;
  private info: InfoPopup;
  /** The game log's contents (title, Close and the list), inside the log panel. */
  logBox = h('div', { class: 'sb-log' });
  logOpen = false;
  /**
   * The info chip, top left: the game's name, the board, the round, the goal and (online) the
   * room code button.
   */
  infoChip = h('div', { class: 'info-chip glass' });
  private chipGoal = h('span', { class: 'gc-tag' });
  roomBtn = h('button', { class: 'btn small ghost gc-room', hidden: true }, 'Room');
  tooltip = h('div', { class: 'tooltip glass' });
  modalLayer = h('div', { class: 'modal-layer' });
  bannerLayer = h('div', { class: 'banner-layer' });
  G!: GameState;
  activePid = -1;
  /** This device's player in an online game (their card goes at the bottom), or -1. */
  myPid = -1;
  /**
   * A player's net worth as the cards show it. The game sets this so a share price change only
   * counts once it has been announced (`HotSeat.shownWorth`); by default, the live net worth.
   */
  worthOf: (p: Player) => number = (p) => netWorth(this.G, p);
  /** Extra space covered on the left (e.g. the UI Lab panel). */
  leftInset = 0;
  private shown = new Map<number, { nw: number; cash: number }>();
  private ranks = new Map<number, number>();
  /** Money popups currently floating beside each card (to stack them). */
  private pops = new Map<number, number>();
  private cardEls = new Map<number, HTMLElement>();
  /** What each card last showed, to skip rebuilding cards that did not change. */
  /** Each card's goal bar, suits and rank when last drawn, so changes can animate. */
  private cardMemo = new Map<number, { pct: number; suits: boolean[]; rank?: number }>();
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
    this.modeChip.onclick = () => this.setCardsMode(this.cardsMode === 'list' ? 'smart' : 'list');
    this.stocksChip.onclick = () => this.toggleInfo(this.infoPage === 'stocks' ? null : 'stocks');
    this.propsChip.onclick = () => this.toggleInfo(this.infoPage === 'props' ? null : 'props');
    this.cardsBar.append(this.stocksChip, this.propsChip, this.modeChip);
    this.cardsWrap.append(this.cards, this.cardsBar);
    // Clicking or tapping the stack (its front card or the strips behind) opens it into a list
    // for a moment; a mouse resting on it keeps it open until it leaves.
    this.cards.addEventListener('click', () => {
      if (!this.locked && this.stacked) this.openStack('tap');
    });
    this.cards.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') this.openStack('hover');
    });
    this.cards.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && this.opened === 'hover') this.closeStack();
    });
    // A dialog's backdrop catches pointer events before the cards. Observe the mouse at
    // the shared board/HUD parent instead, keeping the existing click lock and the modal's own controls intact.
    const over = (el: HTMLElement, e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    };
    const onPopup = (target: EventTarget | null) =>
      target instanceof Element &&
      target.closest('.modal, .prompt-center, .toolbar, .venture-board, .arcade-stage');
    parent.addEventListener(
      'pointermove',
      (e) => {
        if (!this.locked || e.pointerType !== 'mouse') return;
        if (over(this.cards, e) && !onPopup(e.target)) this.openStack('hover');
        else if (this.opened === 'hover') this.closeStack();
      },
      { capture: true, signal: this.lockPointerEvents.signal },
    );
    parent.addEventListener(
      'pointerleave',
      () => {
        if (this.locked && this.opened === 'hover') this.closeStack();
      },
      { signal: this.lockPointerEvents.signal },
    );
    for (const type of ['pointerdown', 'click', 'dblclick', 'keydown'] as const) {
      parent.addEventListener(
        type,
        (e) => {
          if (!this.locked || onPopup(e.target)) return;
          if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return;
          const atCards =
            (e.target instanceof Node && this.cardsWrap.contains(e.target)) ||
            (e instanceof MouseEvent && over(this.cardsWrap, e));
          if (!atCards) return;
          e.preventDefault();
          e.stopImmediatePropagation();
        },
        { capture: true, signal: this.lockPointerEvents.signal },
      );
    }
    this.setCardsMode(this.cardsMode);
    // The info chip: the game's name, the goal, the Room button online and the Info button.
    this.infoChip.append(
      h('span', { class: 'gc-title' }, 'Adventure Avenue'),
      this.chipGoal,
      this.roomBtn,
      this.infoBtn,
    );
    this.logBtn.onclick = () => this.toggleLog();
    this.root.append(
      this.toolbar,
      h('div', { class: 'top-left' }, h('div', { class: 'top-row' }, this.infoChip)),
      this.ask,
      this.cardsWrap,
      this.logPanel,
      this.tooltip,
      this.modalLayer,
      this.bannerLayer,
    );
    parent.append(this.root);
    this.info = new InfoPopup(this);
    this.infoBtn.onclick = () => this.toggleInfo(this.infoPage === 'game' ? null : 'game');
    // While a pop-up is up, only the action bar and the toolbar's View board, Game log, sound and
    // Menu buttons can be used: watch the pop-up layers coming and going.
    this.lockWatch = new MutationObserver(() => this.updateLock());
    this.lockWatch.observe(this.root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden', 'class'],
    });

    this.cb = cb;
    this.fastBtn.onclick = cb.onToggleFast;
    this.zoomChip.onclick = () => {
      if (!this.locked) board.resetZoom();
    };
    board.onZoom = (pct, mode) => {
      // Only the text changes while zooming: update it in place (no new nodes for the observers).
      const text = this.zoomChip.firstChild;
      if (text instanceof Text) text.data = `${pct}%`;
      else this.zoomChip.textContent = `${pct}%`;
      // The border shows who controls the zoom: grey free, blue auto, red locked.
      this.zoomChip.dataset.mode = mode;
      this.zoomChip.title = ZOOM_TITLES[mode];
    };
    this.menuBtn.onclick = () => this.toggleMenu();
    this.viewChip.onclick = () => this.setPeek(!this.peeking);
    this.toolbar.append(this.viewChip, this.zoomChip, this.logBtn, this.musicBtn, this.menuBtn);
    this.buildMenu();
    window.addEventListener('keydown', this.onKey);
    board.onHover = (id, x, y) => this.showTooltip(id, x, y);
    board.onPortalHover = (gate, x, y) => this.showPortalTooltip(gate, x, y);
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
    closeSoundPopover(this.musicBtn);
    this.messages.destroy();
    this.resize.disconnect();
    this.askChanges.disconnect();
    this.lockWatch.disconnect();
    this.lockPointerEvents.abort();
    cancelAnimationFrame(this.askFrame);
    clearTimeout(this.openTimer);
    this.stopAskMorph();
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }

  // ------------------------------------------------------------ game menu

  private cb: HudCallbacks;
  menuBtn = h(
    'button',
    {
      class: 'btn small menu-toggle',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      'aria-label': 'Menu',
    },
    '☰',
    h('span', { class: 'tb-long' }, ' Menu'),
  );
  /** The menu's contents, shown in a pop-up in the middle of the screen. */
  menu = h('div', { class: 'game-menu', role: 'menu' });
  private menuModal: { close(): void } | null = null;
  /** The gold highlight that slides between the menu's rows. */
  private menuHl = h('span', { class: 'gm-hl', 'aria-hidden': 'true' });
  /** The menu's Auto play switches: one per person playing on this device. */
  private autoRows = h('div', { class: 'gm-auto' });
  /** Players a bot is playing for (Auto play): their cards say so. */
  autoPids = new Set<number>();

  /** Draw the Auto play switches as they stand now (each time the menu opens or one is tapped). */
  private drawAutoRows() {
    clear(this.autoRows);
    const players = this.cb.autoPlayers?.() ?? [];
    for (const a of players) {
      // One person here: "Auto play". Several: each by name.
      const label = players.length > 1 ? `Auto play (${a.name})` : 'Auto play';
      const row = gmRow(
        'auto',
        label,
        a.on ? 'A CPU is playing for you' : 'A CPU plays for you',
        () => {
          this.cb.onToggleAuto?.(a.pid);
          this.drawAutoRows();
        },
        a.on,
      );
      row.title = a.on
        ? 'A bot is playing for you. Tap to take over again.'
        : 'Let a bot play for you until you turn this off.';
      this.autoRows.append(row);
    }
  }
  /** The menu behind the Menu button: rules, settings and quit. */
  private buildMenu() {
    const close = (f: () => void) => () => {
      this.toggleMenu(false);
      f();
    };
    // Rows share one gold highlight that slides to the row under the pointer or keyboard focus.
    const rows = h(
      'div',
      { class: 'gm-rows' },
      this.menuHl,
      gmRow(
        'guide',
        'Guide',
        'Rules, squares and cards',
        close(() => this.cb.onGuide()),
      ),
      this.autoRows,
      this.fastBtn,
    );
    if (document.fullscreenEnabled)
      rows.append(gmRow('full', 'Full screen', 'Fill the whole screen', toggleFullscreen));
    rows.append(
      gmRow(
        'quit',
        'Quit game',
        'Saved at the start of each turn',
        () => this.confirmQuit(),
        false,
        'danger',
      ),
    );
    const slide = (e: Event) => {
      const row = (e.target as HTMLElement).closest?.('.gm-item') as HTMLElement | null;
      if (!row || !rows.contains(row)) return;
      this.menuHl.style.transform = `translateY(${row.offsetTop}px)`;
      this.menuHl.style.height = `${row.offsetHeight}px`;
      this.menuHl.classList.add('on');
    };
    rows.addEventListener('pointerover', slide);
    rows.addEventListener('focusin', slide);
    rows.addEventListener('pointerleave', () => {
      if (!rows.contains(document.activeElement)) this.menuHl.classList.remove('on');
    });
    rows.addEventListener('focusout', (e) => {
      if (!rows.contains(e.relatedTarget as Node)) this.menuHl.classList.remove('on');
    });
    this.menu.append(
      rows,
      h('button', { class: 'gm-resume', role: 'menuitem', onclick: close(() => {}) }, 'Resume'),
    );
  }

  /** The menu's own header: a pulsing pause mark, "Game paused" and whose turn it is, and ×. */
  private menuHead(paused: boolean) {
    const G = this.G;
    const p = G ? G.players[G.order[G.turn]] : undefined;
    const round = G
      ? G.roundCap
        ? `Round ${Math.min(G.round, G.roundCap)} / ${G.roundCap}`
        : `Round ${G.round}`
      : '';
    return h(
      'div',
      { class: 'gm-head' },
      paused ? h('span', { class: 'gm-pause', 'aria-hidden': 'true' }, h('i'), h('i')) : null,
      h(
        'div',
        { class: 'gm-title' },
        h('h2', null, paused ? 'Game paused' : 'Menu'),
        G
          ? h(
              'div',
              { class: 'gm-sub' },
              `${round} · `,
              p ? h('span', { class: 'gm-dot', style: `background:${PLAYER_COLORS[p.color]}` }) : null,
              p ? `${p.name}'s turn` : '',
            )
          : null,
      ),
      h(
        'button',
        { class: 'gm-close', 'aria-label': 'Close', onclick: () => this.toggleMenu(false) },
        svgIcon('M2 2l8 8M10 2l-8 8', 12),
      ),
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
    // A game on this device pauses while the menu is open (online games keep going).
    const paused = (this.cb.onPause?.(open) ?? false) && open;
    if (open) {
      closeSoundPopover(this.musicBtn);
      this.drawAutoRows();
      this.menuHl.classList.remove('on');
      const m = this.modal('Menu', this.menu);
      m.el.classList.add('menu-modal');
      m.el.querySelector('.modal-head')!.replaceWith(this.menuHead(paused));
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

  /** Guests in an online game: Fast CPU speed is the host's setting, so no switch. */
  hideFast() {
    this.fastBtn.remove();
  }

  setFastLabel(fast: boolean) {
    const row = gmRow('fast', 'Fast CPU', 'Speed up CPU turns', null, fast);
    this.fastBtn.className = row.className;
    this.fastBtn.setAttribute('role', 'menuitemcheckbox');
    this.fastBtn.setAttribute('aria-checked', String(fast));
    this.fastBtn.replaceChildren(...row.childNodes);
  }

  /** Scale the player cards down (CSS zoom) when they would run into the toolbar. */
  private fitCards(H: number, portraitStack: boolean) {
    const wrap = this.cardsWrap;
    wrap.style.zoom = '';
    if (portraitStack) return;
    const base = parseFloat(getComputedStyle(wrap).zoom) || 1;
    const r = wrap.getBoundingClientRect();
    const room = r.bottom - this.toolbar.getBoundingClientRect().bottom - 8;
    if (r.height > room && room > 0) wrap.style.zoom = String(Math.max(0.6, (base * room) / r.height));
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
    // The player cards shrink to fit between the toolbar and the bottom of the screen (short
    // phone screens with many players), never overlapping the toolbar.
    this.fitCards(H, portraitStack);
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
    // The room the action bar takes at the bottom, so pop-ups above it can use the rest.
    this.root.style.setProperty('--ask-free', `${Math.max(0, Number.isFinite(bottom) ? bottom : 0)}px`);
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
    // (The one exception: a building picker that only fits beside Build / Skip in the corner,
    // `askLeft`, moves there for as long as it is up; the board stays put.)
    this.root.classList.toggle('ab-left', !portraitStack && (narrow || this.askLeft));
    // The same smaller screens center the board between the left edge and the player cards.
    this.board.centerLeft = !portraitStack && narrow && right > 0;
  }

  // ------------------------------------------------------------ state rendering

  render(G: GameState) {
    this.G = G;
    clear(this.chipGoal);
    this.chipGoal.append('Goal ', h('b', null, fmt(G.target)));
    // Easy rules have no stock market.
    this.stocksChip.hidden = G.rules !== 'standard';
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
    const ranked = ranking(G).sort((a, b) => this.worthOf(b) - this.worthOf(a));
    this.ranks = new Map();
    ranked.forEach((p, i) => {
      const prev = ranked[i - 1];
      const same = prev && this.worthOf(prev) === this.worthOf(p);
      this.ranks.set(p.id, same ? this.ranks.get(prev.id)! : i + 1);
    });
    for (const p of order) {
      let el = this.cardEls.get(p.id);
      if (!el) {
        const pid = p.id;
        el = h('div', { class: 'pcard', role: 'button', tabindex: '0' });
        // Pointing at a card picks the player out on the board: their character grows and shows
        // which ways they can go.
        el.addEventListener('pointerenter', (e) => {
          if (!this.locked && e.pointerType === 'mouse') this.board.cardHoverPid = pid;
        });
        el.addEventListener('pointerleave', () => {
          if (this.board.cardHoverPid === pid) this.board.cardHoverPid = -1;
        });
        // A folded stack opens into a list first (the click goes on to this.cards); once open,
        // a card opens that player's info.
        el.onclick = () => {
          if (!this.locked && !this.stacked) this.toggleInfo(this.infoPage === pid ? null : pid);
        };
        el.onkeydown = (e) => {
          if (this.locked) return;
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            e.stopPropagation();
            if (this.stacked) this.openStack('tap');
            else this.toggleInfo(this.infoPage === pid ? null : pid);
          }
        };
        this.cardEls.set(p.id, el);
        this.cards.append(el);
      }
      this.fillCard(el, p);
    }
    if (this.popPending) {
      this.popPending = false;
      this.glide(() => this.stackCards());
    } else this.stackCards();
  }

  /** Fold the player cards into a stack (only the active player's card in front) or spread them out. */
  setCardsCollapsed(on: boolean) {
    this.setCardsMode(on ? 'smart' : 'list');
  }

  /** Show the player cards as a list or a stack, gliding every card from where it was. */
  setCardsMode(mode: CardsMode) {
    const on = mode !== 'list';
    const unfold = on !== this.stacked;
    const change = () => {
      // A stack opened for a moment, and cards lifted out of a stack, go back first.
      clearTimeout(this.openTimer);
      this.opened = null;
      for (const t of this.popped.values()) clearTimeout(t);
      this.popped.clear();
      this.cardsMode = mode;
      saveCardsMode(mode);
      this.cardsWrap.classList.toggle('collapsed', on);
      this.cardsWrap.dataset.mode = mode;
      const m = CARDS_MODES[mode];
      const ico = h('span', { class: 'cards-mode-ico', 'aria-hidden': 'true' });
      ico.innerHTML = m.icon;
      clear(this.modeChip);
      // Just the icon: its name is in the tooltip and for screen readers.
      this.modeChip.append(ico);
      this.modeChip.dataset.mode = mode;
      this.modeChip.title = m.title;
      this.modeChip.setAttribute('aria-label', m.title);
      if (this.G) this.stackCards(false);
    };
    if (unfold) this.glide(change);
    else change();
  }

  /**
   * Place each card in the stack by turn order: the active player in front, the next player
   * just behind, and the player who just went at the back. When the active player changes,
   * the old front card drops out and slides in at the back while the rest move up one.
   */
  private stackCards(cycle = true) {
    const ids = this.G.order;
    const n = ids.length;
    const front = ids.includes(this.activePid)
      ? this.activePid
      : ids.includes(this.stackFront)
        ? this.stackFront
        : ids[0];
    const prev = this.stackFront;
    this.stackFront = front;
    const on = this.stacked;
    // Stack: cards lifted out sit in a list above the stack, in turn order; the rest
    // stay in the stack, the active player's in front.
    const lifted = on ? ids.filter((id) => this.popped.has(id) && id !== front) : [];
    const stacked = ids.filter((id) => !lifted.includes(id));
    const sn = stacked.length;
    const sf = stacked.indexOf(front);
    // Room above the front card for the cards peeking out behind it.
    this.cards.style.setProperty('--stack-n', String(Math.min(sn - 1, STACK_SHOWN)));
    this.cards.style.setProperty('--pop-n', String(lifted.length));
    for (const id of ids) {
      const el = this.cardEls.get(id);
      if (!el) continue;
      const up = lifted.indexOf(id);
      el.classList.toggle('popped', up >= 0);
      el.style.setProperty('--row', String(up >= 0 ? up + 1 : lifted.length + 1));
      const d = up >= 0 ? 0 : (stacked.indexOf(id) - sf + sn) % sn;
      el.style.setProperty('--d', String(Math.min(d, STACK_SHOWN + 1)));
      el.style.zIndex = on && up < 0 ? String(n - d) : '';
      el.classList.toggle('behind', on && up < 0 && d > 0);
      el.classList.toggle('deep', on && up < 0 && d > STACK_SHOWN);
      // Cards behind the front one are only a glimpse: not clickable or reachable by Tab.
      el.inert = on && up < 0 && d > 0;
    }
    const old = this.cardEls.get(prev);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (cycle && on && old && prev !== front && !reduce && stacked.includes(prev)) {
      // The cycle: the old front card drops down out of the way (revealing the next player),
      // slips behind the stack, and rises into its place at the back.
      const d = Math.min((stacked.indexOf(prev) - sf + sn) % sn, STACK_SHOWN + 1);
      const back = stackTransform(d);
      const top = String(n + 1);
      for (const a of old.getAnimations()) a.cancel();
      old.animate(
        [
          { transform: 'none', zIndex: top, easing: 'cubic-bezier(0.5, 0, 0.75, 0)' },
          { transform: 'translateY(55%) scale(0.96)', zIndex: top, offset: 0.42 },
          {
            transform: 'translateY(55%) scale(0.96)',
            zIndex: '0',
            offset: 0.46,
            easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
          },
          { transform: back, zIndex: '0' },
        ],
        { duration: T.cardCycle },
      );
    }
  }

  /**
   * Open a folded stack into a list for a moment (the chosen layout stays): `hover` until the
   * mouse leaves, `tap` for `T.stackOpen`. A hover takes over a tap's timer.
   */
  openStack(how: 'hover' | 'tap') {
    if (!this.cardsCollapsed || (this.locked && how === 'tap')) return;
    clearTimeout(this.openTimer);
    if (how === 'tap' && this.opened !== 'hover')
      this.openTimer = window.setTimeout(() => this.closeStack(), T.stackOpen);
    const was = this.opened;
    if (how === 'hover' || !was) this.opened = how;
    if (was) return;
    this.glide(() => {
      this.cardsWrap.classList.remove('collapsed');
      this.stackCards(false);
    });
  }

  /** Fold an opened stack back up. */
  private closeStack() {
    if (!this.opened) return;
    clearTimeout(this.openTimer);
    this.opened = null;
    if (!this.cardsCollapsed) return;
    this.glide(() => {
      this.cardsWrap.classList.add('collapsed');
      this.stackCards(false);
    });
  }

  /**
   * Stack: lift player `pid`'s card out of the stack into a list above it while it
   * updates, then put it back (`T.cardPop` after its last change). Every card glides from where
   * it was, as when folding.
   */
  private popCard(pid: number): boolean {
    const was = this.popped.get(pid);
    if (was) clearTimeout(was);
    const back = window.setTimeout(() => {
      this.popped.delete(pid);
      this.glide(() => this.stackCards(false));
    }, T.cardPop);
    this.popped.set(pid, back);
    // renderCards glides once for every card that rose out in this update.
    if (was == null) this.popPending = true;
    return was == null;
  }
  /** Set when a card rose out of the stack during this update (see renderCards). */
  private popPending = false;

  /**
   * Change the cards' layout with `change`, gliding every card from where it was to its new place:
   * the one motion for folding and unfolding (the layout buttons, opening a stack for a moment)
   * and for cards rising out of a stack. Front to back, one just after another.
   */
  private glide(change: () => void) {
    const generation = ++this.cardGlide;
    const els = [...this.cardEls.values()];
    const before = els.map((el) => el.getBoundingClientRect());
    for (const el of els) for (const a of el.getAnimations()) a.cancel();
    const wrap = this.cardsWrap;
    if (!this.G || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      wrap.classList.remove('stacking');
      change();
      return;
    }
    wrap.classList.add('stacking');
    change();
    this.updateInsets();
    const zoom = wrap.getBoundingClientRect().width / (wrap.offsetWidth || 1) || 1;
    let left = els.length;
    if (!left) {
      wrap.classList.remove('stacking');
      return;
    }
    const done = () => {
      if (generation === this.cardGlide && --left <= 0) wrap.classList.remove('stacking');
    };
    els.forEach((el, i) => {
      // A card the change set moving itself (the old front card dropping to the back when the
      // turn passes) keeps its own move: gliding it too would pull it out of line.
      // (The cards' own colour and fade transitions don't count.)
      if (el.getAnimations().some((x) => !(x instanceof CSSTransition))) return done();
      const a = before[i];
      const b = el.getBoundingClientRect();
      // Use the intended pose, never an in-flight CSS transition's sampled matrix: a stacked
      // card's depth, or the active card's slide out of a list (so it glides there instead of
      // snapping out once the glide ends).
      const end =
        this.stacked && el.classList.contains('behind')
          ? stackTransform(Number(el.style.getPropertyValue('--d')))
          : !this.stacked && el.classList.contains('active')
            ? ACTIVE_SHIFT
            : 'none';
      const final = end === 'none' ? '' : end;
      const dx = (a.left + a.width / 2 - (b.left + b.width / 2)) / zoom;
      const dy = (a.top - b.top) / zoom;
      const k = b.width ? a.width / b.width : 1;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(k - 1) < 0.01) return done();
      // Cards scale around their top middle (transform-origin 50% 0), matched above.
      el.animate([{ transform: `translate(${dx}px, ${dy}px) ${final} scale(${k})` }, { transform: end }], {
        duration: T.cardStack,
        delay: i * T.cardStackStagger,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        fill: 'backwards',
      }).finished.then(done, done);
    });
  }

  private fillCard(el: HTMLElement, p: Player) {
    const G = this.G;
    const nw = this.worthOf(p);
    const prev = this.shown.get(p.id) ?? { nw, cash: p.cash };
    const color = PLAYER_COLORS[p.color];
    el.style.setProperty('--pc', color);
    el.classList.toggle('active', p.id === this.activePid && !G.over);
    el.classList.toggle('bankrupt', p.bankrupt);
    const tags: string[] = [];
    if (p.boost > 1) tags.push('Fees +30%');
    if (p.motelMoves) tags.push(`Motel +${p.motelMoves} spaces`);
    if (p.bankrupt) tags.push('Bankrupt');
    if (this.autoPids.has(p.id) && !p.bankrupt) tags.push('Auto play');
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
    // Stack: when the cash or net worth of a card behind the front one changes (on someone
    // else's turn), it rises out of the stack for a moment so the change can be seen. A card that
    // only just rose starts its count-up and money chip once it has arrived.
    const moneyMoved = this.shown.has(p.id) && (prev.cash !== p.cash || prev.nw !== nw);
    // Never the active player's card (it is, or is about to be, in front; the stack's front only
    // moves to them once every card is filled in).
    const rising =
      moneyMoved &&
      this.cardsMode === 'smart' &&
      this.stacked &&
      p.id !== this.stackFront &&
      p.id !== this.activePid
        ? this.popCard(p.id)
        : false;
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
          nameText(p.name, `pname ${p.name.length > 7 ? 'long' : ''}`),
          // An active Boon or Boom shows as its symbol, like on the board.
          p.boon > 0
            ? h('img', {
                class: `boon-ico ${p.boon === K.boom ? 'boom' : ''}`,
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
          { class: 'bar-track', title: goalText(G.target, nw, p.bankrupt) },
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
    const known = this.shown.has(p.id);
    // What changed since the card was last drawn, for its little motions: the goal bar glides
    // from where it was (with a light sweep), newly collected suits pop, a changed rank bumps and
    // the cash flashes green or red as it counts.
    const memo = this.cardMemo.get(p.id);
    this.cardMemo.set(p.id, { pct, suits: [...p.suits], rank });
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (memo && !still) {
      const fill = el.querySelector<HTMLElement>('.bar-fill');
      if (fill && Math.abs(memo.pct - pct) > 0.2) {
        fill.classList.add('moving');
        fill
          .animate([{ width: `${memo.pct}%` }, { width: `${pct}%` }], {
            duration: 700,
            easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
          })
          .finished.then(
            () => fill.classList.remove('moving'),
            () => {},
          );
      }
      const suitImgs = el.querySelectorAll<HTMLElement>('.suits > img');
      p.suits.forEach((got, i) => got && !memo.suits[i] && suitImgs[i]?.classList.add('got'));
      if (memo.rank != null && rank != null && memo.rank !== rank)
        el.querySelector('.rank')?.classList.add('bump');
      if (delta && known) cashEl.classList.add(delta > 0 ? 'flash-up' : 'flash-down');
    }
    const animate = () => {
      if (delta && known && el.isConnected) this.moneyPop(el, p.id, delta);
      countUp(nwEl, prev.nw, nw, plain);
      countUp(cashEl, prev.cash, p.cash, plain);
    };
    if (rising) setTimeout(animate, T.cardStack);
    else animate();
    this.shown.set(p.id, { nw, cash: p.cash });
  }

  // ------------------------------------------------------------ info pop-up

  /**
   * Open the info pop-up on a page ('game', 'stocks', 'props' or a player's id), switch it to that page,
   * or close it (null). While a player's page is up, everyone else's properties are greyed out on
   * the board.
   */
  toggleInfo(page: InfoPage | null) {
    if (!this.G) return;
    if (page === 'stocks' && this.G.rules !== 'standard') page = 'game';
    const was = this.infoPage;
    this.infoPage = page;
    // The button or chip that opened the pop-up stays lit while it is open.
    for (const [btn, at] of [
      [this.infoBtn, 'game'],
      [this.stocksChip, 'stocks'],
      [this.propsChip, 'props'],
    ] as const) {
      btn.classList.toggle('on', page === at);
      btn.setAttribute('aria-expanded', String(page === at));
    }
    this.board.focusOwner = typeof page === 'number' ? page : -1;
    if (page == null) {
      if (was != null) this.info.close();
      return;
    }
    if (was == null) this.info.open();
    else this.info.render(true);
  }

  /**
   * While a pop-up is on the screen (the info, stock market or properties pop-up, the stock
   * market or venture board during a choice, an arcade game or a dialog), the rest of the screen
   * is locked: only the action bar and the toolbar's View board, Game log, sound and Menu buttons
   * still work. The info chip, the zoom chip, the player cards (their taps) and the
   * chips under them, and the board (taps and hover) stand still until it closes. Looking at the
   * board with View board unlocks it for as long as the pop-up is away. The stack can still
   * unfold on mouse hover; this is presentation only, never a card or board interaction.
   */
  private updateLock() {
    const layers = this.root.querySelectorAll<HTMLElement>(
      ':scope > .info-layer, :scope > .stock-layer, :scope > .venture-layer, :scope > .arcade-layer',
    );
    const up =
      !this.peeking &&
      ([...layers].some((l) => !l.hidden && l.childElementCount > 0) ||
        this.modalLayer.querySelector('.modal-wrap:not(.closing)') != null);
    if (up === this.locked) return;
    this.locked = up;
    this.root.classList.toggle('locked', up);
    this.board.locked = up;
    if (up) {
      if (this.opened === 'tap') this.closeStack();
      this.board.cardHoverPid = -1;
      this.tooltip.classList.remove('show');
    }
  }

  /** A property clicked in the info pop-up: show it on the board (see `InfoPopup.showOnBoard`). */
  findOnBoard(id: number) {
    this.info.showOnBoard(id);
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
      !this.askHeld &&
      this.ask.classList.contains('status') &&
      this.shownStatus?.text === cur?.text &&
      this.shownStatus?.kind === cur?.kind
    )
      return;
    const from = this.askSize();
    const leaving = this.leaveAsk();
    this.fillStatus();
    waveUnits(this.ask);
    this.morphAsk(from);
    this.revealAskText();
    this.playLeave(leaving);
  }

  private fillStatus() {
    const a = this.ask;
    const cur = this.currentStatus();
    this.shownStatus = cur;
    clear(a);
    this.releaseAskSize();
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
          h('span', { class: 'tick-text' }, ...statusText(this.G, cur.text)),
        ),
      );
    }
  }

  /** Reveal the complete laid-out message without moving text or delaying its buttons. */
  private revealAskText() {
    // New content waves in letter by letter (and piece by piece: icon, ticket, buttons). While the
    // bar is resizing it waits until the bar is nearly its new size, so nothing shows before
    // there is room for it.
    const morphing = this.ask.classList.contains('morphing');
    waveIn(this.ask, morphing ? ASK_WAVE_WAIT : 0, morphing ? ASK_BUTTONS_WAIT : 0);
    // Splitting the text into letters is our own change: don't let the watcher re-morph for it.
    this.askChanges.takeRecords();
  }

  /**
   * Lift the bar's current content out before it is replaced, pinned where it is, so it can wave
   * out (`playLeave`) while the new content comes in. Nothing when the bar is hidden.
   */
  private leaveAsk(): HTMLElement | null {
    const a = this.ask;
    if (!a.classList.contains('show') || matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    const box = a.getBoundingClientRect();
    const style = getComputedStyle(a);
    // The bar grows from its bottom middle (or its bottom left when it sits bottom left), so the
    // lifted content is pinned to that point and stays put on screen while the bar resizes.
    const fromLeft = this.root.classList.contains('ab-left');
    const anchorX = fromLeft ? box.left + parseFloat(style.borderLeftWidth) : box.left + box.width / 2;
    const anchorY = box.bottom - parseFloat(style.borderBottomWidth);
    const layer = h('div', {
      class: `ask-leaving ${fromLeft ? 'from-left' : ''}`,
      'aria-hidden': 'true',
      inert: '',
    });
    const old = [...a.children].filter((c) => !c.classList.contains('ask-leaving')) as HTMLElement[];
    const places = old.map((c) => c.getBoundingClientRect());
    old.forEach((c, i) => {
      const r = places[i];
      Object.assign(c.style, {
        position: 'absolute',
        margin: '0',
        left: `${r.left - anchorX}px`,
        top: `${r.top - anchorY}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      layer.append(c);
    });
    return layer.childElementCount ? layer : null;
  }

  /** Put the lifted content back on top and wave it out quickly, then remove it. */
  private playLeave(layer: HTMLElement | null) {
    if (!layer || !this.ask.classList.contains('show')) return;
    this.ask.append(layer);
    this.askChanges.takeRecords();
    const done = waveOut(layer);
    window.setTimeout(() => layer.remove(), done);
  }

  /** The waiting line the game log last showed, so a new one types in. */
  private logWaitShown: string | undefined;

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

  /**
   * Last resort, so nothing in the action bar is ever cut off: when its options still don't fit
   * beside the player cards (even bottom left), it spreads over them, with the board and the
   * cards blurred behind it (`.ab-over`). Rechecked whenever the bar changes, but never while it
   * is morphing (its size then is mid-way, not what it will be).
   */
  private fitAskOver() {
    const a = this.ask;
    if (a.classList.contains('morphing')) return;
    const was = this.root.classList.contains('ab-over');
    this.root.classList.remove('ab-over');
    const need = a.classList.contains('show') && this.askOverflows();
    this.root.classList.toggle('ab-over', need);
    if (need || was) this.updateInsets();
  }

  /**
   * Whether anything in the action bar is cut off or has to scroll to be seen: a button, the
   * question or one of its chips reaching outside the bar, a button row that has to scroll, or
   * the question squeezed into a sliver. (The bar's own scroll size isn't used: button rows keep
   * a little spare room around them for shadows and the main button's nudge, which pokes past
   * the bar without hiding anything.)
   */
  private askOverflows(): boolean {
    const a = this.ask;
    if (this.askTextSqueezed()) return true;
    // Where an element sits in the bar's layout, ignoring transforms: the wave's bounce and the
    // main button's hop briefly grow or move pieces, and must never count as not fitting.
    const place = (el: HTMLElement) => {
      let x = 0;
      let y = 0;
      let n: HTMLElement | null = el;
      while (n && n !== a) {
        x += n.offsetLeft;
        y += n.offsetTop;
        n = n.offsetParent as HTMLElement | null;
      }
      return n === a ? { left: x, top: y, right: x + el.offsetWidth, bottom: y + el.offsetHeight } : null;
    };
    for (const el of a.querySelectorAll<HTMLElement>('button, .prompt-text, .facts, .m-card, .digits')) {
      // Content on its way out (waving away) doesn't count.
      if (el.closest('.ask-leaving') || !el.offsetWidth) continue;
      const r = place(el);
      if (!r) continue;
      if (r.left < -2 || r.right > a.clientWidth + 2 || r.top < -2 || r.bottom > a.clientHeight + 2)
        return true;
    }
    // A button row whose buttons reach past its own edge (by layout, not animation).
    return [...a.querySelectorAll<HTMLElement>('.btn-row, .tb-btns')].some((row) => {
      const edge = place(row);
      if (!edge) return false;
      return [...row.children].some((c) => {
        const r = place(c as HTMLElement);
        return !!r && r.right > edge.left + row.clientWidth + 2;
      });
    });
  }

  /**
   * Buttons beside the question when they fit, under it when they don't: try the side-by-side
   * layout first and switch to the stacked one (`.ab-col`) only if the buttons wrap onto a second
   * line, the question's title is cut short or the question is squeezed narrow. (If even that
   * doesn't fit, `fitAskOver` spreads the bar over the cards as the last resort.)
   */
  private chooseAskLayout() {
    const a = this.ask;
    a.classList.remove('ab-col');
    // The building picker: the question with Build / Skip side by side in the top right, the
    // building cards across the full width below. When a centered bar squeezes the cards so their
    // names are cut short, the bar uses the bottom-left corner's room while the picker is up.
    const bp = a.querySelector<HTMLElement>('.bp');
    if (bp) {
      // Too small: the cards are squeezed so their names get cut short.
      const names = [...bp.querySelectorAll<HTMLElement>('.bp-name')];
      const small = () => names.some((n) => n.offsetWidth > 0 && n.scrollWidth > n.clientWidth + 1);
      if (small() && !this.askLeft && !this.root.classList.contains('ab-left')) {
        this.askLeft = true;
        this.updateInsets();
        if (small()) {
          this.askLeft = false;
          this.updateInsets();
        }
      }
    } else if (this.askLeft) {
      this.askLeft = false;
      this.updateInsets();
    }
    if (!a.classList.contains('show') || a.classList.contains('status') || a.classList.contains('stacked'))
      return;
    const text = a.querySelector<HTMLElement>(':scope > .prompt-text');
    const row = a.querySelector<HTMLElement>(':scope > .btn-row');
    const btns = row ? ([...row.children] as HTMLElement[]) : [];
    if (!text || !btns.length) return;
    // A row laid out as a column on purpose (two stacked choices) isn't "wrapped".
    const wrapped =
      getComputedStyle(row!).flexDirection !== 'column' &&
      btns.some((b) => b.offsetTop > btns[0].offsetTop + btns[0].offsetHeight / 2);
    const title = text.querySelector<HTMLElement>('.rich-title');
    const cut = !!title && title.scrollWidth > title.clientWidth + 2;
    // Squeezed: a narrow question that has to wrap or is cut (a short one is just short).
    const cs = getComputedStyle(text);
    const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
    const squeezed =
      text.clientWidth < 150 &&
      (text.scrollWidth > text.clientWidth + 2 || (!title && text.offsetHeight > line * 1.6));
    if (wrapped || cut || squeezed) a.classList.add('ab-col');
  }

  /** Measure once, then resize the shell without repeatedly rewrapping its text. */
  private morphAsk(from: { w: number; h: number } | null) {
    const a = this.ask;
    this.updateInsets();
    this.chooseAskLayout();
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
    this.fitAskOver();
    if (!from || !a.classList.contains('show') || matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    const rect = a.getBoundingClientRect();
    const to = { w: rect.width, h: rect.height };
    if (Math.abs(to.w - from.w) < 1 && Math.abs(to.h - from.h) < 1) return;
    const style = getComputedStyle(a);
    const content = h('div', { class: 'ask-content' });
    const bl = parseFloat(style.borderLeftWidth);
    const pl = parseFloat(style.paddingLeft);
    // Keep the destination layout, including phone/stacked prompts, for the whole morph, pinned
    // exactly where it will sit when the bar is done resizing. The bar grows from its bottom
    // middle (bottom left when it sits bottom left), so the content is pinned to the bottom and
    // to that point, and never moves while the bar resizes around it.
    Object.assign(content.style, {
      position: 'absolute',
      bottom: style.paddingBottom,
      left: this.root.classList.contains('ab-left') ? `${pl}px` : `calc(50% + ${bl + pl - to.w / 2}px)`,
      width: `${to.w - bl - parseFloat(style.borderRightWidth) - pl - parseFloat(style.paddingRight)}px`,
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
      { duration: ASK_MORPH_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
    this.askAnim = anim;
    const end = () => {
      if (this.askAnim !== anim) return;
      this.stopAskMorph();
      this.updateInsets();
      this.fitAskOver();
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

  private renderLog(first = false) {
    if (!this.logOpen || !this.G) {
      clear(this.logBox);
      return;
    }
    const old = this.logBox.querySelector('.log-list');
    // Newest turn at the top: the log stays at the top unless the reader scrolled down.
    const keep = old?.scrollTop ?? 0;
    // What was there before the redraw, so what changed can grow, shrink or fade in smoothly
    // (not on the log's first draw, which just appears).
    const animate = !first && this.logSeen >= 0;
    const before: LogBefore = { cards: new Map(), lines: new Set(), waitH: 0 };
    if (old && animate) {
      for (const card of old.querySelectorAll<HTMLElement>('.turn-card'))
        before.cards.set(card.dataset.key ?? '', { folded: card.classList.contains('folded') });
      for (const line of old.querySelectorAll<HTMLElement>('[data-line]'))
        before.lines.add(line.dataset.line!);
      before.waitH =
        old.querySelector('.turn-card.live .log-line.waiting')?.getBoundingClientRect().height ?? 0;
    }
    clear(this.logBox);
    const G = this.G;
    // Lines added since the last render fade in (in place of the waiting line they answer).
    const previous = this.logHeadId ? G.log.findIndex((line) => line.id === this.logHeadId) : -1;
    const fresh =
      this.logSeen < 0
        ? 0
        : this.logHeadId
          ? previous < 0
            ? G.log.length
            : previous
          : Math.max(0, G.log.length - this.logSeen);
    this.logSeen = G.log.length;
    this.logHeadId = G.log[0]?.id;
    const list = logView(G, `${G.round}:${G.turn}`, {
      waiting: this.waiting ?? undefined,
      fresh,
      onTile: (id) => this.board.focusLogTile(id),
      onCard: (id) => this.showCard(id),
      open: this.logOpenTurns,
      onToggle: (key) => {
        if (!this.logOpenTurns.delete(key)) this.logOpenTurns.add(key);
        this.renderLog();
      },
    });
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
    list.scrollTop = first ? 0 : keep;
    if (animate) this.animateLog(list, before);
    this.logWaitShown = this.waiting?.text;
  }

  /**
   * After a redraw of the log, what changed grows, shrinks or fades in smoothly, and because the
   * boxes really change height, everything below moves along with them (nothing jumps):
   * - a new turn's box opens at the top, growing down from nothing;
   * - a turn that folds shrinks to its header, and one opened by hand grows back;
   * - a new entry grows into place (taking over the waiting line's room when it answers it),
   *   fades and rises in, its dot pops and its text uncovers; entries arriving together follow
   *   one another.
   * The log redraws several times per action, so anything still moving carries on from where it
   * was (`logBorn`, `logFold`) instead of restarting or snapping.
   */
  private animateLog(list: HTMLElement, before: LogBefore) {
    const now = performance.now();
    for (const [key, t] of this.logBorn) if (now - t > LOG_SLIDE_MS * 3) this.logBorn.delete(key);
    for (const [key, f] of this.logFold) if (now - f.t > LOG_SLIDE_MS * 3) this.logFold.delete(key);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Measure everything first, then animate: a growing box would change what comes after it.
    const jobs: (() => void)[] = [];
    let fresh = 0;
    for (const card of list.querySelectorAll<HTMLElement>('.turn-card')) {
      const key = card.dataset.key ?? '';
      const was = before.cards.get(key);
      const folded = card.classList.contains('folded');
      const turnBorn = this.logBorn.get(`turn:${key}`);
      if (!was || (turnBorn != null && now - turnBorn < LOG_SLIDE_MS)) {
        // A new turn: its box grows down from nothing at the top of the log.
        const born = this.bornAt(`turn:${key}`, now);
        const ht = card.getBoundingClientRect().height;
        const gap = parseFloat(getComputedStyle(card).marginBottom) || 0;
        jobs.push(() =>
          logGrow(
            card,
            [
              { height: '0px', marginBottom: '0px', opacity: 0 },
              { height: `${ht}px`, marginBottom: `${gap}px`, opacity: 1 },
            ],
            now - born,
          ),
        );
        continue;
      }
      const body = card.querySelector<HTMLElement>('.turn-body');
      if (body && was.folded !== folded) this.logFold.set(key, { t: now, folded });
      const fold = this.logFold.get(key);
      if (body && fold && fold.folded === folded && now - fold.t < LOG_SLIDE_MS) {
        // Folding shrinks the turn's entries away to its header; opening grows them back.
        const ht = body.scrollHeight;
        const open = { height: `${ht}px`, opacity: 1, visibility: 'visible' };
        const shut = { height: '0px', opacity: 0, visibility: 'visible' };
        jobs.push(() => logGrow(body, folded ? [open, shut] : [shut, open], now - fold.t));
      }
      if (folded) continue;
      let waitRoom =
        card.classList.contains('live') && !card.querySelector('.log-line.waiting') ? before.waitH : 0;
      for (const line of card.querySelectorAll<HTMLElement>('[data-line]')) {
        const lineKey = line.dataset.line!;
        if (before.lines.has(lineKey) && !this.logBorn.has(lineKey)) continue;
        // A follow-up arriving with its parent comes in as part of it.
        const parent = line.parentElement?.closest<HTMLElement>('[data-line]');
        if (parent && (!before.lines.has(parent.dataset.line!) || this.logBorn.has(parent.dataset.line!)))
          continue;
        if (!this.logBorn.has(lineKey)) this.logBorn.set(lineKey, now + LOG_STAGGER_MS * fresh++);
        const elapsed = now - this.logBorn.get(lineKey)!;
        if (elapsed >= LOG_SLIDE_MS) continue;
        const ht = line.getBoundingClientRect().height;
        // The first new entry takes over the room of the waiting line it answers.
        const from = Math.min(waitRoom, ht);
        waitRoom = 0;
        jobs.push(() => {
          logGrow(line, [{ height: `${from}px` }, { height: `${ht}px` }], elapsed);
          this.enterLogLine(line, elapsed);
        });
      }
    }
    for (const job of jobs) job();
    const wait = list.querySelector<HTMLElement>('.log-line.waiting > .log-entry');
    if (wait && this.waiting?.text !== this.logWaitShown) typeIn(wait);
  }

  /** When a log item first appeared (`logBorn`), recording it now if it is new. */
  private bornAt(key: string, now: number) {
    if (!this.logBorn.has(key)) this.logBorn.set(key, now);
    return this.logBorn.get(key)!;
  }

  /**
   * A new log line's look as it comes in: it fades and rises a little, its dot pops and its text
   * uncovers left to right. `elapsed` (ms) resumes a line that started before the last redraw;
   * a negative one is a line waiting its turn (staggered), hidden until then.
   */
  private enterLogLine(line: HTMLElement, elapsed: number) {
    const at = (a: Animation) => (a.currentTime = elapsed);
    const entry = line.querySelector<HTMLElement>(':scope > .log-entry');
    if (entry)
      at(
        entry.animate(
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: LOG_SLIDE_MS, easing: LOG_EASE, fill: 'backwards' },
        ),
      );
    const icon = line.querySelector<HTMLElement>(':scope > .log-entry > .log-icon');
    if (icon)
      at(
        icon.animate(
          [
            { transform: 'scale(0.2)', opacity: 0 },
            { transform: 'scale(1.15)', opacity: 1, offset: 0.55 },
            { transform: 'scale(1)', opacity: 1 },
          ],
          { duration: 560, delay: 60, easing: LOG_EASE, fill: 'backwards' },
        ),
      );
    const text = line.querySelector<HTMLElement>(':scope > .log-entry > .log-text');
    if (text)
      at(
        text.animate(
          [
            { clipPath: 'inset(-4px 100% -4px 0)', opacity: 0.3 },
            { clipPath: 'inset(-4px 0% -4px 0)', opacity: 1 },
          ],
          { duration: 520, delay: 140, easing: 'cubic-bezier(0.25, 0.6, 0.35, 1)', fill: 'backwards' },
        ),
      );
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
    const property = sq.t === 'shop' || sq.t === 'plot';
    /** The tooltip speaks to the player whose turn it is: their own building reads differently. */
    const activeOwns = owner != null && G.players[G.order[G.turn]]?.id === owner.id;
    /** A detail line: muted label on the left, the amount on the right. */
    const row = (label: string, value: string) =>
      h('div', { class: 'tt-line' }, h('span', null, label), h('b', null, value));
    let hero: HTMLElement | null = null;
    const lines: HTMLElement[] = [];
    const extra: HTMLElement[] = [];
    if (property) {
      const shopLike = sq.t === 'shop' || sq.b === 'star3';
      if (owner) {
        // Owned: what landing here costs (or, at your own Tax Office, pays) is the headline.
        const fee =
          sq.b === 'tax' || sq.b === 'agency'
            ? buildingLandingLabel(G, sq)
            : sq.b === 'motel'
              ? motelFee(G, sq)
              : fmt(squareFee(G, sq));
        const label = sq.b === 'tax' && activeOwns ? 'Receive' : sq.b === 'agency' ? 'Effect' : 'Fee';
        hero = this.ttHero(isClosed(owner) ? `${label} · shops closed` : label, fee, isClosed(owner));
        if (sq.t === 'shop' || sq.b) lines.push(row('Value', fmt(sq.value)));
        if (shopLike) {
          lines.push(row('Max value', fmt(maxValue(G, sq))));
          lines.push(row('Buyout (5x)', fmt(sq.value * K.buyoutX)));
        }
      } else if (sq.t === 'shop') {
        // For sale: its price is its value, so one number says it.
        hero = this.ttHero('Price', fmt(sq.value));
      }
      if (G.rules === 'standard' && sq.d >= 0)
        lines.push(row('Stock', `${fmt(stockPrice(G, sq.d))} a share`));
      // Explain the effect for the active player, matching the fee or payout headline.
      if (sq.b && BUILDING_INFO[sq.b])
        extra.push(
          h('p', { class: 'tt-info' }, activeOwns ? BUILDING_INFO[sq.b].owner : BUILDING_INFO[sq.b].rival),
        );
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
    } else {
      if (sq.t === 'change') lines.push(row('Offers now', SUITS[G.changeSuit]));
      extra.push(h('p', { class: 'tt-info' }, squareInfo(G, sq)));
    }
    this.tooltip.style.setProperty('--dc', dColor);
    this.tooltip.append(
      h(
        'div',
        { class: 'tt-head' },
        this.tilePicture(sq),
        h(
          'div',
          { class: 'tt-head-text' },
          h('div', { class: 'tt-title' }, shortName(G, sq)),
          property
            ? h(
                'div',
                {
                  class: `tt-owner ${owner ? '' : 'free'}`,
                  style: owner ? `--pc:${PLAYER_COLORS[owner.color]}` : '',
                },
                owner ? [h('img', { src: portraitURL(owner.ch), alt: '' }), owner.name] : 'For sale',
              )
            : null,
        ),
      ),
      hero ?? '',
      lines.length ? h('div', { class: 'tt-lines' }, ...lines) : '',
      ...extra,
    );
    this.placeTooltip(x, y);
  }

  /** The tooltip's headline number (a fee or a price), big and gold. */
  private ttHero(label: string, value: string, off = false) {
    return h('div', { class: `tt-hero ${off ? 'off' : ''}` }, h('span', null, label), h('b', null, value));
  }

  /** A small picture of the tile as it looks on the board, for the tooltip's head. */
  private tilePicture(sq: Square): HTMLCanvasElement {
    const G = this.G!;
    const size = 56;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cv = h('canvas', { class: 'tt-pic', width: size * dpr, height: size * dpr }) as HTMLCanvasElement;
    const ctx = cv.getContext('2d')!;
    const c = squareCenter(sq, G.layout);
    const k = size / 112;
    ctx.setTransform(k * dpr, 0, 0, k * dpr, (size / 2 - c.x * k) * dpr, (size / 2 - (c.y + 3) * k) * dpr);
    paintSquare(ctx, G, sq);
    return cv;
  }

  /** A portal's pop-up: its kind, where it leads (or comes from), and that a tap shows it. */
  showPortalTooltip(gate: PortalGate, x: number, y: number) {
    if (!this.G) return;
    const G = this.G;
    const names = gate.to.map((id) => squareName(G, G.nodes[id]));
    const list =
      names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    const [title, text] =
      gate.way === 'in'
        ? [
            'Entrance portal',
            `Step in to come out next to ${list}. One way: there's no coming back through it.`,
          ]
        : gate.way === 'out'
          ? ['Exit portal', `Players from ${list} come out here. One way: you can't go in.`]
          : ['Portal', `Step through to come out next to ${list}, and back the same way.`];
    clear(this.tooltip);
    this.tooltip.style.setProperty('--dc', gate.color);
    this.tooltip.append(
      h('div', { class: 'tt-title' }, title),
      h('p', { class: 'tt-info' }, text),
      h('p', { class: 'tt-info tt-hint' }, 'Tap it to see where it leads.'),
    );
    this.placeTooltip(x, y);
  }

  /** Show the tooltip below and right of the pointer, flipped above or left near the edges. */
  private placeTooltip(x: number, y: number) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.tooltip.classList.add('show');
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
    const leaving = this.leaveAsk();
    clear(this.ask);
    this.releaseAskSize();
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
      // Coins and letters in place before the bar measures its new size: both change the text's
      // width a little, and the bar must resize to the final layout, not one that rewraps later.
      waveUnits(this.ask);
      this.morphAsk(from);
      this.revealAskText();
      this.playLeave(leaving);
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
    // The choice is complete. Never restore its old "deciding" message (or an older status) while
    // effects animate: the question waves out and the bar waits, empty, for the next message.
    this.messages.decision();
    this.clearAsk();
    if (this.logOpen) this.renderLog();
  }

  /** While the emptied bar waits for its next message (see `clearAsk`); hides it if none comes. */
  private askEmptyTimer = 0;
  /** True while the bar is emptied and held at its old size, waiting for the next message. */
  private askHeld = false;

  /**
   * Empty the action bar after a choice: its content waves out and the bar keeps its size, so the
   * next status line morphs straight from it (no old status in between). If nothing new comes
   * within a moment, it morphs to a fresh line saying whose turn it is, never sitting blank.
   */
  private clearAsk() {
    const a = this.ask;
    clearTimeout(this.askEmptyTimer);
    if (!a.classList.contains('show') || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.showStatus();
      return;
    }
    const { w, h: ht } = this.askSize() ?? { w: 0, h: 0 };
    const leaving = this.leaveAsk();
    clear(a);
    this.shownStatus = null;
    a.classList.remove('stacked');
    a.classList.add('status');
    a.style.removeProperty('--pc');
    Object.assign(a.style, { width: `${w}px`, height: `${ht}px` });
    this.playLeave(leaving);
    this.askChanges.takeRecords();
    this.askHeld = true;
    this.askEmptyTimer = window.setTimeout(() => {
      if (this.promptResolve || !this.askHeld) return;
      // Nothing new yet: say whose turn it is until the next real message replaces it.
      if (!this.currentStatus()) this.messages.fallback(this.turnStatus());
      this.showStatus();
    }, ASK_EMPTY_HOLD);
  }

  /** A neutral status line for gaps: "Rosa's turn..." (or "One moment..." before a game). */
  private turnStatus(): { text: string; kind: IconKind } {
    const G = this.G;
    const p = G && !G.over ? G.players[G.order[G.turn]] : undefined;
    return { text: p ? `${p.name}'s turn...` : 'One moment...', kind: 'wait' };
  }

  /** Let the bar size itself again after `clearAsk` held it. */
  private releaseAskSize() {
    clearTimeout(this.askEmptyTimer);
    this.askHeld = false;
    this.ask.style.removeProperty('width');
    this.ask.style.removeProperty('height');
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
    this.updateLock();
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

  /** `wide`: 760px; 'xl': as wide as its content; 'full': nearly the whole screen (results). */
  modal(title: string, body: Node, opts: { wide?: boolean | 'xl' | 'full'; onClose?: () => void } = {}) {
    const box = h('div', {
      class: `modal glass ${opts.wide ? 'wide' : ''} ${opts.wide === 'xl' || opts.wide === 'full' ? opts.wide : ''}`,
    });
    const head = h('div', { class: 'modal-head' }, h('h2', null, title));
    if (opts.onClose)
      head.append(h('button', { class: 'btn small ghost', onclick: () => opts.onClose!() }, 'Close'));
    box.append(head, body);
    const wrap = h('div', { class: 'modal-wrap' }, box);
    // Dialogs opened from the menu (quit, rules) go over it.
    if (this.menuModal) wrap.classList.add('over-menu');
    this.modalLayer.append(wrap);
    // Closing plays the opening backwards, refined: a tiny lift, then it sinks and fades as the
    // backdrop clears. The screen unlocks straight away (the closing box no longer counts).
    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      wrap.classList.add('closing');
      this.updateLock();
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || !wrap.isConnected) return wrap.remove();
      box.getAnimations().forEach((a) => a.cancel());
      box.animate(POP_OUT, { duration: 220, easing: 'ease-in', fill: 'forwards' });
      wrap.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 220,
        easing: 'ease-in',
        fill: 'forwards',
      }).onfinish = () => wrap.remove();
    };
    return { el: box, body, close };
  }

  /**
   * A venture card's details, opened from its line in the game log: its number, title and what
   * it does, on a purple card like the venture board's.
   */
  showCard(id: string) {
    const card = CARDS[id];
    if (!card) return;
    const m = this.modal(
      'Venture card',
      h(
        'div',
        { class: 'vc-pop' },
        h('span', { class: 'vc-num' }, String(card.number)),
        h('div', { class: 'vc-body' }, h('b', { class: 'vc-title' }, card.title), h('p', null, card.text)),
      ),
      { onClose: () => m.close() },
    );
    m.el.classList.add('vc-modal');
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

  /**
   * A banner across the top of the board for a moment. With `ch` (a character) it is a turn
   * banner: that character stands inside its left end and hops up into place.
   */
  banner(text: string, color?: string, ms = 1400, ch?: unknown) {
    const el = h(
      'div',
      { class: `banner ${ch != null ? 'turn' : ''}`, style: color ? `--bc:${color}` : '' },
      ch != null ? h('img', { class: 'banner-char', src: bodyURL(ch), alt: '' }) : null,
      h('span', null, text),
    );
    this.bannerLayer.append(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => this.dropBanner(el), ms + 500);
  }

  /**
   * Take a faded banner out of the column. The banners still showing (the player's turn chip
   * under the round chip, say) glide up into the space it leaves instead of jumping there.
   */
  private dropBanner(el: HTMLElement) {
    const rest = [...this.bannerLayer.children].filter((x) => x !== el) as HTMLElement[];
    const before = rest.map((x) => x.getBoundingClientRect().top);
    el.remove();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    rest.forEach((x, i) => {
      const dy = before[i] - x.getBoundingClientRect().top;
      if (Math.abs(dy) > 0.5)
        x.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], {
          duration: T.bannerShift,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        });
    });
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

/** The game menu's row pictures (24x24 stroke paths), one per row kind. */
const GM_ICONS: Record<string, string> = {
  guide: 'M4 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4zM20 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z',
  auto: 'M8 8h8a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3zM12 8V5M9.5 13v.5M14.5 13v.5',
  fast: 'M13 3L5 13h6l-1 8 8-10h-6z',
  full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  quit: 'M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9',
};

/**
 * One game-menu row: a colored icon tile, a Lilita name with a short muted line under it, and
 * (for switches, when `on` is given) a switch on the right.
 */
function gmRow(
  kind: string,
  label: string,
  sub: string,
  onclick: (() => void) | null,
  on?: boolean,
  cls = '',
): HTMLButtonElement {
  const toggle = on !== undefined && kind !== 'quit';
  return h(
    'button',
    {
      class: `gm-item gm-${kind} ${toggle ? 'gm-toggle' : ''} ${on ? 'on' : ''} ${cls}`,
      role: toggle ? 'menuitemcheckbox' : 'menuitem',
      ...(toggle ? { 'aria-checked': String(on) } : {}),
      ...(onclick ? { onclick } : {}),
    },
    h('span', { class: 'gm-ico', 'aria-hidden': 'true' }, svgIcon(GM_ICONS[kind], 24)),
    h('span', { class: 'gm-text' }, h('b', null, label), h('small', null, sub)),
    toggle ? h('span', { class: 'gm-switch', 'aria-hidden': 'true' }) : null,
  ) as HTMLButtonElement;
}

/** A small stroked SVG from one path, drawn in the current text color. */
function svgIcon(d: string, box: number) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${box} ${box}`);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', box > 12 ? '2.2' : '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
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

/** The active card's slide out of a list (matches the CSS for `.pcard.active`). */
const ACTIVE_SHIFT = 'translateX(-12px)';

/** How many cards peek out behind the front card when the player cards are collapsed. */
const STACK_SHOWN = 3;

/** A collapsed card's place `d` cards behind the front (matches the CSS for `.pcard.behind`). */
function stackTransform(d: number): string {
  return d ? `translateY(${-d * 7}px) scale(${1 - d * 0.05})` : 'none';
}
/** How the player cards are shown: a list or a stack. */
export type CardsMode = 'list' | 'smart';

/** The layout chip's tooltip and icon (16 x 16) for each layout. */
const CARDS_MODES: Record<CardsMode, { title: string; icon: string }> = {
  list: {
    title: 'List: every player card is shown. Tap for Stack.',
    icon: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2" width="11" height="3" rx="1"/><rect x="2.5" y="6.5" width="11" height="3" rx="1"/><rect x="2.5" y="11" width="11" height="3" rx="1"/></svg>',
  },
  smart: {
    title: "Stack: the active player's card in front; cards that change pop out for a moment. Tap for List.",
    icon: '<svg viewBox="0 0 16 16"><path d="M4 2.5h8M3 5h10"/><rect x="2" y="7.5" width="12" height="6" rx="1.5"/></svg>',
  },
};
const MODE_KEY = 'adventure-avenue-cards-mode';
/** The older on/off setting (a stack when '1'), read once so the choice carries over. */
const COLLAPSE_KEY = 'adventure-avenue-cards-collapsed';
function loadCardsMode(): CardsMode {
  try {
    const m = localStorage.getItem(MODE_KEY);
    if (m === 'list' || m === 'smart') return m;
    // Preserve the old saved Stack preference alongside the current internal smart value.
    if (m === 'stack') return 'smart';
    return localStorage.getItem(COLLAPSE_KEY) === '1' ? 'smart' : 'list';
  } catch {
    return 'list';
  }
}
function saveCardsMode(mode: CardsMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}
