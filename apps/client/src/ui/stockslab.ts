/**
 * Stocks lab (dev tool, `#stocks-lab`): compare the classic and dynamic stock systems.
 * Tweak every stock setting, see the dynamic price curve, trade in two side-by-side sandbox
 * districts (classic and dynamic, same trades), and run CPU-only games to see where prices
 * end up. Settings are kept on this device; they can also be applied to games played here.
 */
import {
  BOARDS,
  BUILT_IN_BOARDS,
  Game,
  K,
  confidence,
  cpuIO,
  cpuSeats,
  isShopLike,
  market,
  netWorth,
  newGame,
  shareBoost,
  shareTradeValue,
  sharesHeld,
  stockPrice,
  stockPriceExact,
  type GameState,
  type StockSystem,
} from '@aa/engine';
import { clear, h } from './dom';

const SAVE_KEY = 'adventure-avenue-stocks-lab';
/** When set, the lab's settings also apply to games played on this device. */
const LIVE_KEY = 'adventure-avenue-stocks-lab-live';

interface Setting {
  /** Path in K, e.g. 'shareSlope' or 'cpu.stockAbove'. */
  key: string;
  label: string;
  step: number;
  hint: string;
}

const GROUPS: { title: string; settings: Setting[] }[] = [
  {
    title: 'Both systems',
    settings: [
      {
        key: 'stockRate',
        label: 'Price per shop value',
        step: 0.005,
        hint: "Base price = shops' average value x this (0.04 = 4%)",
      },
      { key: 'factorMin', label: 'Multiplier floor', step: 0.05, hint: 'Lowest the multiplier can go' },
      { key: 'factorMax', label: 'Multiplier ceiling', step: 0.1, hint: 'Highest the multiplier can go' },
      {
        key: 'nearBank',
        label: 'Near-bank shop discount',
        step: 0.01,
        hint: 'Shop prices cut for the district nearest the bank (0.1 = -10%), none for the farthest. New games only',
      },
      { key: 'maxBuy', label: 'Most shares per buy', step: 1, hint: 'Largest single purchase' },
    ],
  },
  {
    title: 'Classic',
    settings: [
      {
        key: 'bigTrade',
        label: 'Big trade (shares)',
        step: 1,
        hint: 'Trades this size or more move the price',
      },
      {
        key: 'tradeUp',
        label: 'Buy multiplier',
        step: 0.01,
        hint: 'Multiplier after a big buy (1.1 = +10%)',
      },
      {
        key: 'tradeDown',
        label: 'Sell multiplier',
        step: 0.01,
        hint: 'Multiplier after a big sale (0.9 = -10%)',
      },
    ],
  },
  {
    title: 'Dynamic',
    settings: [
      {
        key: 'growthRate',
        label: 'Price per shop growth',
        step: 0.005,
        hint: 'Shop value above base (investing, ownership, cards) counts at this instead (0.08 = double)',
      },
      {
        key: 'shareSlope',
        label: 'Slope per share',
        step: 0.0001,
        hint: 'Price rise per share held, as a part of the price (0.00075 = +7.5% per 100 shares at volatility 1)',
      },
      { key: 'volMin', label: 'Volatility min', step: 0.01, hint: 'Calmest a district can roll' },
      { key: 'volMax', label: 'Volatility max', step: 0.01, hint: 'Wildest a district can roll' },
      {
        key: 'sellOff',
        label: 'Sell-off (shares/turn)',
        step: 5,
        hint: 'Shares sold in one turn before a district is dented',
      },
      { key: 'dent', label: 'First dent', step: 0.01, hint: 'Price cut at that many shares (0.1 = -10%)' },
      {
        key: 'dentDecay',
        label: 'Dent scaling',
        step: 0.05,
        hint: 'Each further batch of that many shares cuts this x the previous step',
      },
      {
        key: 'confMin',
        label: 'Confidence floor',
        step: 0.05,
        hint: 'Most a district can be dented to, across turns (0.5 = -50%)',
      },
      {
        key: 'repairPerShare',
        label: 'Repair per share',
        step: 0.0005,
        hint: 'Dent each share bought back repairs (0.001 = 1% per 10 shares)',
      },
      {
        key: 'investRepair',
        label: 'Repair per 1G invested',
        step: 0.01,
        hint: "Shares' worth each 1G invested counts as",
      },
    ],
  },
  {
    title: 'CPU stock buying',
    settings: [
      {
        key: 'cpu.stockAbove',
        label: 'Buys above cash',
        step: 50,
        hint: 'CPUs only buy stock with more cash than this',
      },
      { key: 'cpu.stockFloor', label: 'Keeps cash', step: 50, hint: 'Cash a CPU keeps back when buying' },
      {
        key: 'cpu.stockShare',
        label: 'Share of spare cash',
        step: 0.05,
        hint: 'Part of the cash above that floor spent on stock',
      },
      {
        key: 'cpu.stockRivalInvest',
        label: 'Rival investing counted',
        step: 0.05,
        hint: "How much of rivals' room to invest a CPU expects them to fill when picking a district",
      },
      {
        key: 'cpu.stockDividendVisits',
        label: 'Dividend visits counted',
        step: 1,
        hint: 'Fee payments in a district a CPU counts on for dividends when picking',
      },
      {
        key: 'cpu.stockDentBonus',
        label: 'Dent appeal',
        step: 0.05,
        hint: 'How much a dented (cheap, recovering) price draws CPUs in',
      },
      {
        key: 'cpu.stockVolBonus',
        label: 'Volatility appeal',
        step: 0.01,
        hint: 'How much a wild district draws CPUs in',
      },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.settings);

function getK(key: string): number {
  return key.split('.').reduce<any>((o, k) => o[k], K) as number;
}
function setK(key: string, v: number) {
  const parts = key.split('.');
  const last = parts.pop()!;
  const obj = parts.reduce<any>((o, k) => o[k], K);
  obj[last] = v;
}

/** The game's own values, captured before any tweaks are applied. */
const DEFAULTS: Record<string, number> = Object.fromEntries(ALL.map((s) => [s.key, getK(s.key)]));

function readSaved(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function applySaved() {
  const saved = readSaved();
  for (const s of ALL) if (typeof saved[s.key] === 'number') setK(s.key, saved[s.key]);
}

/** Called at start-up: dev builds can play games with the lab's settings. */
export function applyLiveStockSettings() {
  try {
    if (localStorage.getItem(LIVE_KEY) === '1') applySaved();
  } catch {
    /* storage blocked */
  }
}

/**
 * Price per share for a district whose shops' base values average `avg` and have grown by `growth`
 * on average, with `held` shares held in total (dynamic stocks).
 */
function curvePrice(avg: number, growth: number, held: number, vol: number): number {
  return (avg * K.stockRate + growth * K.growthRate) * shareBoost(held, vol);
}

/** Classic stocks' price for the same shops: total value x K.stockRate. */
function classicPrice(avg: number, growth: number): number {
  return (avg + growth) * K.stockRate;
}

/** What 100 more shares add to the price (the same anywhere on the line). */
function per100(avg: number, growth: number, vol: number): string {
  return (curvePrice(avg, growth, 100, vol) - curvePrice(avg, growth, 0, vol)).toFixed(2);
}

const COLORS = { normal: '#3987e5', wild: '#d95926', calm: '#199e70', classic: '#c98500' };

export function openStocksLab(root: HTMLElement, onBack: () => void) {
  applySaved();
  clear(root);
  const page = h('div', { class: 'sl-page' });
  root.append(page);
  let avg = 250;
  let growth = 0;

  const settingsBox = h('div', { class: 'sl-settings' });
  const curveBox = h('div', { class: 'sl-curve' });
  const sandboxBox = h('div', { class: 'sl-sandbox' });
  const simBox = h('div', { class: 'sl-sim' });

  const save = () => {
    const out: Record<string, number> = {};
    for (const s of ALL) if (getK(s.key) !== DEFAULTS[s.key]) out[s.key] = getK(s.key);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(out));
    } catch {
      /* storage blocked */
    }
  };
  const refreshAll = () => {
    drawCurve();
    sandbox.draw();
  };

  // ---------------------------------------------------------------- settings
  const drawSettings = () => {
    clear(settingsBox);
    let live = false;
    try {
      live = localStorage.getItem(LIVE_KEY) === '1';
    } catch {
      /* storage blocked */
    }
    const liveBox = h('input', { type: 'checkbox', checked: live }) as HTMLInputElement;
    liveBox.onchange = () => {
      try {
        localStorage.setItem(LIVE_KEY, liveBox.checked ? '1' : '0');
      } catch {
        /* storage blocked */
      }
    };
    settingsBox.append(
      h(
        'div',
        { class: 'sl-head' },
        h('h3', null, 'Settings'),
        h(
          'button',
          {
            class: 'btn small ghost',
            onclick: () => {
              for (const s of ALL) setK(s.key, DEFAULTS[s.key]);
              save();
              drawSettings();
              refreshAll();
            },
          },
          'Reset all',
        ),
      ),
      ...GROUPS.map((g) =>
        h(
          'div',
          { class: 'sl-group' },
          h('h4', null, g.title),
          ...g.settings.map((s) => {
            const input = h('input', {
              type: 'number',
              step: String(s.step),
              value: String(getK(s.key)),
            }) as HTMLInputElement;
            const changed = getK(s.key) !== DEFAULTS[s.key];
            input.onchange = () => {
              const v = Number(input.value);
              if (!Number.isFinite(v)) return;
              setK(s.key, v);
              save();
              drawSettings();
              refreshAll();
            };
            return h(
              'label',
              { class: `sl-field ${changed ? 'changed' : ''}`, title: s.hint },
              h('span', null, s.label, changed ? h('small', null, ` (game: ${DEFAULTS[s.key]})`) : null),
              input,
            );
          }),
        ),
      ),
      h(
        'label',
        { class: 'sl-live' },
        liveBox,
        h(
          'span',
          null,
          'Use these settings in games on this device (after a reload). Online, every player needs the same settings or the game falls out of step.',
        ),
      ),
    );
  };

  // ---------------------------------------------------------------- price curve
  const drawCurve = () => {
    clear(curveBox);
    const avgInput = h('input', { type: 'number', step: '10', value: String(avg) }) as HTMLInputElement;
    avgInput.onchange = () => {
      avg = Math.max(10, Number(avgInput.value) || 250);
      // Redraw after the event: rebuilding now removes the focused input mid-change.
      setTimeout(drawCurve);
    };
    const growthInput = h('input', { type: 'number', step: '50', value: String(growth) }) as HTMLInputElement;
    growthInput.onchange = () => {
      growth = Number(growthInput.value) || 0;
      setTimeout(drawCurve);
    };
    const vols = { calm: K.volMin, normal: +((K.volMin + K.volMax) / 2).toFixed(2), wild: K.volMax };
    const maxShares = 1000;
    const series: { id: keyof typeof COLORS; label: string; at: (n: number) => number }[] = [
      {
        id: 'normal',
        label: `Dynamic, normal (${vols.normal})`,
        at: (n) => curvePrice(avg, growth, n, vols.normal),
      },
      { id: 'wild', label: `Dynamic, wild (${vols.wild})`, at: (n) => curvePrice(avg, growth, n, vols.wild) },
      { id: 'calm', label: `Dynamic, calm (${vols.calm})`, at: (n) => curvePrice(avg, growth, n, vols.calm) },
      { id: 'classic', label: 'Classic (no share effect)', at: () => classicPrice(avg, growth) },
    ];
    // SVG line chart: price against total shares held.
    const W = 640;
    const H = 260;
    const pad = { l: 44, r: 16, t: 14, b: 32 };
    const top = Math.max(...series.map((s) => s.at(maxShares))) * 1.08;
    const x = (n: number) => pad.l + (n / maxShares) * (W - pad.l - pad.r);
    const y = (v: number) => H - pad.b - (v / top) * (H - pad.t - pad.b);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'sl-chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Share price against total shares held');
    const el = (tag: string, attrs: Record<string, string | number>) => {
      const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      svg.append(e);
      return e;
    };
    const step = top > 60 ? 20 : top > 30 ? 10 : 5;
    for (let v = 0; v <= top; v += step) {
      el('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'sl-gridline' });
      el('text', { x: pad.l - 6, y: y(v) + 4, class: 'sl-axis', 'text-anchor': 'end' }).textContent = `${v}G`;
    }
    for (let n = 0; n <= maxShares; n += 250)
      el('text', { x: x(n), y: H - 10, class: 'sl-axis', 'text-anchor': 'middle' }).textContent = String(n);
    for (const s of series) {
      const pts: string[] = [];
      for (let n = 0; n <= maxShares; n += 10) pts.push(`${x(n).toFixed(1)},${y(s.at(n)).toFixed(1)}`);
      el('polyline', { points: pts.join(' '), fill: 'none', stroke: COLORS[s.id], 'stroke-width': 2 });
    }
    // Hover: a crosshair and the prices at that many shares.
    const cross = el('line', { y1: pad.t, y2: H - pad.b, class: 'sl-cross', visibility: 'hidden' });
    const tip = h('div', { class: 'sl-tip', hidden: true });
    const hit = el('rect', {
      x: pad.l,
      y: pad.t,
      width: W - pad.l - pad.r,
      height: H - pad.t - pad.b,
      fill: 'transparent',
    });
    const wrap = h('div', { class: 'sl-chart-wrap' }, svg as unknown as HTMLElement, tip);
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e as PointerEvent).clientX - r.left) * (W / r.width);
      const n =
        Math.round(Math.max(0, Math.min(maxShares, ((px - pad.l) / (W - pad.l - pad.r)) * maxShares)) / 5) *
        5;
      cross.setAttribute('x1', String(x(n)));
      cross.setAttribute('x2', String(x(n)));
      cross.setAttribute('visibility', 'visible');
      clear(tip);
      tip.append(
        h('b', null, `${n} shares held`),
        ...series.map((s) =>
          h(
            'div',
            null,
            h('i', { style: `background:${COLORS[s.id]}` }),
            `${s.label}: ${s.at(n).toFixed(1)}G`,
          ),
        ),
      );
      tip.hidden = false;
      tip.style.left = `${(x(n) / W) * 100}%`;
    });
    hit.addEventListener('pointerleave', () => {
      cross.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    });
    // Table: every 50 shares, and what one 99-share buy adds from there.
    const rows: HTMLElement[] = [];
    for (let n = 0; n <= maxShares; n += 50)
      rows.push(
        h(
          'tr',
          null,
          h('td', null, String(n)),
          h('td', null, classicPrice(avg, growth).toFixed(1)),
          h('td', null, series[2].at(n).toFixed(1)),
          h('td', null, h('b', null, series[0].at(n).toFixed(1))),
          h('td', null, series[1].at(n).toFixed(1)),
          h('td', null, `+${(series[0].at(n + 99) - series[0].at(n)).toFixed(2)}`),
        ),
      );
    curveBox.append(
      h(
        'div',
        { class: 'sl-head' },
        h('h3', null, 'Price curve'),
        h(
          'div',
          { class: 'sl-inline' },
          h('label', null, 'Shops average base', avgInput, 'G'),
          h('label', null, 'Growth', growthInput, 'G'),
        ),
      ),
      h(
        'p',
        { class: 'hint' },
        `Base price ${(avg * K.stockRate).toFixed(1)}G, plus ${(growth * K.growthRate).toFixed(1)}G from growth (value above base, x ${K.growthRate}). Multiplier and confidence at 1. Hover the chart for exact prices.`,
      ),
      h(
        'p',
        { class: 'hint' },
        `Every 100 shares held add: calm +${per100(avg, growth, vols.calm)}, normal +${per100(avg, growth, vols.normal)}, wild +${per100(avg, growth, vols.wild)}.`,
      ),
      h(
        'div',
        { class: 'sl-legend' },
        ...series.map((s) => h('span', null, h('i', { style: `background:${COLORS[s.id]}` }), s.label)),
      ),
      wrap,
      h(
        'div',
        { class: 'sl-table-wrap' },
        h(
          'table',
          { class: 'sl-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              ...['Shares held', 'Classic', 'Calm', 'Normal', 'Wild', 'Next 99 adds (normal)'].map((t) =>
                h('th', null, t),
              ),
            ),
          ),
          h('tbody', null, ...rows),
        ),
      ),
    );
  };

  // ---------------------------------------------------------------- sandbox
  const sandbox = makeSandbox(sandboxBox);

  // ---------------------------------------------------------------- simulation
  const drawSim = () => {
    clear(simBox);
    const games = h('input', { type: 'number', value: '10', min: '1', step: '1' }) as HTMLInputElement;
    const goal = h('input', {
      type: 'number',
      value: String(K.defaultTarget),
      step: '1000',
    }) as HTMLInputElement;
    const style = h(
      'select',
      null,
      h('option', { value: 'normal' }, 'Normal CPUs'),
      h('option', { value: 'eager' }, 'Stock-eager CPUs'),
    ) as HTMLSelectElement;
    const run = h('button', { class: 'btn main' }, 'Run both systems') as HTMLButtonElement;
    const progress = h('div', { class: 'sl-progress' });
    const out = h('div', { class: 'sl-results' });
    run.onclick = async () => {
      run.disabled = true;
      clear(out);
      const n = Math.max(1, Math.min(200, Number(games.value) || 10));
      const target = Math.max(1000, Number(goal.value) || K.defaultTarget);
      const results: Record<StockSystem, SimStats> = {
        classic: await simulateSystem('classic', n, target, style.value === 'eager', (t) => {
          progress.textContent = `Classic: ${t}`;
        }),
        dynamic: await simulateSystem('dynamic', n, target, style.value === 'eager', (t) => {
          progress.textContent = `Dynamic: ${t}`;
        }),
      };
      progress.textContent = '';
      out.append(resultsTable(results));
      run.disabled = false;
    };
    simBox.append(
      h('div', { class: 'sl-head' }, h('h3', null, 'Simulate games')),
      h(
        'p',
        { class: 'hint' },
        'CPU-only games on every built-in board with the current settings. Stock-eager CPUs buy at every chance with most of their spare cash, a rough stand-in for a stock-focused player.',
      ),
      h(
        'div',
        { class: 'sl-row' },
        h('label', { class: 'sl-inline' }, 'Games per board', games),
        h('label', { class: 'sl-inline' }, 'Goal', goal, 'G'),
        style,
        run,
      ),
      progress,
      out,
    );
  };

  page.append(
    h(
      'header',
      { class: 'sl-top' },
      h('h2', null, 'Stocks lab'),
      h(
        'p',
        { class: 'hint' },
        'Compare the classic and dynamic stock systems. Changes here apply to the lab right away.',
      ),
      h('button', { class: 'btn ghost', onclick: onBack }, 'Back to the menu'),
    ),
    h('div', { class: 'sl-grid' }, settingsBox, h('div', { class: 'sl-main' }, curveBox, sandboxBox, simBox)),
  );
  drawSettings();
  drawCurve();
  sandbox.draw();
  drawSim();
}

// -------------------------------------------------------------------- sandbox

/**
 * Two copies of a game district, one per stock system. Every button acts on both, so the
 * systems can be compared trade by trade. The trades run through the real engine.
 */
function makeSandbox(box: HTMLElement) {
  let others = 0;
  let amount = 99;
  const d = 0;
  const make = (stocks: StockSystem) => {
    let pending = { d, n: 0 };
    const G = newGame({
      rules: 'standard',
      stocks,
      target: 99999,
      roundCap: 0,
      seats: cpuSeats(2),
      seed: 7,
      board: BOARDS.town,
    });
    // A steady district at normal volatility; the first seat trades, the second holds 'others'.
    G.players[0].cash = 999999;
    market(G).vol[d] = 1;
    G.players[1].shares[d] = others;
    const game = new Game(G, {
      decide: async (req) => (req.kind === 'buyStock' ? pending : cpuIO(() => G).decide(req)) as never,
      emit: () => {},
    });
    return {
      G,
      game,
      log: [] as string[],
      async buy(n: number) {
        pending = { d, n };
        const cash = G.players[0].cash;
        await game.buyStockFlow(G.players[0], 0);
        const paid = cash - G.players[0].cash;
        const got = G.players[0].cash === cash ? 0 : n;
        this.log.unshift(
          got ? `Bought ${n} for ${paid}G (${(paid / n).toFixed(2)}G each)` : 'Bought nothing',
        );
      },
      async sell(n: number) {
        const p = G.players[0];
        const k = Math.min(n, p.shares[d]);
        if (!k) return void this.log.unshift('Nothing to sell');
        const cash = p.cash;
        await game.sellStock(p, d, k, 0);
        this.log.unshift(`Sold ${k} for ${p.cash - cash}G (${((p.cash - cash) / k).toFixed(2)}G each)`);
      },
    };
  };
  let books = { classic: make('classic'), dynamic: make('dynamic') };
  const both = async (f: (b: ReturnType<typeof make>) => Promise<void> | void) => {
    await f(books.classic);
    await f(books.dynamic);
    draw();
  };
  const shopsOf = (G: GameState) => G.nodes.filter((s) => s.d === d && isShopLike(s));

  const draw = () => {
    clear(box);
    const amountIn = h('input', {
      type: 'number',
      value: String(amount),
      min: '1',
      step: '1',
    }) as HTMLInputElement;
    amountIn.onchange = () => (amount = Math.max(1, Math.floor(Number(amountIn.value) || 1)));
    const othersIn = h('input', {
      type: 'number',
      value: String(others),
      min: '0',
      step: '25',
    }) as HTMLInputElement;
    othersIn.onchange = () => {
      others = Math.max(0, Math.floor(Number(othersIn.value) || 0));
      for (const b of Object.values(books)) b.G.players[1].shares[d] = others;
      draw();
    };
    const card = (title: string, b: ReturnType<typeof make>) => {
      const G = b.G;
      const m = market(G);
      const rows: [string, string][] = [
        ['Listed price', `${stockPrice(G, d)}G (${stockPriceExact(G, d).toFixed(2)})`],
        ['Shares held (all)', String(sharesHeld(G, d))],
        ['Your shares', String(G.players[0].shares[d])],
        ['Multiplier', G.factor[d].toFixed(3)],
        [
          'Shops average',
          `${Math.round(shopsOf(G).reduce((s, q) => s + q.value, 0) / Math.max(1, shopsOf(G).length))}G`,
        ],
        ['Next 99 cost', `${Math.ceil(shareTradeValue(G, d, 99, true))}G`],
      ];
      if (G.stocks === 'dynamic')
        rows.push(
          ['Confidence', `${Math.round(confidence(G, d) * 100)}%`],
          ['Shares to repair', String(Math.ceil(m.cut[d] / K.repairPerShare))],
          ['Sold this turn', String(m.sold[d])],
        );
      return h(
        'div',
        { class: 'sl-book' },
        h('h4', null, title),
        h(
          'table',
          { class: 'sl-kv' },
          ...rows.map(([k, v]) => h('tr', null, h('td', null, k), h('td', null, v))),
        ),
        h('ul', { class: 'sl-log' }, ...b.log.slice(0, 6).map((t) => h('li', null, t))),
      );
    };
    box.append(
      h('div', { class: 'sl-head' }, h('h3', null, 'Trading sandbox')),
      h(
        'p',
        { class: 'hint' },
        "One district (Town's first), traded the same way in both systems through the real game rules. Other players' shares count toward the dynamic price.",
      ),
      h(
        'div',
        { class: 'sl-row' },
        h('label', { class: 'sl-inline' }, 'Shares', amountIn),
        h('button', { class: 'btn small', onclick: () => both((b) => b.buy(amount)) }, 'Buy'),
        h('button', { class: 'btn small', onclick: () => both((b) => b.sell(amount)) }, 'Sell'),
        h(
          'button',
          {
            class: 'btn small ghost',
            onclick: () =>
              both((b) => {
                const m = market(b.G);
                m.sold.fill(0);
                m.turnCut.fill(0);
                b.log.unshift('Next turn');
              }),
          },
          'Next turn',
        ),
        h(
          'button',
          {
            class: 'btn small ghost',
            onclick: () =>
              both((b) => {
                const shop = shopsOf(b.G)[0];
                if (shop) shop.value += 100;
                b.game.repairDistrict(d, 100 * K.investRepair);
                b.log.unshift('Invested 100G');
              }),
          },
          'Invest 100G',
        ),
        h(
          'button',
          {
            class: 'btn small ghost',
            onclick: () =>
              both((b) => {
                b.G.factor[d] = Math.min(K.factorMax, b.G.factor[d] * 1.2);
                b.log.unshift('Bull market');
              }),
          },
          'Bull',
        ),
        h(
          'button',
          {
            class: 'btn small ghost',
            onclick: () =>
              both((b) => {
                b.G.factor[d] = Math.max(K.factorMin, b.G.factor[d] * 0.8);
                b.log.unshift('Bear market');
              }),
          },
          'Bear',
        ),
        h('label', { class: 'sl-inline' }, 'Others hold', othersIn),
        h(
          'button',
          {
            class: 'btn small ghost',
            onclick: () => {
              books = { classic: make('classic'), dynamic: make('dynamic') };
              draw();
            },
          },
          'Reset',
        ),
      ),
      h(
        'div',
        { class: 'sl-books' },
        card('Classic', books.classic),
        card('Dynamic (normal volatility)', books.dynamic),
      ),
    );
  };
  return { draw };
}

// -------------------------------------------------------------------- simulation

interface SimStats {
  games: number;
  rounds: number[];
  held: number[];
  price: number[];
  topHeld: number[];
  topPrice: number[];
  topBase: number[];
  winStock: number[];
  dented: number[];
}

async function simulateSystem(
  stocks: StockSystem,
  perBoard: number,
  target: number,
  eager: boolean,
  onProgress: (text: string) => void,
): Promise<SimStats> {
  const cpu = K.cpu as unknown as Record<string, number>;
  const keep = { stockAbove: cpu.stockAbove, stockFloor: cpu.stockFloor, stockShare: cpu.stockShare };
  if (eager) Object.assign(cpu, { stockAbove: 300, stockFloor: 200, stockShare: 0.8 });
  const st: SimStats = {
    games: 0,
    rounds: [],
    held: [],
    price: [],
    topHeld: [],
    topPrice: [],
    topBase: [],
    winStock: [],
    dented: [],
  };
  const total = BUILT_IN_BOARDS.length * perBoard;
  try {
    for (const board of BUILT_IN_BOARDS) {
      for (let i = 0; i < perBoard; i++) {
        const G = newGame({
          rules: 'standard',
          stocks,
          target,
          roundCap: 0,
          seats: cpuSeats(4),
          seed: i + 1,
          board,
        });
        const game = new Game(
          G,
          cpuIO(() => G),
        );
        let turns = 0;
        while (!G.over && ++turns < 6000) await game.playTurn();
        const held = G.districts.map((_, d) => sharesHeld(G, d));
        const price = G.districts.map((_, d) => stockPrice(G, d));
        st.rounds.push(G.round);
        st.held.push(...held);
        st.price.push(...price);
        const ti = held.indexOf(Math.max(...held));
        st.topHeld.push(held[ti]);
        st.topPrice.push(price[ti]);
        st.topBase.push(stockPriceExact(G, ti, 0));
        if (stocks === 'dynamic') st.dented.push(...market(G).cut.map((x) => (x > 0.001 ? 1 : 0)));
        const w = G.players[G.winner];
        if (w)
          st.winStock.push(w.shares.reduce((s, x, d) => s + x * price[d], 0) / Math.max(1, netWorth(G, w)));
        st.games++;
        onProgress(`${st.games} / ${total} games`);
        // Let the page draw between games.
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  } finally {
    Object.assign(cpu, keep);
  }
  return st;
}

function resultsTable(r: Record<StockSystem, SimStats>): HTMLElement {
  const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const pct = (a: number[], p: number) => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
  };
  const rows: [string, (s: SimStats) => string][] = [
    ['Games', (s) => String(s.games)],
    ['Average rounds', (s) => mean(s.rounds).toFixed(1)],
    ['Shares held per district (avg)', (s) => mean(s.held).toFixed(0)],
    [
      'Busiest district: shares held (avg / 90%)',
      (s) => `${mean(s.topHeld).toFixed(0)} / ${pct(s.topHeld, 0.9)}`,
    ],
    [
      'Busiest district: price (avg / 90%)',
      (s) => `${mean(s.topPrice).toFixed(1)}G / ${pct(s.topPrice, 0.9)}G`,
    ],
    ['Busiest district without the share boost', (s) => `${mean(s.topBase).toFixed(1)}G`],
    ['Average district price', (s) => `${mean(s.price).toFixed(1)}G`],
    ['Highest price seen', (s) => `${Math.max(0, ...s.price)}G`],
    ['Winner net worth in stock', (s) => `${(mean(s.winStock) * 100).toFixed(0)}%`],
    ['Districts dented at the end', (s) => (s.dented.length ? `${(mean(s.dented) * 100).toFixed(1)}%` : '-')],
  ];
  return h(
    'table',
    { class: 'sl-table sl-res' },
    h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Classic'), h('th', null, 'Dynamic'))),
    h(
      'tbody',
      null,
      ...rows.map(([label, f]) =>
        h('tr', null, h('td', null, label), h('td', null, f(r.classic)), h('td', null, f(r.dynamic))),
      ),
    ),
  );
}
