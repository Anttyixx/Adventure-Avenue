/**
 * CPU players: simple greedy rules with a cash buffer. Good enough to fill seats.
 */
import { K } from './constants';
import type { DecisionAnswer, DecisionKind, DecisionRequest, TradeOffer } from './decisions';
import { pick, rand, randInt, weighted } from './rng';
import { canPromote, netWorth, ownedCount, shopFee, squareFee, stockPrice } from './rules';
import { SUITS, type BuildingKey, type GameState, type Player } from './types';

const C = K.cpu;

/** Breadth-first distance (ignoring direction) from `from` to every square. */
function distances(G: GameState, from: number): number[] {
  const dist = new Array(G.nodes.length).fill(Infinity);
  dist[from] = 0;
  const q = [from];
  while (q.length) {
    const n = q.shift()!;
    for (const m of G.nodes[n].nb) {
      if (dist[m] === Infinity) {
        dist[m] = dist[n] + 1;
        q.push(m);
      }
    }
  }
  return dist;
}

/** The squares the CPU is heading for: the bank if it can promote or win, else missing suits. */
export function goals(G: GameState, p: Player): number[] {
  const bank = G.nodes.filter((s) => s.t === 'bank').map((s) => s.id);
  if (canPromote(p) || netWorth(G, p) >= G.target) return bank;
  const out = G.nodes
    .filter((s) => {
      const si = (SUITS as string[]).indexOf(s.t);
      return (si >= 0 && !p.suits[si]) || s.t === 'change';
    })
    .map((s) => s.id);
  return out.length ? out : bank;
}

function goalDistance(G: GameState, p: Player, node: number): number {
  const d = distances(G, node);
  return Math.min(...goals(G, p).map((g) => d[g]));
}

/** District/group where the player owns the most squares (-1 if none). */
function bestGroup(G: GameState, p: Player): number {
  let best = -1;
  let n = 0;
  G.groups.forEach((_, g) => {
    const c = ownedCount(G, p.id, g);
    if (c > n) {
      n = c;
      best = g;
    }
  });
  return best;
}

function bestDistrict(G: GameState, p: Player): number {
  const counts = G.districts.map((_, d) => G.nodes.filter((s) => s.d === d && s.owner === p.id).length);
  const max = Math.max(...counts);
  if (max === 0) return randInt(G, G.districts.length);
  return counts.indexOf(max);
}

function tradeWorth(G: GameState, cpu: Player, ids: number[], giving: boolean): number {
  return ids.reduce((s, id) => {
    const sq = G.nodes[id];
    let k = ownedCount(G, cpu.id, sq.g);
    if (giving && sq.owner === cpu.id) k -= 1;
    return s + sq.value * (1 + C.tradeGroupBonus * Math.max(0, k));
  }, 0);
}

export function cpuAcceptsTrade(G: GameState, o: TradeOffer): boolean {
  const cpu = G.players[o.to];
  const receives = tradeWorth(G, cpu, o.give, false) + o.cashGive;
  const gives = tradeWorth(G, cpu, o.get, true) + o.cashGet;
  return receives >= C.tradeAccept * gives + C.tradeAcceptPlus && cpu.cash >= o.cashGet;
}

export function cpuDecide<T extends DecisionKind>(G: GameState, req: DecisionRequest<T>): DecisionAnswer<T> {
  return decide(G, req as DecisionRequest) as DecisionAnswer<T>;
}

function decide(G: GameState, req: DecisionRequest): unknown {
  const p = G.players[req.pid];
  switch (req.kind) {
    case 'preRoll':
      return { act: 'roll' };

    case 'path': {
      let best = req.dests[0].node;
      let bestScore = -Infinity;
      for (const r of req.dests) {
        const sq = G.nodes[r.node];
        let s = -goalDistance(G, p, r.node) * 10;
        const held = p.suits.slice();
        for (const id of r.path) {
          const si = (SUITS as string[]).indexOf(G.nodes[id].t);
          if (si >= 0 && !held[si]) {
            held[si] = true;
            s += 40;
          }
          if (G.nodes[id].t === 'bank' && held.filter(Boolean).length + p.wild >= 4) s += 200;
          const c = G.nodes[id];
          if (c.t === 'plot' && c.b === 'checkpoint' && c.owner >= 0 && c.owner !== p.id) s -= c.toll / 5;
        }
        if ((sq.t === 'shop' || sq.t === 'plot') && sq.owner < 0 && p.cash > (sq.value || K.plotCost))
          s += 15;
        if (sq.owner >= 0 && sq.owner !== p.id) s -= squareFee(G, sq, p) / 10;
        if (sq.t === 'venture') s += 5;
        s += rand(G);
        if (s > bestScore) {
          bestScore = s;
          best = r.node;
        }
      }
      return best;
    }

    case 'buyShop': {
      const sq = G.nodes[req.sq];
      return p.cash - req.price >= C.buyKeep || ownedCount(G, p.id, sq.g) > 0;
    }

    case 'build': {
      const can = (b: BuildingKey) => req.options.some((o) => o.b === b);
      if (can('star3') && p.cash - K.star3Cost >= C.star3Keep && rand(G) < C.star3Chance) return 'star3';
      if (p.cash - K.plotCost < C.buildKeep) return null;
      const w: Record<string, number> = {};
      for (const [b, n] of Object.entries(C.buildWeights)) if (can(b as BuildingKey)) w[b] = n;
      if (!Object.keys(w).length) return null;
      return weighted(G, w);
    }

    case 'invest': {
      if (p.cash <= C.investAbove || rand(G) >= C.investChance) return null;
      const opt = req.shops.slice().sort((a, b) => b.room - a.room)[0];
      const amount = Math.floor(Math.min(opt.room, req.max, C.investShare * (p.cash - C.investFloor)));
      return amount > 0 ? { sq: opt.sq, amount } : null;
    }

    case 'buyout': {
      const sq = G.nodes[req.sq];
      return ownedCount(G, p.id, sq.g) > 0 && p.cash - req.price >= C.buyoutKeep;
    }

    case 'circusUpgrade':
      return p.cash - req.cost >= C.circusKeep;

    case 'buyStock': {
      if (p.cash <= C.stockAbove) return null;
      const d = bestDistrict(G, p);
      const unit = stockPrice(G, d) * (1 - req.discount);
      const n = Math.min(K.maxBuy, Math.floor((C.stockShare * (p.cash - C.stockFloor)) / unit));
      return n >= C.stockMin ? { d, n } : null;
    }

    case 'sellStock': {
      let best = -1;
      let v = 0;
      p.shares.forEach((n, d) => {
        const val = n * stockPrice(G, d);
        if (val > v) {
          v = val;
          best = d;
        }
      });
      return best >= 0 ? { d: best, n: p.shares[best] } : null;
    }

    case 'venturePanel': {
      const free = req.owner.map((o, i) => (o < 0 ? i : -1)).filter((i) => i >= 0);
      return pick(G, free);
    }

    case 'reels':
      return [0, 1, 2].map(() => randInt(G, 8));

    case 'memory':
      return randInt(G, 9);

    case 'pickRacer':
      return randInt(G, req.count);

    case 'cannonTarget':
      return pick(G, req.options);

    case 'pickSquare': {
      if (req.purpose === 'balloon' || req.purpose === 'zoom') {
        const targets = goals(G, p).filter((id) => req.options.includes(id));
        if (!targets.length) return req.optional ? null : pick(G, req.options);
        const d = distances(G, p.node);
        return targets.sort((a, b) => d[a] - d[b])[0];
      }
      if (req.purpose === 'agency') {
        const g = bestGroup(G, p);
        const opts = req.options.filter(
          (id) => (g < 0 || G.nodes[id].g === g) && p.cash - G.nodes[id].value >= C.agencyKeep,
        );
        return opts.length ? opts[0] : null;
      }
      // forcedBuyout
      const opts = req.options
        .filter((id) => {
          const sq = G.nodes[id];
          return ownedCount(G, p.id, sq.g) > 0 && p.cash - sq.value * K.buyoutX >= C.buyoutKeep;
        })
        .sort((a, b) => shopFee(G, G.nodes[b]) - shopFee(G, G.nodes[a]));
      return opts.length ? opts[0] : null;
    }

    case 'pickDistrict': {
      if (req.purpose === 'up20') {
        const held = p.shares.map((n, d) => n * stockPrice(G, d));
        const max = Math.max(...held);
        return max > 0 ? held.indexOf(max) : bestDistrict(G, p);
      }
      if (req.purpose === 'down20') {
        const none = req.options.filter((d) => p.shares[d] === 0);
        return none.length ? pick(G, none) : pick(G, req.options);
      }
      return bestDistrict(G, p);
    }

    case 'answerTrade':
      return cpuAcceptsTrade(G, req.offer);

    case 'bid': {
      const sq = G.nodes[req.sq];
      const limit = sq.value * (ownedCount(G, p.id, sq.g) > 0 ? C.bidMaxGroup : C.bidMax);
      return req.bid <= limit && p.cash - req.bid >= C.bidKeep;
    }

    case 'debt': {
      const stock = req.assets.findIndex((a) => a.kind === 'stock');
      if (stock >= 0) return stock;
      let best = 0;
      req.assets.forEach((a, i) => {
        if (a.amount < req.assets[best].amount) best = i;
      });
      return best;
    }
  }
  return null;
}
