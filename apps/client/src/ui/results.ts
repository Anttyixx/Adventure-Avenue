import {
  PLAYER_COLORS,
  dominated,
  netWorth,
  ownedSquares,
  propertyValue,
  ranking,
  stat,
  stockValue,
  type GameState,
  type Player,
} from '@aa/engine';
import { bodyURL, portraitURL } from '../sprites';
import { fmt, h } from './dom';
import type { Hud } from './hud';
import { marketView } from './market';
import { assetMix } from './overview';

/** One row of the stats table: how to read it, and which end of it is best (none: no winner). */
interface StatRow {
  label: string;
  value: (p: Player) => number;
  /** How the number shows (money unless a plain count). */
  money?: boolean;
  best?: 'high' | 'low';
  /** Only with stocks (Standard rules). */
  stocks?: boolean;
  /** Left out when every player has 0 (nobody bought out a shop, no dividends...). */
  optional?: boolean;
}

const PLACES = ['1st', '2nd', '3rd', '4th', '5th'];

/**
 * The end of a game, laid out to use a big screen:
 * - at the top, a podium with the top three (gold, silver and bronze medals) and, under it, a
 *   participation ribbon for everyone else;
 * - under that, panels that scroll: the stats table (players as columns, like the stock market's
 *   table), net worth by round, the stock market and what each player's net worth is made of.
 *   On a wide screen the panels sit side by side; on a narrow one they stack.
 */
export function showResults(hud: Hud, G: GameState, onNew: () => void) {
  const winner = G.players[G.winner];
  // Finishing order: the winner first, then by net worth, then players who went bankrupt.
  const alive = ranking(G);
  const order = [
    ...(winner && !winner.bankrupt ? [winner] : []),
    ...alive.filter((p) => p !== winner),
    ...G.players.filter((p) => p.bankrupt),
  ];
  const standard = G.rules === 'standard';
  const peak = (p: Player) => Math.max(netWorth(G, p), ...G.hist.map((row) => row[p.id] ?? 0));
  const districts = (p: Player) => G.groups.filter((_, g) => dominated(G, p.id, g)).length;
  const sections: [string, StatRow[]][] = [
    [
      'Wealth',
      [
        { label: 'Net worth', value: (p) => netWorth(G, p), money: true, best: 'high' },
        { label: 'Highest net worth', value: peak, money: true, best: 'high' },
        { label: 'Cash', value: (p) => p.cash, money: true, best: 'high' },
        { label: 'Property', value: (p) => propertyValue(G, p), money: true, best: 'high' },
        { label: 'Stocks', value: (p) => stockValue(G, p), money: true, best: 'high', stocks: true },
      ],
    ],
    [
      'Income',
      [
        { label: 'Fees collected', value: (p) => p.stats.feesEarned, money: true, best: 'high' },
        {
          label: 'Biggest fee',
          value: (p) => stat(p, 'biggestFee'),
          money: true,
          best: 'high',
          optional: true,
        },
        { label: 'Salary', value: (p) => p.stats.salary, money: true, best: 'high' },
        {
          label: 'Dividends',
          value: (p) => p.stats.dividends,
          money: true,
          best: 'high',
          stocks: true,
          optional: true,
        },
        { label: 'Commission', value: (p) => p.stats.commission, money: true, best: 'high', optional: true },
        {
          label: 'Stock sales',
          value: (p) => stat(p, 'stockSold'),
          money: true,
          stocks: true,
          optional: true,
        },
      ],
    ],
    [
      'Spending',
      [
        { label: 'Fees paid', value: (p) => p.stats.feesPaid, money: true, best: 'low' },
        { label: 'Invested in shops', value: (p) => stat(p, 'invested'), money: true, optional: true },
        {
          label: 'Stock bought',
          value: (p) => stat(p, 'stockBought'),
          money: true,
          stocks: true,
          optional: true,
        },
      ],
    ],
    [
      'On the board',
      [
        { label: 'Level', value: (p) => p.level, best: 'high' },
        { label: 'Properties owned', value: (p) => ownedSquares(G, p.id).length, best: 'high' },
        { label: 'Districts dominated', value: districts, best: 'high', optional: true },
        { label: 'Shops bought', value: (p) => stat(p, 'shopsBought') },
        { label: 'Buyouts', value: (p) => stat(p, 'buyouts'), optional: true },
        { label: 'Venture cards', value: (p) => stat(p, 'ventures') },
        { label: 'Squares walked', value: (p) => stat(p, 'steps') },
      ],
    ],
  ];

  const chart = h('canvas', { class: 'chart' }) as HTMLCanvasElement;
  const chartBox = h('div', { class: 'chart-box' }, chart);
  const podiumPlayers = order.filter((p) => !p.bankrupt).slice(0, 3);
  const others = order.filter((p) => !podiumPlayers.includes(p));
  const body = h(
    'div',
    { class: 'results' },
    h(
      'div',
      { class: 'res-hero' },
      h(
        'div',
        { class: 'res-title', style: `--pc:${PLAYER_COLORS[winner.color]}` },
        h('div', { class: 'res-win-name' }, `${winner.name} wins!`),
        h('div', { class: 'res-win-why' }, `${G.endReason}.`),
      ),
      podium(G, podiumPlayers),
      others.length
        ? h('div', { class: 'res-ribbons' }, ...others.map((p) => ribbonChip(G, p, order.indexOf(p))))
        : null,
    ),
    h(
      'div',
      { class: `res-panels ${standard ? '' : 'no-stocks'}` },
      h(
        'section',
        { class: 'res-panel res-stats' },
        h('h3', null, 'Stats'),
        statsTable(G, order, sections, standard),
      ),
      h(
        'section',
        { class: 'res-panel res-worth' },
        h('h3', null, 'Net worth by round'),
        chartBox,
        h(
          'div',
          { class: 'res-legend' },
          ...G.players.map((p) =>
            h('span', null, h('i', { style: `background:${PLAYER_COLORS[p.color]}` }), p.name),
          ),
          h('span', null, h('i', { class: 'target' }), 'Goal'),
        ),
      ),
      standard
        ? h('section', { class: 'res-panel res-stocks' }, h('h3', null, 'Stock market'), marketView(G, null))
        : null,
      h(
        'section',
        { class: 'res-panel res-mix' },
        h('h3', null, 'What net worth is made of'),
        h('div', { class: 'res-cards' }, ...order.map((p) => playerCard(G, p, order.indexOf(p)))),
      ),
    ),
    h(
      'div',
      { class: 'btn-row res-foot' },
      h('button', { class: 'btn main', onclick: () => onNew() }, 'Back to start'),
    ),
  );
  const m = hud.modal('Results', body, { wide: 'full' });
  m.el.classList.add('results-modal');
  // The chart fills its panel, so draw it again when the panel changes width.
  let drawnW = 0;
  const redraw = () => {
    const w = Math.round(chartBox.clientWidth);
    if (!w || w === drawnW || !chart.isConnected) return;
    drawnW = w;
    drawChart(chart, G, w);
  };
  new ResizeObserver(redraw).observe(chartBox);
  requestAnimationFrame(redraw);
}

/** A medal for the top three: a gold, silver or bronze disc with its number, hung on a ribbon. */
function medal(place: number): HTMLElement {
  const el = h('span', { class: `res-medal m${place}`, title: `${PLACES[place - 1]} place` });
  el.innerHTML = `<svg viewBox="0 0 40 54" aria-hidden="true">
    <path d="M9 0h9l6 20h-9z" class="strap a"/><path d="M31 0h-9l-6 20h9z" class="strap b"/>
    <circle cx="20" cy="35" r="17" class="disc"/><circle cx="20" cy="35" r="12.5" class="ring"/>
    <text x="20" y="41.5" text-anchor="middle">${place}</text></svg>`;
  return el;
}

/** A participation ribbon: a rosette with two tails, for everyone off the podium. */
function ribbon(): HTMLElement {
  const el = h('span', { class: 'res-ribbon-ico', title: 'Thanks for playing!' });
  const petals = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return `<circle cx="${(20 + Math.cos(a) * 12).toFixed(1)}" cy="${(17 + Math.sin(a) * 12).toFixed(1)}" r="5" />`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 40 52" aria-hidden="true">
    <path d="M12 24l-6 26 7-5 5 6 5-24z" class="tail"/><path d="M28 24l6 26-7-5-5 6-5-24z" class="tail"/>
    <g class="petals">${petals}</g><circle cx="20" cy="17" r="11" class="core"/>
    <path d="M20 10.5l2 4.2 4.6.6-3.3 3.2.8 4.6-4.1-2.2-4.1 2.2.8-4.6-3.3-3.2 4.6-.6z" class="star"/></svg>`;
  return el;
}

/**
 * The podium: 2nd, 1st and 3rd left to right, each player standing on their step with their
 * medal, name and net worth. The steps rise one after another, 3rd first.
 */
function podium(G: GameState, top: Player[]): HTMLElement {
  const spots = [top[1], top[0], top[2]];
  return h(
    'div',
    { class: 'res-podium' },
    ...spots.map((p) => {
      if (!p) return h('div', { class: 'res-spot empty' });
      const place = top.indexOf(p) + 1;
      return h(
        'div',
        { class: `res-spot p${place}`, style: `--pc:${PLAYER_COLORS[p.color]}` },
        h(
          'div',
          { class: 'res-stand' },
          h('img', { class: 'res-body', src: bodyURL(p.ch), alt: '' }),
          medal(place),
        ),
        h('b', { class: 'res-name' }, p.name),
        h('span', { class: 'res-amt' }, fmt(netWorth(G, p))),
        h('div', { class: 'res-step' }, h('span', null, String(place))),
      );
    }),
  );
}

/** Everyone off the podium: a chip with a participation ribbon, place, portrait, name and net worth. */
function ribbonChip(G: GameState, p: Player, place: number): HTMLElement {
  return h(
    'div',
    { class: `res-ribbon ${p.bankrupt ? 'out' : ''}`, style: `--pc:${PLAYER_COLORS[p.color]}` },
    ribbon(),
    h('span', { class: 'res-ribbon-place' }, p.bankrupt ? 'Out' : PLACES[place]),
    h('img', { class: 'portrait', src: portraitURL(p.ch), alt: '' }),
    h('b', null, p.name),
    h('span', { class: 'res-ribbon-amt' }, p.bankrupt ? 'Bankrupt' : fmt(netWorth(G, p))),
  );
}

/** A player's card: place, portrait, name and level, net worth, and the ring of what it is made of. */
function playerCard(G: GameState, p: Player, place: number): HTMLElement {
  return h(
    'div',
    {
      class: `res-card ${p.id === G.winner ? 'won' : ''} ${p.bankrupt ? 'out' : ''}`,
      style: `--pc:${PLAYER_COLORS[p.color]}`,
    },
    h(
      'div',
      { class: 'res-card-head' },
      h(
        'span',
        { class: `res-place p${p.bankrupt ? 'out' : place + 1}` },
        p.bankrupt ? 'Out' : PLACES[place],
      ),
      h('img', { class: 'portrait', src: portraitURL(p.ch), alt: '' }),
      h('div', { class: 'res-card-who' }, h('b', null, p.name), h('small', null, `Level ${p.level}`)),
      h(
        'div',
        { class: 'res-nw' },
        h('small', null, 'Net worth'),
        // One span, so the coin stays beside the amount in this column.
        h('span', null, p.bankrupt ? 'Bankrupt' : fmt(netWorth(G, p))),
      ),
    ),
    // The same ring as on the player's page.
    p.bankrupt ? null : assetMix(G, p),
  );
}

/**
 * Every stat with the players as columns, drawn like the stock market's table: each player's
 * column is a strip of their color under a tab with their portrait, the stat names sit on the
 * left in shaded cells, and the best number in a row is a gold cell with a star.
 */
function statsTable(
  G: GameState,
  order: Player[],
  sections: [string, StatRow[]][],
  standard: boolean,
): HTMLElement {
  const groups: HTMLElement[] = [];
  for (const [title, list] of sections) {
    const shown = list.filter(
      (r) => (standard || !r.stocks) && !(r.optional && order.every((p) => r.value(p) === 0)),
    );
    if (!shown.length) continue;
    // The section's name in the label column; each player's color strip carries on beside it.
    const rows: HTMLElement[] = [
      h(
        'tr',
        { class: 'res-group' },
        h('th', { scope: 'rowgroup' }, title),
        ...order.map((p) => h('td', { class: 'rs-cell', style: `--pc:${PLAYER_COLORS[p.color]}` })),
      ),
    ];
    for (const r of shown) {
      const values = order.map((p) => (p.bankrupt && r.best ? NaN : r.value(p)));
      const live = values.filter((v) => !Number.isNaN(v));
      const top = r.best === 'high' ? Math.max(...live) : r.best === 'low' ? Math.min(...live) : NaN;
      // Mark the best only when it stands out (not when everyone is level).
      const marked = r.best && live.some((v) => v !== top);
      rows.push(
        h(
          'tr',
          null,
          h('th', { scope: 'row', class: 'rs-label' }, r.label),
          ...order.map((p, i) => {
            const v = values[i];
            const best = marked && v === top;
            return h(
              'td',
              {
                class: `rs-cell ${best ? 'best' : ''} ${p.bankrupt ? 'out' : ''}`,
                style: `--pc:${PLAYER_COLORS[p.color]}`,
                title: best ? `Best: ${r.label.toLowerCase()}` : null,
              },
              Number.isNaN(v) ? '–' : r.money ? fmt(v) : String(v),
            );
          }),
        ),
      );
    }
    groups.push(h('tbody', null, ...rows));
  }
  return h(
    'div',
    { class: 'res-table-wrap' },
    h(
      'table',
      { class: 'res-grid' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', { class: 'rs-corner' }),
          ...order.map((p, i) =>
            h(
              'th',
              {
                class: `rs-ph ${p.bankrupt ? 'out' : ''}`,
                style: `--pc:${PLAYER_COLORS[p.color]}`,
                title: p.name,
              },
              h('img', { src: portraitURL(p.ch), alt: '' }),
              h('span', { class: 'rs-pname' }, p.name),
              h('small', null, p.bankrupt ? 'Out' : PLACES[i]),
            ),
          ),
        ),
      ),
      ...groups,
    ),
  );
}

function drawChart(cv: HTMLCanvasElement, G: GameState, width: number) {
  const W = Math.max(240, width);
  const H = Math.round(Math.min(300, Math.max(180, W * 0.42)));
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const pad = { l: 56, r: 12, t: 12, b: 26 };
  const n = G.hist.length;
  const maxV = Math.max(G.target * 1.1, ...G.hist.flat());
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => H - pad.b - (Math.max(0, v) / maxV) * (H - pad.t - pad.b);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '11px "Atkinson Hyperlegible", sans-serif';
  for (let i = 0; i <= 4; i++) {
    const v = (maxV / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.l, y(v));
    ctx.lineTo(W - pad.r, y(v));
    ctx.stroke();
    ctx.fillText(`${Math.round(v).toLocaleString('en-US')}G`, 4, y(v) + 4);
  }
  // Round numbers along the bottom (every round on short games, fewer on long ones).
  const every = Math.max(1, Math.ceil(n / 10));
  for (let i = 0; i < n; i += every) ctx.fillText(String(i + 1), x(i) - 3, H - 8);
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(pad.l, y(G.target));
  ctx.lineTo(W - pad.r, y(G.target));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineJoin = 'round';
  G.players.forEach((p, pi) => {
    ctx.strokeStyle = PLAYER_COLORS[p.color];
    ctx.lineWidth = pi === G.winner ? 4 : 2.5;
    ctx.beginPath();
    G.hist.forEach((row, i) => (i ? ctx.lineTo(x(i), y(row[pi])) : ctx.moveTo(x(i), y(row[pi]))));
    ctx.stroke();
  });
}
