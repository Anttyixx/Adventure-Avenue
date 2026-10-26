/**
 * Dark-glass overlays floating over the board: top-right toolbar, ticker (opens the log) and
 * action bar, player cards, market/log drawer, tooltip, modals and banners.
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
import { squareName } from '../names';
import { suitIconURL, wildIconURL } from '../icons';
import { portraitURL } from '../sprites';
import { clear, fmt, h } from './dom';
import { logView } from './log';
import { marketView } from './market';

export interface PromptButton<T> {
  label: string;
  value: T;
  main?: boolean;
  disabled?: boolean;
  secondary?: boolean;
  hover?: (on: boolean) => void;
}

export interface HudCallbacks {
  onToggleFast(): void;
  /** Leave the game (already confirmed by the player). */
  onQuit(): void;
  onRules(): void;
  /** The question to confirm quitting with, or null to quit without asking (game over). */
  quitQuestion?(): string | null;
}

export class Hud {
  root: HTMLElement;
  toolbar = h('div', { class: 'toolbar' });
  /** Current zoom; tapping it zooms back in on the player. */
  zoomChip = h('button', { class: 'zoom-chip', title: 'Zoom: scroll, pinch or - / +. Tap to reset.' });
  /** The last action; tapping it opens the game log above it. */
  ticker = h('div', { class: 'ticker glass', role: 'button', tabindex: '0', 'aria-expanded': 'false' });
  /** Round, target and rules, shown at the top of the game menu. */
  gameInfo = h('div', { class: 'gm-info' });
  bar = h('div', { class: 'action-bar glass' });
  /** The current player's options, centered near the bottom of the board. */
  ask = h('div', { class: 'prompt-center glass' });
  cardsWrap = h('div', { class: 'cards-wrap' });
  cards = h('div', { class: 'cards' });
  cardsToggle = h('button', { class: 'btn small ghost cards-toggle' }, 'Hide');
  /** The game log, opened from the ticker in the bottom left. */
  logBox = h('div', { class: 'log-panel glass' });
  logOpen = false;
  roomBtn = h('button', { class: 'btn small ghost cards-toggle', hidden: true }, 'Room');
  drawer = h('div', { class: 'drawer glass' });
  tooltip = h('div', { class: 'tooltip glass' });
  modalLayer = h('div', { class: 'modal-layer' });
  bannerLayer = h('div', { class: 'banner-layer' });
  G!: GameState;
  activePid = -1;
  drawerMode: 'market' | 'log' | null = null;
  cardsHidden = false;
  /** Extra space covered on the left (e.g. the UI Lab panel). */
  leftInset = 0;
  private shown = new Map<number, { nw: number; cash: number }>();
  private ranks = new Map<number, number>();
  /** Money popups currently floating beside each card (to stack them). */
  private pops = new Map<number, number>();
  private cardEls = new Map<number, HTMLElement>();
  private promptResolve: ((v: any) => void) | null = null;
  private mainButton: HTMLButtonElement | null = null;
  fastBtn = h('button', { class: 'btn small' });

  constructor(
    parent: HTMLElement,
    public board: BoardView,
    cb: HudCallbacks,
  ) {
    this.root = h('div', { class: 'hud' });
    const bottomLeft = h('div', { class: 'bottom-left' }, this.logBox, this.ticker, this.bar);
    this.cardsWrap.append(h('div', { class: 'cards-head' }, this.roomBtn, this.cardsToggle), this.cards);
    this.ticker.onclick = () => this.toggleLog();
    this.ticker.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggleLog();
      }
    };
    this.root.append(
      this.toolbar,
      bottomLeft,
      this.ask,
      this.cardsWrap,
      this.drawer,
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
    this.marketBtn.onclick = () => this.toggleDrawer('market');
    this.toolbar.append(this.zoomChip, this.marketBtn, this.menuBtn, this.menu);
    this.buildMenu();
    this.cardsToggle.onclick = () => {
      this.cardsHidden = !this.cardsHidden;
      this.cardsWrap.classList.toggle('hidden-cards', this.cardsHidden);
      this.cardsToggle.textContent = this.cardsHidden ? 'Show' : 'Hide';
      this.updateInsets();
    };
    window.addEventListener('keydown', this.onKey);
    board.onHover = (id, x, y) => this.showTooltip(id, x, y);
    new ResizeObserver(() => this.updateInsets()).observe(this.root);
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    document.removeEventListener('pointerdown', this.menuOutside, true);
    this.root.remove();
  }

  // ------------------------------------------------------------ game menu

  private cb: HudCallbacks;
  menuBtn = h(
    'button',
    { class: 'btn small menu-toggle', 'aria-haspopup': 'true', 'aria-expanded': 'false' },
    '☰ Menu',
  );
  menu = h('div', { class: 'game-menu glass', role: 'menu', hidden: true });
  /** Opens the stock market drawer (Standard rules only); sits beside the Menu button. */
  marketBtn = h('button', { class: 'btn small market-btn' }, 'Stock market');

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
      h('div', { class: 'gm-head' }, 'Menu'),
      this.gameInfo,
      item('Rules', close(this.cb.onRules)),
      this.fastBtn,
    );
    if (document.fullscreenEnabled) this.menu.append(item('Full screen', close(toggleFullscreen)));
    this.menu.append(
      h('div', { class: 'gm-sound' }, h('div', { class: 'gm-label' }, 'Sound'), soundControls()),
      item('Quit game', () => this.confirmQuit(), 'danger'),
    );
  }

  toggleMenu(open = this.menu.hidden) {
    this.menu.hidden = !open;
    this.menuBtn.setAttribute('aria-expanded', String(open));
    this.menuBtn.classList.toggle('on', open);
    if (open) document.addEventListener('pointerdown', this.menuOutside, true);
    else document.removeEventListener('pointerdown', this.menuOutside, true);
  }

  private menuOutside = (e: PointerEvent) => {
    const t = e.target as Node;
    // Clicks in the menu, on its button or in a dialog opened from it keep it open.
    if (this.menu.contains(t) || this.menuBtn.contains(t) || this.modalLayer.contains(t)) return;
    this.toggleMenu(false);
  };

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
            { class: 'btn danger', onclick: () => (m.close(), this.toggleMenu(false), this.cb.onQuit()) },
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
    if (e.key === 'Escape' && !this.menu.hidden && !this.modalLayer.querySelector('.quit-modal')) {
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
    const portraitStack = this.root.classList.contains('upright');
    const bottomLeft = this.bar.parentElement!;
    const ask = this.ask.getBoundingClientRect();
    // When the options would cover the ticker (narrow screens, long lines), the ticker and log
    // move up to sit just above them.
    const tick = this.ticker.getBoundingClientRect();
    const covered = ask.height > 0 && tick.width > 0 && tick.right > ask.left && tick.left < ask.right;
    bottomLeft.style.bottom = covered ? `${window.innerHeight - ask.top + 6}px` : '';
    const bar = bottomLeft.getBoundingClientRect();
    const cards = this.cardsWrap.getBoundingClientRect();
    const tools = this.toolbar.getBoundingClientRect();
    if (portraitStack) this.root.style.setProperty('--cards-h', `${this.cardsWrap.offsetHeight + 6}px`);
    let right = 0;
    if (!this.cardsHidden && !portraitStack && cards.width) right = Math.min(W * 0.4, W - cards.left + 8);
    // A lifted ticker is left out, so a new ticker line never moves the camera.
    const top = Math.min(
      covered ? Infinity : bar.top,
      ask.height ? ask.top : Infinity,
      portraitStack ? cards.top : Infinity,
    );
    const bottom = window.innerHeight - top + 4;
    this.board.insets = { top: tools.bottom + 6, right, bottom: Math.max(0, bottom), left: this.leftInset };
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
    this.marketBtn.hidden = G.rules !== 'standard';
    this.renderCards();
    if (this.drawerMode) this.renderDrawer();
    if (this.logOpen) this.renderLog();
  }

  renderCards() {
    const G = this.G;
    const order = G.order.map((id) => G.players[id]);
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
    clear(el);
    const tags: string[] = [];
    if (isClosed(p)) tags.push('Closed');
    if (p.boon > 0) tags.push(`${p.boon === K.boom ? 'Boom' : 'Boon'} ${Math.round(p.boon * 100)}%`);
    if (p.boost > 1) tags.push('Fees +30%');
    if (p.bankrupt) tags.push('Bankrupt');
    else if (nw >= G.target && !G.over) tags.unshift('Can win! Get to the bank');
    const nwEl = h('span', { class: 'nw' }, fmt(prev.nw));
    const cashEl = h('span', { class: 'cash' }, fmt(prev.cash));
    const pct = Math.max(0, Math.min(100, (nw / G.target) * 100));
    const extras = tags.map((t) => h('span', { class: 'tag' }, t));
    const rank = this.ranks.get(p.id);
    const active = p.id === this.activePid && !G.over;
    el.append(
      active ? h('span', { class: 'turn-tag' }, 'Turn') : '',
      h('div', { class: 'pc-side' }, h('img', { class: 'portrait', src: portraitURL(p.ch), alt: '' })),
      h(
        'div',
        { class: 'pc-main' },
        h(
          'div',
          { class: 'pc-row pc-top' },
          // Place, beside the name so it never covers the character.
          rank && !p.bankrupt
            ? h('span', { class: `rank r${rank}`, title: `Rank ${rank}` }, ordinal(rank))
            : null,
          h('span', { class: 'pname' }, p.name),
          p.cpu ? null : h('span', { class: 'seat' }, `P${p.slot + 1}`),
          h('span', { class: 'lvl' }, `Lv ${p.level}`),
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
        h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: `width:${pct}%` })),
        h(
          'div',
          { class: 'pc-row money' },
          h('span', { class: 'm-cash' }, h('span', { class: 'lbl' }, 'Cash'), cashEl),
          h('span', { class: 'm-nw' }, h('span', { class: 'lbl' }, 'Net'), nwEl),
        ),
      ),
    );
    const delta = p.cash - prev.cash;
    if (delta && this.shown.has(p.id)) this.moneyPop(el, p.id, delta);
    countUp(nwEl, prev.nw, nw);
    countUp(cashEl, prev.cash, p.cash);
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

  // ------------------------------------------------------------ ticker, log, drawer

  tick(text: string, color?: number) {
    clear(this.ticker);
    const dot =
      color != null && color >= 0
        ? h('span', { class: 'dot', style: `background:${PLAYER_COLORS[color]}` })
        : null;
    const line = h('div', { class: 'tick-line rise' }, dot, h('span', { class: 'tick-text' }, text));
    this.ticker.append(line, h('span', { class: 'tick-more', 'aria-hidden': 'true' }));
    this.updateInsets();
    if (this.drawerMode === 'log') this.renderDrawer();
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
            'Anyone who drops out can rejoin: open the game, tap Play online, then Join a game and type this code (with the same name).',
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

  /** Open or close the game log above the ticker. */
  toggleLog(open = !this.logOpen) {
    this.logOpen = open;
    this.root.classList.toggle('log-open', open);
    this.ticker.setAttribute('aria-expanded', String(open));
    this.renderLog(true);
    this.updateInsets();
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
    const list = logView(G, `${G.round}:${G.turn}`);
    this.logBox.append(
      h(
        'div',
        { class: 'drawer-head' },
        h('h3', null, 'Game log'),
        h('button', { class: 'btn small ghost', onclick: () => this.toggleLog(false) }, 'Close'),
      ),
      list,
    );
    list.scrollTop = toBottom || atBottom ? list.scrollHeight : keep;
  }

  toggleDrawer(mode: 'market' | 'log') {
    if (mode === 'log') return this.toggleLog();
    this.drawerMode = this.drawerMode === mode ? null : mode;
    this.drawer.classList.toggle('open', !!this.drawerMode);
    this.marketBtn.classList.toggle('on', this.drawerMode === 'market');
    this.renderDrawer();
  }

  renderDrawer() {
    // Keep the reader's place when the drawer refreshes during a turn.
    const keep = this.drawer.querySelector('.log-list')?.scrollTop ?? 0;
    const keepDrawer = this.drawer.scrollTop;
    clear(this.drawer);
    if (!this.drawerMode) return;
    const close = h(
      'button',
      { class: 'btn small ghost', onclick: () => this.toggleDrawer(this.drawerMode!) },
      'Close',
    );
    if (this.drawerMode === 'log') {
      const G = this.G;
      this.drawer.append(
        h('div', { class: 'drawer-head' }, h('h3', null, 'Game log'), close),
        logView(G, `${G.round}:${G.turn}`),
      );
      const list = this.drawer.querySelector('.log-list');
      if (list) list.scrollTop = keep;
      this.drawer.scrollTop = keepDrawer;
    } else {
      this.drawer.append(
        h('div', { class: 'drawer-head' }, h('h3', null, 'Stock market'), close),
        marketView(this.G, null),
      );
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

  /** Show the current player's options. `text` may be rich content (tables, chips). */
  prompt<T>(text: string | Node, buttons: PromptButton<T>[], color?: number): Promise<T> {
    this.cancelPrompt();
    clear(this.bar);
    clear(this.ask);
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
            class: `btn ${b.main ? 'main nudge' : ''} ${b.secondary ? 'ghost' : ''}`,
            disabled: !!b.disabled,
          },
          b.label,
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
      this.updateInsets();
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
    clear(this.bar);
    clear(this.ask);
    this.updateInsets();
  }

  cancelPrompt() {
    this.promptResolve = null;
    this.mainButton = null;
  }

  status(text: string, color?: number) {
    if (this.promptResolve) return;
    clear(this.bar);
    const head = h('div', { class: 'prompt-text muted' });
    if (color != null) head.append(h('span', { class: 'dot', style: `background:${PLAYER_COLORS[color]}` }));
    head.append(text);
    this.bar.append(head);
  }

  // ------------------------------------------------------------ modals and banners

  modal(title: string, body: Node, opts: { wide?: boolean; onClose?: () => void } = {}) {
    const box = h('div', { class: `modal glass ${opts.wide ? 'wide' : ''}` });
    const head = h('div', { class: 'modal-head' }, h('h2', null, title));
    if (opts.onClose)
      head.append(h('button', { class: 'btn small ghost', onclick: () => opts.onClose!() }, 'Close'));
    box.append(head, body);
    const wrap = h('div', { class: 'modal-wrap' }, box);
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

function countUp(el: HTMLElement, from: number, to: number) {
  if (from === to) {
    el.textContent = fmt(to);
    return;
  }
  el.classList.add(to > from ? 'up' : 'down');
  const t0 = performance.now();
  const dur = 600;
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    el.textContent = fmt(from + (to - from) * k);
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
