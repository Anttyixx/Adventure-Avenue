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
import { squareName } from '../names';
import { digitPicker } from './digits';
import { clear, fmt, h } from './dom';
import type { Hud, PromptButton } from './hud';
import { buildModal } from './modals';

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

// ------------------------------------------------------------ auction, renovate, debt

export async function auctionOnBoard(ctx: PickCtx, p: Player): Promise<number | null> {
  const { G, hud, board } = ctx;
  const mine = ownedSquares(G, p.id).filter(isProperty);
  for (;;) {
    const id = await pickOnBoard(
      ctx,
      mine.map((s) => s.id),
      p.color,
      'Auction: tap the property you want to sell.',
    );
    if (id == null) return null;
    const sq = G.nodes[id as number];
    spotlight(board, sq.id, p.color);
    const go = await hud.prompt<'yes' | 'back' | 'no'>(
      titled(
        `Auction your ${squareName(G, sq)}?`,
        factTable([
          ['Value', fmt(sq.value)],
          ['Opening bid', fmt(sq.value)],
          ['Winning bid goes to', 'You'],
        ]),
      ),
      [
        { label: 'Auction it', value: 'yes', main: true },
        { label: 'Pick another', value: 'back' },
        { label: 'Cancel', value: 'no', secondary: true },
      ],
      p.color,
    );
    board.clearChoices();
    if (go === 'yes') return sq.id;
    if (go === 'no') return null;
  }
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
    const b = await buildModal(hud, options, `Renovate ${squareName(G, sq)}`, K.renovate);
    ctx.board.clearChoices();
    if (b) return { sq: sq.id, b };
  }
}

/** In debt: sell stock (buttons) or tap a property to sell it to the bank. */
export async function debtOnBoard(ctx: PickCtx, p: Player, assets: DebtAsset[]): Promise<number> {
  const { G, hud, board } = ctx;
  const squares = assets.map((a, i) => ({ a, i })).filter(({ a }) => a.kind === 'square');
  const stocks = assets.map((a, i) => ({ a, i })).filter(({ a }) => a.kind === 'stock');
  const labels = new Map(squares.map(({ a }) => [a.id, `+${fmt(a.amount)}`]));
  for (;;) {
    const v = await pickOnBoard<`s${number}`>(
      ctx,
      squares.map(({ a }) => a.id),
      p.color,
      titled(
        `${p.name} is ${fmt(-p.cash)} in debt`,
        `Sell stock, or tap a property to sell it to the bank for ${K.debtSale * 100}% of its value.`,
      ),
      stocks.map(({ a, i }) => ({
        label: `Sell all ${G.districts[a.id].name} shares +${fmt(a.amount)}`,
        value: `s${i}` as const,
      })),
      { labels, cancel: '' },
    );
    if (typeof v === 'string') return Number(v.slice(1));
    if (v == null) continue;
    const pick = squares.find(({ a }) => a.id === v)!;
    spotlight(board, pick.a.id, p.color);
    const ok = await hud.prompt(
      titled(
        `Sell your ${squareName(G, G.nodes[pick.a.id])}?`,
        factTable([
          ['The bank pays', `+${fmt(pick.a.amount)}`, 'good'],
          ['Cash after', fmt(p.cash + pick.a.amount)],
        ]),
      ),
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
  const after = p.cash - price;
  return hud.prompt(
    titled(
      `Buy out ${owner.name}'s ${squareName(G, sq)}?`,
      factTable([
        ['Property value', fmt(sq.value)],
        ['Buyout price (5x)', fmt(price), 'big'],
        [`${owner.name} receives (3x)`, fmt(sq.value * K.buyoutOwnerX)],
        ['Your cash now', fmt(p.cash)],
        ['Your cash after', fmt(after), after < 0 ? 'bad' : ''],
      ]),
      after < 0
        ? h(
            'p',
            { class: 'hint debt-note' },
            'You would need to sell stock or property at the end of your turn.',
          )
        : '',
    ),
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
 * Build a trade on the board. Your properties and your partner's light up; tap to add or
 * remove them. `fixed` locks the partner (used for counter-offers, prefilled with `start`).
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
  const mine = ownedSquares(G, p.id).filter(isProperty);
  const theirs = ownedSquares(G, q.id).filter(isProperty);

  const body = h('div', { class: 'rich-body trade-dock' });
  const relabel = () => {
    const labels = new Map<number, string>();
    for (const id of give) labels.set(id, 'Give');
    for (const id of get) labels.set(id, 'Get');
    board.choiceLabels = labels;
    board.highlight = [...give, ...get];
    // With nothing picked, every candidate is lit evenly.
    if (!board.highlight.length) board.highlight = [];
  };
  const chips = (ids: Set<number>) =>
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
      : h('div', { class: 'hint' }, 'Tap properties on the board');
  const draw = () => {
    clear(body);
    relabel();
    const valid = give.size + get.size > 0 || cashGive > 0 || cashGet > 0;
    const gPick = digitPicker({
      max: Math.max(0, p.cash),
      value: cashGive,
      unit: 10,
      suffix: 'G',
      onChange: (v) => (cashGive = v),
    });
    const tPick = digitPicker({
      max: Math.max(0, q.cash),
      value: cashGet,
      unit: 10,
      suffix: 'G',
      onChange: (v) => (cashGet = v),
    });
    body.append(
      h('div', { class: 'rich-title' }, `${fixed ? 'Counter-offer to' : 'Trade with'} ${q.name}`),
      h(
        'div',
        { class: 'trade-cols' },
        h(
          'div',
          null,
          h('h4', null, 'You give'),
          chips(give),
          h('div', { class: 'cash-pick' }, 'Plus cash', gPick.el),
        ),
        h(
          'div',
          null,
          h('h4', null, `${q.name} gives`),
          chips(get),
          h('div', { class: 'cash-pick' }, 'Plus cash', tPick.el),
        ),
      ),
      h(
        'div',
        { class: 'btn-row' },
        h(
          'button',
          { class: 'btn main', disabled: !valid, onclick: () => hud.resolvePrompt('send') },
          fixed ? 'Send counter-offer' : 'Propose',
        ),
        h('button', { class: 'btn ghost', onclick: () => hud.resolvePrompt('cancel') }, 'Cancel'),
      ),
    );
  };
  board.setChoices(
    [...mine, ...theirs].map((s) => s.id),
    PLAYER_COLORS[p.color],
    (id) => {
      const set = G.nodes[id].owner === p.id ? give : get;
      if (set.has(id)) set.delete(id);
      else set.add(id);
      draw();
    },
    undefined,
    { pins: false },
  );
  draw();
  // The board stays live (taps toggle properties) while the dock waits for Propose or Cancel.
  const keepPick = board.onPick;
  const v = await hud.prompt<'send' | 'cancel'>(body, [], p.color);
  board.onPick = keepPick;
  board.clearChoices();
  if (v !== 'send') return null;
  return { from: p.id, to: q.id, give: [...give], get: [...get], cashGive, cashGet };
}

/** Show an offer on the board and answer it: accept, decline, or send back different terms. */
export async function answerTradeOnBoard(
  ctx: PickCtx,
  o: TradeOffer,
  canCounter: boolean,
): Promise<boolean | { counter: TradeOffer }> {
  const { G, hud, board } = ctx;
  const a = G.players[o.from];
  const b = G.players[o.to];
  const labels = new Map<number, string>();
  for (const id of o.give) labels.set(id, 'You get');
  for (const id of o.get) labels.set(id, 'You give');
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
  board.setChoices([...o.give, ...o.get], PLAYER_COLORS[a.color], () => {}, undefined, {
    labels,
    pins: false,
  });
  const v = await hud.prompt<'yes' | 'no' | 'counter'>(
    h(
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
    ),
    [
      { label: 'Accept', value: 'yes', main: true },
      ...(canCounter ? [{ label: 'Counter-offer', value: 'counter' as const }] : []),
      { label: 'Decline', value: 'no', secondary: true },
    ],
    b.color,
  );
  board.clearChoices();
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
