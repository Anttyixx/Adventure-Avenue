/**
 * Choosing properties on the board instead of from lists: auctions, renovations, debt sales,
 * trades (proposing, answering and counter-offers), the cannon target and the 5x buyout.
 * The candidates light up on the board; tapping one picks it, and a confirm step follows.
 */
import {
  buildingAvailable,
  BUILDABLE,
  K,
  PLAYER_COLORS,
  isProperty,
  ownedSquares,
  squareFee,
  type BuildingKey,
  type DebtAsset,
  type GameState,
  type Player,
  type TradeOffer,
} from '@aa/engine';
import type { BoardView } from '../board';
import { shortName, squareName } from '../names';
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

/** The Buy button's answer while picking a shop to buy (square ids are never negative). */
const BUY_PICKED = -1;

/**
 * Buying a shop from a venture card (a rival's for 5x its value, `takeover`; or an unowned one):
 * tap a glowing shop on the board, then Buy in the action bar. Tapping another shop switches to
 * it. The bar never lists the shops. Resolves with the shop bought, or null for Skip.
 */
export async function buyOnBoard(
  { hud, board }: PickCtx,
  p: Player,
  options: number[],
  text: string,
  price: (id: number) => number,
  takeover: boolean,
  optional = true,
): Promise<number | null> {
  const G = hud.G;
  const labels = new Map(options.map((id) => [id, fmt(price(id))]));
  board.setChoices(options, PLAYER_COLORS[p.color], (id) => hud.resolvePrompt(id), undefined, { labels });
  let sel: number | null = null;
  for (;;) {
    board.highlight = sel == null ? [] : [sel];
    let body: string | HTMLElement = `${text} Tap a glowing square.`;
    if (sel != null) {
      const sq = G.nodes[sel];
      const owner = sq.owner >= 0 ? G.players[sq.owner] : null;
      const cost = price(sel);
      body = question(`Buy ${owner ? `${owner.name}'s ` : ''}${squareName(G, sq)} for ${fmt(cost)}?`, [
        ['Price', fmt(cost)],
        ...(takeover ? ([['Its value', fmt(sq.value)]] as [string, string][]) : []),
        ['Your cash after', fmt(p.cash - cost)],
      ]);
    }
    const buttons: PromptButton<number | null>[] = [];
    if (sel != null) buttons.push({ label: 'Buy', value: BUY_PICKED, main: true });
    if (optional) buttons.push({ label: 'Skip', value: null, secondary: true });
    const v: number | null = await hud.prompt<number | null>(body, buttons, p.color);
    if (v === BUY_PICKED || v == null) {
      board.clearChoices();
      return v == null ? null : sel;
    }
    sel = v;
  }
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
 * The fee rivals would pay on a square if `pid` owned it (and, for a circus, at level `lv`):
 * the square is changed for the sum and put back straight after.
 */
export function feeIfOwned(G: GameState, sqId: number, pid: number, lv?: number): number {
  const sq = G.nodes[sqId];
  const keep = { owner: sq.owner, lv: sq.lv };
  sq.owner = pid;
  if (lv != null) sq.lv = lv;
  const fee = squareFee(G, sq);
  Object.assign(sq, keep);
  return fee;
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
    const options = BUILDABLE.filter(
      (b) => b.b !== sq.b && b.cost + K.renovate <= p.cash && buildingAvailable(G, b.b, sq.id),
    ).map(({ b, cost }) => ({
      b,
      cost,
    }));
    const b = await buildPrompt(
      hud,
      p,
      options,
      `Renovate your ${shortName(G, sq)} into what?`,
      K.renovate,
      sq.id,
    );
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
        p.cash + pick.a.amount < 0
          ? ['Debt left', fmt(-(p.cash + pick.a.amount)), 'bad']
          : ['Debt', 'Paid off', 'good'],
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
      [`Price (${K.buyoutX}x)`, fmt(price), 'big'],
      ['Fee when rivals land here', fmt(feeIfOwned(G, sqId, p.id))],
      ['Value', fmt(sq.value)],
      [`${owner.name} gets (${K.buyoutOwnerX}x)`, fmt(sq.value * K.buyoutOwnerX)],
    ]),
    [
      { label: 'Buy out', value: true },
      { label: 'No thanks', value: false, main: true, danger: true },
    ],
    p.color,
  );
}

/** Passing a motel: stop here, or keep moving. */
export function motelPrompt(
  ctx: PickCtx,
  p: Player,
  sqId: number,
  fee: number,
  left: number,
): Promise<boolean> {
  const { G, hud, board } = ctx;
  const sq = G.nodes[sqId];
  const mine = sq.owner === p.id;
  spotlight(board, sqId, p.color);
  return hud
    .prompt(
      question(mine ? 'Stop at your motel?' : `Stop at ${G.players[sq.owner].name}'s motel?`, [
        mine ? ['Stopping here', 'Invest in one of your shops'] : ['Fee to stop here', fmt(fee), 'big'],
        ['Spaces left to move', String(left)],
      ]),
      [
        { label: 'Stop here', value: true },
        { label: 'Keep moving', value: false, main: true },
      ],
      p.color,
    )
    .finally(() => board.clearChoices());
}

/** Cannon or Swap square: tap a player on the board, then confirm. */
export async function cannonOnBoard(
  ctx: PickCtx,
  p: Player,
  options: number[],
  kind: 'cannon' | 'swap' = 'cannon',
): Promise<number> {
  const { G, hud, board } = ctx;
  const words =
    kind === 'swap'
      ? {
          title: 'Swap! Tap the player you want to trade places with.',
          which: 'Swap with which player?',
          go: 'Swap with',
        }
      : {
          title: 'The cannon! Tap the player you want to fly to.',
          which: 'Fly to which player?',
          go: 'Fly to',
        };
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
    const node = (await pickOnBoard(ctx, nodes, p.color, words.title, [], {
      labels,
      cancel: '',
    })) as number;
    const here = options.filter((id) => G.players[id].node === node);
    spotlight(board, node, p.color);
    const target = await hud.prompt<number | null>(
      here.length > 1 ? words.which : `${words.go} ${G.players[here[0]].name}?`,
      [
        ...here.map((id) => ({
          label: here.length > 1 ? G.players[id].name : `${words.go} ${G.players[id].name}`,
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

/** A property in a trade, as a chip with its district color (tapping it can remove it). */
function tradeChip(G: GameState, id: number, onRemove?: () => void): HTMLElement {
  const sq = G.nodes[id];
  return h(
    onRemove ? 'button' : 'span',
    {
      class: 'tb-chip',
      style: `--dc:${G.districts[sq.d]?.color ?? '#9aa3b8'}`,
      title: onRemove ? `${squareName(G, sq)}: tap to take it out` : squareName(G, sq),
      onclick: onRemove ?? null,
    },
    `${shortName(G, sq)} ${fmt(sq.value)}`,
  );
}

/** Cash in a trade: minus, the amount (can be typed), plus. Steps of 50G, capped at `max`. */
function cashStepper(value: number, max: number, onChange: (v: number) => void): HTMLElement {
  const clamp = (v: number) => Math.max(0, Math.min(Math.max(0, max), Math.round(v) || 0));
  const input = h('input', {
    class: 'tb-cash-in',
    type: 'number',
    min: '0',
    max: String(Math.max(0, max)),
    step: '10',
    value: String(value),
    'aria-label': 'Cash',
  }) as HTMLInputElement;
  const set = (v: number) => {
    v = clamp(v);
    input.value = String(v);
    onChange(v);
  };
  input.onchange = () => set(Number(input.value));
  return h(
    'span',
    { class: 'tb-cash', title: `Cash (up to ${fmt(Math.max(0, max))})` },
    h(
      'button',
      { class: 'tb-step', onclick: () => set(Number(input.value) - 50), 'aria-label': 'Less cash' },
      '−',
    ),
    input,
    h('span', { class: 'tb-g' }, 'G'),
    h(
      'button',
      { class: 'tb-step', onclick: () => set(Number(input.value) + 50), 'aria-label': 'More cash' },
      '+',
    ),
  );
}

/**
 * Build a trade in the action bar: pick the partner, then the board pulls back to show every
 * square, with everything but the two players' properties dimmed. Tapping a property adds it
 * (or takes it out); the bar shows what each side gives side by side (you on the left), with
 * cash for each. `fixed` locks the
 * partner (counter-offers, prefilled with `start`).
 */
export async function tradeOnBoard(
  ctx: PickCtx,
  p: Player,
  start?: TradeOffer,
  fixed = false,
): Promise<TradeOffer | null> {
  const { G, hud, board } = ctx;
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
  const ids = [...ownedSquares(G, p.id), ...ownedSquares(G, q.id)].filter(isProperty).map((s) => s.id);

  const body = h('div', { class: 'trade-bar' });
  const send = h('button', { class: 'btn main' }, fixed ? 'Send' : 'Propose') as HTMLButtonElement;
  const valid = () => give.size + get.size > 0 || cashGive > 0 || cashGet > 0;
  const lightBoard = () => {
    const labels = new Map<number, string>();
    for (const id of give) labels.set(id, 'Give');
    for (const id of get) labels.set(id, 'Get');
    board.setChoices(ids, PLAYER_COLORS[p.color], toggle, undefined, { labels, pins: false });
  };
  const toggle = (id: number) => {
    const set = G.nodes[id].owner === p.id ? give : get;
    if (set.has(id)) set.delete(id);
    else set.add(id);
    lightBoard();
    draw();
  };
  const row = (who: Player, label: string, set: Set<number>, cash: number, setCash: (v: number) => void) =>
    h(
      'div',
      { class: 'tb-row', style: `--pc:${PLAYER_COLORS[who.color]}` },
      h(
        'div',
        { class: 'tb-head' },
        h('span', { class: 'tb-who' }, label),
        cashStepper(cash, who.cash, (v) => {
          setCash(v);
          send.disabled = !valid();
        }),
      ),
      h(
        'div',
        { class: 'tb-chips' },
        ...(set.size
          ? [...set].map((id) => tradeChip(G, id, () => toggle(id)))
          : [h('span', { class: 'tb-hint' }, `Tap ${who === p ? 'your' : `${who.name}'s`} properties`)]),
      ),
    );
  const draw = () => {
    clear(body);
    send.disabled = !valid();
    body.append(
      h(
        'div',
        { class: 'tb-rows' },
        row(p, 'You give', give, cashGive, (v) => (cashGive = v)),
        row(q, `${q.name} gives`, get, cashGet, (v) => (cashGet = v)),
      ),
      h(
        'div',
        { class: 'tb-btns' },
        send,
        h('button', { class: 'btn ghost', onclick: () => hud.resolvePrompt(null) }, 'Cancel'),
      ),
    );
  };
  send.onclick = () =>
    valid() && hud.resolvePrompt({ from: p.id, to: q.id, give: [...give], get: [...get], cashGive, cashGet });
  board.overviewHold = true;
  lightBoard();
  draw();
  const offer = await hud.prompt<TradeOffer | null>(body, [], p.color);
  board.clearChoices();
  board.overviewHold = false;
  return offer;
}

/**
 * Someone else is deciding on a trade: everyone else sees the terms on the table (what each side
 * gives, labelled on the board) without any buttons, and who is deciding. Returns a function that
 * takes it down once they have answered.
 */
export function watchTradeOnBoard(ctx: PickCtx, o: TradeOffer): () => void {
  const { G, hud, board } = ctx;
  const a = G.players[o.from];
  const b = G.players[o.to];
  const row = (who: Player, ids: number[], cash: number) =>
    h(
      'div',
      { class: 'tb-row', style: `--pc:${PLAYER_COLORS[who.color]}` },
      h('div', { class: 'tb-head' }, h('span', { class: 'tb-who' }, `${who.name} gives`)),
      h(
        'div',
        { class: 'tb-chips' },
        ...ids.map((id) => tradeChip(G, id)),
        cash ? h('span', { class: 'tb-chip cash' }, fmt(cash)) : null,
        !ids.length && !cash ? h('span', { class: 'tb-hint' }, 'Nothing') : null,
      ),
    );
  const body = h(
    'div',
    { class: 'trade-bar watching' },
    h('div', { class: 'tb-rows' }, row(a, o.give, o.cashGive), row(b, o.get, o.cashGet)),
    h('div', { class: 'tb-waiting' }, `${b.name} is deciding…`),
  );
  const labels = new Map<number, string>();
  for (const id of o.give) labels.set(id, `${a.name} gives`);
  for (const id of o.get) labels.set(id, `${b.name} gives`);
  board.setChoices([...o.give, ...o.get], PLAYER_COLORS[a.color], () => {}, undefined, {
    labels,
    pins: false,
    fit: false,
  });
  let open = true;
  void hud.prompt(body, [], b.color);
  return () => {
    if (!open) return;
    open = false;
    hud.resolvePrompt(null);
    board.clearChoices();
  };
}

/**
 * Answer an offer in the action bar: what each side gives, with the properties labelled on the
 * zoomed-out board. Accept, decline, or send back different terms.
 */
export async function answerTradeOnBoard(
  ctx: PickCtx,
  o: TradeOffer,
  canCounter: boolean,
): Promise<boolean | { counter: TradeOffer }> {
  const { G, hud, board } = ctx;
  const a = G.players[o.from];
  const b = G.players[o.to];
  const row = (who: Player, label: string, ids: number[], cash: number) =>
    h(
      'div',
      { class: 'tb-row', style: `--pc:${PLAYER_COLORS[who.color]}` },
      h('div', { class: 'tb-head' }, h('span', { class: 'tb-who' }, label)),
      h(
        'div',
        { class: 'tb-chips' },
        ...ids.map((id) => tradeChip(G, id)),
        cash ? h('span', { class: 'tb-chip cash' }, fmt(cash)) : null,
        !ids.length && !cash ? h('span', { class: 'tb-hint' }, 'Nothing') : null,
      ),
    );
  const body = h(
    'div',
    { class: 'trade-bar' },
    h(
      'div',
      { class: 'tb-rows' },
      row(a, 'You get', o.give, o.cashGive),
      row(b, 'You give', o.get, o.cashGet),
    ),
    h(
      'div',
      { class: `tb-btns ${canCounter ? 'three' : ''}` },
      h('button', { class: 'btn main', onclick: () => hud.resolvePrompt('yes') }, 'Accept'),
      canCounter
        ? h('button', { class: 'btn', onclick: () => hud.resolvePrompt('counter') }, 'Counter')
        : null,
      h('button', { class: 'btn ghost', onclick: () => hud.resolvePrompt('no') }, 'Decline'),
    ),
  );
  const labels = new Map<number, string>();
  for (const id of o.give) labels.set(id, 'You get');
  for (const id of o.get) labels.set(id, 'You give');
  board.overviewHold = true;
  board.setChoices([...o.give, ...o.get], PLAYER_COLORS[a.color], () => {}, undefined, {
    labels,
    pins: false,
  });
  const v = await hud.prompt<'yes' | 'no' | 'counter'>(body, [], b.color);
  board.clearChoices();
  board.overviewHold = false;
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
