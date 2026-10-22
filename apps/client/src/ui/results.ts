import { PLAYER_COLORS, netWorth, ranking, type GameState } from '@aa/engine';
import { portraitURL } from '../sprites';
import { fmt, h } from './dom';
import type { Hud } from './hud';

/** Final ranking, a net-worth-by-round chart with the target marked, and per-player totals. */
export function showResults(hud: Hud, G: GameState, onNew: () => void) {
  const winner = G.players[G.winner];
  const order = [...ranking(G), ...G.players.filter((p) => p.bankrupt)];
  const chart = h('canvas', { class: 'chart' }) as HTMLCanvasElement;
  const body = h(
    'div',
    { class: 'results' },
    h('p', { class: 'res-reason' }, `${winner.name} wins! ${G.endReason}.`),
    h(
      'ol',
      { class: 'ranking' },
      ...order.map((p) =>
        h(
          'li',
          { style: `--pc:${PLAYER_COLORS[p.color]}` },
          h('img', { class: 'portrait', src: portraitURL(p.ch, PLAYER_COLORS[p.color]), alt: '' }),
          h('b', null, p.name),
          h('span', null, p.bankrupt ? 'Bankrupt' : fmt(netWorth(G, p))),
          h('small', null, `Level ${p.level}`),
        ),
      ),
    ),
    chart,
    h(
      'table',
      { class: 'totals' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          ...['', 'Fees earned', 'Fees paid', 'Salary', 'Dividends', 'Commission'].map((t) =>
            h('th', null, t),
          ),
        ),
      ),
      h(
        'tbody',
        null,
        ...G.players.map((p) =>
          h(
            'tr',
            null,
            h('td', null, h('span', { class: 'dot', style: `background:${PLAYER_COLORS[p.color]}` }), p.name),
            h('td', null, fmt(p.stats.feesEarned)),
            h('td', null, fmt(p.stats.feesPaid)),
            h('td', null, fmt(p.stats.salary)),
            h('td', null, fmt(p.stats.dividends)),
            h('td', null, fmt(p.stats.commission)),
          ),
        ),
      ),
    ),
    h(
      'div',
      { class: 'btn-row' },
      h('button', { class: 'btn main', onclick: () => onNew() }, 'Back to start'),
    ),
  );
  hud.modal('Results', body, { wide: true });
  requestAnimationFrame(() => drawChart(chart, G));
}

function drawChart(cv: HTMLCanvasElement, G: GameState) {
  const W = Math.min(640, cv.parentElement!.clientWidth || 600);
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
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '11px "Atkinson Hyperlegible", sans-serif';
  for (let i = 0; i <= 4; i++) {
    const v = (maxV / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.l, y(v));
    ctx.lineTo(W - pad.r, y(v));
    ctx.stroke();
    ctx.fillText(`${Math.round(v)}G`, 4, y(v) + 4);
  }
  ctx.fillText('Round', W / 2 - 16, H - 6);
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(pad.l, y(G.target));
  ctx.lineTo(W - pad.r, y(G.target));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffd166';
  ctx.fillText('Target', W - pad.r - 40, y(G.target) - 5);
  G.players.forEach((p, pi) => {
    ctx.strokeStyle = PLAYER_COLORS[p.color];
    ctx.lineWidth = 3;
    ctx.beginPath();
    G.hist.forEach((row, i) => (i ? ctx.lineTo(x(i), y(row[pi])) : ctx.moveTo(x(i), y(row[pi]))));
    ctx.stroke();
  });
}
