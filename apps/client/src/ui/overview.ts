/**
 * The player overview: everything about one player, shown when their player card is clicked
 * (the card expands over the other cards). Net worth and how it splits between cash, properties
 * and stock, its history, the properties by district, the stock held and the money earned.
 */
import {
  BUILDINGS,
  K,
  PLAYER_COLORS,
  SUITS,
  canPromote,
  dominated,
  isClosed,
  isShopLike,
  maxValue,
  netWorth,
  ranking,
  salary,
  squareFee,
  stockValue,
  type GameState,
  type Player,
  type Square,
} from '@aa/engine';
import { SHOP_TIERS, SHOP_TIER_NAMES, STAR3_TIERS, STAR3_TIER_NAMES, propertyIconURL, tierFor } from '../art';
import { boonIconURL, suitIconURL, wildIconURL } from '../icons';
import { propIconURL, type PropKey } from '../props';
import { bodyURL } from '../sprites';
import { shortName } from '../names';
import { fmt, h } from './dom';

/** Net worth parts, in a fixed order and color (validated dataviz palette, on the dark glass). */
const PARTS = [
  { key: 'cash', label: 'Cash', color: '#3987e5' },
  { key: 'props', label: 'Properties', color: '#d95926' },
  { key: 'stock', label: 'Stock', color: '#199e70' },
] as const;

export interface OverviewHooks {
  /** Light up these squares on the board (null: stop). */
  onHover(ids: number[] | null): void;
  /** Show the previous (-1) or next (+1) player. */
  onSwitch(step: number): void;
  onClose(): void;
}

export function playerOverview(G: GameState, p: Player, hooks: OverviewHooks): HTMLElement {
  const color = PLAYER_COLORS[p.color];
  const nw = netWorth(G, p);
  const stock = stockValue(G, p);
  const owned = G.nodes.filter((s) => s.owner === p.id);
  const props = owned.reduce((s, q) => s + q.value, 0);
  const ranked = ranking(G);
  const rank = ranked.findIndex((q) => q.id === p.id) + 1;
  const standard = G.rules === 'standard';

  // Columns side by side, each scrolling on its own: who they are and what they are worth; their
  // properties; how their net worth grew, their stock and what they earned.
  const root = h('div', { class: 'pv-body', style: `--pc:${color}` });
  const colA = h('div', { class: 'pv-col pv-col-a' });
  const colB = h('div', { class: 'pv-col pv-col-b' });
  const colC = h('div', { class: 'pv-col pv-col-c' });

  // ---------------------------------------------------------------- head
  const tags: HTMLElement[] = [];
  if (p.bankrupt) tags.push(h('span', { class: 'pv-tag bad' }, 'Bankrupt'));
  if (isClosed(p)) tags.push(h('span', { class: 'pv-tag bad' }, 'Shops closed'));
  if (p.boost > 1) tags.push(h('span', { class: 'pv-tag' }, 'Fees +30%'));
  if (p.boon > 0) {
    const boom = p.boon === K.boom;
    tags.push(
      h(
        'span',
        { class: 'pv-tag' },
        h('img', { src: boonIconURL(boom ? 'boom' : 'boon'), alt: '' }),
        `${boom ? 'Boom' : 'Boon'} ${Math.round(p.boon * 100)}%`,
      ),
    );
  }
  colA.append(
    h(
      'div',
      { class: 'pv-head' },
      h('img', { class: 'pv-sprite', src: bodyURL(p.ch, 4), alt: '' }),
      h(
        'div',
        { class: 'pv-id' },
        h('div', { class: 'pv-name' }, p.name, p.cpu ? h('span', { class: 'pv-cpu' }, 'CPU') : null),
        h(
          'div',
          { class: 'pv-sub' },
          h('span', { class: 'lvl' }, `Lv ${p.level}`),
          p.bankrupt ? null : h('span', { class: `rank r${rank}` }, ordinal(rank)),
          h(
            'span',
            { class: `suits ${canPromote(p) && !p.bankrupt ? 'ready' : ''}` },
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
        tags.length ? h('div', { class: 'pv-tags' }, ...tags) : null,
      ),
      h(
        'div',
        { class: 'pv-nav' },
        G.players.length > 1
          ? h(
              'button',
              { class: 'btn small ghost', title: 'Previous player', onclick: () => hooks.onSwitch(-1) },
              '‹',
            )
          : null,
        G.players.length > 1
          ? h(
              'button',
              { class: 'btn small ghost', title: 'Next player', onclick: () => hooks.onSwitch(1) },
              '›',
            )
          : null,
        h(
          'button',
          { class: 'btn small ghost', title: 'Close', 'aria-label': 'Close', onclick: () => hooks.onClose() },
          '✕',
        ),
      ),
    ),
  );

  // ---------------------------------------------------------------- net worth and goal
  const pct = Math.max(0, Math.min(100, (nw / G.target) * 100));
  const need = G.target - nw;
  colA.append(
    h(
      'div',
      { class: 'pv-nw' },
      h('div', { class: 'pv-nw-row' }, h('span', null, 'Net worth'), h('b', null, fmt(nw))),
      h(
        'div',
        { class: 'bar-track', title: `${Math.round(pct)}% of the ${fmt(G.target)} goal` },
        h('div', { class: 'bar-fill', style: `width:${pct}%` }),
      ),
      h(
        'div',
        { class: 'pv-note' },
        p.bankrupt
          ? 'Out of the game.'
          : need <= 0
            ? `Reached the ${fmt(G.target)} goal: back to the bank to win!`
            : `${Math.round(pct)}% of the ${fmt(G.target)} goal, ${fmt(need)} to go.`,
      ),
    ),
  );

  // ---------------------------------------------------------------- what the net worth is made of
  const values = { cash: p.cash, props, stock };
  const positive = PARTS.filter((s) => standard || s.key !== 'stock');
  const total = positive.reduce((s, part) => s + Math.max(0, values[part.key]), 0);
  // An unfilled ring split by asset, with the hovered (or biggest) part named in the middle.
  const parts = positive.map((part) => ({ ...part, v: Math.max(0, values[part.key]) }));
  const biggest = parts.reduce((a, b) => (b.v > a.v ? b : a), parts[0]);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'pv-donut-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Net worth by asset');
  const R = 40;
  const C = 2 * Math.PI * R;
  const track = document.createElementNS(ns, 'circle');
  for (const [k, v] of Object.entries({ cx: 50, cy: 50, r: R, class: 'pv-donut-track' }))
    track.setAttribute(k, String(v));
  svg.append(track);
  const midPct = h('b', null, '');
  const what = h('span', null, '');
  const show = (part: (typeof parts)[number] | null) => {
    midPct.textContent = part && total ? `${Math.round((part.v / total) * 100)}%` : '-';
    what.textContent = part ? part.label : 'Nothing yet';
  };
  // Each part is an arc of the ring, with a 2px gap on either side when there is more than one.
  const shown = parts.filter((part) => part.v > 0);
  const gap = shown.length > 1 ? 2 : 0;
  let at = 0;
  const arcs = new Map<string, SVGCircleElement>();
  for (const part of shown) {
    const len = (part.v / total) * C;
    const arc = document.createElementNS(ns, 'circle');
    for (const [k, v] of Object.entries({
      cx: 50,
      cy: 50,
      r: R,
      class: 'pv-donut-arc',
      stroke: part.color,
      'stroke-dasharray': `${Math.max(0.5, len - gap)} ${C}`,
      'stroke-dashoffset': String(-at),
    }))
      arc.setAttribute(k, String(v));
    const tip = document.createElementNS(ns, 'title');
    tip.textContent = `${part.label}: ${fmt(part.v)} (${Math.round((part.v / total) * 100)}%)`;
    arc.append(tip);
    arc.addEventListener('pointerenter', () => show(part));
    arc.addEventListener('pointerleave', () => show(biggest.v ? biggest : null));
    arcs.set(part.key, arc);
    svg.append(arc);
    at += len;
  }
  show(biggest.v ? biggest : null);
  const donut = h('div', { class: 'pv-donut' }, svg, h('div', { class: 'pv-donut-mid' }, midPct, what));
  colA.append(
    section(
      'Net worth breakdown',
      null,
      h(
        'div',
        { class: 'pv-mix' },
        donut,
        h(
          'div',
          { class: 'pv-legend' },
          ...parts.map((part) => {
            const v = values[part.key];
            const row = h(
              'div',
              { class: 'pv-leg' },
              h('i', { style: `background:${part.color}` }),
              h('span', null, part.label),
              h('b', { class: v < 0 ? 'neg' : '' }, fmt(v)),
              h('em', null, total && v > 0 ? `${Math.round((v / total) * 100)}%` : '-'),
            );
            row.onmouseenter = () => {
              show(part);
              arcs.get(part.key)?.classList.add('on');
            };
            row.onmouseleave = () => {
              show(biggest.v ? biggest : null);
              arcs.get(part.key)?.classList.remove('on');
            };
            return row;
          }),
        ),
      ),
    ),
  );

  // ---------------------------------------------------------------- net worth over the game
  const hist = G.hist.map((row) => row[p.id] ?? 0);
  if (!G.over) hist.push(nw);
  if (hist.length >= 2) colB.append(section('Net worth over the game', null, trend(hist, G.target, color)));

  // ---------------------------------------------------------------- properties
  const byDistrict = new Map<number, Square[]>();
  for (const s of owned) {
    const key = standard ? s.d : s.g;
    if (!byDistrict.has(key)) byDistrict.set(key, []);
    byDistrict.get(key)!.push(s);
  }
  const groups = [...byDistrict.entries()].sort((a, b) => a[0] - b[0]);
  const propBox = h('div', { class: 'pv-props' });
  for (const [key, squares] of groups) {
    const g = squares[0].g;
    const size = g >= 0 ? G.groups[g].length : squares.length;
    const dist = standard ? G.districts[key] : null;
    const head = h(
      'div',
      { class: 'pv-group' },
      h('i', { class: 'pv-dot' }),
      h('span', null, dist?.name ?? 'Row'),
      h('em', null, `${squares.length} of ${size}`),
      g >= 0 && dominated(G, p.id, g) ? h('span', { class: 'pv-dom' }, 'All owned') : null,
    );
    hover(
      head,
      squares.map((s) => s.id),
      hooks,
    );
    propBox.append(
      h(
        'div',
        { class: 'pv-pgroup', style: `--dc:${dist?.color ?? '#8a94a8'}` },
        head,
        h('div', { class: 'pv-cards' }, ...squares.map((s) => propertyCard(G, s, color, hooks))),
      ),
    );
  }
  colC.append(
    section(
      'Properties',
      owned.length ? `${owned.length} · ${fmt(props)}` : null,
      owned.length ? propBox : h('p', { class: 'pv-empty' }, 'No properties yet.'),
    ),
  );

  // ---------------------------------------------------------------- stock
  // Just how many shares they hold in each district (none: dimmed).
  if (standard) {
    const total = p.shares.reduce((a, n) => a + n, 0);
    const list = h(
      'div',
      { class: 'pv-shares' },
      ...G.districts.map((dist, d) => {
        const n = p.shares[d] ?? 0;
        const row = h(
          'div',
          { class: `pv-share ${n ? '' : 'none'}`, style: `--dc:${dist.color}` },
          h('i', { class: 'pv-dot' }),
          h('span', null, dist.name),
          h('b', null, String(n)),
        );
        hover(
          row,
          G.nodes.filter((s) => s.d === d && isShopLike(s)).map((s) => s.id),
          hooks,
        );
        return row;
      }),
    );
    colB.append(section('Shares', total ? `${total} in all` : 'None yet', list));
  }

  // ---------------------------------------------------------------- money in and out
  const st = p.stats;
  const facts: [string, number, string?][] = [
    ['Fees earned', st.feesEarned],
    ['Fees paid', st.feesPaid ? -st.feesPaid : 0],
    ['Salary collected', st.salary],
  ];
  if (standard) facts.push(['Dividends', st.dividends]);
  facts.push(['Commission', st.commission]);
  colB.append(
    section(
      'Earnings',
      null,
      h(
        'div',
        { class: 'pv-facts' },
        ...facts.map(([label, v]) =>
          h(
            'div',
            { class: 'pv-fact' },
            h('span', null, label),
            h('b', { class: v < 0 ? 'neg' : '' }, fmt(v)),
          ),
        ),
        h(
          'div',
          { class: 'pv-fact wide' },
          h('span', null, `Next promotion (Lv ${p.level + 1}) pays`),
          h('b', null, fmt(salary(G, { ...p, level: p.level + 1 }))),
        ),
      ),
    ),
  );
  root.append(colA, colC, colB);
  return root;
}

function section(title: string, aside: string | null, ...body: Node[]): HTMLElement {
  return h(
    'section',
    { class: 'pv-sec' },
    h('div', { class: 'pv-sec-head' }, h('h4', null, title), aside ? h('span', null, aside) : null),
    ...body,
  );
}

/** Light up `ids` on the board while the pointer (or focus) is on `el`. */
function hover(el: HTMLElement, ids: number[], hooks: OverviewHooks) {
  el.onmouseenter = () => hooks.onHover(ids);
  el.onmouseleave = () => hooks.onHover(null);
}

/** A little card for one property: its picture, its rent (the fee a rival pays) and its value. */
function propertyCard(G: GameState, s: Square, color: string, hooks: OverviewHooks): HTMLElement {
  const building = s.b ? BUILDINGS.find((b) => b.b === s.b) : null;
  let src = '';
  let kind = building?.name ?? 'Vacant plot';
  if (s.t === 'shop' || s.b === 'star3') {
    const star3 = s.b === 'star3';
    const tier = tierFor(s.value, star3 ? STAR3_TIERS : SHOP_TIERS);
    kind = star3 ? STAR3_TIER_NAMES[tier] : SHOP_TIER_NAMES[tier];
    src = propertyIconURL(star3 ? 'star3' : 'shop', tier, color);
  } else if (s.b) {
    // Other buildings: the same art as the build choice (a circus by its tier).
    src = propIconURL((s.b === 'circus' ? `circus${Math.min(3, s.lv)}` : s.b) as PropKey, color);
  }
  const owner = G.players[s.owner];
  const closed = isClosed(owner);
  const rent = s.b === 'tax' ? '10%' : s.b === 'agency' ? '-' : fmt(squareFee(G, s));
  const capped = isShopLike(s) ? maxValue(G, s) : 0;
  const name = s.t === 'shop' ? `${shortName(G, s)} (${s.base}G)` : shortName(G, s);
  const card = h(
    'div',
    {
      class: `pv-card ${closed ? 'closed' : ''}`,
      tabindex: '0',
      title: `${name}: ${kind}. Rent ${rent}${closed ? ' (closed now)' : ''}, value ${fmt(s.value)}${capped ? `, up to ${fmt(capped)}` : ''}.`,
    },
    src ? h('img', { src, alt: '' }) : h('span', { class: 'pv-card-none' }, '·'),
    h('span', { class: 'pv-card-rent' }, rent),
    h('span', { class: 'pv-card-val' }, fmt(s.value)),
  );
  hover(card, [s.id], hooks);
  card.onfocus = () => hooks.onHover([s.id]);
  card.onblur = () => hooks.onHover(null);
  return card;
}

/** Net worth after each round as a line, with the goal dashed; hover for the exact value. */
function trend(values: number[], goal: number, color: string): HTMLElement {
  const W = 300;
  const H = 86;
  const pad = { l: 4, r: 4, t: 8, b: 8 };
  const top = Math.max(goal, ...values) * 1.05;
  const low = Math.min(0, ...values);
  const x = (i: number) => pad.l + (i / (values.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - ((v - low) / (top - low)) * (H - pad.t - pad.b);
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag: string, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  };
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'pv-trend');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Net worth after each round');
  svg.append(
    el('line', { x1: pad.l, x2: W - pad.r, y1: y(goal), y2: y(goal), class: 'pv-goal' }),
    el('polyline', {
      points: values.map((v, i) => `${x(i)},${y(v)}`).join(' '),
      fill: 'none',
      stroke: color,
      'stroke-width': 2,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
      'vector-effect': 'non-scaling-stroke',
    }),
  );
  const cross = el('line', { y1: pad.t, y2: H - pad.b, class: 'pv-cross' });
  const dot = el('circle', { r: 4, fill: color, class: 'pv-dotc' });
  svg.append(cross, dot);
  const label = h('div', { class: 'pv-trend-label' }, `Now: ${fmt(values[values.length - 1])}`);
  const show = (i: number) => {
    cross.setAttribute('x1', String(x(i)));
    cross.setAttribute('x2', String(x(i)));
    dot.setAttribute('cx', String(x(i)));
    dot.setAttribute('cy', String(y(values[i])));
    const last = i === values.length - 1;
    label.textContent = `${last ? 'Now' : i === 0 ? 'Start' : `After round ${i}`}: ${fmt(values[i])}`;
  };
  show(values.length - 1);
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((fx - pad.l) / (W - pad.l - pad.r)) * (values.length - 1));
    show(Math.max(0, Math.min(values.length - 1, i)));
  });
  svg.addEventListener('pointerleave', () => show(values.length - 1));
  return h(
    'div',
    { class: 'pv-trend-box' },
    label,
    svg,
    h('div', { class: 'pv-trend-key' }, h('i', { class: 'goal' }), `Goal ${fmt(goal)}`),
  );
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
