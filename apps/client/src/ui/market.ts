/**
 * Stock screen: district list beside a panel for the selected district with a mini map,
 * a holdings table and a footer note. Used by the market drawer and the buy/sell modals.
 */
import { K, PLAYER_COLORS, stockPrice, type GameState } from '@aa/engine';
import { clear, fmt, h } from './dom';

export function marketView(
  G: GameState,
  initial: number | null,
  onSelect?: (d: number) => void,
): HTMLElement {
  let sel = initial ?? 0;
  const root = h('div', { class: 'market' });
  const list = h('div', { class: 'm-list' });
  const panel = h('div', { class: 'm-panel' });
  root.append(list, panel);

  const draw = () => {
    clear(list);
    G.districts.forEach((d, i) => {
      const b = h(
        'button',
        { class: `m-item ${i === sel ? 'sel' : ''}`, onclick: () => ((sel = i), onSelect?.(i), draw()) },
        h('span', { class: 'swatch', style: `background:${d.color}` }),
        h('span', { class: 'm-name' }, d.name),
        h('b', null, fmt(stockPrice(G, i))),
      );
      list.append(b);
    });
    clear(panel);
    panel.append(miniMap(G, sel), holdings(G, sel), footer(G, sel));
  };
  draw();
  return root;
}

function miniMap(G: GameState, d: number): HTMLElement {
  const cell = 22;
  const cv = h('canvas', { class: 'minimap' }) as HTMLCanvasElement;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const W = 12 * cell + 8;
  const H = 7 * cell + 8;
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const pos = (sq: { x: number; y: number }) => ({
    x: 4 + sq.x * cell + cell / 2,
    y: 4 + sq.y * cell + cell / 2,
  });
  for (const sq of G.nodes) {
    const c = pos(sq);
    const inD = sq.d === d;
    ctx.fillStyle = inD ? G.districts[d].color : 'rgba(255,255,255,0.14)';
    ctx.fillRect(c.x - 8, c.y - 8, 16, 16);
    if (inD && sq.t === 'plot' && !sq.b) {
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(c.x - 8, c.y - 8, 16, 16);
      ctx.setLineDash([]);
    }
    if (inD && sq.owner >= 0) {
      const p = G.players[sq.owner];
      ctx.strokeStyle = PLAYER_COLORS[p.color];
      ctx.lineWidth = 3;
      ctx.strokeRect(c.x - 9, c.y - 9, 18, 18);
      ctx.fillStyle = '#101a33';
      ctx.font = '700 10px "Atkinson Hyperlegible", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.name[0]?.toUpperCase() ?? '?', c.x, c.y + 1);
    }
    if (sq.t === 'bank') {
      ctx.fillStyle = '#ffd84a';
      ctx.font = '700 11px "Lilita One", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('G', c.x, c.y + 1);
    }
  }
  for (const p of G.players) {
    if (p.bankrupt) continue;
    const c = pos(G.nodes[p.node]);
    ctx.fillStyle = PLAYER_COLORS[p.color];
    ctx.beginPath();
    ctx.arc(c.x + 6 - p.id * 4, c.y + 9, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  cv.title = '';
  cv.addEventListener('mousemove', (e) => {
    const r = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left - 4) / cell);
    const y = Math.floor((e.clientY - r.top - 4) / cell);
    const sq = G.nodes.find((s) => s.x === x && s.y === y);
    cv.title =
      sq && (sq.t === 'shop' || sq.t === 'plot')
        ? `${G.districts[sq.d]?.name ?? ''}: ${sq.owner >= 0 ? G.players[sq.owner].name : 'unowned'}, ${fmt(sq.value)}`
        : '';
  });
  return h('div', { class: 'm-map' }, cv);
}

function holdings(G: GameState, d: number): HTMLElement {
  const price = stockPrice(G, d);
  const total = G.players.reduce((s, p) => s + p.shares[d], 0);
  const rows = G.players.map((p) => {
    const owned = G.nodes.filter((s) => s.d === d && s.owner === p.id).length;
    const n = p.shares[d];
    const pct = total ? (n / total) * 100 : 0;
    return h(
      'tr',
      { class: owned || n ? '' : 'dim' },
      h('td', null, h('span', { class: 'dot', style: `background:${PLAYER_COLORS[p.color]}` }), p.name),
      h('td', null, String(owned)),
      h('td', null, String(n)),
      h('td', null, fmt(n * price)),
      h(
        'td',
        null,
        h(
          'div',
          { class: 'share-bar' },
          h('div', { style: `width:${pct}%;background:${PLAYER_COLORS[p.color]}` }),
        ),
      ),
    );
  });
  return h(
    'table',
    { class: 'holdings' },
    h(
      'thead',
      null,
      h('tr', null, ...['Player', 'Squares', 'Shares', 'Value', 'Share'].map((t) => h('th', null, t))),
    ),
    h('tbody', null, ...rows),
  );
}

function footer(G: GameState, d: number): HTMLElement {
  const sqs = G.nodes.filter((s) => s.d === d);
  const unowned = sqs.filter((s) => s.owner < 0).length;
  const total = G.players.reduce((s, p) => s + p.shares[d], 0);
  return h(
    'p',
    { class: 'm-foot' },
    `${unowned} unowned square${unowned === 1 ? '' : 's'} · ${total} shares held · `,
    `Every fee paid here pays each other shareholder floor(fee x shares / ${K.divDivisor}).`,
  );
}
