/**
 * The venture deck as data: each card has a title, text and an effect function.
 * Cards marked `std` are stock cards and are left out of the Easy deck.
 */
import type { Game } from './engine';
import { randInt, rollDie } from './rng';
import { K } from './constants';
import {
  canAfford,
  clampFactor,
  isProperty,
  isShopLike,
  netWorth,
  ownedShops,
  ownedSquares,
  salary,
  stockPrice,
} from './rules';
import type { Player, RuleSet } from './types';

export interface Card {
  id: string;
  title: string;
  text: string;
  std?: boolean;
  run(game: Game, p: Player): Promise<void>;
}

const list: Card[] = [
  // Movement
  {
    id: 'rollAgain',
    title: 'Roll again',
    text: 'Roll the die and move again.',
    run: (g, p) => g.rollAgain(p),
  },
  {
    id: 'move2',
    title: 'Two more squares',
    text: 'Move 2 more squares.',
    run: (g, p) => g.move(p, 2),
  },
  {
    id: 'zoomBank',
    title: 'Zoom to the bank',
    text: 'Warp straight to the bank.',
    run: async (g, p) => {
      const bank = g.G.nodes.find((s) => s.t === 'bank')!;
      await g.warp(p, bank.id);
      await g.landAfterWarp(p);
    },
  },
  {
    id: 'zoomAny',
    title: 'Zoom anywhere',
    text: 'Warp to any square. Its landing effect applies.',
    run: async (g, p) => {
      const options = g.G.nodes.map((s) => s.id).filter((id) => id !== p.node);
      const to = await g.ask({ kind: 'pickSquare', pid: p.id, purpose: 'zoom', options, optional: false });
      await g.warp(p, to != null && options.includes(to) ? to : options[0]);
      await g.landAfterWarp(p);
    },
  },
  // Cash
  {
    id: 'bank50',
    title: 'Bank bonus',
    text: 'Roll the die: the bank pays you 50G times the roll.',
    run: async (g, p) => {
      const n = rollDie(g.G);
      await g.emit({ type: 'roll', pid: p.id, value: n });
      await g.pay(null, p, 50 * n, 'Venture');
      await g.log(`${p.name} rolled ${n} and the bank paid ${50 * n}G.`, p.id, 'money');
    },
  },
  {
    id: 'leader40',
    title: 'Tax the leader',
    text: 'Roll the die: the richest rival pays you 40G times the roll.',
    run: async (g, p) => {
      const n = rollDie(g.G);
      await g.emit({ type: 'roll', pid: p.id, value: n });
      const q = g.leader(p);
      if (q) {
        await g.pay(q, p, 40 * n, 'Venture');
        await g.log(`${p.name} rolled ${n} and took ${40 * n}G from ${q.name}.`, p.id, 'money', [q.id]);
      }
    },
  },
  {
    id: 'lose10',
    title: 'Pickpocket',
    text: 'Lose 10% of your cash.',
    run: async (g, p) => {
      const amt = Math.floor(Math.max(0, p.cash) * 0.1);
      await g.pay(p, null, amt, 'Venture');
      await g.log(`${p.name} lost ${amt}G.`, p.id, 'money');
    },
  },
  {
    id: 'giveAll30',
    title: 'Party time',
    text: 'Give every other player 30G.',
    run: async (g, p) => {
      const others = g.G.players.filter((q) => q !== p && !q.bankrupt);
      for (const q of others) await g.pay(p, q, 30, 'Venture');
      await g.log(
        `${p.name} gave everyone 30G.`,
        p.id,
        'money',
        others.map((q) => q.id),
      );
    },
  },
  {
    id: 'halfSalary',
    title: 'Bonus pay',
    text: 'Receive half a salary.',
    run: async (g, p) => {
      const amt = Math.floor(salary(g.G, p) / 2);
      await g.pay(null, p, amt, 'Venture');
      await g.log(`${p.name} received ${amt}G in bonus pay.`, p.id, 'money');
    },
  },
  {
    id: 'giveLast',
    title: 'Charity',
    text: 'Give 10% of your cash to the player in last place.',
    run: async (g, p) => {
      // Last place counts the drawer too: a player already last (or tied for it) keeps the cash.
      const q = g.last();
      if (!q || netWorth(g.G, q) >= netWorth(g.G, p)) {
        await g.log(`${p.name} is already in last place, so nothing happens.`, p.id, 'card');
        return;
      }
      const amt = Math.floor(Math.max(0, p.cash) * 0.1);
      await g.pay(p, q, amt, 'Venture');
      await g.log(`${p.name} gave ${amt}G to ${q.name}.`, p.id, 'money', [q.id]);
    },
  },
  {
    id: 'perProperty',
    title: 'Property dividend',
    text: 'Receive 30G for every property you own.',
    run: async (g, p) => {
      const amt = 30 * ownedSquares(g.G, p.id).length;
      await g.pay(null, p, amt, 'Venture');
      if (amt) await g.log(`${p.name} received ${amt}G for their properties.`, p.id, 'money');
    },
  },
  // Shop value
  {
    id: 'shops10',
    title: 'Renovation boom',
    text: 'All your shops rise 10% in value.',
    run: (g, p) => g.scaleShops(ownedShops(g.G, p.id), 1.1),
  },
  {
    id: 'shop40',
    title: 'Hot spot',
    text: 'One random shop of yours rises 40% in value.',
    run: async (g, p) => {
      const sq = g.randomOf(ownedShops(g.G, p.id));
      if (sq) await g.scaleShops([sq], 1.4);
    },
  },
  {
    id: 'district15',
    title: 'District festival',
    text: "A random district's shops rise 15% in value.",
    run: async (g) => {
      const d = randInt(g.G, g.G.districts.length);
      await g.log(`${g.G.districts[d].name} is booming!`, undefined, 'property');
      await g.scaleShops(
        g.G.nodes.filter((s) => s.d === d && isShopLike(s)),
        1.15,
      );
    },
  },
  // Fees
  {
    id: 'allClose',
    title: 'Holiday',
    text: "Everyone's shops close until their next turn. Then roll again.",
    run: async (g, p) => {
      for (const q of g.G.players) q.closed = true;
      await g.emit({ type: 'closed', pids: g.G.players.filter((q) => !q.bankrupt).map((q) => q.id) });
      await g.rollAgain(p);
    },
  },
  {
    id: 'oddEven',
    title: 'Odd or even',
    text: "Roll the die. Odd: your shops close. Even: everyone else's shops close.",
    run: async (g, p) => {
      const n = rollDie(g.G);
      await g.emit({ type: 'roll', pid: p.id, value: n });
      if (n % 2) p.closed = true;
      else for (const q of g.G.players) if (q !== p) q.closed = true;
      await g.log(n % 2 ? `${p.name}'s shops close.` : `Everyone else's shops close.`, p.id, 'effect');
      const shut = n % 2 ? [p] : g.G.players.filter((q) => q !== p && !q.bankrupt);
      await g.emit({ type: 'closed', pids: shut.map((q) => q.id) });
    },
  },
  {
    id: 'fees30',
    title: 'Price hike',
    text: 'Your fees rise 30% until your next turn.',
    run: async (_g, p) => {
      p.boost = 1.3;
    },
  },
  {
    id: 'commission50',
    title: 'Middleman',
    text: 'Earn 50% commission on every fee until your next turn.',
    run: async (_g, p) => {
      p.boon = Math.max(p.boon, 0.5);
    },
  },
  // Suits
  {
    id: 'freeHeart',
    title: 'Free heart',
    text: 'Collect the heart suit. If you have it already, take 100G.',
    run: async (g, p) => {
      if (p.suits[1]) await g.pay(null, p, 100, 'Venture');
      else {
        p.suits[1] = true;
        await g.emit({ type: 'suit', pid: p.id, suit: 1 });
      }
    },
  },
  {
    id: 'wild',
    title: 'Suit Yourself',
    text: 'Take a Suit Yourself card: it counts as any one missing suit.',
    run: async (g, p) => {
      p.wild++;
      await g.emit({ type: 'suit', pid: p.id, suit: -1 });
    },
  },
  {
    id: 'promo',
    title: 'Sudden promotion',
    text: 'You are promoted on the spot. Your suits are discarded.',
    run: (g, p) => g.promote(p, false),
  },
  // Property deals
  {
    id: 'investNow',
    title: 'Investment opportunity',
    text: 'Invest in any of your shops now.',
    run: (g, p) => g.investFlow(p, ownedShops(g.G, p.id)),
  },
  {
    id: 'forcedBuyout',
    title: 'Hostile takeover',
    text: "You may buy any rival's property for 5 times its value.",
    run: async (g, p) => {
      const options = g.G.nodes
        .filter(
          (s) => isProperty(s) && s.owner >= 0 && s.owner !== p.id && canAfford(g.G, p, s.value * K.buyoutX),
        )
        .map((s) => s.id);
      if (!options.length) {
        await g.log(`${p.name} cannot afford any rival property right now.`, p.id, 'card');
        return;
      }
      const id = await g.ask({
        kind: 'pickSquare',
        pid: p.id,
        purpose: 'forcedBuyout',
        options,
        optional: true,
      });
      if (id == null || !options.includes(id)) return;
      await g.buyout(p, g.G.nodes[id]);
    },
  },
  // Stocks (Standard only)
  {
    id: 'free20',
    title: 'Gift shares',
    text: 'Receive 20 free shares in a district of your choice.',
    std: true,
    run: async (g, p) => {
      const options = g.G.districts.map((_, d) => d);
      const d = await g.ask({ kind: 'pickDistrict', pid: p.id, purpose: 'free20', options });
      const dd = options.includes(d) ? d : 0;
      p.shares[dd] += 20;
      await g.log(`${p.name} received 20 ${g.G.districts[dd].name} shares.`, p.id, 'stock');
    },
  },
  {
    id: 'up20',
    title: 'Bull market',
    text: "Raise a district's stock price by 20%.",
    std: true,
    run: async (g, p) => {
      const options = g.G.districts.map((_, d) => d);
      const d = await g.ask({ kind: 'pickDistrict', pid: p.id, purpose: 'up20', options });
      const dd = options.includes(d) ? d : 0;
      g.G.factor[dd] *= 1.2;
      clampFactor(g.G, dd);
      await g.log(`${g.G.districts[dd].name} stock rose to ${stockPrice(g.G, dd)}G.`, p.id, 'stock');
    },
  },
  {
    id: 'down20',
    title: 'Bear market',
    text: "Cut a district's stock price by 20%.",
    std: true,
    run: async (g, p) => {
      const options = g.G.districts.map((_, d) => d);
      const d = await g.ask({ kind: 'pickDistrict', pid: p.id, purpose: 'down20', options });
      const dd = options.includes(d) ? d : 0;
      g.G.factor[dd] *= 0.8;
      clampFactor(g.G, dd);
      await g.log(`${g.G.districts[dd].name} stock fell to ${stockPrice(g.G, dd)}G.`, p.id, 'stock');
    },
  },
  {
    id: 'dividend10',
    title: 'Special dividend',
    text: 'Receive 10% of the value of your stock.',
    std: true,
    run: async (g, p) => {
      const v = p.shares.reduce((s, n, d) => s + n * stockPrice(g.G, d), 0);
      await g.pay(null, p, Math.floor(v * 0.1), 'Dividend');
    },
  },
  {
    id: 'tax2',
    title: 'Stock tax',
    text: 'Pay 2G for every share you hold.',
    std: true,
    run: (g, p) => g.pay(p, null, p.shares.reduce((s, n) => s + n, 0) * 2, 'Stock tax'),
  },
  {
    id: 'buy10off',
    title: 'Share sale',
    text: 'Buy stock at 10% off.',
    std: true,
    run: (g, p) => g.buyStockFlow(p, 0.1),
  },
  {
    id: 'sell20above',
    title: 'Hot buyer',
    text: 'Sell stock at 20% above the market price.',
    std: true,
    run: async (g, p) => {
      if (!p.shares.some((n) => n > 0)) return;
      const ans = await g.ask({ kind: 'sellStock', pid: p.id, premium: 0.2 });
      if (ans) await g.sellStock(p, ans.d, ans.n, 0.2);
    },
  },
];

export const CARDS: Record<string, Card> = Object.fromEntries(list.map((c) => [c.id, c]));
export const CARD_LIST = list;

export function buildDeck(rules: RuleSet): string[] {
  return list.filter((c) => rules === 'standard' || !c.std).map((c) => c.id);
}
