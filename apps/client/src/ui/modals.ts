/**
 * Modal dialogs for human decisions: stocks, investing, building and renovating, trades,
 * auctions, debt and the rules summary.
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
import { question } from './pick';
import { propIconURL, type PropKey } from '../props';

// ------------------------------------------------------------------ stocks

/** A share price, with one decimal when a discount or premium makes it fractional. */
const priceFmt = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString('en-US')}G`;

export function stockModal(
  hud: Hud,
  G: GameState,
  p: Player,
  mode: 'buy' | 'sell',
  rate = 0,
): Promise<{ d: number; n: number } | null> {
  return new Promise((resolve) => {
    let d =
      mode === 'sell'
        ? Math.max(
            0,
            p.shares.findIndex((n) => n > 0),
          )
        : 0;
    let n = 0;
    // The deal summary goes under the map; the share counter and buttons beside the shop cards.
    const info = h('div', { class: 'm-info' });
    const side = h('div', { class: 'm-deal-side' });
    const body = h('div', null);
    const m = hud.modal(
      mode === 'buy'
        ? rate
          ? 'Buy stock at 10% off'
          : 'Buy stock'
        : rate
          ? 'Sell stock at 20% above'
          : 'Sell stock',
      body,
      { wide: 'xl' },
    );
    const done = (v: { d: number; n: number } | null) => {
      m.close();
      resolve(v);
    };
    const unit = () => stockPrice(G, d) * (mode === 'buy' ? 1 - rate : 1 + rate);
    const maxN = () => (mode === 'buy' ? Math.min(K.maxBuy, Math.floor(p.cash / unit())) : p.shares[d]);
    const drawAction = () => {
      clear(info);
      clear(side);
      const max = Math.max(0, maxN());
      n = Math.min(n || Math.min(10, max), max);
      // Summary card: the cost, and the share price, cash and shares now and after.
      const sum = h('div', { class: 'm-sum m-card' });
      const go = h(
        'button',
        { class: 'btn main', onclick: () => n > 0 && done({ d, n }) },
        mode === 'buy' ? 'Buy' : 'Sell',
      ) as HTMLButtonElement;
      /** The share price once this trade is done: more shares held raise it, fewer lower it. */
      const priceAfter = () => {
        const held = sharesHeld(G, d) + (mode === 'buy' ? n : -n);
        return Math.max(1, Math.round(stockPriceExact(G, d, Math.max(0, held))));
      };
      const update = () => {
        // Trades cost (or fetch) the average of the price before and after, as in the engine.
        const value = shareTradeValue(G, d, n, mode === 'buy');
        const total = mode === 'buy' ? Math.ceil(value * (1 - rate)) : Math.floor(value * (1 + rate));
        const cashAfter = p.cash + (mode === 'buy' ? -total : total);
        const now = stockPrice(G, d);
        const after = priceAfter();
        const line = (label: string, a: string, b: string, cls = '') =>
          h(
            'div',
            { class: `m-line ${cls}` },
            h('span', null, label),
            h('span', { class: 'm-now' }, a),
            h('span', { class: 'm-arrow' }, '→'),
            h('b', null, b),
          );
        // At a discount (buying) or a premium (selling): the market price beside the player's.
        const normal = mode === 'buy' ? n * now : Math.floor(n * now);
        const deal = rate
          ? [
              h(
                'div',
                { class: 'm-line deal' },
                h('span', null, mode === 'buy' ? 'Your price per share' : 'You get per share'),
                h('span', { class: 'm-now was' }, fmt(now)),
                h('span', { class: 'm-arrow' }, '→'),
                h('b', null, priceFmt(unit())),
              ),
              h(
                'div',
                { class: 'm-line deal' },
                h(
                  'span',
                  null,
                  mode === 'buy' ? `You save (${rate * 100}% off)` : `Extra (${rate * 100}% above)`,
                ),
                h('span', null),
                h('span', null),
                h('b', null, `+${fmt(Math.abs(total - normal))}`),
              ),
            ]
          : [];
        clear(sum);
        sum.append(
          h(
            'div',
            { class: 'm-total' },
            `${mode === 'buy' ? 'Buy' : 'Sell'} ${n} share${n === 1 ? '' : 's'} for `,
            h('b', null, fmt(total)),
            rate
              ? h(
                  'span',
                  { class: 'm-deal-tag' },
                  mode === 'buy' ? `${rate * 100}% off` : `${rate * 100}% above market`,
                )
              : null,
            rate && n > 0 ? h('s', { class: 'm-was' }, fmt(normal)) : null,
          ),
          ...deal,
          line('Market price', fmt(now), fmt(after), after > now ? 'up' : after < now ? 'down' : ''),
          line('Your cash', fmt(p.cash), fmt(cashAfter), cashAfter < 0 ? 'down' : ''),
          line('Shares you hold', String(p.shares[d]), String(p.shares[d] + (mode === 'buy' ? n : -n))),
        );
        go.disabled = n <= 0;
      };
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
      info.append(sum);
      side.append(
        picker.el,
        h(
          'div',
          { class: 'btn-row' },
          go,
          h('button', { class: 'btn ghost', onclick: () => done(null) }, mode === 'buy' ? 'Skip' : 'Cancel'),
        ),
      );
    };
    body.append(
      marketView(
        G,
        d,
        (i) => {
          d = i;
          n = 0;
          drawAction();
        },
        { underMap: info, besideShops: side },
      ),
    );
    drawAction();
  });
}

/** How many free shares the Gift shares card gives. */
const GIFT_SHARES = 20;

/**
 * Venture cards that pick a district (20 free shares, stock up or down 20%): the stock screen,
 * with the amount fixed. Pick the district on the map or in the list, then confirm.
 */
export function districtStockModal(
  hud: Hud,
  G: GameState,
  p: Player,
  purpose: DistrictPurpose,
): Promise<number> {
  return new Promise((resolve) => {
    // Start on the district the player holds most of (or the first).
    let d = Math.max(0, p.shares.indexOf(Math.max(...p.shares)));
    const action = h('div', { class: 'm-action' });
    const title = {
      free20: `Gift shares: ${GIFT_SHARES} free shares`,
      up20: 'Bull market: raise a stock 20%',
      down20: 'Bear market: cut a stock 20%',
    }[purpose];
    const body = h('div', null);
    const m = hud.modal(title, body, { wide: true });
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
    const line = (label: string, a: string, b: string, cls = '') =>
      h(
        'div',
        { class: `m-line ${cls}` },
        h('span', null, label),
        h('span', { class: 'm-now' }, a),
        h('span', { class: 'm-arrow' }, '→'),
        h('b', null, b),
      );
    const drawAction = () => {
      clear(action);
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
          ? line('Shares you hold', String(p.shares[d]), String(p.shares[d] + GIFT_SHARES), 'up')
          : line('Price per share', fmt(now), fmt(after), after > now ? 'up' : after < now ? 'down' : ''),
        free
          ? line(
              'Your shares are worth',
              fmt(p.shares[d] * now),
              fmt((p.shares[d] + GIFT_SHARES) * now),
              'up',
            )
          : line('Your shares are worth', fmt(p.shares[d] * now), fmt(p.shares[d] * after)),
      );
      action.append(
        h(
          'div',
          { class: 'm-sel' },
          h('b', null, name),
          ` · ${fmt(now)} per share · you hold ${p.shares[d]}`,
        ),
        h(
          'div',
          { class: 'm-deal' },
          sum,
          h(
            'div',
            { class: 'm-deal-side' },
            free ? h('div', { class: 'm-fixed' }, h('b', null, String(GIFT_SHARES)), ' shares') : null,
            h(
              'div',
              { class: 'btn-row' },
              h(
                'button',
                {
                  class: 'btn main',
                  onclick: () => {
                    m.close();
                    resolve(d);
                  },
                },
                free ? `Take ${GIFT_SHARES} ${name} shares` : `Pick ${name}`,
              ),
            ),
          ),
        ),
        h('p', { class: 'hint' }, 'Pick a district on the map or in the list.'),
      );
    };
    body.append(
      marketView(G, d, (i) => {
        d = i;
        drawAction();
      }),
      action,
    );
    drawAction();
  });
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
 * Pick a building, in the action bar: a picture button per building with its name and price
 * under it (what it does on hover). Buildings the player cannot choose are greyed out. `extra`
 * is added to every cost (renovating). Cash is on the player's card, so it is not repeated here.
 */
export function buildPrompt(
  hud: Hud,
  p: Player,
  options: { b: BuildingKey; cost: number }[],
  text: string,
  extra = 0,
): Promise<BuildingKey | null> {
  const color = PLAYER_COLORS[p.color];
  const cost = (b: BuildingKey) => BUILDINGS.find((x) => x.b === b)!.cost + extra;
  return hud.prompt<BuildingKey | null>(
    question(text, []),
    [
      ...BUILDINGS.map((b) => {
        const opt = options.find((o) => o.b === b.b);
        const key = (b.b === 'star3' ? 'star0' : b.b === 'circus' ? 'circus0' : b.b) as PropKey;
        return {
          label: b.name,
          value: b.b as BuildingKey | null,
          icon: propIconURL(key, color),
          disabled: !opt,
          note: fmt(cost(b.b)),
          title: `${b.name} (${fmt(cost(b.b))})${
            !buildingAvailable(hud.G, b.b)
              ? ` - all ${K.buildingLimit} are already built`
              : cost(b.b) > p.cash
                ? ' - more than your cash: sell at the end of your turn'
                : ''
          }\nRival lands: ${BUILDING_INFO[b.b].rival}\nYou land: ${BUILDING_INFO[b.b].owner}`,
        };
      }),
      { label: 'Skip', value: null, secondary: true },
    ],
    p.color,
  );
}

// ------------------------------------------------------------------ trades

// ------------------------------------------------------------------ auction / debt

// ------------------------------------------------------------------ rules

export function rulesModal(hud: Hud, G: GameState | null) {
  const easy = G?.rules === 'easy';
  const body = h(
    'div',
    { class: 'rules' },
    h(
      'p',
      null,
      'Roll one die and move around the town. Buy shops, grow their value, and race to reach the target net worth, then get back to the bank.',
    ),
    h('h4', null, 'Shops'),
    h(
      'p',
      null,
      'Rivals who land on your shop pay a fee. Owning more of a ',
      easy ? 'row' : 'district',
      ' raises both fees and shop values; owning all of it dominates. Land on your own shop to invest. After paying a fee you may buy the shop out for 5x its value.',
    ),
    h('h4', null, 'Suits and promotion'),
    h(
      'p',
      null,
      'Collect ♠ ♥ ♦ ♣ and pass the bank to be promoted: you earn a salary of 600G + 250G x level + 15% of your shop value. Suit Yourself cards count as any missing suit.',
    ),
    easy ? null : h('h4', null, 'Stocks'),
    easy
      ? null
      : h(
          'p',
          null,
          "Buy shares at the bank or the stockbroker. Prices follow each district's average shop value. Every fee paid in a district pays dividends to its shareholders. Sell before rolling.",
        ),
    easy ? null : h('h4', null, 'Vacant plots'),
    easy
      ? null
      : h(
          'p',
          null,
          'Some properties start as empty plots (set in game setup). The first player to stop on one may build: Checkpoint, Circus, Balloonport, Tax Office, Home, Estate Agency or a 3-Star Shop. Each can be built at most 3 times unless every property is a plot.',
        ),
    h('h4', null, 'Special squares'),
    h(
      'p',
      null,
      'Venture squares (and stopping on a suit square) flip a venture card. Roll-on rolls again. Take-a-break closes your shops. Boon/Boom pay you 20%/50% of fees others pay. Warp squares send you to another part of the board. The cannon fires you to another player. The arcade plays a minigame.',
    ),
    h('h4', null, 'Before rolling'),
    h('p', null, 'You can sell stock, propose a trade, auction a property or renovate a building.'),
    h('h4', null, 'Debt'),
    h(
      'p',
      null,
      'If your cash is below 0 at the end of your turn you must sell stock or property. With nothing left to sell you go bankrupt and the richest player wins.',
    ),
    h('h4', null, 'Controls'),
    h(
      'p',
      null,
      'Enter or Space presses the main button. V toggles the full board view. Hover or tap a square for details.',
    ),
  );
  const m = hud.modal('Rules', body, { onClose: () => m.close() });
}
