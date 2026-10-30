/**
 * The player overview: everything about one player, in a pop-up in the middle of the screen
 * when their player card is clicked (the pop-up itself is managed by `Hud.openOverview`). Net
 * worth and how it splits between cash, properties and stock, the money earned, the properties
 * by district (click one to find it on the board), the shares held and, once the game is over,
 * net worth over the game.
 */
import {
  BUILDINGS,
  K,
  PLAYER_COLORS,
  SUITS,
  canPromote,
  isClosed,
  isShopLike,
  maxValue,
  netWorth,
  ranking,
  salary,
  squareFee,
  stockPrice,
  stockValue,
  type GameState,
  type Player,
  type Square,
} from '@aa/engine';
import { SHOP_TIERS, SHOP_TIER_NAMES, STAR3_TIERS, STAR3_TIER_NAMES, propertyIconURL, tierFor } from '../art';
import { boonIconURL, suitIconURL, wildIconURL } from '../icons';
import { propIconURL, type PropKey } from '../props';
import { bodyURL, portraitURL } from '../sprites';
import { shortName } from '../names';
import { fmt, h } from './dom';

/** Net worth parts, in a fixed order and color (validated dataviz palette, on the dark glass). */
const PARTS = [
  { key: 'cash', label: 'Cash', color: '#3987e5' },
  { key: 'props', label: 'Properties', color: '#d95926' },
  { key: 'stock', label: 'Stock', color: '#199e70' },
] as const;

export interface OverviewHooks {
  onClose(): void;
  /** Find a property on the board (it was clicked). */
  onFind(id: number): void;
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
    const dist = standard ? G.districts[key] : null;
    const head = h(
      'div',
      { class: 'pv-group' },
      h('i', { class: 'pv-dot' }),
      h('span', null, dist?.name ?? 'Row'),
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
  // Shares, laid out like the stock screen's table: each district's price, the shares this
  // player holds there and what they are worth, with the totals at the bottom.
  if (standard) {
    const pc = PLAYER_COLORS[p.color];
    let shares = 0;
    let worth = 0;
    const rows = G.districts.map((dist, d) => {
      const n = p.shares[d] ?? 0;
      const price = stockPrice(G, d);
      shares += n;
      worth += n * price;
      return h(
        'tr',
        { class: n ? '' : 'none' },
        h(
          'td',
          { class: 'm-dname' },
          h('span', { class: 'swatch', style: `background:${dist.color}` }),
          dist.name,
        ),
        h('td', { class: 'm-price' }, fmt(price)),
        h('td', { class: 'm-cell', style: `--pc:${pc}` }, n ? String(n) : '–'),
        h('td', { class: 'pv-sval' }, n ? fmt(n * price) : '–'),
      );
    });
    const table = h(
      'table',
      { class: 'm-grid pv-grid' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', { class: 'm-dname' }, 'District'),
          h('th', { class: 'm-price-h' }, h('span', { class: 'coin-ico' }, 'G'), 'Price'),
          h(
            'th',
            { class: 'm-ph', style: `--pc:${pc}`, title: `${p.name}'s shares` },
            h('img', { src: portraitURL(p.ch), alt: p.name }),
          ),
          h('th', { class: 'pv-sval-h' }, 'Value'),
        ),
      ),
      h(
        'tbody',
        null,
        ...rows,
        h(
          'tr',
          { class: 'pv-total' },
          h('td', { class: 'm-dname' }, 'Total'),
          h('td', null),
          h('td', null, String(shares)),
          h('td', { class: 'pv-sval' }, fmt(worth)),
        ),
      ),
    );
    colB.append(section('Shares', null, h('div', { class: 'm-grid-wrap' }, table)));
  }

  // ---------------------------------------------------------------- money in and out
  const st = p.stats;
  const facts: [string, number, string?][] = [
    ['Fees earned', st.feesEarned],
    ['Fees paid', st.feesPaid ? -st.feesPaid : 0],
    ['Salary', st.salary],
  ];
  if (standard) facts.push(['Dividends', st.dividends]);
  facts.push(['Commission', st.commission]);
  colA.append(
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
  // Net worth over the game: only once the game is over.
  const hist = G.hist.map((row) => row[p.id] ?? 0);
  if (G.over && hist.length >= 2)
    colA.append(section('Net worth over the game', null, trend(hist, G.target, color)));

  // The close button stays in the top right corner while the columns scroll.
  return h(
    'div',
    { class: 'pv-inner' },
    h('button', { class: 'btn small ghost pv-close', onclick: () => hooks.onClose() }, 'Close'),
    root,
  );
}

function section(title: string, aside: string | null, ...body: Node[]): HTMLElement {
  return h(
    'section',
    { class: 'pv-sec' },
    h('div', { class: 'pv-sec-head' }, h('h4', null, title), aside ? h('span', null, aside) : null),
    ...body,
  );
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
      role: 'button',
      title: `${name}: ${kind}. Rent ${rent}${closed ? ' (closed now)' : ''}, value ${fmt(s.value)}${capped ? `, up to ${fmt(capped)}` : ''}. Click to find it on the board.`,
    },
    src ? h('img', { src, alt: '' }) : h('span', { class: 'pv-card-none' }, '·'),
    h('span', { class: 'pv-card-rent' }, rent),
    h('span', { class: 'pv-card-val' }, fmt(s.value)),
  );
  card.onclick = () => hooks.onFind(s.id);
  card.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      hooks.onFind(s.id);
    }
  };
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
