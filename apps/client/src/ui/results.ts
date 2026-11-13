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
 * The end of a game: the winner, a card per player in finishing order (net worth with what it is
 * made of), net worth over the rounds, and a table of every player's stats side by side with the
 * best in each row marked.
 */
export function showResults(hud: Hud, G: GameState, onNew: () => void) {
  const winner = G.players[G.winner];
  const order = [...ranking(G), ...G.players.filter((p) => p.bankrupt)];
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
  const body = h(
    'div',
    { class: 'results' },
    h(
      'div',
      { class: 'res-win', style: `--pc:${PLAYER_COLORS[winner.color]}` },
      h('img', { class: 'res-win-body', src: bodyURL(winner.ch), alt: '' }),
      h(
        'div',
        null,
        h('div', { class: 'res-win-name' }, `${winner.name} wins!`),
        h('div', { class: 'res-win-why' }, `${G.endReason}.`),
      ),
    ),
    h('div', { class: 'res-cards' }, ...order.map((p, i) => playerCard(G, p, i))),
    h(
      'section',
      { class: 'res-section' },
      h('h3', null, 'Net worth by round'),
      chart,
      h(
        'div',
        { class: 'res-legend' },
        ...G.players.map((p) =>
          h('span', null, h('i', { style: `background:${PLAYER_COLORS[p.color]}` }), p.name),
        ),
        h('span', null, h('i', { class: 'target' }), 'Goal'),
      ),
    ),
    h('section', { class: 'res-section' }, h('h3', null, 'Stats'), statsTable(G, order, sections, standard)),
    h(
      'div',
      { class: 'btn-row' },
      h('button', { class: 'btn main', onclick: () => onNew() }, 'Back to start'),
    ),
  );
  hud.modal('Results', body, { wide: true });
  requestAnimationFrame(() => drawChart(chart, G));
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

/** Every stat with the players as columns; the best number in a row gets a gold mark. */
function statsTable(
  G: GameState,
  order: Player[],
  sections: [string, StatRow[]][],
  standard: boolean,
): HTMLElement {
  const rows: HTMLElement[] = [];
  for (const [title, list] of sections) {
    const shown = list.filter(
      (r) => (standard || !r.stocks) && !(r.optional && order.every((p) => r.value(p) === 0)),
    );
    if (!shown.length) continue;
    rows.push(h('tr', { class: 'res-group' }, h('th', { colspan: String(order.length + 1) }, title)));
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
          h('th', { scope: 'row' }, r.label),
          ...order.map((p, i) => {
            const v = values[i];
            const best = marked && v === top;
            return h(
              'td',
              { class: best ? 'best' : '' },
              Number.isNaN(v) ? '-' : r.money ? fmt(v) : String(v),
            );
          }),
        ),
      );
    }
  }
  return h(
    'div',
    { class: 'res-table-wrap' },
    h(
      'table',
      { class: 'res-table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', null),
          ...order.map((p) =>
            h(
              'th',
              { style: `--pc:${PLAYER_COLORS[p.color]}` },
              h(
                'span',
                { class: 'res-who' },
                h('img', { class: 'portrait', src: portraitURL(p.ch), alt: '' }),
                h('span', null, p.name),
              ),
            ),
          ),
        ),
      ),
      h('tbody', null, ...rows),
    ),
  );
}

function drawChart(cv: HTMLCanvasElement, G: GameState) {
  const W = Math.min(720, cv.parentElement!.clientWidth || 600);
  const H = 220;
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
