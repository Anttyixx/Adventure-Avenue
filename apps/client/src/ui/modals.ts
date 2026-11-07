/**
 * Dialogs and prompts for human decisions: buying and selling stock (and the district picker
 * for stock venture cards), the investment amount, and the building choice for plots and
 * renovations. Choices made on the board (trades, auctions, debt...) are in pick.ts.
 */
import {
  BUILDABLE,
  BUILDINGS,
  buildingAvailable,
  buildingsLeft,
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
/** Space kept between the stock pop-up and the player cards. */
const CARD_GAP = 28;

/**
 * Keep a centered pop-up clear of the player cards: it stays in the middle of the screen, and
 * when that would run under the cards it slides left just far enough to leave a gap. Rechecked
 * when its size or the window changes. Returns the function that stops it.
 */
export function keepClearOfCards(hud: Hud, box: HTMLElement): () => void {
  const place = () => {
    if (!box.isConnected || !box.offsetWidth) return;
    box.style.translate = '';
    const r = box.getBoundingClientRect();
    const freeRight = parseFloat(getComputedStyle(hud.root).getPropertyValue('--free-right')) || 0;
    const limit = window.innerWidth - freeRight - CARD_GAP;
    const shift = r.right > limit ? Math.max(12 - r.left, limit - r.right) : 0;
    if (shift) box.style.translate = `${Math.round(shift)}px 0`;
  };
  const watch = new ResizeObserver(place);
  watch.observe(box);
  window.addEventListener('resize', place);
  return () => {
    watch.disconnect();
    window.removeEventListener('resize', place);
  };
}

/**
 * Shrink a pop-up or game board (CSS zoom) when its contents don't fit the room its layer gives
 * it (small phone screens), instead of cutting them off or making them scroll. Rechecked as its
 * contents or the window change. Returns the function that stops it.
 */
export function fitInLayer(box: HTMLElement, min = 0.55): () => void {
  let busy = false;
  const fit = () => {
    const layer = box.parentElement;
    if (busy || !layer || !box.isConnected) return;
    busy = true;
    box.style.zoom = '';
    box.style.maxHeight = '';
    box.style.maxWidth = '';
    const cs = getComputedStyle(layer);
    const roomW = layer.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const roomH = layer.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    // Its natural size: everything inside it, even what would have to scroll.
    const w = Math.max(box.scrollWidth, box.offsetWidth);
    const hgt = Math.max(box.scrollHeight, box.offsetHeight);
    const z = Math.min(1, roomW / w, roomH / hgt);
    if (roomW > 0 && roomH > 0 && z < 0.98) {
      box.style.maxHeight = 'none';
      box.style.maxWidth = 'none';
      box.style.zoom = String(Math.max(min, z));
    }
    requestAnimationFrame(() => (busy = false));
  };
  const watch = new ResizeObserver(() => requestAnimationFrame(fit));
  watch.observe(box);
  const kids = new MutationObserver(() => requestAnimationFrame(fit));
  kids.observe(box, { childList: true, subtree: true });
  window.addEventListener('resize', fit);
  requestAnimationFrame(fit);
  return () => {
    watch.disconnect();
    kids.disconnect();
    window.removeEventListener('resize', fit);
  };
}

/** Screens small enough that the stock market and the auction fill the screen. */
const FILL_SCREENS = '(max-height: 500px), (max-width: 760px)';

/**
 * A pop-up in the middle of the screen whose choices sit in the action bar below it (the stock
 * market, the auction). It never scrolls: it shrinks to fit (`fit`). On small screens it fills the
 * room between the toolbar (so View board stays in reach) and the action bar, with the board
 * blurred behind it. `cls` replaces the stock market's size classes.
 */
export function stockPopup(hud: Hud, title: string, content: Node, cls = 'wide xl') {
  const box = h(
    'div',
    { class: `modal glass ${cls} stock-pop`, role: 'region', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', null, title)),
    content,
  );
  const layer = h('div', { class: 'stock-layer' }, box);
  const small = matchMedia(FILL_SCREENS);
  const fill = () => layer.classList.toggle('fill', small.matches);
  fill();
  small.addEventListener('change', fill);
  hud.root.append(layer);
  const unplace = keepClearOfCards(hud, box);
  let release = () => {};
  let unfit = () => {};
  return {
    /** Shrink the pop-up when its contents don't fit the screen (instead of scrolling). */
    fit: () => {
      unfit = fitInLayer(box);
    },
    /** Offer the toolbar's View board chip for this pop-up; `onPeek` hears it hide and return. */
    offer: (onPeek: (on: boolean) => void) => {
      release = hud.offerViewBoard(layer, onPeek);
    },
    close: () => {
      small.removeEventListener('change', fill);
      release();
      unplace();
      unfit();
      layer.remove();
    },
  };
}

/**
 * The action bar while the stock pop-up is hidden: a short note and a button back to it.
 */
function boardPeekBar(hud: Hud) {
  return [
    h(
      'div',
      { class: 'm-sum m-card stock-peek' },
      h('div', { class: 'm-total' }, 'Looking at the board'),
      h('div', { class: 'hint' }, 'The stock market is hidden. Come back to it to finish.'),
    ),
    h(
      'div',
      { class: 'tb-btns' },
      h('button', { class: 'btn main', onclick: () => hud.setPeek(false) }, 'Back to stocks'),
    ),
  ];
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
  /** The district to start on (default: the first, or the first with shares to sell). */
  start?: number,
): Promise<{ d: number; n: number } | null> {
  let d =
    start ??
    (mode === 'sell'
      ? Math.max(
          0,
          p.shares.findIndex((n) => n > 0),
        )
      : 0);
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
    clear(sum);
    sum.append(
      h('div', { class: 'm-total' }, `${mode === 'buy' ? 'Buy' : 'Sell'} ${G.districts[d].name} shares`),
      // At a discount (buying) or a premium (selling): a chip in the card's top right corner.
      ...(rate
        ? [
            h(
              'span',
              { class: 'm-deal-tag m-corner' },
              mode === 'buy' ? `${rate * 100}% off` : `${rate * 100}% above`,
            ),
          ]
        : []),
      // The market: its price and the player's shares, now and after this trade.
      mLine('Market price', fmt(now), fmt(after), after > now ? 'up' : after < now ? 'down' : ''),
      mLine('Shares you hold', String(p.shares[d]), String(p.shares[d] + (mode === 'buy' ? n : -n)), 'held'),
      h('hr', { class: 'm-divider' }),
      // What the player pays or gets: the price per share (fixed while they change the count; a
      // deal crosses out the market's price and glows their own) and their cash.
      perShare(now, unit(), !!rate),
      mLine('Your cash', fmt(p.cash), fmt(cashAfter), cashAfter < 0 ? 'down' : ''),
    );
    go.disabled = n <= 0;
  };
  let peeking = false;
  const draw = () => {
    clear(bar);
    if (peeking) {
      bar.append(...boardPeekBar(hud));
      return;
    }
    const max = Math.max(0, maxN());
    n = Math.min(n || Math.min(10, max), max);
    // Arrows above and below each digit set the number of shares (no slider: easier on phones),
    // with Max right beside them.
    const picker = digitPicker({
      max,
      value: n,
      minButton: false,
      onChange: (v) => {
        n = v;
        update();
      },
    });
    update();
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
    marketView(
      G,
      d,
      (i) => {
        d = i;
        n = 0;
        draw();
      },
      { split: true },
    ),
  );
  pop.offer((on) => {
    peeking = on;
    draw();
  });
  pop.fit();
  draw();
  try {
    return await hud.prompt<{ d: number; n: number } | null>(bar, [], p.color);
  } finally {
    pop.close();
  }
}

/**
 * The "Price per share" row: what the player pays (or gets) for each share. With a discount or premium the
 * market's price is crossed out and the player's own price glows beside it.
 */
function perShare(market: number, mine: number | string, deal: boolean) {
  return h(
    'div',
    { class: 'm-line m-pay' },
    h('span', null, 'Price per share'),
    deal ? h('s', { class: 'm-was' }, priceFmt(market)) : h('span', null),
    h('span', null),
    h('b', { class: deal ? 'm-deal-price' : '' }, typeof mine === 'string' ? mine : priceFmt(mine)),
  );
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
  let peeking = false;
  const draw = () => {
    clear(bar);
    if (peeking) {
      bar.append(...boardPeekBar(hud));
      return;
    }
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
        // Gift shares just names the district; the rows below show the shares and "Free".
        free ? `Get ${name} shares` : `${name} stock ${purpose === 'up20' ? 'rises' : 'falls'} `,
        free ? null : h('b', null, '20%'),
      ),
      mLine('Market price', fmt(now), fmt(after), after > now ? 'up' : after < now ? 'down' : ''),
      ...(free
        ? [
            mLine('Shares you hold', String(p.shares[d]), String(p.shares[d] + GIFT_SHARES), 'up'),
            h('hr', { class: 'm-divider' }),
            perShare(now, 'Free', false),
          ]
        : [mLine('Your shares are worth', fmt(p.shares[d] * now), fmt(p.shares[d] * after))]),
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
    marketView(
      G,
      d,
      (i) => {
        d = i;
        draw();
      },
      { split: true },
    ),
  );
  pop.offer((on) => {
    peeking = on;
    draw();
  });
  pop.fit();
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
  /** Renovating: the square whose building is being replaced. */
  renovating = -1,
): Promise<BuildingKey | null> {
  const color = PLAYER_COLORS[p.color];
  const verb = extra ? 'Renovate' : 'Build';
  const cost = (b: BuildingKey) => BUILDINGS.find((x) => x.b === b)!.cost + extra;
  /** Why a building can't be chosen, or null when it can. */
  const blocked = (b: BuildingKey) =>
    options.some((o) => o.b === b)
      ? null
      : !buildingAvailable(hud.G, b, renovating)
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
    const card = cards[BUILDABLE.findIndex((x) => x.b === b)];
    const box = tip.parentElement;
    if (!box) return;
    const half = tip.offsetWidth / 2;
    const mid = card.offsetLeft + card.offsetWidth / 2;
    tip.style.left = `${Math.max(half, Math.min(box.clientWidth - half, mid))}px`;
  };
  const cards: HTMLButtonElement[] = BUILDABLE.map((def) => {
    const key = (def.b === 'star3' ? 'star0' : def.b === 'circus' ? 'circus0' : def.b) as PropKey;
    // How many more can go up on this board (renovating counts the building being replaced).
    const left = buildingsLeft(hud.G, def.b, renovating);
    const card = h(
      'button',
      {
        class: `bp-card ${blocked(def.b) ? 'off' : ''}`,
        'aria-label': `${def.name}, ${fmt(cost(def.b))}`,
        'aria-pressed': 'false',
      },
      h('img', { src: propIconURL(key, color), alt: '' }),
      left == null
        ? null
        : h(
            'span',
            { class: `bp-left ${left ? '' : 'none'}`, title: `${left} more can be built` },
            h('b', null, String(left)),
            h('span', { class: 'bp-left-word' }, ' left'),
          ),
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
