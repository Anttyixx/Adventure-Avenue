/**
 * The info pop-up, opened by the Info button beside the info chip (or a player card): one place to
 * read about the game. It sits in the middle of the screen like the stock market, and the page is
 * picked in the action bar: Game (the rules in play, the goal, the turn and the standings),
 * Stocks (the stock market, Standard rules only) or a player (everything about them).
 *
 * The action bar while it is open is a stand-in laid over the real one, so whatever the game
 * shows meanwhile (statuses, a choice waiting for the player) is still there when it closes.
 */
import { PLAYER_COLORS, SUITS, canPromote, netWorth, ranking, type GameState, type Player } from '@aa/engine';
import { portraitURL } from '../sprites';
import { suitIconURL, wildIconURL } from '../icons';
import { clear, fmt, h } from './dom';
import type { Hud } from './hud';
import { marketView } from './market';
import { keepClearOfCards } from './modals';
import { ordinal, playerOverview, section } from './overview';

/** What the info pop-up shows: the game, the stock market, or a player (their id). */
export type InfoPage = 'game' | 'stocks' | number;

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
    this.release();
    this.unplace();
    const done = () => {
      // Opened again while closing: keep it.
      if (hud.infoPage != null) return;
      this.layer.hidden = true;
      this.bar.hidden = true;
      clear(this.box);
      clear(this.bar);
      this.pageEl = null;
      hud.root.classList.remove('info-open');
      // The real action bar's content fades back in where the stand-in ended.
      if (!STILL())
        hud.ask.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
    };
    if (STILL()) return done();
    this.box.animate([HERE, AWAY], { duration: 200, easing: 'ease-in', fill: 'forwards' }).onfinish = (e) =>
      (e.target as Animation).cancel();
    // The stand-in bar morphs back to the real bar's size, then hands over to it.
    const ask = hud.ask.classList.contains('show') ? hud.ask.getBoundingClientRect() : null;
    this.morphBar(null, ask, done);
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
      bar.classList.remove('morphing');
      if (after) {
        bar.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        after();
      }
    };
  }

  /**
   * A property is being found on the board: the pop-up and its bar step aside (closing motion),
   * then come back.
   */
  stepAside(away: boolean) {
    if (this.hud.infoPage == null) return;
    for (const el of [this.layer, this.bar]) {
      if (STILL() || !away) el.hidden = away;
      const target = el === this.layer ? this.box : el;
      if (STILL()) continue;
      if (away)
        target.animate([HERE, AWAY], { duration: 180, easing: 'ease-in', fill: 'forwards' }).onfinish = (
          e,
        ) => {
          el.hidden = true;
          (e.target as Animation).cancel();
        };
      else target.animate([AWAY, HERE], { duration: 220, easing: 'ease-out' });
    }
    if (!away) this.render();
  }

  /**
   * Draw the current page and the action bar's page tabs (kept up to date as the game goes).
   * `changed`: the player picked another page: the old page slides out and the new one slides in
   * (toward the side of the tab picked), inside a pop-up that keeps one size for every page.
   */
  render(changed = false) {
    const page = this.hud.infoPage;
    const G = this.hud.G;
    if (page == null || !G) return;
    const old = this.pageEl;
    const scroller = (el: HTMLElement | null) => el?.querySelector<HTMLElement>('.info-scroll, .pv-body');
    const keep = changed || this.drawn !== page ? 0 : (scroller(old)?.scrollTop ?? 0);
    const p = typeof page === 'number' ? G.players[page] : null;
    this.box.classList.toggle('player', !!p);
    this.box.style.setProperty('--pc', p ? PLAYER_COLORS[p.color] : 'var(--accent)');
    this.box.setAttribute(
      'aria-label',
      p ? `${p.name}: info` : page === 'stocks' ? 'Stock market' : 'Game info',
    );
    const el = h('div', { class: 'info-page' });
    if (p) {
      el.append(playerOverview(G, p, { onFind: (id) => void this.hud.findOnBoard(id) }));
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
    if (!this.back.isConnected) this.box.append(this.back);
    const was = this.drawn;
    this.pageEl = el;
    this.drawn = page;
    this.drawBar(G, page);
    if (changed && old && was != null && was !== page && !STILL()) {
      // Slide: the old page out, the new page in, toward the side of the tab picked.
      const dir = order(page) > order(was) ? 1 : -1;
      old.classList.add('leaving');
      old.animate([HERE, { opacity: 0, transform: `translateX(${-28 * dir}px)` }], {
        duration: 200,
        easing: 'ease-in',
        fill: 'forwards',
      }).onfinish = () => old.remove();
      this.box.append(el);
      el.animate([{ opacity: 0, transform: `translateX(${28 * dir}px)` }, HERE], {
        duration: 300,
        delay: 80,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        fill: 'backwards',
      });
    } else {
      // A live refresh (or opening): swap in place and keep the scroll position.
      this.box.querySelectorAll('.info-page.leaving').forEach((x) => x.remove());
      if (old) old.replaceWith(el);
      else this.box.append(el);
      const body = scroller(el);
      if (body) body.scrollTop = keep;
    }
  }

  /** The action bar: Game, Stocks, then a button per player (the tabs only change state). */
  private drawBar(G: GameState, page: InfoPage) {
    const tabs = [...this.bar.querySelectorAll<HTMLElement>('.ib-tab')];
    const pages: InfoPage[] = [
      'game',
      ...(G.rules === 'standard' ? ['stocks' as const] : []),
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
  }
}

/** Where a page sits among the tabs (Game, Stocks, then the players), to slide the right way. */
function order(page: InfoPage) {
  return page === 'game' ? 0 : page === 'stocks' ? 1 : 2 + page;
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
      ...ranked.map((p, i) => standingRow(G, p, i + 1, () => openPlayer(p.id))),
    ),
  );
  return h(
    'div',
    { class: 'info-game' },
    h('div', { class: 'pv-col info-col' }, goal, facts),
    h('div', { class: 'pv-col info-col wide' }, standings),
  );
}

/** One player in the standings: place, portrait, name and level, suits, net worth toward the goal, cash. */
function standingRow(G: GameState, p: Player, place: number, onclick: () => void): HTMLElement {
  const nw = netWorth(G, p);
  const pct = Math.max(0, Math.min(100, (nw / G.target) * 100));
  return h(
    'button',
    { class: `info-row ${p.bankrupt ? 'out' : ''}`, style: `--pc:${PLAYER_COLORS[p.color]}`, onclick },
    h('span', { class: `rank r${place}` }, p.bankrupt ? '-' : ordinal(place)),
    h('img', { class: 'info-face', src: portraitURL(p.ch), alt: '' }),
    h(
      'span',
      { class: 'info-who' },
      h('b', null, p.name),
      h(
        'span',
        { class: 'info-sub' },
        h('span', { class: 'lvl' }, `Lv ${p.level}`),
        h(
          'span',
          { class: `suits ${canPromote(p) && !p.bankrupt ? 'ready' : ''}` },
          p.wild ? h('img', { src: wildIconURL(), alt: 'Wild' }) : null,
          ...SUITS.map((_, i) => h('img', { src: suitIconURL(i, p.suits[i]), alt: SUITS[i] })),
        ),
      ),
    ),
    h(
      'span',
      { class: 'info-nw' },
      h('span', { class: 'info-nw-top' }, h('b', null, fmt(nw)), h('em', null, `cash ${fmt(p.cash)}`)),
      h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: `width:${pct}%` })),
    ),
  );
}
