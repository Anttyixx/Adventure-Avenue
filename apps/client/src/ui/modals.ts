/**
 * Dialogs and prompts for human decisions: buying and selling stock (and the district picker
 * for stock venture cards), the investment amount, and the building choice for plots and
 * renovations. Choices made on the board (trades, auctions, debt...) are in pick.ts.
 */
import {
  BUILDINGS,
  buildingAvailable,
  shareTradeValue,
  sharesHeld,
  stockPriceExact,
  clampFactor,
  K,
  PLAYER_COLORS,
  maxValue,
  salary,
  shopFee,
  stockPrice,
  type BuildingKey,
  type DistrictPurpose,
  type GameState,
  type Player,
} from '@aa/engine';
import { BUILDING_INFO, squareName } from '../names';
import { clear, fmt, h } from './dom';
import { digitPicker } from './digits';
import type { Hud } from './hud';
import { marketView } from './market';
import { propIconURL, type PropKey } from '../props';

// ------------------------------------------------------------------ stocks

/** A share price, with one decimal when a discount or premium makes it fractional. */
const priceFmt = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString('en-US')}G`;

/**
 * The stock market in a pop-up in the middle of the screen, over the board (pick a district on
 * its map or in its table), while the choice itself sits in the action bar below it.
 */
function stockPopup(hud: Hud, title: string, content: Node) {
  const layer = h(
    'div',
    { class: 'stock-layer' },
    h(
      'div',
      { class: 'modal glass wide xl stock-pop', role: 'region', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', null, title)),
      content,
    ),
  );
  hud.root.append(layer);
  return { close: () => layer.remove() };
}

/**
 * Buying or selling shares: the market in a pop-up, and in the action bar the share counter,
 * what the deal does (cost, price, cash and shares now and after) and Buy/Sell or Skip.
 */
export async function stockModal(
  hud: Hud,
  G: GameState,
  p: Player,
  mode: 'buy' | 'sell',
  rate = 0,
): Promise<{ d: number; n: number } | null> {
  let d =
    mode === 'sell'
      ? Math.max(
          0,
          p.shares.findIndex((n) => n > 0),
        )
      : 0;
  let n = 0;
  const bar = h('div', { class: 'stock-bar' });
  const go = h(
    'button',
    { class: 'btn main', onclick: () => n > 0 && hud.resolvePrompt({ d, n }) },
    mode === 'buy' ? 'Buy' : 'Sell',
  ) as HTMLButtonElement;
  const unit = () => stockPrice(G, d) * (mode === 'buy' ? 1 - rate : 1 + rate);
  const maxN = () => (mode === 'buy' ? Math.min(K.maxBuy, Math.floor(p.cash / unit())) : p.shares[d]);
  /** The share price once this trade is done: more shares held raise it, fewer lower it. */
  const priceAfter = () => {
    const held = sharesHeld(G, d) + (mode === 'buy' ? n : -n);
    return Math.max(1, Math.round(stockPriceExact(G, d, Math.max(0, held))));
  };
  const sum = h('div', { class: 'm-sum m-card' });
  const update = () => {
    // Trades cost (or fetch) the average of the price before and after, as in the engine.
    const value = shareTradeValue(G, d, n, mode === 'buy');
    const total = mode === 'buy' ? Math.ceil(value * (1 - rate)) : Math.floor(value * (1 + rate));
    const cashAfter = p.cash + (mode === 'buy' ? -total : total);
    const now = stockPrice(G, d);
    const after = priceAfter();
    // At a discount (buying) or a premium (selling): what the player saves or gains on the market price.
    const normal = mode === 'buy' ? n * now : Math.floor(n * now);
    clear(sum);
    sum.append(
      h(
        'div',
        { class: 'm-total' },
        `${mode === 'buy' ? 'Buy' : 'Sell'} ${n} ${G.districts[d].name} share${n === 1 ? '' : 's'} for `,
        h('b', null, fmt(total)),
        rate
          ? h(
              'span',
              { class: 'm-deal-tag' },
              mode === 'buy'
                ? `${rate * 100}% off · you save ${fmt(Math.abs(total - normal))}`
                : `${rate * 100}% above · +${fmt(Math.abs(total - normal))}`,
            )
          : null,
      ),
      ...(rate
        ? [
            mLine(
              mode === 'buy' ? 'Your price per share' : 'You get per share',
              fmt(now),
              priceFmt(unit()),
              'deal',
            ),
          ]
        : []),
      mLine('Market price', fmt(now), fmt(after), after > now ? 'up' : after < now ? 'down' : ''),
      mLine('Your cash', fmt(p.cash), fmt(cashAfter), cashAfter < 0 ? 'down' : ''),
      mLine('Shares you hold', String(p.shares[d]), String(p.shares[d] + (mode === 'buy' ? n : -n)), 'held'),
    );
    go.disabled = n <= 0;
  };
  const draw = () => {
    const max = Math.max(0, maxN());
    n = Math.min(n || Math.min(10, max), max);
    // Arrows above and below each digit set the number of shares (no slider: easier on phones).
    const picker = digitPicker({
      max,
      value: n,
      suffix: 'shares',
      onChange: (v) => {
        n = v;
        update();
      },
    });
    update();
    clear(bar);
    bar.append(
      sum,
      picker.el,
      h(
        'div',
        { class: 'tb-btns' },
        go,
        h(
          'button',
          { class: 'btn ghost', onclick: () => hud.resolvePrompt(null) },
          mode === 'buy' ? 'Skip' : 'Cancel',
        ),
      ),
    );
  };
  const pop = stockPopup(
    hud,
    mode === 'buy'
      ? rate
        ? 'Buy stock at 10% off'
        : 'Buy stock'
      : rate
        ? 'Sell stock at 20% above'
        : 'Sell stock',
    marketView(G, d, (i) => {
      d = i;
      n = 0;
      draw();
    }),
  );
  draw();
  try {
    return await hud.prompt<{ d: number; n: number } | null>(bar, [], p.color);
  } finally {
    pop.close();
  }
}

/** A "label: now → after" row of a deal summary. */
function mLine(label: string, a: string, b: string, cls = '') {
  return h(
    'div',
    { class: `m-line ${cls}` },
    h('span', null, label),
    h('span', { class: 'm-now' }, a),
    h('span', { class: 'm-arrow' }, '→'),
    h('b', null, b),
  );
}

/** How many free shares the Gift shares card gives. */
const GIFT_SHARES = 20;

/**
 * Venture cards that pick a district (20 free shares, stock up or down 20%): the stock screen,
 * with the amount fixed. Pick the district on the map or in the list, then confirm.
 */
export async function districtStockModal(
  hud: Hud,
  G: GameState,
  p: Player,
  purpose: DistrictPurpose,
): Promise<number> {
  // Start on the district the player holds most of (or the first).
  let d = Math.max(0, p.shares.indexOf(Math.max(...p.shares)));
  const bar = h('div', { class: 'stock-bar' });
  const title = {
    free20: `Gift shares: ${GIFT_SHARES} free shares`,
    up20: 'Bull market: raise a stock 20%',
    down20: 'Bear market: cut a stock 20%',
  }[purpose];
  /** The district's price once the card has moved it (worked out, then put back). */
  const priceAfter = () => {
    if (purpose === 'free20') return stockPrice(G, d);
    const f = G.factor[d];
    G.factor[d] *= purpose === 'up20' ? 1.2 : 0.8;
    clampFactor(G, d);
    const after = stockPrice(G, d);
    G.factor[d] = f;
    return after;
  };
  const draw = () => {
    clear(bar);
    const now = stockPrice(G, d);
    const after = priceAfter();
    const name = G.districts[d].name;
    const free = purpose === 'free20';
    const sum = h(
      'div',
      { class: 'm-sum m-card' },
      h(
        'div',
        { class: 'm-total' },
        free
          ? `Get ${GIFT_SHARES} ${name} shares for `
          : `${name} stock ${purpose === 'up20' ? 'rises' : 'falls'} `,
        h('b', null, free ? 'free' : '20%'),
        free ? h('span', { class: 'm-deal-tag' }, `worth ${fmt(GIFT_SHARES * now)}`) : null,
      ),
      free
        ? mLine('Shares you hold', String(p.shares[d]), String(p.shares[d] + GIFT_SHARES), 'up')
        : mLine('Price per share', fmt(now), fmt(after), after > now ? 'up' : after < now ? 'down' : ''),
      free
        ? mLine('Your shares are worth', fmt(p.shares[d] * now), fmt((p.shares[d] + GIFT_SHARES) * now), 'up')
        : mLine('Your shares are worth', fmt(p.shares[d] * now), fmt(p.shares[d] * after)),
      h('div', { class: 'hint' }, 'Pick a district on the map or in the list.'),
    );
    bar.append(
      sum,
      h(
        'div',
        { class: 'tb-btns' },
        h(
          'button',
          { class: 'btn main', onclick: () => hud.resolvePrompt(d) },
          free ? `Take ${GIFT_SHARES} ${name} shares` : `Pick ${name}`,
        ),
      ),
    );
  };
  const pop = stockPopup(
    hud,
    title,
    marketView(G, d, (i) => {
      d = i;
      draw();
    }),
  );
  draw();
  try {
    return await hud.prompt<number>(bar, [], p.color);
  } finally {
    pop.close();
  }
}

// ------------------------------------------------------------------ invest

/**
 * How much to invest in one shop, with what it will do: the new value, the fee rivals will
 * pay, the district's stock price and the player's salary.
 */
export function investAmountModal(hud: Hud, G: GameState, sqId: number, lim: number): Promise<number | null> {
  return new Promise((resolve) => {
    const sq = G.nodes[sqId];
    const owner = G.players[sq.owner];
    // Start at what cash covers; more is allowed when stock or property could pay it back.
    let amount = owner.cash > 0 ? Math.min(lim, owner.cash) : lim;
    const body = h('div', { class: 'invest' });
    const m = hud.modal(`Invest in your ${squareName(G, sq)}`, body);
    const done = (v: number | null) => {
      m.close();
      resolve(v);
    };
    /** Values with `extra` added to this shop (computed on the real state, then put back). */
    const preview = (extra: number) => {
      const before = sq.value;
      sq.value = before + extra;
      const out = {
        value: sq.value,
        fee: shopFee(G, sq),
        price: sq.d >= 0 ? stockPrice(G, sq.d) : 0,
        salary: salary(G, owner),
      };
      sq.value = before;
      return out;
    };
    const now = preview(0);
    const table = h('div', { class: 'inv-table' });
    const go = h(
      'button',
      { class: 'btn main', onclick: () => amount > 0 && done(amount) },
      'Invest',
    ) as HTMLButtonElement;
    const row = (label: string, a: string, b: string) =>
      h('div', { class: 'inv-row' }, h('span', null, label), h('span', null, a), h('b', null, `→ ${b}`));
    const update = () => {
      const after = preview(amount);
      clear(table);
      table.append(
        row('Shop value', fmt(now.value), fmt(after.value)),
        row('Fee a rival pays here', fmt(now.fee), fmt(after.fee)),
        G.rules === 'standard' && sq.d >= 0
          ? row(`${G.districts[sq.d].name} stock`, fmt(now.price), fmt(after.price))
          : '',
        row('Your salary at the bank', fmt(now.salary), fmt(after.salary)),
        h(
          'div',
          { class: `inv-row ${owner.cash - amount < 0 ? 'bad' : ''}` },
          h('span', null, 'Your cash'),
          h('span', null, fmt(owner.cash)),
          h('b', null, `→ ${fmt(owner.cash - amount)}`),
        ),
      );
      short.hidden = owner.cash - amount >= 0;
      go.disabled = amount <= 0;
      go.textContent = amount > 0 ? `Invest ${fmt(amount)}` : 'Invest';
    };
    const picker = digitPicker({
      max: lim,
      value: amount,
      suffix: 'G',
      onChange: (v) => {
        amount = v;
        update();
      },
    });
    const short = h(
      'p',
      { class: 'hint debt-note' },
      'That is more than your cash: sell stock or property at the end of your turn to cover it.',
    );
    update();
    body.append(
      h(
        'p',
        { class: 'hint' },
        `Investing moves your cash into this shop (up to ${fmt(lim)} here; the shop can grow to ${fmt(maxValue(G, sq))}). `,
        'Its value goes up, so rivals who land here pay more. Your net worth stays the same: the cash becomes shop value.',
      ),
      picker.el,
      table,
      short,
      h(
        'div',
        { class: 'btn-row' },
        go,
        h('button', { class: 'btn ghost', onclick: () => done(null) }, 'Pick another shop'),
      ),
    );
  });
}

// ------------------------------------------------------------------ build / renovate

/**
 * Pick a building, in the action bar: the details of the chosen building on the left (what a
 * rival pays and what the owner gets, or why it can't be built), a row of same-size building
 * cards (picture, name, price) in the middle, and Build / Skip on the right. Tapping a card
 * selects it (hovering or focusing one previews it); tapping the selected card again, or Build,
 * builds it. On phones the details and buttons sit above the cards. `extra` is added to every
 * cost (renovating). Cash is on the player's card, so it is not repeated here.
 */
export function buildPrompt(
  hud: Hud,
  p: Player,
  options: { b: BuildingKey; cost: number }[],
  text: string,
  extra = 0,
): Promise<BuildingKey | null> {
  const color = PLAYER_COLORS[p.color];
  const verb = extra ? 'Renovate' : 'Build';
  const cost = (b: BuildingKey) => BUILDINGS.find((x) => x.b === b)!.cost + extra;
  /** Why a building can't be chosen, or null when it can. */
  const blocked = (b: BuildingKey) =>
    options.some((o) => o.b === b)
      ? null
      : !buildingAvailable(hud.G, b)
        ? `All ${K.buildingLimit} are already built.`
        : 'You can’t afford it right now.';
  let picked: BuildingKey | null = null;

  // The bar's own text and buttons never change while choosing, so the bar never resizes:
  // a building's details show in a tip floating above its card instead.
  const info = h(
    'div',
    { class: 'bp-info' },
    h('div', { class: 'bp-title' }, text),
    h('p', { class: 'bp-hint' }, `Tap a building to see what it does, then ${verb}.`),
  );
  const tip = h('div', { class: 'bp-tip glass', role: 'status', 'aria-live': 'polite' });
  const go = h('button', { class: 'btn main', disabled: true }, verb) as HTMLButtonElement;
  const skip = h('button', { class: 'btn ghost', onclick: () => hud.resolvePrompt(null) }, 'Skip');
  /** Show a building's details above its card, or hide the tip. */
  const describe = (b: BuildingKey | null) => {
    clear(tip);
    tip.classList.toggle('show', !!b);
    if (!b) return;
    const def = BUILDINGS.find((x) => x.b === b)!;
    const why = blocked(b);
    const over = !why && cost(b) > p.cash;
    tip.append(
      h('div', { class: 'bp-tip-title' }, def.name, h('span', { class: 'bp-cost' }, fmt(cost(b)))),
      h('p', null, h('em', null, 'Rivals: '), BUILDING_INFO[b].rival),
      h('p', null, h('em', null, 'You: '), BUILDING_INFO[b].owner),
    );
    if (why) tip.append(h('p', { class: 'bp-note bad' }, why));
    else if (over)
      tip.append(h('p', { class: 'bp-note' }, 'More than your cash: sell at the end of your turn.'));
    // Centered over the card, kept inside the picker's width.
    const card = cards[BUILDINGS.findIndex((x) => x.b === b)];
    const box = tip.parentElement;
    if (!box) return;
    const half = tip.offsetWidth / 2;
    const mid = card.offsetLeft + card.offsetWidth / 2;
    tip.style.left = `${Math.max(half, Math.min(box.clientWidth - half, mid))}px`;
  };
  const cards: HTMLButtonElement[] = BUILDINGS.map((def) => {
    const key = (def.b === 'star3' ? 'star0' : def.b === 'circus' ? 'circus0' : def.b) as PropKey;
    const card = h(
      'button',
      {
        class: `bp-card ${blocked(def.b) ? 'off' : ''}`,
        'aria-label': `${def.name}, ${fmt(cost(def.b))}`,
        'aria-pressed': 'false',
      },
      h('img', { src: propIconURL(key, color), alt: '' }),
      h('span', { class: 'bp-name' }, def.name),
      h('span', { class: 'bp-price' }, fmt(cost(def.b))),
    ) as HTMLButtonElement;
    card.onmouseenter = card.onfocus = () => describe(def.b);
    card.onmouseleave = card.onblur = () => describe(picked);
    card.onclick = () => {
      // A second tap on the chosen building builds it.
      if (picked === def.b && !blocked(def.b)) return hud.resolvePrompt(def.b);
      picked = def.b;
      for (const c of cards) c.setAttribute('aria-pressed', String(c === card));
      go.disabled = !!blocked(def.b);
      go.setAttribute('aria-label', blocked(def.b) ? verb : `${verb} ${def.name}`);
      describe(def.b);
    };
    return card;
  });
  go.onclick = () => picked && !blocked(picked) && hud.resolvePrompt(picked);
  return hud.prompt<BuildingKey | null>(
    h(
      'div',
      { class: 'bp', style: `--pc:${color}` },
      info,
      tip,
      h('div', { class: 'bp-cards', role: 'group', 'aria-label': 'Buildings' }, ...cards),
      h('div', { class: 'bp-actions' }, go, skip),
    ),
    [],
    p.color,
  );
}

// ------------------------------------------------------------------ trades

// ------------------------------------------------------------------ auction / debt
