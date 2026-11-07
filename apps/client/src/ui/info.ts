/**
 * The info pop-up, opened by the Info button beside the info chip (or a player card): one place to
 * read about the game. It sits in the middle of the screen like the stock market, and the page is
 * picked in the action bar: Game (the rules in play, the goal, the turn and the standings),
 * Stocks (the stock market, Standard rules only) or a player (everything about them).
 *
 * The action bar while it is open is a stand-in laid over the real one, so whatever the game
 * shows meanwhile (statuses, a choice waiting for the player) is still there when it closes.
 */
import {
  PLAYER_COLORS,
  SUITS,
  canPromote,
  netWorth,
  ranking,
  type GameState,
  type Player,
  type Square,
} from '@aa/engine';
import { bodyURL, portraitURL } from '../sprites';
import { suitIconURL, wildIconURL } from '../icons';
import { clear, fmt, h } from './dom';
import type { Hud } from './hud';
import { marketView } from './market';
import { shortName } from '../names';
import { keepClearOfCards } from './modals';
import { ordinal, playerOverview, propertyCard, section } from './overview';

/** Unowned property art is grey, as on the board. */
const UNOWNED_ART = '#9aa3b8';

/** What the info pop-up shows: the game, the stock market, or a player (their id). */
export type InfoPage = 'game' | 'stocks' | 'props' | number;

const STILL = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The pop-ups' opening and closing motion (as for the stock market and View board). */
const AWAY = { transform: 'translateY(14px) scale(0.97)', opacity: 0 };
const HERE = { transform: 'none', opacity: 1 };

export class InfoPopup {
  private layer = h('div', { class: 'info-layer', hidden: true });
  private box = h('div', { class: 'modal glass info-pop', role: 'dialog', 'aria-label': 'Info' });
  /** Stands in for the action bar while the pop-up is open (same place, same look). */
  private bar = h('div', { class: 'prompt-center glass show info-bar', hidden: true });
  private unplace = () => {};
  private release = () => {};
  /** The page drawn last, so a page change scrolls back to the top but a refresh keeps its place. */
  private drawn: InfoPage | null = null;

  /** Back, in the pop-up's top right corner: closes the pop-up. */
  private back = h('button', { class: 'btn small ghost info-close', title: 'Close the info pop-up' }, 'Back');
  /** The page now shown (its content swaps with a slide when the page changes). */
  private pageEl: HTMLElement | null = null;

  constructor(private hud: Hud) {
    this.back.onclick = () => hud.toggleInfo(null);
    this.layer.append(this.box);
    hud.root.append(this.layer, this.bar);
    // The page chips get room checks as the window (or the bar) changes size.
    new ResizeObserver(() => this.fitTabs()).observe(this.bar);
  }

  /**
   * When the page chips don't all fit the action bar's widest size, the player chips show just
   * the player's sprite (no name; it stays as the chip's title).
   */
  private fitTabs() {
    const tabs = this.bar.querySelector<HTMLElement>('.info-tabs');
    if (!tabs || this.bar.hidden) return;
    tabs.classList.remove('compact');
    if (tabs.scrollWidth > tabs.clientWidth + 1) tabs.classList.add('compact');
  }

  open() {
    const hud = this.hud;
    // Measure the real action bar before it is covered, so the stand-in morphs out of it.
    const ask = hud.ask.classList.contains('show') ? hud.ask.getBoundingClientRect() : null;
    hud.root.classList.add('info-open');
    this.layer.hidden = false;
    this.bar.hidden = false;
    this.drawn = null;
    this.render();
    this.unplace = keepClearOfCards(hud, this.box);
    this.release = hud.offerViewBoard(this.layer);
    if (STILL()) return;
    this.box.animate([AWAY, HERE], { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    this.morphBar(ask, null);
  }

  close() {
    const hud = this.hud;
    this.backFromBoard(true);
    this.release();
    this.unplace();
    const reopened = () => hud.infoPage != null;
    const finish = () => {
      if (reopened()) return;
      this.layer.hidden = true;
      this.bar.hidden = true;
      this.bar.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      this.bar.classList.remove('morphing');
      clear(this.box);
      clear(this.bar);
      this.pageEl = null;
      hud.root.classList.remove('info-open');
    };
    if (STILL()) return finish();
    // The pop-up sinks away and stays hidden once it has (no frame of it popping back).
    this.box.animate([HERE, AWAY], { duration: 200, easing: 'ease-in', fill: 'forwards' }).onfinish = (e) => {
      if (!reopened()) this.layer.hidden = true;
      (e.target as Animation).cancel();
    };
    // The stand-in bar morphs to the real bar's size, then the real bar shows underneath while the
    // stand-in fades away on top of it, so the two never blink.
    const ask = hud.ask.classList.contains('show') ? hud.ask.getBoundingClientRect() : null;
    this.morphBar(null, ask, () => {
      if (reopened()) return;
      hud.root.classList.remove('info-open');
      this.bar.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 140,
        easing: 'ease-out',
        fill: 'forwards',
      }).onfinish = finish;
    });
  }

  /**
   * Morph the stand-in action bar between the real bar's size and its own: its size eases while
   * its tabs fade in (opening) or out (closing). Without a real bar it rises in or sinks away.
   */
  private morphBar(from: DOMRect | null, to: DOMRect | null, after?: () => void) {
    const bar = this.bar;
    const own = bar.getBoundingClientRect();
    const size = (r: DOMRect) => ({ width: `${r.width}px`, height: `${r.height}px` });
    const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
    bar.classList.add('morphing');
    const kids = [...bar.children] as HTMLElement[];
    let anim: Animation;
    if (after) {
      anim = to
        ? bar.animate([size(own), size(to)], { duration: 240, easing: ease, fill: 'forwards' })
        : bar.animate([HERE, { transform: 'translateY(12px)', opacity: 0 }], {
            duration: 200,
            easing: 'ease-in',
            fill: 'forwards',
          });
      for (const k of kids) k.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' });
    } else {
      anim = from
        ? bar.animate([size(from), size(own)], { duration: 300, easing: ease })
        : bar.animate([{ transform: 'translateY(12px)', opacity: 0 }, HERE], { duration: 260, easing: ease });
      for (const k of kids)
        k.animate([{ opacity: 0, transform: 'translateY(4px)' }, HERE], {
          duration: 200,
          delay: 120,
          easing: 'ease-out',
          fill: 'backwards',
        });
    }
    anim.onfinish = () => {
      // Closing keeps the morphed size until `after` has finished handing over.
      if (after) return after();
      bar.classList.remove('morphing');
    };
  }

  /** The property being shown on the board from the pop-up, or -1. */
  private finding = -1;
  /** On the Properties page: the player whose properties are picked out, or -1. */
  private pickedOwner = -1;

  /**
   * A property clicked in the pop-up: the pop-up steps aside, the board shows the whole map (an
   * auto zoom: zooming in centers on that property) with every other tile greyed and that property
   * glowing, and the action bar morphs into a note with a Back button that brings the pop-up back.
   */
  showOnBoard(id: number) {
    const hud = this.hud;
    if (this.finding >= 0 || hud.infoPage == null) return;
    const G = hud.G;
    const sq = G.nodes[id];
    const owner = G.players[sq.owner];
    this.finding = id;
    hud.board.spot = id;
    hud.board.spotColor = owner ? PLAYER_COLORS[owner.color] : '#ffffff';
    hud.board.focusSquare = id;
    hud.board.overviewHold = true;
    if (STILL()) this.layer.hidden = true;
    else
      this.box.animate([HERE, AWAY], { duration: 180, easing: 'ease-in', fill: 'forwards' }).onfinish = (
        e,
      ) => {
        if (this.finding >= 0) this.layer.hidden = true;
        (e.target as Animation).cancel();
      };
    this.swapBar(() =>
      this.bar.append(
        h(
          'div',
          { class: 'ib-note' },
          h('b', null, shortName(G, sq)),
          h('span', null, owner ? `Owned by ${owner.name}` : 'For sale'),
        ),
        h('button', { class: 'btn main ib-back', onclick: () => this.backFromBoard() }, 'Back to info'),
      ),
    );
  }

  /** Back from the board to the pop-up, which pops back in with its page tabs. */
  backFromBoard(quiet = false) {
    if (this.finding < 0) return;
    const hud = this.hud;
    this.finding = -1;
    hud.board.spot = -1;
    hud.board.focusSquare = -1;
    hud.board.overviewHold = false;
    if (quiet) return;
    this.layer.hidden = false;
    if (!STILL()) this.box.animate([AWAY, HERE], { duration: 220, easing: 'ease-out' });
    this.swapBar(() => this.drawBar(hud.G, hud.infoPage ?? 'game'));
    this.render();
  }

  /** Change what the stand-in action bar shows, morphing it from its old size to the new one. */
  private swapBar(fill: () => void) {
    const bar = this.bar;
    const from = bar.getBoundingClientRect();
    bar.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    clear(bar);
    fill();
    if (STILL()) return;
    const to = bar.getBoundingClientRect();
    bar.classList.add('morphing');
    bar.animate(
      [
        { width: `${from.width}px`, height: `${from.height}px` },
        { width: `${to.width}px`, height: `${to.height}px` },
      ],
      { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    ).onfinish = () => bar.classList.remove('morphing');
    for (const k of bar.children)
      k.animate([{ opacity: 0, transform: 'translateY(4px)' }, HERE], {
        duration: 200,
        delay: 100,
        easing: 'ease-out',
        fill: 'backwards',
      });
  }

  /** Bumped on each page change, so a change started earlier stands down. */
  private swapToken = 0;
  /** A page change is running (live refreshes wait; the change draws the latest state anyway). */
  private swapping = false;

  /**
   * Draw the current page and the action bar's page tabs (kept up to date as the game goes).
   * `changed`: the player picked another page: the old page's parts pop out (shrinking away),
   * the pop-up morphs to the new page's height, then the new page's parts pop in one by one.
   */
  render(changed = false) {
    const page = this.hud.infoPage;
    const G = this.hud.G;
    if (page == null || !G) return;
    // Another page picked (e.g. a player card) while a property is on the board: back first.
    if (changed && this.finding >= 0) this.backFromBoard();
    const old = this.pageEl;
    if (this.finding < 0) this.drawBar(G, page);
    if (!this.back.isConnected) this.box.append(this.back);
    const was = this.drawn;
    this.drawn = page;
    if (changed && old && was != null && was !== page && !STILL()) {
      const token = ++this.swapToken;
      this.swapping = true;
      const parts = popParts(old);
      parts.forEach((el, i) =>
        el.animate([HERE, { opacity: 0, transform: 'scale(0.82)' }], {
          duration: 136,
          delay: Math.min(i, 8) * 16,
          easing: 'ease-in',
          fill: 'forwards',
        }),
      );
      setTimeout(
        () => {
          if (token !== this.swapToken || this.hud.infoPage == null) return;
          this.swapping = false;
          const from = this.box.getBoundingClientRect().height;
          const fresh = this.paint(this.hud.infoPage);
          old.replaceWith(fresh);
          // The pop-up morphs to the new page's height (player pages all share one)...
          const to = this.box.getBoundingClientRect().height;
          const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
          if (Math.abs(to - from) > 1)
            this.box.animate([{ height: `${from}px` }, { height: `${to}px` }], {
              duration: 235,
              easing: ease,
            });
          // ...and the new page's parts pop in, one after another.
          popParts(fresh).forEach((el, i) =>
            el.animate(
              [
                { opacity: 0, transform: 'scale(0.82)' },
                { opacity: 1, transform: 'scale(1.03)', offset: 0.7 },
                HERE,
              ],
              { duration: 253, delay: 144 + Math.min(i, 10) * 27, easing: 'ease-out', fill: 'backwards' },
            ),
          );
        },
        150 + Math.min(parts.length - 1, 8) * 18,
      );
      return;
    }
    if (this.swapping && !changed) return;
    this.swapToken++;
    this.swapping = false;
    // A live refresh (or opening): swap in place and keep the scroll position.
    const scroller = (el: HTMLElement | null) => el?.querySelector<HTMLElement>('.info-scroll, .pv-body');
    const keep = changed || was !== page ? 0 : (scroller(old)?.scrollTop ?? 0);
    const el = this.paint(page);
    if (old) old.replaceWith(el);
    else this.box.append(el);
    const body = scroller(el);
    if (body) body.scrollTop = keep;
  }

  /** Build a page (and set the pop-up's player color and label for it). */
  private paint(page: InfoPage): HTMLElement {
    const G = this.hud.G;
    const p = typeof page === 'number' ? G.players[page] : null;
    this.box.classList.toggle('player', !!p);
    this.box.style.setProperty('--pc', p ? PLAYER_COLORS[p.color] : 'var(--accent)');
    this.box.setAttribute(
      'aria-label',
      p
        ? `${p.name}: info`
        : page === 'stocks'
          ? 'Stock market'
          : page === 'props'
            ? 'Properties'
            : 'Game info',
    );
    const el = h('div', { class: 'info-page' });
    if (p) {
      el.append(playerOverview(G, p, { onFind: (id) => this.showOnBoard(id) }));
    } else if (page === 'props') {
      // The player chips stay pinned at the top; the properties scroll under a soft fade.
      const { owners, list } = propertiesPage(
        G,
        (id) => this.showOnBoard(id),
        this.pickedOwner,
        (pid) => {
          this.pickedOwner = this.pickedOwner === pid ? -1 : pid;
          this.render();
        },
      );
      el.append(
        h('div', { class: 'modal-head' }, h('h2', null, 'Properties')),
        owners,
        h('div', { class: 'info-scroll info-fade' }, list),
      );
    } else if (page === 'stocks') {
      el.append(
        h('div', { class: 'modal-head' }, h('h2', null, 'Stock market')),
        h('div', { class: 'info-scroll' }, marketView(G, null, undefined, { split: true })),
      );
    } else {
      el.append(
        h('div', { class: 'modal-head' }, h('h2', null, 'Game info')),
        h(
          'div',
          { class: 'info-scroll' },
          gamePage(G, (pid) => this.hud.toggleInfo(pid)),
        ),
      );
    }
    this.pageEl = el;
    return el;
  }

  /** The action bar: Game, Stocks, then a button per player (the tabs only change state). */
  private drawBar(G: GameState, page: InfoPage) {
    const tabs = [...this.bar.querySelectorAll<HTMLElement>('.ib-tab')];
    const pages: InfoPage[] = [
      'game',
      ...(G.rules === 'standard' ? ['stocks' as const] : []),
      'props',
      ...G.players.map((p) => p.id),
    ];
    if (tabs.length === pages.length) {
      tabs.forEach((t, i) => {
        t.classList.toggle('on', pages[i] === page);
        t.setAttribute('aria-selected', String(pages[i] === page));
      });
      return;
    }
    const tab = (target: InfoPage, ...label: (Node | string)[]) =>
      h(
        'button',
        {
          class: `ib-tab ${page === target ? 'on' : ''}`,
          role: 'tab',
          'aria-selected': String(page === target),
          onclick: () => this.hud.toggleInfo(target),
        },
        ...label,
      );
    clear(this.bar);
    this.bar.append(
      h(
        'div',
        { class: 'info-tabs', role: 'tablist', 'aria-label': 'Info pages' },
        tab('game', 'Game'),
        G.rules === 'standard' ? tab('stocks', 'Stocks') : null,
        tab('props', 'Properties'),
        h('span', { class: 'ib-sep', 'aria-hidden': 'true' }),
        ...G.players.map((p) => {
          const b = tab(
            p.id,
            h('img', { src: portraitURL(p.ch), alt: '' }),
            h('span', { class: 'ib-name' }, p.name),
          );
          b.classList.add('ib-player');
          b.style.setProperty('--pc', PLAYER_COLORS[p.color]);
          b.title = p.name;
          return b;
        }),
      ),
    );
    this.fitTabs();
  }
}

/** The parts of a page that pop out and in on a page change (outermost ones only). */
function popParts(page: HTMLElement): HTMLElement[] {
  const all = [
    ...page.querySelectorAll<HTMLElement>(
      '.modal-head, .pv-head, .pv-nw, .pv-sec, .m-map, .m-shops, .m-grid-wrap, .info-owners',
    ),
  ];
  return all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
}

/**
 * The Game page: the rules in play, the goal and how to win, whose turn it is, and the standings
 * (a row per player; tap one for their page).
 */
function gamePage(G: GameState, openPlayer: (pid: number) => void): HTMLElement {
  const standard = G.rules === 'standard';
  const turn = G.players[G.order[G.turn]];
  const ranked = ranking(G);
  const leader = ranked[0];
  const owned = G.nodes.filter((s) => s.d >= 0 && s.owner >= 0).length;
  const props = G.nodes.filter((s) => s.d >= 0).length;
  const flipped = G.vg.owner.filter((o) => o >= 0).length;
  const fact = (label: string, value: Node | string) =>
    h('div', { class: 'pv-fact' }, h('span', null, label), h('b', null, value));

  const facts = section(
    'This game',
    null,
    h(
      'div',
      { class: 'pv-facts' },
      fact('Board', G.boardName ?? 'Town'),
      fact('Rules', standard ? 'Standard' : 'Easy'),
      standard ? fact('Stocks', G.stocks === 'classic' ? 'Classic' : 'Dynamic') : null,
      fact('Round', G.roundCap ? `${Math.min(G.round, G.roundCap)} of ${G.roundCap}` : String(G.round)),
      fact('Turn', turn?.name ?? '-'),
      fact('Properties owned', `${owned} of ${props}`),
      fact('Venture panels flipped', `${flipped} of 64`),
    ),
  );
  const goal = section(
    'How to win',
    null,
    h(
      'p',
      { class: 'info-goal' },
      'Reach ',
      h('b', null, fmt(G.target)),
      ' net worth, then get back to the bank.',
      G.roundCap ? ` After round ${G.roundCap}, the richest player wins.` : '',
    ),
    ...(leader
      ? [
          h(
            'p',
            { class: 'pv-note' },
            `${leader.name} leads with ${fmt(netWorth(G, leader))} (${Math.round((netWorth(G, leader) / G.target) * 100)}% of the goal).`,
          ),
        ]
      : []),
  );
  const standings = section(
    'Standings',
    'Tap a player for more',
    h(
      'div',
      { class: 'info-standings' },
      ...ranked.map((p, i) => standingCard(G, p, i + 1, () => openPlayer(p.id))),
    ),
  );
  return h(
    'div',
    { class: 'info-game' },
    h('div', { class: 'pv-col info-col info-left' }, goal, facts),
    h('div', { class: 'pv-col info-col info-standings-col' }, standings),
  );
}

/**
 * One player in the standings, built like their player card on the game screen: their sprite,
 * level, name and suits, the bar toward the goal, cash bottom left and place + net worth bottom
 * right. Tap it for their page.
 */
function standingCard(G: GameState, p: Player, place: number, onclick: () => void): HTMLElement {
  const nw = netWorth(G, p);
  const pct = Math.max(0, Math.min(100, (nw / G.target) * 100));
  const num = (n: number) => Math.round(n).toLocaleString('en-US');
  return h(
    'button',
    {
      class: `pcard info-pcard ${p.bankrupt ? 'bankrupt' : ''} ${nw >= G.target && !p.bankrupt ? 'can-win' : ''}`,
      style: `--pc:${PLAYER_COLORS[p.color]}`,
      onclick,
      title: `${p.name}: open their page`,
    },
    h('div', { class: 'pc-side' }, h('img', { class: 'portrait body', src: bodyURL(p.ch), alt: '' })),
    h(
      'div',
      { class: 'pc-main' },
      h(
        'div',
        { class: 'pc-row pc-top' },
        h('span', { class: 'lvl' }, `Lv ${p.level}`),
        h('span', { class: 'pname' }, p.name),
        h(
          'span',
          { class: `suits ${canPromote(p) && !p.bankrupt ? 'ready' : ''}` },
          p.wild ? h('span', { class: 'wild' }, h('img', { src: wildIconURL(), alt: 'Wild' })) : null,
          ...SUITS.map((_, i) => h('img', { src: suitIconURL(i, p.suits[i]), alt: SUITS[i] })),
        ),
      ),
      h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: `width:${pct}%` })),
      h(
        'div',
        { class: 'pc-row money' },
        h(
          'span',
          { class: 'm-cash', title: 'Cash' },
          h('span', { class: 'gc', 'aria-hidden': 'true' }),
          num(p.cash),
        ),
        h(
          'span',
          { class: 'm-nw', title: 'Net worth' },
          p.bankrupt ? null : h('span', { class: `rank r${place}` }, ordinal(place)),
          h('span', { class: 'nw' }, num(nw)),
        ),
      ),
    ),
  );
}

/**
 * The Properties page: every property (owned or not), district by district (rows in Easy rules), each as
 * a card in its owner's color with their portrait, under a chip per player with how many they own
 * and what they are worth. Tap a card to find it on the board.
 */
function propertiesPage(
  G: GameState,
  onFind: (id: number) => void,
  picked: number,
  onPick: (pid: number) => void,
): { owners: HTMLElement; list: HTMLElement } {
  const standard = G.rules === 'standard';
  const owned = G.nodes.filter((s) => s.d >= 0 && s.owner >= 0);
  // Every property of each district (owned or not), two districts to a row.
  const groups = new Map<number, Square[]>();
  for (const s of G.nodes.filter((q) => q.d >= 0)) {
    const key = standard ? s.d : s.g;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const box = h('div', { class: 'pv-props info-props' });
  for (const [key, squares] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const dist = standard ? G.districts[key] : null;
    const taken = squares.filter((s) => s.owner >= 0).length;
    box.append(
      h(
        'div',
        { class: 'pv-pgroup', style: `--dc:${dist?.color ?? '#8a94a8'}` },
        h(
          'div',
          { class: 'pv-group' },
          h('i', { class: 'pv-dot' }),
          h('span', null, dist?.name ?? 'Row'),
          h('em', null, `${taken} of ${squares.length} owned`),
        ),
        h(
          'div',
          { class: 'pv-cards' },
          ...squares.map((s) => {
            const owner = s.owner >= 0 ? G.players[s.owner] : null;
            // Unowned properties are drawn in grey and dimmed, with no owner badge.
            const color = owner ? PLAYER_COLORS[owner.color] : UNOWNED_ART;
            const card = propertyCard(G, s, color, { onFind });
            if (!owner) {
              card.classList.add('unowned');
              return card;
            }
            card.classList.add('owned-by');
            // A player picked in the chips: their properties glow, everyone else's fade.
            if (picked >= 0) card.classList.add(owner.id === picked ? 'picked' : 'faded');
            card.style.setProperty('--pc', color);
            card.prepend(
              h('img', {
                class: 'pv-card-owner',
                src: portraitURL(owner.ch),
                alt: owner.name,
                title: owner.name,
              }),
            );
            return card;
          }),
        ),
      ),
    );
  }
  // A chip per player (tap to pick out their properties): how many they own and what they are worth.
  const owners = h(
    'div',
    { class: 'info-owners', role: 'group', 'aria-label': 'Pick a player to highlight their properties' },
    ...G.players.map((p) => {
      const mine = owned.filter((s) => s.owner === p.id);
      return h(
        'button',
        {
          class: `info-owner ${picked === p.id ? 'on' : ''}`,
          style: `--pc:${PLAYER_COLORS[p.color]}`,
          'aria-pressed': String(picked === p.id),
          title: picked === p.id ? 'Show everyone again' : `Highlight ${p.name}'s properties`,
          onclick: () => onPick(p.id),
        },
        h('img', { src: portraitURL(p.ch), alt: '' }),
        h(
          'span',
          { class: 'info-owner-text' },
          h('span', { class: 'info-owner-name' }, p.name),
          h(
            'span',
            { class: 'info-owner-sub' },
            h('b', null, String(mine.length)),
            ` ${mine.length === 1 ? 'property' : 'properties'} · worth `,
            h('b', null, fmt(mine.reduce((sum, s) => sum + s.value, 0))),
          ),
        ),
      );
    }),
  );
  const list = section(
    'Properties',
    `${owned.length} of ${G.nodes.filter((s) => s.d >= 0).length} owned`,
    box,
  );
  return { owners, list };
}
