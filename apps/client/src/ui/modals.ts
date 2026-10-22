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
  stockPrice,
  type BuildingKey,
  type DebtAsset,
  type GameState,
  type Player,
  type TradeOffer,
} from '@aa/engine';
import { BUILDING_INFO, squareName } from '../names';
import { clear, fmt, h } from './dom';
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
      const total = mode === 'buy' ? Math.ceil(n * unit()) : Math.floor(n * unit());
      const input = h('input', {
        type: 'range',
        min: '0',
        max: String(max),
        value: String(n),
        step: '1',
      }) as HTMLInputElement;
      const num = h('input', {
        type: 'number',
        min: '0',
        max: String(max),
        value: String(n),
        class: 'num',
      }) as HTMLInputElement;
      const sync = (v: number) => {
        n = Math.max(0, Math.min(max, Math.floor(v) || 0));
        drawAction();
      };
      input.oninput = () => sync(Number(input.value));
      num.onchange = () => sync(Number(num.value));
      action.append(
        h(
          'div',
          { class: 'm-sel' },
          h('b', null, G.districts[d].name),
          ` · ${fmt(unit())} per share · you hold ${p.shares[d]}`,
        ),
        h('div', { class: 'amount' }, input, num),
        h(
          'div',
          { class: 'm-sum' },
          `${n} shares = ${fmt(total)}`,
          n >= K.bigTrade
            ? h(
                'span',
                { class: 'hint' },
                mode === 'buy' ? ' · price will rise 10%' : ' · price will drop 10%',
              )
            : null,
        ),
        h(
          'div',
          { class: 'btn-row' },
          h(
            'button',
            { class: 'btn main', disabled: n <= 0, onclick: () => done({ d, n }) },
            mode === 'buy' ? 'Buy' : 'Sell',
          ),
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

export function investModal(
  hud: Hud,
  G: GameState,
  shops: { sq: number; room: number }[],
  max: number,
): Promise<{ sq: number; amount: number } | null> {
  return new Promise((resolve) => {
    let sel = shops[0].sq;
    let amount = 0;
    const body = h('div', { class: 'invest' });
    const m = hud.modal('Invest', body);
    const done = (v: { sq: number; amount: number } | null) => {
      m.close();
      resolve(v);
    };
    const draw = () => {
      clear(body);
      const opt = shops.find((s) => s.sq === sel)!;
      const lim = Math.min(opt.room, max);
      amount = Math.min(amount || lim, lim);
      const list = h(
        'div',
        { class: 'pick-list' },
        ...shops.map((s) => {
          const sq = G.nodes[s.sq];
          return h(
            'button',
            {
              class: `pick ${s.sq === sel ? 'sel' : ''}`,
              onclick: () => ((sel = s.sq), (amount = 0), draw()),
            },
            h('span', { class: 'swatch', style: `background:${G.districts[sq.d]?.color ?? '#ccc'}` }),
            h('span', null, squareName(G, sq)),
            h('small', null, `${fmt(sq.value)} / max ${fmt(maxValue(G, sq))}`),
          );
        }),
      );
      const range = h('input', {
        type: 'range',
        min: '0',
        max: String(lim),
        value: String(amount),
        step: '1',
      }) as HTMLInputElement;
      const num = h('input', {
        type: 'number',
        min: '0',
        max: String(lim),
        value: String(amount),
        class: 'num',
      }) as HTMLInputElement;
      range.oninput = () => {
        amount = Number(range.value);
        num.value = range.value;
        sum.textContent = `Invest ${fmt(amount)}`;
      };
      num.onchange = () => {
        amount = Math.max(0, Math.min(lim, Math.floor(Number(num.value)) || 0));
        draw();
      };
      const sum = h('div', { class: 'm-sum' }, `Invest ${fmt(amount)}`);
      body.append(
        h(
          'p',
          { class: 'hint' },
          `Up to ${fmt(K.investCap)} per visit. Investing raises the value, the fee, your salary and the stock price.`,
        ),
        list,
        h('div', { class: 'amount' }, range, num),
        sum,
        h(
          'div',
          { class: 'btn-row' },
          h(
            'button',
            { class: 'btn main', onclick: () => done(amount > 0 ? { sq: sel, amount } : null) },
            'Invest',
          ),
          h('button', { class: 'btn ghost', onclick: () => done(null) }, 'Skip'),
        ),
      );
    };
    draw();
  });
}

// ------------------------------------------------------------------ build / renovate

export function buildModal(
  hud: Hud,
  options: { b: BuildingKey; cost: number }[],
  title: string,
  extra = 0,
): Promise<BuildingKey | null> {
  return new Promise((resolve) => {
    const body = h('div', { class: 'build-grid' });
    const m = hud.modal(
      title,
      h(
        'div',
        null,
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
