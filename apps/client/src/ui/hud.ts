/**
 * Dark-glass overlays floating over the board: title pill, top-right toolbar, ticker and
 * action bar, player cards, market/log drawer, tooltip, modals and banners.
 */
import {
  PLAYER_COLORS,
  K,
  SUITS,
  dominated,
  isClosed,
  maxValue,
  netWorth,
  ownedCount,
  squareFee,
  stockPrice,
  type GameState,
  type Player,
} from '@aa/engine';
import type { BoardView } from '../board';
import { squareName } from '../names';
import { portraitURL, suitIconURL } from '../sprites';
import { clear, fmt, h } from './dom';
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
  onToggleView(): void;
  onToggleFast(): void;
  onQuit(): void;
  onRules(): void;
}

export class Hud {
  root: HTMLElement;
  title = h('div', { class: 'title-pill glass' });
  toolbar = h('div', { class: 'toolbar' });
  ticker = h('div', { class: 'ticker glass' });
  bar = h('div', { class: 'action-bar glass' });
  cardsWrap = h('div', { class: 'cards-wrap' });
  cards = h('div', { class: 'cards' });
  cardsToggle = h('button', { class: 'btn small ghost cards-toggle' }, 'Hide');
  drawer = h('div', { class: 'drawer glass' });
  tooltip = h('div', { class: 'tooltip glass' });
  modalLayer = h('div', { class: 'modal-layer' });
  bannerLayer = h('div', { class: 'banner-layer' });
  G!: GameState;
  activePid = -1;
  drawerMode: 'market' | 'log' | null = null;
  cardsHidden = false;
  private shown = new Map<number, { nw: number; cash: number }>();
  private cardEls = new Map<number, HTMLElement>();
  private promptResolve: ((v: any) => void) | null = null;
  private mainButton: HTMLButtonElement | null = null;
  viewBtn = h('button', { class: 'btn small' });
  fastBtn = h('button', { class: 'btn small' });

  constructor(
    parent: HTMLElement,
    public board: BoardView,
    cb: HudCallbacks,
  ) {
    this.root = h('div', { class: 'hud' });
    const bottomLeft = h('div', { class: 'bottom-left' }, this.ticker, this.bar);
    this.cardsWrap.append(this.cardsToggle, this.cards);
    this.root.append(
      this.title,
      this.toolbar,
      bottomLeft,
      this.cardsWrap,
      this.drawer,
      this.tooltip,
      this.modalLayer,
      this.bannerLayer,
    );
    parent.append(this.root);

    this.viewBtn.onclick = cb.onToggleView;
    this.fastBtn.onclick = cb.onToggleFast;
    const fs = h('button', { class: 'btn small', onclick: () => toggleFullscreen() }, 'Full screen');
    this.toolbar.append(
      this.viewBtn,
      this.fastBtn,
      h('button', { class: 'btn small market-btn', onclick: () => this.toggleDrawer('market') }, 'Market'),
      h('button', { class: 'btn small', onclick: () => this.toggleDrawer('log') }, 'Log'),
    );
    if (document.fullscreenEnabled) this.toolbar.append(fs);
    this.toolbar.append(
      h('button', { class: 'btn small', onclick: cb.onRules }, 'Rules'),
      h('button', { class: 'btn small danger', onclick: cb.onQuit }, 'Quit'),
    );
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
    this.root.remove();
  }

  private onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if ((e.key === 'Enter' || e.key === ' ') && !this.modalLayer.childElementCount && this.mainButton) {
      e.preventDefault();
      this.mainButton.click();
    }
  };

  setViewLabel(mode: 'follow' | 'full') {
    this.viewBtn.textContent = mode === 'follow' ? 'Full board' : 'Follow player';
  }

  setFastLabel(fast: boolean) {
    this.fastBtn.textContent = fast ? 'Fast CPU: on' : 'Fast CPU: off';
    this.fastBtn.classList.toggle('on', fast);
  }

  /** Tell the board which parts of the screen the overlays cover. */
  updateInsets() {
    const W = window.innerWidth;
    const portraitStack = this.root.classList.contains('upright');
    const bar = this.bar.parentElement!.getBoundingClientRect();
    const cards = this.cardsWrap.getBoundingClientRect();
    const title = this.title.getBoundingClientRect();
    if (portraitStack) this.root.style.setProperty('--cards-h', `${this.cardsWrap.offsetHeight + 6}px`);
    let right = 0;
    if (!this.cardsHidden && !portraitStack && cards.width) right = Math.min(W * 0.4, W - cards.left + 8);
    const bottom = window.innerHeight - Math.min(bar.top, portraitStack ? cards.top : bar.top) + 4;
    this.board.insets = { top: title.bottom + 6, right, bottom: Math.max(0, bottom), left: 0 };
  }

  // ------------------------------------------------------------ state rendering

  render(G: GameState) {
    this.G = G;
    const roundText = G.roundCap
      ? `Round ${Math.min(G.round, G.roundCap)} / ${G.roundCap}`
      : `Round ${G.round}`;
    this.title.innerHTML = '';
    this.title.append(
      h('span', { class: 'logo' }, 'Adventure Avenue'),
      h('span', { class: 'sep' }, roundText),
      h('span', { class: 'sep' }, `Target ${fmt(G.target)}`),
      h('span', { class: 'sep' }, G.rules === 'standard' ? 'Standard' : 'Easy'),
    );
    this.toolbar.querySelector('.market-btn')?.toggleAttribute('hidden', G.rules !== 'standard');
    this.renderCards();
    if (this.drawerMode) this.renderDrawer();
  }

  renderCards() {
    const G = this.G;
    const order = G.order.map((id) => G.players[id]);
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
    const seat = p.cpu ? 'CPU' : `P${p.slot + 1}`;
    const nwEl = h('span', { class: 'nw' }, fmt(prev.nw));
    const cashEl = h('span', { class: 'cash' }, fmt(prev.cash));
    const pct = Math.max(0, Math.min(100, (nw / G.target) * 100));
    el.append(
      h('img', { class: 'portrait', src: portraitURL(p.ch, color), alt: '' }),
      h(
        'div',
        { class: 'pc-main' },
        h(
          'div',
          { class: 'pc-row' },
          h('span', { class: 'pname' }, p.name),
          h('span', { class: 'seat' }, seat),
          h('span', { class: 'lvl' }, `Lv ${p.level}`),
        ),
        h(
          'div',
          { class: 'pc-row suits' },
          ...SUITS.map((_, i) => h('img', { src: suitIconURL(i, p.suits[i]), alt: SUITS[i] })),
          p.wild ? h('span', { class: 'wild' }, `+${p.wild} wild`) : null,
          ...tags.map((t) => h('span', { class: 'tag' }, t)),
        ),
        h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: `width:${pct}%` })),
        h(
          'div',
          { class: 'pc-row money' },
          h('span', { class: 'lbl' }, 'Net'),
          nwEl,
          h('span', { class: 'lbl' }, 'Cash'),
          cashEl,
        ),
      ),
    );
    countUp(nwEl, prev.nw, nw);
    countUp(cashEl, prev.cash, p.cash);
    this.shown.set(p.id, { nw, cash: p.cash });
  }

  // ------------------------------------------------------------ ticker, log, drawer

  tick(text: string, color?: number) {
    clear(this.ticker);
    const dot =
      color != null && color >= 0
        ? h('span', { class: 'dot', style: `background:${PLAYER_COLORS[color]}` })
        : null;
    const line = h('div', { class: 'tick-line rise' }, dot, text);
    this.ticker.append(line);
    if (this.drawerMode === 'log') this.renderDrawer();
  }

  toggleDrawer(mode: 'market' | 'log') {
    this.drawerMode = this.drawerMode === mode ? null : mode;
    this.drawer.classList.toggle('open', !!this.drawerMode);
    this.renderDrawer();
  }

  renderDrawer() {
    clear(this.drawer);
    if (!this.drawerMode) return;
    const close = h(
      'button',
      { class: 'btn small ghost', onclick: () => this.toggleDrawer(this.drawerMode!) },
      'Close',
    );
    if (this.drawerMode === 'log') {
      this.drawer.append(
        h('div', { class: 'drawer-head' }, h('h3', null, 'Game log'), close),
        h(
          'div',
          { class: 'log-list' },
          ...this.G.log.map((l) =>
            h(
              'div',
              { class: 'log-line' },
              l.color != null && l.color >= 0
                ? h('span', { class: 'dot', style: `background:${PLAYER_COLORS[l.color]}` })
                : null,
              l.text,
            ),
          ),
        ),
      );
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
    const rows: [string, string][] = [];
    const owner = sq.owner >= 0 ? G.players[sq.owner] : null;
    if (sq.t === 'shop' || sq.t === 'plot') {
      rows.push(['Owner', owner ? owner.name : 'For sale']);
      if (sq.t === 'shop' || sq.b) rows.push(['Value', fmt(sq.value)]);
      if (owner && sq.b !== 'agency') {
        const fee = sq.b === 'tax' ? '10% of net worth' : fmt(squareFee(G, sq));
        rows.push(['Fee', owner && isClosed(owner) ? `${fee} (closed)` : fee]);
      }
      if (sq.t === 'shop' || sq.b === 'star3') {
        rows.push(['Max value', fmt(maxValue(G, sq))]);
        if (owner) rows.push(['Buyout', fmt(sq.value * K.buyoutX)]);
      }
      if (sq.g >= 0) {
        const grp = G.groups[sq.g];
        const label = G.rules === 'standard' ? 'District' : 'Row';
        const own = owner
          ? `${ownedCount(G, owner.id, sq.g)}/${grp.length} owned by ${owner.name}`
          : `${grp.length} squares`;
        rows.push([label, own + (owner && dominated(G, owner.id, sq.g) ? ' (dominated)' : '')]);
      }
      if (G.rules === 'standard' && sq.d >= 0) rows.push(['Stock', `${fmt(stockPrice(G, sq.d))} / share`]);
    } else if (sq.t === 'change') {
      rows.push(['Offers', SUITS[G.changeSuit]]);
    }
    this.tooltip.append(
      h('div', { class: 'tt-title' }, squareName(G, sq)),
      ...rows.map(([k, v]) => h('div', { class: 'tt-row' }, h('span', null, k), h('b', null, v))),
    );
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.tooltip.style.left = `${Math.min(W - 250, x + 14)}px`;
    this.tooltip.style.top = `${Math.min(H - 200, y + 14)}px`;
    this.tooltip.classList.add('show');
  }

  // ------------------------------------------------------------ action bar

  prompt<T>(text: string, buttons: PromptButton<T>[], color?: number): Promise<T> {
    this.cancelPrompt();
    clear(this.bar);
    const head = h('div', { class: 'prompt-text rise' });
    if (color != null) head.append(h('span', { class: 'dot', style: `background:${PLAYER_COLORS[color]}` }));
    head.append(text);
    const row = h('div', { class: 'btn-row' });
    this.bar.append(head, row);
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
          h('img', { class: 'portrait big', src: portraitURL(p.ch, PLAYER_COLORS[p.color], 8), alt: '' }),
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
