/**
 * Choosing properties on the board instead of from lists: auctions, renovations, debt sales,
 * trades (proposing, answering and counter-offers), the cannon target and the 5x buyout.
 * The candidates light up on the board; tapping one picks it, and a confirm step follows.
 */
import {
  BUILDINGS,
  K,
  PLAYER_COLORS,
  isProperty,
  ownedSquares,
  type BuildingKey,
  type DebtAsset,
  type GameState,
  type Player,
  type TradeOffer,
} from '@aa/engine';
import type { BoardView } from '../board';
import { shortName, squareName } from '../names';
import { digitPicker } from './digits';
import { clear, fmt, h } from './dom';
import type { Hud, PromptButton } from './hud';
import { boardPopup } from './minimap';
import { buildPrompt, stockModal } from './modals';

export interface PickCtx {
  hud: Hud;
  board: BoardView;
  G: GameState;
}

/** Light up `ids` and wait for a tap (or a button). Resolves null for the cancel button. */
export async function pickOnBoard<T = never>(
  { hud, board }: PickCtx,
  ids: number[],
  color: number,
  text: string | Node,
  extra: PromptButton<number | T | null>[] = [],
  opts: { labels?: Map<number, string>; cancel?: string; pins?: boolean } = {},
): Promise<number | T | null> {
  board.setChoices(ids, PLAYER_COLORS[color], (id) => hud.resolvePrompt(id), undefined, {
    labels: opts.labels,
    pins: opts.pins,
  });
  const buttons: PromptButton<number | T | null>[] = [...extra];
  if (opts.cancel !== '') buttons.push({ label: opts.cancel ?? 'Cancel', value: null, secondary: true });
  const v = await hud.prompt<number | T | null>(text, buttons, color);
  board.clearChoices();
  return v;
}

/** Keep one square lit while a question about it is open. */
function spotlight(board: BoardView, id: number, color: number) {
  board.setChoices([id], PLAYER_COLORS[color], () => {}, undefined, { pins: true });
}

/** A small table of label / value rows for the options panel. */
export function factTable(rows: [string, string | Node, string?][]): HTMLElement {
  return h(
    'div',
    { class: 'facts' },
    ...rows.map(([k, v, cls]) =>
      h('div', { class: `fact ${cls ?? ''}` }, h('span', null, k), h('b', null, v)),
    ),
  );
}

function titled(title: string, ...rest: (Node | string)[]): HTMLElement {
  return h('div', { class: 'rich-body' }, h('div', { class: 'rich-title' }, title), ...rest);
}

/**
 * A question for the action bar: just the question, with the numbers that go with it (price,
 * value, cash...) as chips underneath.
 */
export function question(text: string, chips: [string, string | Node, string?][]): HTMLElement {
  return titled(text, factTable(chips));
}

/**
 * Chips for a purchase, most important first (narrow screens show only the first few): the
 * price, the player's cash after (red below zero) and their cash now.
 */
export function costChips(label: string, price: number, cash: number): [string, string, string?][] {
  return [
    [label, fmt(price), 'big'],
    ['Cash after', fmt(cash - price), cash - price < 0 ? 'bad' : ''],
    ['Your cash', fmt(cash)],
  ];
}

// ------------------------------------------------------------ auction, renovate, debt

export function auctionOnBoard(ctx: PickCtx, p: Player): Promise<number | null> {
  const { G, hud } = ctx;
  const mine = ownedSquares(G, p.id).filter(isProperty);
  const color = PLAYER_COLORS[p.color];
  let picked = -1;
  const side = h('div', { class: 'rich-body bp-auction' });
  return new Promise((resolve) => {
    const done = (v: number | null) => {
      pop.close();
      resolve(v);
    };
    const draw = () => {
      clear(side);
      const sq = picked >= 0 ? G.nodes[picked] : null;
      side.append(
        sq
          ? h(
              'div',
              null,
              h('div', { class: 'rich-title' }, `Auction your ${squareName(G, sq)}?`),
              factTable([
                ['Value', fmt(sq.value)],
                ['Opening bid', fmt(sq.value)],
                ['Winning bid goes to', 'You'],
              ]),
            )
          : h(
              'div',
              null,
              h('div', { class: 'rich-title' }, 'Pick a property to auction'),
              h('p', { class: 'hint' }, 'Tap one of your properties on the board.'),
            ),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn main', disabled: !sq, onclick: () => done(picked) }, 'Auction it'),
          h('button', { class: 'btn ghost', onclick: () => done(null) }, 'Cancel'),
        ),
      );
      pop.mini.draw();
    };
    const pop = boardPopup(hud.modalLayer, G, 'Auction', side, {
      candidates: mine.map((s) => s.id),
      onPick: (id) => {
        picked = picked === id ? -1 : id;
        draw();
      },
      marks: () => new Map(picked >= 0 ? [[picked, { text: 'Sell', color }]] : []),
    });
    draw();
  });
}

export async function renovateOnBoard(
  ctx: PickCtx,
  p: Player,
): Promise<{ sq: number; b: BuildingKey } | null> {
  const { G, hud } = ctx;
  const plots = ownedSquares(G, p.id).filter((s) => s.t === 'plot' && s.b);
  for (;;) {
    const id = await pickOnBoard(
      ctx,
      plots.map((s) => s.id),
      p.color,
      `Renovate: tap one of your buildings to swap it for another (its cost + ${fmt(K.renovate)}).`,
    );
    if (id == null) return null;
    const sq = G.nodes[id as number];
    spotlight(ctx.board, sq.id, p.color);
    const options = BUILDINGS.filter((b) => b.b !== sq.b && b.cost + K.renovate <= p.cash).map(
      ({ b, cost }) => ({
        b,
        cost,
      }),
    );
    const b = await buildPrompt(hud, p, options, `Renovate your ${shortName(G, sq)} into what?`, K.renovate);
    ctx.board.clearChoices();
    if (b) return { sq: sq.id, b };
  }
}

/** In debt: sell stock (buttons) or tap a property to sell it to the bank. */
export async function debtOnBoard(
  ctx: PickCtx,
  p: Player,
  assets: DebtAsset[],
): Promise<number | { d: number; n: number }> {
  const { G, hud, board } = ctx;
  const squares = assets.map((a, i) => ({ a, i })).filter(({ a }) => a.kind === 'square');
  const stocks = assets.map((a, i) => ({ a, i })).filter(({ a }) => a.kind === 'stock');
  const labels = new Map(squares.map(({ a }) => [a.id, `+${fmt(a.amount)}`]));
  for (;;) {
    const stockValue = stocks.reduce((sum, { a }) => sum + a.amount, 0);
    const v = await pickOnBoard<'stock'>(
      ctx,
      squares.map(({ a }) => a.id),
      p.color,
      question(`${stocks.length ? 'Sell stock or tap' : 'Tap'} a property to pay off your debt`, [
        ['In debt', fmt(-p.cash), 'bad'],
        ['Properties sell for', `${K.debtSale * 100}% of value`],
      ]),
      stocks.length ? [{ label: `Sell stock (worth ${fmt(stockValue)})`, value: 'stock', main: true }] : [],
      { labels, cancel: '' },
    );
    if (v === 'stock') {
      // Any number of shares from any district, one sale at a time until cash is back to 0+.
      const r = await stockModal(hud, G, p, 'sell');
      if (r && r.n > 0) return r;
      continue;
    }
    if (v == null) continue;
    const pick = squares.find(({ a }) => a.id === v)!;
    spotlight(board, pick.a.id, p.color);
    const ok = await hud.prompt(
      question(`Sell your ${shortName(G, G.nodes[pick.a.id])}?`, [
        ['The bank pays', `+${fmt(pick.a.amount)}`, 'good'],
        ['Cash after', fmt(p.cash + pick.a.amount), p.cash + pick.a.amount < 0 ? 'bad' : ''],
      ]),
      [
        { label: 'Sell it', value: true, main: true },
        { label: 'Pick another', value: false },
      ],
      p.color,
    );
    board.clearChoices();
    if (ok) return pick.i;
  }
}

// ------------------------------------------------------------ buyout and cannon

export function buyoutPrompt(ctx: PickCtx, p: Player, sqId: number, price: number): Promise<boolean> {
  const { G, hud } = ctx;
  const sq = G.nodes[sqId];
  const owner = G.players[sq.owner];
  return hud.prompt(
    question(`Buy out ${owner.name}'s ${shortName(G, sq)} at ${K.buyoutX}x?`, [
      ...costChips(`Price (${K.buyoutX}x)`, price, p.cash).slice(0, 2),
      ['Value', fmt(sq.value)],
      [`${owner.name} gets (${K.buyoutOwnerX}x)`, fmt(sq.value * K.buyoutOwnerX)],
      ['Your cash', fmt(p.cash)],
    ]),
    [
      { label: 'Buy out', value: true },
      { label: 'No thanks', value: false, main: true },
    ],
    p.color,
  );
}

/** Cannon: tap a player on the board, then confirm. */
export async function cannonOnBoard(ctx: PickCtx, p: Player, options: number[]): Promise<number> {
  const { G, hud, board } = ctx;
  for (;;) {
    const nodes = [...new Set(options.map((id) => G.players[id].node))];
    const labels = new Map(
      nodes.map((n) => [
        n,
        options
          .filter((id) => G.players[id].node === n)
          .map((id) => G.players[id].name)
          .join(' & '),
      ]),
    );
    const node = (await pickOnBoard(
      ctx,
      nodes,
      p.color,
      'The cannon! Tap the player you want to fly to.',
      [],
      {
        labels,
        cancel: '',
      },
    )) as number;
    const here = options.filter((id) => G.players[id].node === node);
    spotlight(board, node, p.color);
    const target = await hud.prompt<number | null>(
      here.length > 1 ? 'Fly to which player?' : `Fly to ${G.players[here[0]].name}?`,
      [
        ...here.map((id) => ({
          label: here.length > 1 ? G.players[id].name : `Fly to ${G.players[id].name}`,
          value: id,
          main: here.length === 1,
        })),
        { label: 'Pick another', value: null, secondary: true },
      ],
      p.color,
    );
    board.clearChoices();
    if (target != null) return target;
  }
}

// ------------------------------------------------------------ trades

/**
 * Build a trade: pick the partner, then a pop-up shows the whole board on the left (tap your
 * properties and theirs to add or remove them) and the deal on the right. `fixed` locks the
 * partner (used for counter-offers, prefilled with `start`).
 */
export async function tradeOnBoard(
  ctx: PickCtx,
  p: Player,
  start?: TradeOffer,
  fixed = false,
): Promise<TradeOffer | null> {
  const { G, hud } = ctx;
  const rivals = G.players.filter((q) => q.id !== p.id && !q.bankrupt);
  let partner = start ? G.players[start.to] : null;
  if (!partner) {
    const id = await hud.prompt<number | null>(
      'Trade with who?',
      [
        ...rivals.map((q) => ({ label: q.name, value: q.id })),
        { label: 'Cancel', value: null, secondary: true },
      ],
      p.color,
    );
    if (id == null) return null;
    partner = G.players[id];
  }
  const q = partner;
  const give = new Set(start?.give ?? []);
  const get = new Set(start?.get ?? []);
  let cashGive = start?.cashGive ?? 0;
  let cashGet = start?.cashGet ?? 0;
  const mine = ownedSquares(G, p.id).filter(isProperty);
  const theirs = ownedSquares(G, q.id).filter(isProperty);

  const side = h('div', { class: 'rich-body trade-dock' });
  const chips = (ids: Set<number>, who: string) =>
    ids.size
      ? h(
          'div',
          { class: 'chips' },
          ...[...ids].map((id) => {
            const sq = G.nodes[id];
            return h(
              'span',
              { class: 'chip', style: `--dc:${G.districts[sq.d]?.color ?? '#ccc'}` },
              `${squareName(G, sq)} · ${fmt(sq.value)}`,
            );
          }),
        )
      : h('div', { class: 'hint' }, `Tap ${who} properties on the board`);
  return new Promise((resolve) => {
    const done = (v: TradeOffer | null) => {
      pop.close();
      resolve(v);
    };
    const draw = () => {
      clear(side);
      const valid = give.size + get.size > 0 || cashGive > 0 || cashGet > 0;
      const send = h(
        'button',
        {
          class: 'btn main',
          disabled: !valid,
          onclick: () => done({ from: p.id, to: q.id, give: [...give], get: [...get], cashGive, cashGet }),
        },
        fixed ? 'Send counter-offer' : 'Propose',
      ) as HTMLButtonElement;
      const cash = (max: number, value: number, set: (v: number) => void) =>
        digitPicker({
          max: Math.max(0, max),
          value,
          unit: 10,
          suffix: 'G',
          onChange: (v) => {
            set(v);
            send.disabled = !(give.size + get.size > 0 || cashGive > 0 || cashGet > 0);
          },
        }).el;
      side.append(
        h('div', { class: 'rich-title' }, `${fixed ? 'Counter-offer to' : 'Trade with'} ${q.name}`),
        h(
          'div',
          { class: 'trade-cols' },
          h(
            'div',
            { style: `--pc:${PLAYER_COLORS[p.color]}` },
            h('h4', null, 'You give'),
            chips(give, 'your'),
            h(
              'div',
              { class: 'cash-pick' },
              'Plus cash',
              cash(p.cash, cashGive, (v) => (cashGive = v)),
            ),
          ),
          h(
            'div',
            { style: `--pc:${PLAYER_COLORS[q.color]}` },
            h('h4', null, `${q.name} gives`),
            chips(get, `${q.name}'s`),
            h(
              'div',
              { class: 'cash-pick' },
              'Plus cash',
              cash(q.cash, cashGet, (v) => (cashGet = v)),
            ),
          ),
        ),
        h(
          'div',
          { class: 'btn-row' },
          send,
          h('button', { class: 'btn ghost', onclick: () => done(null) }, 'Cancel'),
        ),
      );
      pop.mini.draw();
    };
    const pop = boardPopup(hud.modalLayer, G, fixed ? 'Counter-offer' : 'Trade', side, {
      candidates: [...mine, ...theirs].map((s) => s.id),
      onPick: (id) => {
        const set = G.nodes[id].owner === p.id ? give : get;
        if (set.has(id)) set.delete(id);
        else set.add(id);
        draw();
      },
      marks: () => {
        const m = new Map<number, { text: string; color: string }>();
        for (const id of give) m.set(id, { text: 'Give', color: PLAYER_COLORS[p.color] });
        for (const id of get) m.set(id, { text: 'Get', color: PLAYER_COLORS[q.color] });
        return m;
      },
    });
    draw();
  });
}

/** Show an offer next to the whole board and answer it: accept, decline, or send back different terms. */
export async function answerTradeOnBoard(
  ctx: PickCtx,
  o: TradeOffer,
  canCounter: boolean,
): Promise<boolean | { counter: TradeOffer }> {
  const { G, hud } = ctx;
  const a = G.players[o.from];
  const b = G.players[o.to];
  const list = (ids: number[], cash: number) =>
    h(
      'div',
      { class: 'chips' },
      ...ids.map((id) =>
        h(
          'span',
          { class: 'chip', style: `--dc:${G.districts[G.nodes[id].d]?.color ?? '#ccc'}` },
          `${squareName(G, G.nodes[id])} · ${fmt(G.nodes[id].value)}`,
        ),
      ),
      cash ? h('span', { class: 'chip cash' }, fmt(cash)) : '',
      !ids.length && !cash ? h('span', { class: 'hint' }, 'Nothing') : '',
    );
  const v = await new Promise<'yes' | 'no' | 'counter'>((resolve) => {
    const done = (v: 'yes' | 'no' | 'counter') => {
      pop.close();
      resolve(v);
    };
    const side = h(
      'div',
      { class: 'rich-body trade-dock' },
      h('div', { class: 'rich-title' }, `${a.name} offers ${b.name} a trade`),
      h(
        'div',
        { class: 'trade-cols' },
        h('div', null, h('h4', null, `${b.name} gets`), list(o.give, o.cashGive)),
        h('div', null, h('h4', null, `${b.name} gives`), list(o.get, o.cashGet)),
      ),
      h('p', { class: 'hint' }, 'The properties are marked on the board.'),
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn main', onclick: () => done('yes') }, 'Accept'),
        canCounter ? h('button', { class: 'btn', onclick: () => done('counter') }, 'Counter-offer') : '',
        h('button', { class: 'btn ghost', onclick: () => done('no') }, 'Decline'),
      ),
    );
    const marks = new Map<number, { text: string; color: string }>();
    for (const id of o.give) marks.set(id, { text: 'You get', color: PLAYER_COLORS[a.color] });
    for (const id of o.get) marks.set(id, { text: 'You give', color: PLAYER_COLORS[b.color] });
    const pop = boardPopup(hud.modalLayer, G, 'Trade offer', side, {
      candidates: [...o.give, ...o.get],
      marks: () => marks,
    });
  });
  if (v === 'yes') return true;
  if (v === 'no') return false;
  // Counter-offer: start from the same deal seen from this side, then edit it.
  const counter = await tradeOnBoard(
    ctx,
    b,
    { from: b.id, to: a.id, give: o.get, get: o.give, cashGive: o.cashGet, cashGet: o.cashGive },
    true,
  );
  return counter ? { counter } : false;
}
