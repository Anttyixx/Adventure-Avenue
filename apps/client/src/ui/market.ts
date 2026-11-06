/**
 * Stock screen, laid out like the original game's market:
 * - top left: a mini map of the board with the selected district highlighted (and the district
 *   under the pointer outlined);
 * - top right: a district x player grid with each district's share price and every
 *   player's holdings (the selected district's row is highlighted);
 * - bottom: one card per square in the selected district with its shop value, the fee a
 *   rival pays there, and how much more can be invested (max. capital).
 * Used by the market drawer and the buy/sell stock pop-up. A district a sell-off has shaken shows
 * a small icon after its name (volatility itself is never shown to players).
 */
import {
  BUILDINGS,
  K,
  PLAYER_COLORS,
  dynamicStocks,
  market,
  investRoom,
  isShopLike,
  squareFee,
  stockPrice,
  type GameState,
  type Square,
} from '@aa/engine';
import { motelFee } from '../names';
import { SHOP_TIERS, SHOP_TIER_NAMES, STAR3_TIERS, STAR3_TIER_NAMES, propertyIconURL, tierFor } from '../art';
import { cellAt, cellCenter, tileShape, worldSize } from '../geometry';
import { portraitURL } from '../sprites';
import { sound } from '../audio';
import { clear, fmt, h } from './dom';

/** Unowned squares use neutral greys so they never look like a player's color. */
const UNOWNED = '#d5dae6';
const UNOWNED_ICON = '#9aa3b8';

/** How many districts the table shows at once on short screens. */
const MAX_ROWS_SHORT = 6;

/** Remember the last district viewed so the drawer keeps it when it refreshes mid-turn. */
let lastSelected = 0;

export function marketView(
  G: GameState,
  initial: number | null,
  onSelect?: (d: number) => void,
  /**
   * `split`: the buy/sell pop-up's layout: the mini map top left, the shop cards under it and the
   * district table down the right side, with a bigger map.
   */
  opts: { split?: boolean } = {},
): HTMLElement {
  let sel = Math.min(initial ?? lastSelected, G.districts.length - 1);
  const split = !!opts.split;
  const root = h('div', { class: `market ${split ? 'm-split' : ''}` });
  const mapWrap = h('div', { class: 'm-map' });
  const grid = h('div', { class: 'm-grid-wrap' });
  const shops = h('div', { class: 'm-shops' });
  if (split) root.append(h('div', { class: 'm-left' }, mapWrap, shops), h('div', { class: 'm-right' }, grid));
  else root.append(h('div', { class: 'm-top' }, mapWrap, h('div', { class: 'm-right' }, grid)), shops);
  // Short (phone) screens show 6 districts at a time; the list shifts by one when the selection
  // moves past either end.
  let first = 0;

  const select = (d: number) => {
    sound.play('click');
    sel = (d + G.districts.length) % G.districts.length;
    lastSelected = sel;
    onSelect?.(sel);
    draw();
  };

  const draw = () => {
    clear(mapWrap);
    mapWrap.append(miniMap(G, sel, select, split ? 1.6 : 1));
    clear(grid);
    const shown = matchMedia('(max-height: 500px)').matches ? MAX_ROWS_SHORT : G.districts.length;
    if (sel < first) first = sel;
    if (sel >= first + shown) first = sel - shown + 1;
    first = Math.max(0, Math.min(first, G.districts.length - shown));
    grid.append(holdingsGrid(G, sel, select, first, shown));
    clear(shops);
    shops.append(shopStrip(G, sel));
  };

  // Up/down arrow keys move between districts while the screen is open.
  root.tabIndex = 0;
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      select(sel + (e.key === 'ArrowUp' ? -1 : 1));
    }
  });

  draw();
  return root;
}

// ------------------------------------------------------------------ mini map

/** `scale` makes the whole map bigger (the buy/sell pop-up has room for a larger one). */
function miniMap(G: GameState, d: number, select: (d: number) => void, scale = 1): HTMLElement {
  const cols = G.cols ?? 12;
  const rows = G.rows ?? 7;
  // Shrink cells on big boards so the map keeps about the same size.
  const cell = Math.max(
    10,
    Math.min(Math.round(21 * scale), Math.floor((260 * scale) / cols), Math.floor((150 * scale) / rows)),
  );
  const pad = 6;
  const cv = h('canvas', { class: 'minimap' }) as HTMLCanvasElement;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  // Scale board space (100 units per cell) down to the map.
  const k = cell / 100;
  const world = worldSize(G);
  const W = (world.w - 100) * k + pad * 2;
  const H = (world.h - 100) * k + pad * 2;
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const pos = (sq: { x: number; y: number }) => {
    const c = cellCenter(G.layout, sq.x, sq.y);
    return { x: pad + (c.x - 50) * k, y: pad + (c.y - 50) * k };
  };

  const drawRoads = () => {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 4;
    for (const sq of G.nodes) {
      for (const n of sq.nb) {
        if (n < sq.id) continue;
        const a = pos(sq);
        const b = pos(G.nodes[n]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  };
  const s = cell - 5;
  /** Draw the squares; `hover` is the district under the pointer (its squares are outlined). */
  const paint = (hover: number) => {
    ctx.clearRect(0, 0, W, H);
    drawRoads();
    for (const sq of G.nodes) {
      const c = pos(sq);
      const inD = sq.d === d;
      const inHover = hover >= 0 && sq.d === hover;
      const isProp = sq.d >= 0;
      ctx.globalAlpha = isProp && !inD && !inHover ? 0.45 : 1;
      // Owned squares take the owner's color; unowned property is a neutral light grey so it is
      // never mistaken for a player's color.
      ctx.fillStyle = sq.owner >= 0 ? PLAYER_COLORS[G.players[sq.owner].color] : isProp ? UNOWNED : '#3a4670';
      tileShape(ctx, G.layout, c.x, c.y, s / 2, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (sq.t === 'plot' && !sq.b) {
        ctx.setLineDash([3, 2]);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        tileShape(ctx, G.layout, c.x, c.y, s / 2 - 1, 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (inD || inHover) {
        // The selected district is outlined in gold (like its row); the one under the pointer
        // in white, so all of its properties stand out.
        ctx.strokeStyle = inD ? '#ffd166' : '#ffffff';
        ctx.lineWidth = 2;
        tileShape(ctx, G.layout, c.x, c.y, s / 2 + 2, 5);
        ctx.stroke();
      }
      if (inD) {
        ctx.fillStyle = sq.owner >= 0 ? '#fff' : '#101a33';
        ctx.font = '11px "Lilita One", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const p = sq.owner >= 0 ? G.players[sq.owner] : null;
        ctx.fillText(p ? (p.name[0]?.toUpperCase() ?? '') : '', c.x, c.y + 1);
      }
      if (sq.t === 'bank') {
        ctx.fillStyle = '#ffd84a';
        ctx.font = '12px "Lilita One", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('G', c.x, c.y + 1);
      }
    }
  };
  let hovered = -1;
  paint(-1);

  // Hover shows the square; clicking a district square selects that district.
  const hit = (e: MouseEvent) => {
    const r = cv.getBoundingClientRect();
    // The map may be drawn smaller than its natural size to fit the screen.
    const f = W / Math.max(1, r.width);
    const c = cellAt(
      G.layout,
      cols,
      rows,
      ((e.clientX - r.left) * f - pad) / k + 50,
      ((e.clientY - r.top) * f - pad) / k + 50,
    );
    return c ? G.nodes.find((q) => q.x === c.x && q.y === c.y) : undefined;
  };
  const hoverDistrict = (dist: number) => {
    if (dist === hovered) return;
    hovered = dist;
    paint(dist);
  };
  cv.addEventListener('mousemove', (e) => {
    const sq = hit(e);
    cv.title =
      sq && sq.d >= 0
        ? `${G.districts[sq.d].name}: ${sq.owner >= 0 ? G.players[sq.owner].name : 'for sale'}, ${fmt(sq.value)}`
        : '';
    cv.style.cursor = sq && sq.d >= 0 ? 'pointer' : 'default';
    hoverDistrict(sq && sq.d >= 0 ? sq.d : -1);
  });
  cv.addEventListener('mouseleave', () => hoverDistrict(-1));
  cv.addEventListener('click', (e) => {
    const sq = hit(e);
    if (sq && sq.d >= 0) select(sq.d);
  });
  return cv;
}

// ------------------------------------------------------------------ district x player grid

/** A small falling-chart icon for a district a sell-off has shaken (its price is cut until repaired). */
function shakenIcon(G: GameState, d: number): HTMLElement {
  const el = h('span', { class: 'm-shake' });
  if (!dynamicStocks(G)) return el;
  const cut = market(G).cut[d];
  if (cut <= 0.001) return el;
  el.classList.add('on');
  el.title = `Shaken: a sell-off cut this price. Buying ${Math.ceil(cut / K.repairPerShare)} shares or investing in its shops repairs it.`;
  el.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3l4.5 5 3-3L14 10.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11.5h4.5V7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  el.setAttribute('aria-label', 'Shaken');
  return el;
}

function holdingsGrid(
  G: GameState,
  sel: number,
  select: (d: number) => void,
  first = 0,
  shown = G.districts.length,
): HTMLElement {
  const players = G.players;
  const head = h(
    'tr',
    null,
    h(
      'th',
      { class: 'm-dname' },
      h('button', { class: 'm-arrow', onclick: () => select(sel - 1), title: 'Previous district' }, '▲'),
    ),
    h('th', { class: 'm-price-h' }, 'Price'),
    ...players.map((p) =>
      h(
        'th',
        { class: `m-ph ${p.bankrupt ? 'out' : ''}`, style: `--pc:${PLAYER_COLORS[p.color]}`, title: p.name },
        h('img', { src: portraitURL(p.ch), alt: p.name }),
      ),
    ),
  );
  const rows = G.districts.map((dist, d) =>
    h(
      'tr',
      {
        class: d === sel ? 'sel' : '',
        hidden: d < first || d >= first + shown,
        onclick: () => select(d),
      },
      h(
        'td',
        { class: 'm-dname' },
        h('span', { class: 'swatch', style: `background:${dist.color}` }),
        dist.name,
        shakenIcon(G, d),
      ),
      h('td', { class: 'm-price' }, fmt(stockPrice(G, d))),
      ...players.map((p) =>
        h(
          'td',
          { class: 'm-cell', style: `--pc:${PLAYER_COLORS[p.color]}` },
          p.shares[d] ? String(p.shares[d]) : '–',
        ),
      ),
    ),
  );
  const foot = h(
    'tr',
    { class: 'm-arrow-row' },
    h(
      'td',
      { class: 'm-dname' },
      h('button', { class: 'm-arrow', onclick: () => select(sel + 1), title: 'Next district' }, '▼'),
    ),
    h('td', { colspan: String(players.length + 1) }),
  );
  return h('table', { class: 'm-grid' }, h('thead', null, head), h('tbody', null, ...rows, foot));
}

// ------------------------------------------------------------------ shops in the district

function shopStrip(G: GameState, d: number): HTMLElement {
  const squares = G.nodes.filter((s) => s.d === d);
  const labels = h(
    'div',
    { class: 'm-labels' },
    h('span', null, 'Shop value'),
    h('span', null, 'Shop fee'),
    h('span', null, 'Max. capital'),
  );
  return h('div', { class: 'm-strip' }, labels, ...squares.map((sq) => shopCard(G, sq)));
}

function shopCard(G: GameState, sq: Square): HTMLElement {
  const owner = sq.owner >= 0 ? G.players[sq.owner] : null;
  const color = owner ? PLAYER_COLORS[owner.color] : 'rgba(255,255,255,0.25)';
  const vacant = sq.t === 'plot' && !sq.b;
  const building = sq.t === 'plot' && sq.b ? BUILDINGS.find((b) => b.b === sq.b)!.name : null;
  const shopLike = isShopLike(sq);
  const fee = !owner
    ? '–'
    : sq.b === 'tax'
      ? '10%'
      : sq.b === 'agency'
        ? 'Break'
        : sq.b === 'motel'
          ? motelFee(G, sq)
          : fmt(squareFee(G, sq));
  const room = owner && shopLike ? fmt(investRoom(G, sq)) : '–';
  // Owned squares show a house in the owner's color with their initial.
  const icon = h('div', {
    class: `m-shop-ico ${vacant ? 'vacant' : ''} ${owner ? 'owned' : ''}`,
    style: `--dc:${owner ? color : UNOWNED_ICON}`,
  });
  const initial = owner ? (owner.name[0] ?? '').toUpperCase() : undefined;
  if (vacant) icon.innerHTML = '<span>VACANT</span>';
  else if (sq.t === 'shop' || sq.b === 'star3') {
    // Shops and 3-Star Shops use the same value-based art as the board.
    const star3 = sq.b === 'star3';
    const tier = tierFor(sq.value, star3 ? STAR3_TIERS : SHOP_TIERS);
    icon.classList.add('art');
    icon.title = star3 ? STAR3_TIER_NAMES[tier] : SHOP_TIER_NAMES[tier];
    icon.append(
      h('img', {
        src: propertyIconURL(star3 ? 'star3' : 'shop', tier, owner ? color : UNOWNED_ICON, initial),
        alt: icon.title,
      }),
    );
  } else {
    icon.innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>' +
      (initial ? `<b>${initial}</b>` : '');
  }
  return h(
    'div',
    { class: `m-shop ${owner ? 'owned' : ''}`, style: `--pc:${color}` },
    h(
      'div',
      { class: 'm-shop-top' },
      icon,
      h('small', null, owner ? owner.name : building ? building : vacant ? 'Plot' : 'For sale'),
    ),
    h('b', null, vacant ? '–' : fmt(sq.value)),
    h('b', null, fee),
    h('b', null, room),
  );
}
