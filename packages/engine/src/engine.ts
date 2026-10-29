/**
 * The turn flow. The Game runs one turn at a time and never touches the DOM or sockets:
 * whenever a player must choose, it raises a decision request through `io.decide` and
 * waits for the answer; every state change is announced through `io.emit`.
 */
import { K } from './constants';
import { playArcade } from './arcade';
import { CARDS } from './cards';
import type {
  DecisionAnswer,
  DecisionKind,
  DecisionRequest,
  DebtAsset,
  PreRollAction,
  Route,
  TradeOffer,
} from './decisions';
import type { GameEvent } from './events';
import { randInt, rollDie } from './rng';
import {
  buildingAvailable,
  bumpFactor,
  canAfford,
  canPromote,
  expand,
  isClosed,
  isProperty,
  investRoom,
  lineBonus,
  linesThrough,
  netWorth,
  ownedShops,
  ownedSquares,
  ranking,
  salary,
  shopFee,
  squareFee,
  stockPrice,
  suitCount,
  vacate,
} from './rules';
import { resetVentureGrid } from './setup';
import {
  SUITS,
  type BuildingKey,
  type GameState,
  type LogKind,
  type LogLine,
  type Player,
  type Square,
} from './types';

export interface GameIO {
  decide<T extends DecisionKind>(req: DecisionRequest<T>): Promise<DecisionAnswer<T>>;
  emit(e: GameEvent): void | Promise<void>;
}

export const BUILDINGS: { b: BuildingKey; name: string; cost: number }[] = [
  { b: 'checkpoint', name: 'Checkpoint', cost: K.plotCost },
  { b: 'circus', name: 'Circus', cost: K.plotCost },
  { b: 'balloon', name: 'Balloonport', cost: K.plotCost },
  { b: 'tax', name: 'Tax Office', cost: K.plotCost },
  { b: 'home', name: 'Home', cost: K.plotCost },
  { b: 'agency', name: 'Estate Agency', cost: K.plotCost },
  { b: 'star3', name: '3-Star Shop', cost: K.star3Cost },
];

export const buildingCost = (b: BuildingKey) => BUILDINGS.find((x) => x.b === b)!.cost;
export const buildingName = (b: BuildingKey) => BUILDINGS.find((x) => x.b === b)!.name;

const SUIT_TYPES = SUITS as string[];

/** One payment: from (null = the bank), to (null = the bank), amount. */
type Payment = [Player | null, Player | null, number];

export class Game {
  /** Roll-on / roll-again chain depth for the current turn. */
  chain = 0;

  constructor(
    public G: GameState,
    public io: GameIO,
  ) {}

  get current(): Player {
    return this.G.players[this.G.order[this.G.turn]];
  }

  // ---------------------------------------------------------------- plumbing

  ask<T extends DecisionKind>(req: DecisionRequest<T>): Promise<DecisionAnswer<T>> {
    return this.io.decide(req);
  }

  async emit(e: GameEvent) {
    await this.io.emit(e);
  }

  /** Add a log line to the current turn. `involves` lists other players the action affects. */
  async log(text: string, color?: number, kind?: LogKind, involves?: number[]) {
    const line: LogLine = { text, color, round: this.G.round, turn: this.G.turn, kind };
    const others = (involves ?? []).filter((id) => id >= 0 && id !== color);
    if (others.length) line.involves = [...new Set(others)];
    this.G.log.unshift(line);
    if (this.G.log.length > 300) this.G.log.length = 300;
    await this.emit({ type: 'log', ...line });
  }

  /** Move money. `from`/`to` null means the bank. */
  async pay(from: Player | null, to: Player | null, amount: number, reason: string) {
    await this.payAll([[from, to, amount]], reason);
  }

  /**
   * Several payments that make up one transaction: every balance changes first, then each payment
   * is announced, so no one sees a half-done transaction (e.g. net worth dipping then recovering).
   * Transactions also change the rest of the state (owner, shares, value) before paying.
   */
  async payAll(list: Payment[], reason: string) {
    await this.announcePayments(this.applyPayments(list), reason);
  }

  /** Move the cash for these payments (no events yet); returns the ones that moved anything. */
  applyPayments(list: Payment[]): Payment[] {
    const done: Payment[] = [];
    for (const [from, to, raw] of list) {
      const amount = Math.round(raw);
      if (amount <= 0) continue;
      if (from) from.cash -= amount;
      if (to) to.cash += amount;
      done.push([from, to, amount]);
    }
    return done;
  }

  async announcePayments(done: Payment[], reason: string) {
    for (const [from, to, amount] of done)
      await this.emit({ type: 'money', from: from ? from.id : -1, to: to ? to.id : -1, amount, reason });
  }

  // ---------------------------------------------------------------- turn loop

  async run() {
    while (!this.G.over) await this.playTurn();
  }

  async playTurn() {
    const G = this.G;
    if (G.over) return;
    const p = this.current;
    if (p.bankrupt) {
      await this.advance();
      return;
    }
    // Turn-start reset: "until your next turn" effects expire. Closed shops reopen just after
    // the turn starts, so it can be shown.
    p.boon = 0;
    p.boost = 1;
    await this.emit({ type: 'turnStart', pid: p.id, round: G.round });
    if (p.onBreak || p.closed) {
      await this.emit({ type: 'opened', pids: [p.id] });
      p.onBreak = false;
      p.closed = false;
    }

    if (!p.cpu) await this.preRoll(p);
    if (G.over) return;

    this.chain = 0;
    await this.rollAndMove(p);
    if (G.over) return;

    await this.settleDebt(p);
    if (G.over) return;
    await this.advance();
  }

  async advance() {
    const G = this.G;
    G.turn++;
    if (G.turn >= G.order.length) {
      G.turn = 0;
      G.round++;
      G.hist.push(G.players.map((q) => netWorth(G, q)));
      if (G.roundCap && G.round > G.roundCap) {
        await this.endGame(ranking(G)[0], 'Round limit reached');
        return;
      }
      await this.emit({ type: 'roundStart', round: G.round });
    }
  }

  async endGame(winner: Player, reason: string) {
    const G = this.G;
    if (G.over) return;
    G.over = true;
    G.winner = winner.id;
    G.endReason = reason;
    G.hist.push(G.players.map((q) => netWorth(G, q)));
    await this.log(`${winner.name} wins! ${reason}.`, winner.id, 'alert');
    await this.emit({ type: 'gameOver', winner: winner.id, reason });
  }

  // ---------------------------------------------------------------- before rolling

  async preRoll(p: Player) {
    const G = this.G;
    for (let guard = 0; guard < 200 && !G.over; guard++) {
      const canStock = G.rules === 'standard' && p.shares.some((n) => n > 0);
      const mine = ownedSquares(G, p.id);
      const act: PreRollAction = await this.ask({
        kind: 'preRoll',
        pid: p.id,
        canStock,
        canAuction: mine.length > 0 && G.players.some((q) => q.id !== p.id && !q.bankrupt),
        canRenovate: mine.some((s) => s.t === 'plot' && s.b),
        canTrade: G.players.some((q) => q.id !== p.id && !q.bankrupt),
      });
      if (!act || act.act === 'roll') return;
      if (act.act === 'sellStock') await this.sellStock(p, act.d, act.n, 0);
      else if (act.act === 'trade') await this.trade(act.offer);
      else if (act.act === 'auction') await this.voluntaryAuction(p, act.sq);
      else if (act.act === 'renovate') await this.renovate(p, act.sq, act.b);
    }
  }

  async renovate(p: Player, sqId: number, b: BuildingKey) {
    const sq = this.G.nodes[sqId];
    if (!sq || sq.t !== 'plot' || sq.owner !== p.id || !sq.b || sq.b === b) return;
    if (!buildingAvailable(this.G, b, sq.id)) return;
    const cost = buildingCost(b) + K.renovate;
    if (p.cash < cost) return;
    sq.b = b;
    sq.value = buildingCost(b);
    sq.lv = 0;
    sq.toll = K.toll0;
    await this.pay(p, null, cost, 'Renovation');
    await this.emit({ type: 'value', sqs: [sq.id] });
    await this.log(`${p.name} renovated into a ${buildingName(b)}.`, p.id, 'property');
    this.expandAndAnnounce(p.id, sq.g);
  }

  // ---------------------------------------------------------------- movement

  async rollAndMove(p: Player) {
    const n = rollDie(this.G);
    await this.emit({ type: 'roll', pid: p.id, value: n });
    await this.log(`${p.name} rolled a ${n}.`, p.id, 'move');
    await this.move(p, n);
  }

  /** Every square the player could stop on after exactly n steps, with the best route to each. */
  destinations(p: Player, n: number): Route[] {
    const G = this.G;
    const all = new Map<number, number[][]>();
    const walk = (node: number, prev: number, left: number, path: number[]) => {
      if (left === 0) {
        const list = all.get(node) ?? [];
        list.push(path);
        all.set(node, list);
        return;
      }
      let nbs = G.nodes[node].nb.filter((x) => x !== prev);
      if (!nbs.length) nbs = G.nodes[node].nb;
      for (const nx of nbs) walk(nx, node, left - 1, [...path, nx]);
    };
    walk(p.node, p.prev, n, []);
    const out: Route[] = [];
    for (const [node, paths] of all) {
      let best = paths[0];
      let bestScore = -Infinity;
      for (const path of paths) {
        const s = this.routeScore(p, path);
        if (s > bestScore) {
          bestScore = s;
          best = path;
        }
      }
      out.push({ node, path: best });
    }
    return out.sort((a, b) => a.node - b.node);
  }

  /** Prefer routes that collect new suits, pass the bank with a promotion ready, and avoid tolls. */
  routeScore(p: Player, path: number[]): number {
    const G = this.G;
    const held = p.suits.slice();
    let change = G.changeSuit;
    let score = 0;
    for (const id of path) {
      const sq = G.nodes[id];
      const si = SUIT_TYPES.indexOf(sq.t);
      if (si >= 0 && !held[si]) {
        held[si] = true;
        score += 100;
      } else if (sq.t === 'change') {
        if (!held[change]) {
          held[change] = true;
          score += 100;
        }
        change = (change + 1) % 4;
      } else if (sq.t === 'bank') {
        if (held.filter(Boolean).length + p.wild >= 4) score += 500;
      } else if (sq.t === 'plot' && sq.b === 'checkpoint' && sq.owner >= 0 && sq.owner !== p.id) {
        if (!isClosed(G.players[sq.owner])) score -= sq.toll;
      }
    }
    return score;
  }

  async move(p: Player, n: number) {
    const G = this.G;
    const dests = this.destinations(p, n);
    let choice = dests[0];
    if (dests.length > 1) {
      const node = await this.ask({ kind: 'path', pid: p.id, dests, steps: n });
      choice = dests.find((d) => d.node === node) ?? dests[0];
    }
    const path = choice.path;
    for (let i = 0; i < path.length; i++) {
      const next = path[i];
      const from = p.node;
      p.prev = p.node;
      p.node = next;
      await this.emit({ type: 'step', pid: p.id, from, to: next, left: path.length - 1 - i });
      if (i < path.length - 1) {
        await this.passSquare(p, G.nodes[next]);
        if (G.over) return;
      }
    }
    await this.land(p, G.nodes[p.node]);
  }

  async passSquare(p: Player, sq: Square) {
    if (SUIT_TYPES.includes(sq.t) || sq.t === 'change') await this.collectSuit(p, sq, true);
    else if (sq.t === 'bank') await this.bankVisit(p, false);
    else if (sq.t === 'plot' && sq.b === 'checkpoint' && sq.owner >= 0) {
      // A rival pays the toll; the owner pays nothing, but the toll still goes up.
      if (sq.owner !== p.id) await this.payToll(p, sq);
      else await this.raiseToll(p, sq);
    }
  }

  /** The owner passes their own checkpoint: no money changes hands, the toll rises. */
  async raiseToll(p: Player, sq: Square) {
    sq.toll += K.tollStep;
    await this.emit({ type: 'value', sqs: [sq.id] });
    await this.log(`${p.name} passed their checkpoint. Its toll is now ${sq.toll}G.`, p.id, 'property');
  }

  async warp(p: Player, to: number) {
    p.node = to;
    p.prev = -1;
    await this.emit({ type: 'warp', pid: p.id, to });
  }

  // ---------------------------------------------------------------- suits, bank, promotion

  /** Pick up a suit (`passing` = collected on the way past, without stopping). */
  async collectSuit(p: Player, sq: Square, passing = false) {
    let si = SUIT_TYPES.indexOf(sq.t);
    if (sq.t === 'change') {
      si = this.G.changeSuit;
      this.G.changeSuit = (this.G.changeSuit + 1) % 4;
    }
    if (si < 0 || p.suits[si]) return;
    p.suits[si] = true;
    await this.emit({ type: 'suit', pid: p.id, suit: si, passing });
    await this.log(`${p.name} collected the ${SUITS[si]}.`, p.id, 'suit');
  }

  /**
   * Reaching the bank (passing or landing). The win is checked first: a player who arrives with
   * the target net worth wins, but one who only reaches it through this visit's promotion has to
   * come back. Then the promotion. Stock can be bought when landing here, or when passing and
   * leveling up; otherwise passing does nothing.
   */
  async bankVisit(p: Player, landed: boolean) {
    const G = this.G;
    if (netWorth(G, p) >= G.target) {
      await this.endGame(p, `Reached the ${G.target}G target`);
      return;
    }
    let promoted = false;
    if (canPromote(p)) {
      await this.promote(p, true);
      promoted = true;
    }
    if (G.rules === 'standard' && (landed || promoted)) await this.buyStockFlow(p, 0);
    if (landed) p.prev = -1;
  }

  async promote(p: Player, useWilds: boolean) {
    if (useWilds) p.wild = Math.max(0, p.wild - (4 - suitCount(p)));
    const pay = salary(this.G, p);
    p.level++;
    p.suits = [false, false, false, false];
    p.stats.salary += pay;
    await this.pay(null, p, pay, 'Salary');
    await this.emit({ type: 'promote', pid: p.id, level: p.level, salary: pay });
    await this.log(`${p.name} was promoted to level ${p.level} and earned ${pay}G.`, p.id, 'suit');
  }

  // ---------------------------------------------------------------- landing

  async land(p: Player, sq: Square) {
    const G = this.G;
    await this.emit({ type: 'land', pid: p.id, sq: sq.id });
    switch (sq.t) {
      case 'shop':
        return this.landShop(p, sq);
      case 'plot':
        return this.landPlot(p, sq);
      case 'bank':
        return this.bankVisit(p, true);
      case 'venture':
        return this.venture(p);
      case 'spade':
      case 'heart':
      case 'diamond':
      case 'club':
        await this.collectSuit(p, sq);
        return this.venture(p);
      case 'change':
        return this.collectSuit(p, sq);
      case 'roll':
        return this.rollAgain(p);
      case 'break':
        p.onBreak = true;
        await this.log(`${p.name} takes a break: their shops close until their next turn.`, p.id, 'effect');
        await this.emit({ type: 'closed', pids: [p.id] });
        return;
      case 'boon':
      case 'boom': {
        const rate = sq.t === 'boon' ? K.boon : K.boom;
        p.boon = Math.max(p.boon, rate);
        await this.log(
          `${p.name} earns ${rate * 100}% commission on every fee until their next turn.`,
          p.id,
          'effect',
        );
        return;
      }
      case 'broker':
        if (G.rules === 'easy') return this.venture(p);
        return this.buyStockFlow(p, 0);
      case 'back': {
        const other = G.nodes.find((s) => s.t === 'back' && s.id !== sq.id);
        if (other) {
          await this.log(`${p.name} slipped down the backstreet.`, p.id, 'move');
          await this.warp(p, other.id);
        }
        return;
      }
      case 'cannon':
        return this.cannon(p);
      case 'warp': {
        const to = sq.link ?? -1;
        if (to >= 0 && to !== sq.id && G.nodes[to]) {
          await this.log(`${p.name} warped away.`, p.id, 'move');
          await this.warp(p, to);
        }
        return;
      }
      case 'arcade':
        return playArcade(this, p);
    }
  }

  async rollAgain(p: Player) {
    if (this.chain >= K.rollChainMax) {
      await this.log(`${p.name} has rolled enough this turn.`, p.id, 'move');
      return;
    }
    this.chain++;
    await this.log(`${p.name} rolls again!`, p.id, 'move');
    await this.rollAndMove(p);
  }

  async cannon(p: Player) {
    const G = this.G;
    const options = G.players.filter((q) => q.id !== p.id && !q.bankrupt).map((q) => q.id);
    if (!options.length) return;
    let target = await this.ask({ kind: 'cannonTarget', pid: p.id, options });
    if (!options.includes(target)) target = options[0];
    const q = G.players[target];
    await this.log(`${p.name} was fired from the cannon to ${q.name}.`, p.id, 'move', [q.id]);
    await this.warp(p, q.node);
    const dest = G.nodes[q.node];
    if (SUIT_TYPES.includes(dest.t) || dest.t === 'change') await this.collectSuit(p, dest);
    else if (dest.t === 'bank') await this.bankVisit(p, true);
  }

  async landShop(p: Player, sq: Square) {
    const G = this.G;
    if (sq.owner < 0) {
      if (!canAfford(G, p, sq.value)) return;
      const yes = await this.ask({ kind: 'buyShop', pid: p.id, sq: sq.id, price: sq.value });
      if (yes && canAfford(G, p, sq.value)) await this.buySquare(p, sq, sq.value, null, 'bought');
      return;
    }
    // Landing on your own shop lets you invest in any of your shops.
    if (sq.owner === p.id) return this.investFlow(p, ownedShops(G, p.id));
    return this.rivalShop(p, sq);
  }

  async rivalShop(p: Player, sq: Square) {
    const G = this.G;
    const owner = G.players[sq.owner];
    if (isClosed(owner)) {
      await this.log(`${owner.name}'s shop is closed. No fee!`, p.id, 'effect', [owner.id]);
      return;
    }
    await this.chargeFee(p, sq, shopFee(G, sq));
    if (G.over) return;
    await this.offerBuyout(p, sq);
  }

  /** After paying a rival's property, offer to buy it out for 5x its value. */
  async offerBuyout(p: Player, sq: Square) {
    const G = this.G;
    if (G.over || sq.owner < 0 || sq.owner === p.id || p.bankrupt) return;
    const price = sq.value * K.buyoutX;
    if (price <= 0 || !canAfford(G, p, price)) return;
    const yes = await this.ask({ kind: 'buyout', pid: p.id, sq: sq.id, price });
    if (yes && canAfford(G, p, price)) await this.buyout(p, sq);
  }

  async buyout(p: Player, sq: Square) {
    const owner = this.G.players[sq.owner];
    const price = sq.value * K.buyoutX;
    sq.owner = p.id;
    await this.payAll(
      [
        [p, owner, sq.value * K.buyoutOwnerX],
        [p, null, price - sq.value * K.buyoutOwnerX],
      ],
      'Buyout',
    );
    const what = sq.t === 'plot' && sq.b && sq.b !== 'star3' ? buildingName(sq.b) : 'shop';
    await this.log(`${p.name} bought out ${owner.name}'s ${what} for ${price}G.`, p.id, 'property', [
      owner.id,
    ]);
    await this.transfer(sq, p.id);
  }

  /** Buy an unowned square: pay `price` to `seller` (null = bank) and run expansion. */
  async buySquare(p: Player, sq: Square, price: number, seller: Player | null, verb: string) {
    sq.owner = p.id;
    await this.pay(p, seller, price, 'Purchase');
    await this.log(`${p.name} ${verb} a shop for ${price}G.`, p.id, 'property');
    await this.transfer(sq, p.id);
  }

  async transfer(sq: Square, to: number) {
    sq.owner = to;
    await this.emit({ type: 'owner', sq: sq.id, owner: to });
    await this.expandAndAnnounce(to, sq.g);
  }

  async expandAndAnnounce(pid: number, g: number) {
    const changed = expand(this.G, pid, g);
    if (changed.length) await this.emit({ type: 'value', sqs: changed });
  }

  async investFlow(p: Player, shops: Square[]) {
    const options = shops.map((s) => ({ sq: s.id, room: investRoom(this.G, s) })).filter((o) => o.room > 0);
    // Players may invest more than their cash when stock or property could cover it: they sell
    // to pay back the bank at the end of the turn, like any other debt.
    const sellable = this.debtAssets(p).reduce((sum, a) => sum + a.amount, 0);
    const max = Math.floor(Math.min(K.investCap, p.cash + sellable));
    if (!options.length || max <= 0) return;
    const ans = await this.ask({ kind: 'invest', pid: p.id, shops: options, max });
    if (!ans) return;
    const opt = options.find((o) => o.sq === ans.sq);
    if (!opt) return;
    const amount = Math.floor(Math.min(ans.amount, opt.room, max));
    if (amount <= 0) return;
    const sq = this.G.nodes[opt.sq];
    sq.value += amount;
    await this.pay(p, null, amount, 'Investment');
    await this.emit({ type: 'value', sqs: [sq.id] });
    await this.log(`${p.name} invested ${amount}G.`, p.id, 'property');
  }

  /** A rival pays a fee on `sq`; dividends and commissions are paid on the fee actually paid. */
  async chargeFee(payer: Player, sq: Square, fee: number) {
    const G = this.G;
    if (fee <= 0 || sq.owner < 0) return;
    const owner = G.players[sq.owner];
    await this.pay(payer, owner, fee, 'Fee');
    payer.stats.feesPaid += fee;
    owner.stats.feesEarned += fee;
    await this.log(`${payer.name} paid ${owner.name} ${fee}G.`, payer.id, 'money', [owner.id]);
    if (G.rules === 'standard' && sq.d >= 0) {
      for (const q of G.players) {
        if (q.id === payer.id || q.bankrupt || q.shares[sq.d] <= 0) continue;
        const div = Math.floor((fee * q.shares[sq.d]) / K.divDivisor);
        if (div > 0) {
          q.stats.dividends += div;
          await this.pay(null, q, div, 'Dividend');
          await this.log(`${q.name} earned ${div}G in dividends.`, q.id, 'stock');
        }
      }
    }
    for (const q of G.players) {
      if (q.id === payer.id || q.bankrupt || q.boon <= 0) continue;
      const com = Math.floor(fee * q.boon);
      if (com > 0) {
        q.stats.commission += com;
        await this.pay(null, q, com, 'Commission');
        await this.log(`${q.name} earned ${com}G in commission.`, q.id, 'money');
      }
    }
  }

  async payToll(p: Player, sq: Square) {
    const owner = this.G.players[sq.owner];
    if (isClosed(owner)) return;
    const fee = squareFee(this.G, sq);
    await this.chargeFee(p, sq, fee);
    sq.toll += K.tollStep;
    await this.emit({ type: 'value', sqs: [sq.id] });
  }

  // ---------------------------------------------------------------- vacant plots

  async landPlot(p: Player, sq: Square) {
    const G = this.G;
    if (sq.owner < 0) {
      const options = BUILDINGS.filter((b) => canAfford(G, p, b.cost) && buildingAvailable(G, b.b)).map(
        ({ b, cost }) => ({ b, cost }),
      );
      if (!options.length) return;
      const b = await this.ask({ kind: 'build', pid: p.id, sq: sq.id, options });
      const cost = b ? buildingCost(b) : 0;
      if (!b || !canAfford(G, p, cost)) return;
      sq.b = b;
      sq.value = cost;
      sq.lv = 0;
      sq.toll = K.toll0;
      sq.owner = p.id;
      await this.pay(p, null, cost, 'Construction');
      await this.log(`${p.name} built a ${buildingName(b)}.`, p.id, 'property');
      await this.transfer(sq, p.id);
      return;
    }
    if (sq.owner === p.id) return this.ownPlot(p, sq);
    const owner = G.players[sq.owner];
    if (isClosed(owner)) {
      await this.log(`${owner.name}'s ${buildingName(sq.b!)} is closed.`, p.id, 'effect', [owner.id]);
      return;
    }
    switch (sq.b) {
      case 'checkpoint':
        await this.payToll(p, sq);
        break;
      case 'agency':
        p.onBreak = true;
        await this.log(
          `${p.name} was talked into a break at ${owner.name}'s Estate Agency. Their shops close.`,
          p.id,
          'effect',
          [owner.id],
        );
        await this.emit({ type: 'closed', pids: [p.id] });
        break;
      case 'star3':
        return this.rivalShop(p, sq);
      default:
        await this.chargeFee(p, sq, squareFee(G, sq, p));
    }
    await this.offerBuyout(p, sq);
  }

  async ownPlot(p: Player, sq: Square) {
    const G = this.G;
    switch (sq.b) {
      case 'checkpoint':
      case 'star3':
        return this.investFlow(p, ownedShops(G, p.id));
      case 'circus': {
        if (sq.lv >= 3) return;
        const cost = K.circusUp[sq.lv];
        if (p.cash < cost) return;
        const yes = await this.ask({ kind: 'circusUpgrade', pid: p.id, sq: sq.id, cost, tier: sq.lv + 1 });
        if (!yes || p.cash < cost) return;
        sq.lv++;
        sq.value += cost;
        await this.pay(p, null, cost, 'Circus upgrade');
        await this.emit({ type: 'value', sqs: [sq.id] });
        await this.log(
          `${p.name} upgraded the circus. Show fee is now ${K.circus[sq.lv]}G.`,
          p.id,
          'property',
        );
        return;
      }
      case 'balloon': {
        const options = G.nodes
          .filter((s) => !(s.t === 'plot' && s.b === 'balloon' && s.owner === p.id))
          .map((s) => s.id);
        const to = await this.ask({
          kind: 'pickSquare',
          pid: p.id,
          purpose: 'balloon',
          options,
          optional: true,
        });
        if (to == null || !options.includes(to)) return;
        await this.log(`${p.name} took the balloon.`, p.id, 'move');
        await this.warp(p, to);
        return this.landAfterWarp(p);
      }
      case 'tax': {
        const amt = Math.floor(Math.max(0, netWorth(G, p)) * K.taxOwner);
        await this.log(`The Tax Office pays ${p.name} a ${amt}G rebate.`, p.id, 'money');
        return this.pay(null, p, amt, 'Tax rebate');
      }
      case 'home': {
        const others = G.players.filter((q) => q.id !== p.id && !q.bankrupt);
        await this.log(
          `${p.name} called everyone home!`,
          p.id,
          'move',
          others.map((q) => q.id),
        );
        for (const q of others) await this.warp(q, sq.id);
        return;
      }
      case 'agency': {
        const options = G.nodes
          .filter((s) => s.t === 'shop' && s.owner < 0 && canAfford(G, p, s.value))
          .map((s) => s.id);
        if (!options.length) return;
        const id = await this.ask({
          kind: 'pickSquare',
          pid: p.id,
          purpose: 'agency',
          options,
          optional: true,
        });
        if (id == null || !options.includes(id)) return;
        const target = G.nodes[id];
        if (canAfford(G, p, target.value)) await this.buySquare(p, target, target.value, null, 'bought');
        return;
      }
    }
  }

  /** Landing after a warp that applies the destination's landing effect (balloon, zoom). */
  async landAfterWarp(p: Player) {
    const sq = this.G.nodes[p.node];
    await this.land(p, sq);
  }

  // ---------------------------------------------------------------- venture

  async venture(p: Player) {
    const G = this.G;
    if (G.vg.owner.every((o) => o >= 0)) resetVentureGrid(G);
    let panel = await this.ask({ kind: 'venturePanel', pid: p.id, owner: G.vg.owner.slice() });
    if (!(panel >= 0 && panel < 64) || G.vg.owner[panel] >= 0) panel = G.vg.owner.findIndex((o) => o < 0);
    G.vg.owner[panel] = p.id;
    const card = CARDS[G.vg.cards[panel]];
    // Every line of 4+ panels through the new one pays 10G per panel (a full line of 8 pays 200G).
    const lines = linesThrough(G.vg.owner, panel, p.id);
    const bonus = lines.reduce((s, l) => s + lineBonus(l.length), 0);
    await this.emit({
      type: 'venture',
      pid: p.id,
      panel,
      card: card.id,
      title: card.title,
      text: card.text,
      line: Math.max(1, ...lines.map((l) => l.length)),
      lines,
      bonus,
    });
    await this.log(`Venture card: ${card.title}. ${card.text}`, p.id, 'card');
    if (bonus) {
      const desc = lines.map((l) => l.length).join(' and ');
      await this.log(
        `${p.name} made ${lines.length > 1 ? 'lines' : 'a line'} of ${desc} panels and earned ${bonus}G.`,
        p.id,
        'card',
      );
      await this.pay(null, p, bonus, 'Line bonus');
    }
    await card.run(this, p);
  }

  // ---------------------------------------------------------------- stocks

  async buyStockFlow(p: Player, discount: number) {
    const G = this.G;
    if (G.rules !== 'standard' || p.cash <= 0) return;
    const ans = await this.ask({ kind: 'buyStock', pid: p.id, discount, maxSpend: p.cash });
    if (!ans) return;
    const d = ans.d;
    if (!(d >= 0 && d < G.factor.length)) return;
    const unit = stockPrice(G, d) * (1 - discount);
    const n = Math.min(Math.floor(ans.n), K.maxBuy, Math.floor(p.cash / unit));
    if (n <= 0) return;
    const cost = Math.ceil(n * unit);
    p.shares[d] += n;
    bumpFactor(G, d, true, n);
    await this.pay(p, null, cost, 'Stock');
    await this.log(`${p.name} bought ${n} ${G.districts[d].name} shares for ${cost}G.`, p.id, 'stock');
  }

  async sellStock(p: Player, d: number, n: number, premium: number) {
    const G = this.G;
    if (G.rules !== 'standard' || !(d >= 0 && d < p.shares.length)) return;
    n = Math.min(Math.floor(n), p.shares[d]);
    if (n <= 0) return;
    const amount = Math.floor(n * stockPrice(G, d) * (1 + premium));
    p.shares[d] -= n;
    bumpFactor(G, d, false, n);
    await this.pay(null, p, amount, 'Stock sale');
    await this.log(`${p.name} sold ${n} ${G.districts[d].name} shares for ${amount}G.`, p.id, 'stock');
  }

  // ---------------------------------------------------------------- trades and auctions

  validTrade(o: TradeOffer): boolean {
    const G = this.G;
    const a = G.players[o.from];
    const b = G.players[o.to];
    if (!a || !b || a === b || a.bankrupt || b.bankrupt) return false;
    if (!Array.isArray(o.give) || !Array.isArray(o.get)) return false;
    if (
      o.cashGive < 0 ||
      o.cashGet < 0 ||
      o.cashGive > Math.max(0, a.cash) ||
      o.cashGet > Math.max(0, b.cash)
    )
      return false;
    if (!o.give.length && !o.get.length && !o.cashGive && !o.cashGet) return false;
    if (new Set(o.give).size !== o.give.length || new Set(o.get).size !== o.get.length) return false;
    return (
      o.give.every((id) => G.nodes[id]?.owner === a.id) && o.get.every((id) => G.nodes[id]?.owner === b.id)
    );
  }

  async trade(offer: TradeOffer) {
    const G = this.G;
    offer = {
      ...offer,
      cashGive: Math.floor(offer.cashGive || 0),
      cashGet: Math.floor(offer.cashGet || 0),
    };
    if (!this.validTrade(offer)) return;
    // The other side may accept, decline, or send back different terms; up to K.tradeCounters
    // counter-offers go back and forth.
    let accepted = false;
    for (let round = 0; ; round++) {
      const ans = await this.ask({
        kind: 'answerTrade',
        pid: offer.to,
        offer,
        canCounter: round < K.tradeCounters,
      });
      if (ans === true) {
        accepted = this.validTrade(offer);
        break;
      }
      const counter = ans && typeof ans === 'object' ? ans.counter : null;
      if (!counter || round >= K.tradeCounters) break;
      const next: TradeOffer = {
        from: offer.to,
        to: offer.from,
        give: (counter.give ?? []).slice(),
        get: (counter.get ?? []).slice(),
        cashGive: Math.floor(counter.cashGive || 0),
        cashGet: Math.floor(counter.cashGet || 0),
      };
      if (!this.validTrade(next)) break;
      await this.log(
        `${G.players[next.from].name} sent back different terms to ${G.players[next.to].name}.`,
        next.from,
        'property',
        [next.to],
      );
      offer = next;
    }
    const a = G.players[offer.from];
    const b = G.players[offer.to];
    if (accepted) {
      // Both sides' properties and cash change together, then each part is announced.
      const groups = new Set<number>();
      for (const id of offer.give) G.nodes[id].owner = b.id;
      for (const id of offer.get) G.nodes[id].owner = a.id;
      const cash = this.applyPayments([
        [a, b, offer.cashGive],
        [b, a, offer.cashGet],
      ]);
      for (const id of [...offer.give, ...offer.get]) {
        groups.add(G.nodes[id].g);
        await this.emit({ type: 'owner', sq: id, owner: G.nodes[id].owner });
      }
      await this.announcePayments(cash, 'Trade');
      for (const g of groups) {
        await this.expandAndAnnounce(a.id, g);
        await this.expandAndAnnounce(b.id, g);
      }
      await this.log(`${a.name} and ${b.name} made a trade.`, a.id, 'property', [b.id]);
    } else {
      await this.log(`${b.name} declined ${a.name}'s trade.`, a.id, 'property', [b.id]);
    }
    await this.emit({ type: 'trade', offer, accepted: !!accepted });
  }

  async voluntaryAuction(p: Player, sqId: number) {
    const sq = this.G.nodes[sqId];
    if (!sq || sq.owner !== p.id || !isProperty(sq)) return;
    await this.log(`${p.name} put a property up for auction.`, p.id, 'property');
    await this.auction(sq, p, sq.value);
  }

  /**
   * Run an auction. `seller` null means the bank (debt sale). Bidders are asked in turn order;
   * each raises by the step or passes and drops out.
   */
  async auction(sq: Square, seller: Player | null, opening: number) {
    const G = this.G;
    opening = Math.max(1, Math.round(opening));
    const step = Math.max(K.auctionStepMin, Math.round(sq.value * K.auctionStep));
    const start = G.turn;
    const bidders: number[] = [];
    // Asked in turn order, starting after the active player (who is asked last).
    for (let i = 1; i <= G.order.length; i++) {
      const q = G.players[G.order[(start + i) % G.order.length]];
      if (!q.bankrupt && (!seller || q.id !== seller.id)) bidders.push(q.id);
    }
    const inRace = new Set(bidders);
    let high = 0;
    let highBidder = -1;
    await this.emit({
      type: 'auctionStart',
      sq: sq.id,
      seller: seller ? seller.id : -1,
      opening,
      step,
      bidders,
    });
    while (inRace.size > 0) {
      if (highBidder >= 0 && inRace.size === 1) break;
      for (const pid of bidders) {
        if (!inRace.has(pid) || pid === highBidder) continue;
        if (highBidder >= 0 && inRace.size === 1) break;
        const next = highBidder < 0 ? opening : high + step;
        const q = G.players[pid];
        if (q.cash < next) {
          inRace.delete(pid);
          await this.emit({ type: 'auctionBid', sq: sq.id, pid, bid: next, raised: false });
          continue;
        }
        const yes = await this.ask({
          kind: 'bid',
          pid,
          sq: sq.id,
          bid: next,
          high,
          highBidder,
          seller: seller ? seller.id : -1,
        });
        if (yes && q.cash >= next) {
          high = next;
          highBidder = pid;
        } else inRace.delete(pid);
        await this.emit({
          type: 'auctionBid',
          sq: sq.id,
          pid,
          bid: next,
          raised: highBidder === pid && high === next,
        });
      }
    }
    if (highBidder < 0) {
      await this.log('Nobody bid. No sale.', seller?.id, 'property');
      await this.emit({ type: 'auctionEnd', sq: sq.id, winner: -1, price: 0 });
      return;
    }
    const w = G.players[highBidder];
    sq.owner = w.id;
    await this.pay(w, seller, high, 'Auction');
    await this.log(`${w.name} won the auction for ${high}G.`, w.id, 'property', seller ? [seller.id] : []);
    await this.transfer(sq, w.id);
    await this.emit({ type: 'auctionEnd', sq: sq.id, winner: w.id, price: high });
  }

  // ---------------------------------------------------------------- debt and bankruptcy

  debtAssets(p: Player): DebtAsset[] {
    const G = this.G;
    const out: DebtAsset[] = [];
    if (G.rules === 'standard') {
      p.shares.forEach((n, d) => {
        if (n > 0) out.push({ kind: 'stock', id: d, amount: n * stockPrice(G, d) });
      });
    }
    for (const sq of ownedSquares(G, p.id)) {
      out.push({ kind: 'square', id: sq.id, amount: Math.floor(sq.value * K.debtSale) });
    }
    return out;
  }

  async settleDebt(p: Player) {
    const G = this.G;
    while (p.cash < 0 && !G.over) {
      const assets = this.debtAssets(p);
      if (!assets.length) {
        await this.bankrupt(p);
        return;
      }
      const ans = await this.ask({ kind: 'debt', pid: p.id, assets });
      // Selling some shares of one district (as many as the player likes).
      if (ans && typeof ans === 'object') {
        const d = Math.floor(ans.d);
        const n = Math.min(p.shares[d] ?? 0, Math.max(1, Math.floor(ans.n)));
        if (G.rules === 'standard' && n > 0) {
          await this.sellStock(p, d, n, 0);
          continue;
        }
      }
      let i = typeof ans === 'number' ? ans : 0;
      if (!(i >= 0 && i < assets.length)) i = 0;
      const a = assets[i];
      if (a.kind === 'stock') {
        await this.sellStock(p, a.id, p.shares[a.id], 0);
      } else {
        const sq = G.nodes[a.id];
        await this.pay(null, p, a.amount, 'Sold to bank');
        await this.log(`${p.name} sold a property to the bank for ${a.amount}G.`, p.id, 'property');
        if (sq.t === 'plot') {
          vacate(sq);
          await this.emit({ type: 'owner', sq: sq.id, owner: -1 });
        } else {
          sq.owner = -1;
          await this.emit({ type: 'owner', sq: sq.id, owner: -1 });
          await this.auction(sq, null, a.amount);
        }
      }
    }
  }

  async bankrupt(p: Player) {
    const G = this.G;
    p.bankrupt = true;
    for (const sq of ownedSquares(G, p.id)) {
      if (sq.t === 'plot') vacate(sq);
      else sq.owner = -1;
      await this.emit({ type: 'owner', sq: sq.id, owner: -1 });
    }
    p.shares = p.shares.map(() => 0);
    await this.log(`${p.name} went bankrupt!`, p.id, 'alert');
    await this.emit({ type: 'bankrupt', pid: p.id });
    const best = ranking(G)[0];
    if (best) await this.endGame(best, `${p.name} went bankrupt`);
  }

  // ---------------------------------------------------------------- helpers for cards and arcade

  leader(exclude?: Player): Player | undefined {
    return ranking(this.G).filter((q) => q !== exclude)[0];
  }

  last(exclude?: Player): Player | undefined {
    const r = ranking(this.G).filter((q) => q !== exclude);
    return r[r.length - 1];
  }

  async scaleShops(sqs: Square[], factor: number) {
    for (const sq of sqs) sq.value = Math.max(1, Math.round(sq.value * factor));
    if (sqs.length) await this.emit({ type: 'value', sqs: sqs.map((s) => s.id) });
  }

  randomOf<T>(arr: T[]): T | undefined {
    return arr.length ? arr[randInt(this.G, arr.length)] : undefined;
  }
}
