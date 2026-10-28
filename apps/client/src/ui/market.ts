/**
 * Stock screen, laid out like the original game's market:
 * - top left: a mini map of the board with the selected district highlighted (and the district
 *   under the pointer outlined);
 * - top right: a district x player grid with each district's share price and every
 *   player's holdings (the selected district's row is highlighted);
 * - bottom: one card per square in the selected district with its shop value, the fee a
 *   rival pays there, and how much more can be invested (max. capital).
 * Used by the market drawer and the buy/sell stock dialogs.
 */
import {
  BUILDINGS,
  K,
  PLAYER_COLORS,
  investRoom,
  isShopLike,
  squareFee,
  stockPrice,
  type GameState,
  type Square,
} from '@aa/engine';
import { SHOP_TIERS, SHOP_TIER_NAMES, STAR3_TIERS, STAR3_TIER_NAMES, propertyIconURL, tierFor } from '../art';
import { cellAt, cellCenter, tileShape, worldSize } from '../geometry';
import { portraitURL } from '../sprites';
import { clear, fmt, h } from './dom';

/** Unowned squares use neutral greys so they never look like a player's color. */
const UNOWNED = '#d5dae6';
const UNOWNED_ICON = '#9aa3b8';

/** Remember the last district viewed so the drawer keeps it when it refreshes mid-turn. */
let lastSelected = 0;

export function marketView(
  G: GameState,
  initial: number | null,
  onSelect?: (d: number) => void,
  /** Extra panels for the buy/sell screen: one under the map, one beside the shop cards. */
  slots: { underMap?: Node; besideShops?: Node } = {},
): HTMLElement {
  let sel = Math.min(initial ?? lastSelected, G.districts.length - 1);
  const root = h('div', { class: 'market' });
  const top = h('div', { class: 'm-top' });
  const mapWrap = h('div', { class: 'm-map' });
  const grid = h('div', { class: 'm-grid-wrap' });
  const shops = h('div', { class: 'm-shops' });
  const foot = h('p', { class: 'm-foot' });
  // The footer sits under the holdings table, beside the map, instead of on a row of its own.
  top.append(
    slots.underMap ? h('div', { class: 'm-left' }, mapWrap, slots.underMap) : mapWrap,
    h('div', { class: 'm-right' }, grid, foot),
  );
  root.append(slots.besideShops ? h('div', { class: 'm-shops-row' }, shops, slots.besideShops) : shops);
  root.prepend(top);

  const select = (d: number) => {
    sel = (d + G.districts.length) % G.districts.length;
    lastSelected = sel;
    onSelect?.(sel);
    draw();
  };

  const draw = () => {
    clear(mapWrap);
    mapWrap.append(miniMap(G, sel, select));
    clear(grid);
    grid.append(holdingsGrid(G, sel, select));
    clear(shops);
    shops.append(shopStrip(G, sel));
    const total = G.players.reduce((s, p) => s + p.shares[sel], 0);
    const unowned = G.nodes.filter((s) => s.d === sel && s.owner < 0).length;
    foot.textContent =
      `${G.districts[sel].name}: ${unowned} unowned square${unowned === 1 ? '' : 's'}, ${total} shares held. ` +
      `Every fee paid here pays each other shareholder fee x shares / ${K.divDivisor}.`;
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

function miniMap(G: GameState, d: number, select: (d: number) => void): HTMLElement {
  const cols = G.cols ?? 12;
  const rows = G.rows ?? 7;
  // Shrink cells on big boards so the map keeps about the same size.
  const cell = Math.max(10, Math.min(21, Math.floor(260 / cols), Math.floor(150 / rows)));
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
    const c = cellAt(
      G.layout,
      cols,
      rows,
      (e.clientX - r.left - pad) / k + 50,
      (e.clientY - r.top - pad) / k + 50,
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

function holdingsGrid(G: GameState, sel: number, select: (d: number) => void): HTMLElement {
  const players = G.players;
  const head = h(
    'tr',
    null,
    h(
      'th',
      { class: 'm-dname' },
      h('button', { class: 'm-arrow', onclick: () => select(sel - 1), title: 'Previous district' }, '▲'),
    ),
    h('th', { class: 'm-price-h' }, h('span', { class: 'coin-ico' }, 'G'), 'Price'),
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
      { class: d === sel ? 'sel' : '', onclick: () => select(d) },
      h(
        'td',
        { class: 'm-dname' },
        h('span', { class: 'swatch', style: `background:${dist.color}` }),
        dist.name,
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
  const fee = !owner ? '–' : sq.b === 'tax' ? '10%' : sq.b === 'agency' ? 'Break' : fmt(squareFee(G, sq));
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
