/**
 * Modal dialogs for human decisions: stocks, investing, building and renovating, trades,
 * auctions, debt and the rules summary.
 */
import {
  BUILDINGS,
  K,
  PLAYER_COLORS,
  isProperty,
  maxValue,
  ownedSquares,
  salary,
  shopFee,
  stockPrice,
  type BuildingKey,
  type DebtAsset,
  type GameState,
  type Player,
  type TradeOffer,
} from '@aa/engine';
import { BUILDING_INFO, squareName } from '../names';
import { clear, fmt, h } from './dom';
import { digitPicker } from './digits';
import type { Hud } from './hud';
import { marketView } from './market';

// ------------------------------------------------------------------ stocks

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
    const action = h('div', { class: 'm-action' });
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
      { wide: true },
    );
    const done = (v: { d: number; n: number } | null) => {
      m.close();
      resolve(v);
    };
    const unit = () => stockPrice(G, d) * (mode === 'buy' ? 1 - rate : 1 + rate);
    const maxN = () => (mode === 'buy' ? Math.min(K.maxBuy, Math.floor(p.cash / unit())) : p.shares[d]);
    const drawAction = () => {
      clear(action);
      const max = Math.max(0, maxN());
      n = Math.min(n || Math.min(10, max), max);
      const sum = h('div', { class: 'm-sum' });
      const go = h(
        'button',
        { class: 'btn main', onclick: () => n > 0 && done({ d, n }) },
        mode === 'buy' ? 'Buy' : 'Sell',
      ) as HTMLButtonElement;
      const update = () => {
        const total = mode === 'buy' ? Math.ceil(n * unit()) : Math.floor(n * unit());
        clear(sum);
        sum.append(
          `${n} shares = ${fmt(total)}`,
          n >= K.bigTrade
            ? h(
                'span',
                { class: 'hint' },
                mode === 'buy' ? ' · price will rise 10%' : ' · price will drop 10%',
              )
            : '',
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
      action.append(
        h(
          'div',
          { class: 'm-sel' },
          h('b', null, G.districts[d].name),
          ` · ${fmt(unit())} per share · you hold ${p.shares[d]}`,
          mode === 'buy' ? ` · you can buy up to ${max}` : '',
        ),
        picker.el,
        sum,
        h(
          'div',
          { class: 'btn-row' },
          go,
          h('button', { class: 'btn ghost', onclick: () => done(null) }, mode === 'buy' ? 'Skip' : 'Cancel'),
        ),
      );
    };
    body.append(
      marketView(G, d, (i) => {
        d = i;
        n = 0;
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
    let amount = lim;
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
      );
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

export function buildModal(
  hud: Hud,
  options: { b: BuildingKey; cost: number }[],
  title: string,
  extra = 0,
  note = '',
): Promise<BuildingKey | null> {
  return new Promise((resolve) => {
    const body = h('div', { class: 'build-grid' });
    const m = hud.modal(
      title,
      h(
        'div',
        null,
        note ? h('p', { class: 'hint debt-note' }, note) : null,
        body,
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn ghost', onclick: () => done(null) }, 'Skip'),
        ),
      ),
      {
        wide: true,
      },
    );
    const done = (v: BuildingKey | null) => {
      m.close();
      resolve(v);
    };
    for (const b of BUILDINGS) {
      const opt = options.find((o) => o.b === b.b);
      body.append(
        h(
          'button',
          { class: 'build-card', disabled: !opt, onclick: () => done(b.b) },
          h(
            'div',
            { class: 'bc-head' },
            h('b', null, b.name),
            h('span', { class: 'cost' }, fmt(b.cost + extra)),
          ),
          h('p', null, h('i', null, 'Rival lands: '), BUILDING_INFO[b.b].rival),
          h('p', null, h('i', null, 'You land: '), BUILDING_INFO[b.b].owner),
        ),
      );
    }
  });
}

export function renovateModal(
  hud: Hud,
  G: GameState,
  p: Player,
): Promise<{ sq: number; b: BuildingKey } | null> {
  return new Promise((resolve) => {
    const plots = ownedSquares(G, p.id).filter((s) => s.t === 'plot' && s.b);
    const body = h('div', null);
    const m = hud.modal('Renovate', body);
    const done = (v: { sq: number; b: BuildingKey } | null) => {
      m.close();
      resolve(v);
    };
    body.append(
      h('p', { class: 'hint' }, `Swap a building for another for its cost + ${K.renovate}G.`),
      h(
        'div',
        { class: 'pick-list' },
        ...plots.map((sq) =>
          h(
            'button',
            {
              class: 'pick',
              onclick: async () => {
                m.close();
                const options = BUILDINGS.filter((b) => b.b !== sq.b && b.cost + K.renovate <= p.cash).map(
                  ({ b, cost }) => ({ b, cost }),
                );
                const b = await buildModal(hud, options, `Renovate ${squareName(G, sq)}`, K.renovate);
                resolve(b ? { sq: sq.id, b } : null);
              },
            },
            h('span', null, squareName(G, sq)),
          ),
        ),
      ),
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn ghost', onclick: () => done(null) }, 'Cancel'),
      ),
    );
  });
}

// ------------------------------------------------------------------ trades

export function tradeModal(hud: Hud, G: GameState, p: Player): Promise<TradeOffer | null> {
  return new Promise((resolve) => {
    const rivals = G.players.filter((q) => q.id !== p.id && !q.bankrupt);
    let partner = rivals[0];
    const give = new Set<number>();
    const get = new Set<number>();
    let cashGive = 0;
    let cashGet = 0;
    const body = h('div', { class: 'trade' });
    const m = hud.modal('Propose a trade', body, { wide: true });
    const done = (v: TradeOffer | null) => {
      m.close();
      resolve(v);
    };
    const propList = (owner: Player, set: Set<number>) =>
      h(
        'div',
        { class: 'pick-list compact' },
        ...ownedSquares(G, owner.id)
          .filter(isProperty)
          .map((sq) => {
            const cb = h('input', { type: 'checkbox', checked: set.has(sq.id) }) as HTMLInputElement;
            cb.onchange = () => {
              if (cb.checked) set.add(sq.id);
              else set.delete(sq.id);
              draw();
            };
            return h(
              'label',
              { class: 'pick' },
              cb,
              h('span', { class: 'swatch', style: `background:${G.districts[sq.d]?.color ?? '#ccc'}` }),
              h('span', null, squareName(G, sq)),
              h('small', null, fmt(sq.value)),
            );
          }),
        ownedSquares(G, owner.id).length ? null : h('p', { class: 'hint' }, 'No properties.'),
      );
    const cashInput = (val: number, max: number, set: (v: number) => void) => {
      const el = h('input', {
        type: 'number',
        min: '0',
        max: String(Math.max(0, max)),
        value: String(val),
        class: 'num',
      }) as HTMLInputElement;
      el.onchange = () => {
        set(Math.max(0, Math.min(Math.max(0, max), Math.floor(Number(el.value)) || 0)));
        draw();
      };
      return el;
    };
    const draw = () => {
      clear(body);
      const valid = give.size + get.size > 0 || cashGive > 0 || cashGet > 0;
      body.append(
        h(
          'div',
          { class: 'btn-row left' },
          'Trade with: ',
          ...rivals.map((q) =>
            h(
              'button',
              {
                class: `btn small ${q === partner ? 'on' : 'ghost'}`,
                style: `--pc:${PLAYER_COLORS[q.color]}`,
                onclick: () => {
                  partner = q;
                  get.clear();
                  cashGet = 0;
                  draw();
                },
              },
              q.name,
            ),
          ),
        ),
        h(
          'div',
          { class: 'trade-cols' },
          h(
            'div',
            null,
            h('h4', null, `You give (${p.name})`),
            propList(p, give),
            h(
              'div',
              { class: 'cash-row' },
              'Cash ',
              cashInput(cashGive, p.cash, (v) => (cashGive = v)),
            ),
          ),
          h(
            'div',
            null,
            h('h4', null, `You get (${partner.name})`),
            propList(partner, get),
            h(
              'div',
              { class: 'cash-row' },
              'Cash ',
              cashInput(cashGet, partner.cash, (v) => (cashGet = v)),
            ),
          ),
        ),
        h(
          'div',
          { class: 'btn-row' },
          h(
            'button',
            {
              class: 'btn main',
              disabled: !valid,
              onclick: () =>
                done({ from: p.id, to: partner.id, give: [...give], get: [...get], cashGive, cashGet }),
            },
            'Propose',
          ),
          h('button', { class: 'btn ghost', onclick: () => done(null) }, 'Cancel'),
        ),
      );
    };
    draw();
  });
}

export function answerTradeModal(hud: Hud, G: GameState, o: TradeOffer): Promise<boolean> {
  return new Promise((resolve) => {
    const a = G.players[o.from];
    const b = G.players[o.to];
    const list = (ids: number[], cash: number) =>
      h(
        'ul',
        { class: 'offer' },
        ...ids.map((id) => h('li', null, `${squareName(G, G.nodes[id])} (${fmt(G.nodes[id].value)})`)),
        cash ? h('li', null, fmt(cash)) : null,
        !ids.length && !cash ? h('li', { class: 'hint' }, 'Nothing') : null,
      );
    const body = h(
      'div',
      { class: 'trade' },
      h('p', null, `${a.name} offers ${b.name} a trade.`),
      h(
        'div',
        { class: 'trade-cols' },
        h('div', null, h('h4', null, `${b.name} gets`), list(o.give, o.cashGive)),
        h('div', null, h('h4', null, `${b.name} gives`), list(o.get, o.cashGet)),
      ),
    );
    const m = hud.modal('Trade offer', body);
    const done = (v: boolean) => {
      m.close();
      resolve(v);
    };
    body.append(
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn main', onclick: () => done(true) }, 'Accept'),
        h('button', { class: 'btn ghost', onclick: () => done(false) }, 'Decline'),
      ),
    );
  });
}

// ------------------------------------------------------------------ auction / debt

export function auctionPickModal(hud: Hud, G: GameState, p: Player): Promise<number | null> {
  return new Promise((resolve) => {
    const body = h('div', null);
    const m = hud.modal('Auction a property', body);
    const done = (v: number | null) => {
      m.close();
      resolve(v);
    };
    body.append(
      h('p', { class: 'hint' }, 'Opening bid is the property value; the winning bid is paid to you.'),
      h(
        'div',
        { class: 'pick-list' },
        ...ownedSquares(G, p.id).map((sq) =>
          h(
            'button',
            { class: 'pick', onclick: () => done(sq.id) },
            h('span', null, squareName(G, sq)),
            h('small', null, fmt(sq.value)),
          ),
        ),
      ),
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn ghost', onclick: () => done(null) }, 'Cancel'),
      ),
    );
  });
}

export function debtModal(hud: Hud, G: GameState, p: Player, assets: DebtAsset[]): Promise<number> {
  return new Promise((resolve) => {
    const body = h('div', null);
    const m = hud.modal(`${p.name} is in debt`, body);
    body.append(
      h(
        'p',
        null,
        `Cash: `,
        h('b', { class: 'neg' }, fmt(p.cash)),
        '. Sell assets until your cash is 0G or more.',
      ),
      h(
        'div',
        { class: 'pick-list' },
        ...assets.map((a, i) =>
          h(
            'button',
            {
              class: 'pick',
              onclick: () => {
                m.close();
                resolve(i);
              },
            },
            h(
              'span',
              null,
              a.kind === 'stock'
                ? `All ${G.districts[a.id].name} shares (${p.shares[a.id]})`
                : squareName(G, G.nodes[a.id]),
            ),
            h('small', null, `+${fmt(a.amount)}`),
          ),
        ),
      ),
      h(
        'p',
        { class: 'hint' },
        `Shops are sold to the bank for ${K.debtSale * 100}% of value, then auctioned.`,
      ),
    );
  });
}

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
          'Five plots start empty. The first player to stop on one may build: Checkpoint, Circus, Balloonport, Tax Office, Home, Estate Agency or a 3-Star Shop.',
        ),
    h('h4', null, 'Special squares'),
    h(
      'p',
      null,
      'Venture squares (and stopping on a suit square) flip a venture card. Roll-on rolls again. Take-a-break closes your shops. Boon/Boom pay you 20%/50% of fees others pay. Backstreets warp across town. The cannon fires you to another player. The arcade plays a minigame.',
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
