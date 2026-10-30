/**
 * What a player is doing while the game waits on their choice, for the status line and the
 * waiting line in the game log ("Rosa is buying stocks...").
 */
import type { DecisionRequest, GameEvent, GameState } from '@aa/engine';
import type { IconKind } from './log';

export interface Activity {
  text: string;
  /** Log icon shown beside it. */
  kind: IconKind;
}

export function activity(G: GameState, req: DecisionRequest, rolled?: number): Activity {
  const name = G.players[req.pid].name;
  const is = (what: string, kind: IconKind): Activity => ({ text: `${name} is ${what}...`, kind });
  switch (req.kind) {
    case 'preRoll':
      return is('deciding what to do', 'wait');
    case 'path':
      return rolled === req.steps
        ? { text: `${name} rolled a ${rolled} and is deciding where to move...`, kind: 'move' }
        : is(`deciding where to move ${req.steps} spaces`, 'move');
    case 'buyShop':
      return is('deciding whether to buy the shop', 'property');
    case 'build':
      return is(req.renovate ? 'choosing what to renovate into' : 'choosing what to build', 'property');
    case 'invest':
      return is('choosing a shop to invest in', 'money');
    case 'buyout':
      return is('deciding whether to buy out the shop', 'property');
    case 'circusUpgrade':
      return is('deciding whether to upgrade the circus', 'property');
    case 'buyStock':
      return is('buying stocks', 'stock');
    case 'sellStock':
      return is('selling stocks', 'stock');
    case 'venturePanel':
      return is('picking a venture card', 'card');
    case 'reels':
      return is('playing Lucky Reels', 'arcade');
    case 'memory':
      return is('playing Memory Blocks', 'arcade');
    case 'pickRacer':
      return is('picking a racer in Coin Derby', 'arcade');
    case 'pickSquare':
      switch (req.purpose) {
        case 'balloon':
          return is('choosing where to fly the balloon', 'move');
        case 'zoom':
          return is('choosing a square to zoom to', 'move');
        case 'agency':
          return is('choosing a shop to buy', 'property');
        case 'forcedBuyout':
          return is('choosing a shop to buy out', 'property');
      }
      return is('choosing a square', 'move');
    case 'cannonTarget':
      return is('aiming the cannon', 'move');
    case 'pickDistrict':
      return is(
        req.purpose === 'free20' ? 'choosing a district for free shares' : 'choosing a district',
        'stock',
      );
    case 'answerTrade':
      return is('considering a trade offer', 'property');
    case 'bid':
      return is('deciding whether to bid', 'money');
    case 'debt':
      return is('selling assets to pay a debt', 'alert');
  }
}

/** Steps a player on this device takes from their turn menu before rolling. */
export const PRE_ROLL_STEPS = {
  sell: { what: 'selling stocks', kind: 'stock' },
  trade: { what: 'setting up a trade', kind: 'property' },
  auction: { what: 'choosing a shop to auction', kind: 'property' },
  renovate: { what: 'choosing a shop to renovate', kind: 'property' },
} as const satisfies Record<string, { what: string; kind: IconKind }>;

/** Money events arrive after the engine commits the action, before its visual effects. */
export function paymentActivity(G: GameState, event: Extract<GameEvent, { type: 'money' }>): Activity | null {
  const payer = G.players[event.from]?.name;
  const receiver = G.players[event.to]?.name;
  const amount = `${event.amount.toLocaleString('en-US')}G`;
  const result = (text: string, kind: IconKind = 'property'): Activity => ({ text, kind });
  switch (event.reason) {
    case 'Purchase':
      return payer ? result(`${payer} bought a property for ${amount}.`) : null;
    case 'Construction':
      return payer ? result(`${payer} built a new building for ${amount}.`) : null;
    // A buyout has multiple payments. Do not mistake a single payment for its total price.
    case 'Buyout':
      return payer ? result(`${payer} bought out a rival property.`) : null;
    case 'Renovation':
      return payer ? result(`${payer} renovated a property for ${amount}.`) : null;
    case 'Investment':
      return payer ? result(`${payer} invested ${amount} in a shop.`) : null;
    case 'Circus upgrade':
      return payer ? result(`${payer} upgraded the circus for ${amount}.`) : null;
    case 'Stock':
      return payer ? result(`${payer} bought shares for ${amount}.`, 'stock') : null;
    case 'Stock sale':
      return receiver ? result(`${receiver} sold shares for ${amount}.`, 'stock') : null;
    case 'Fee':
      return payer && receiver ? result(`${payer} paid ${receiver} ${amount}.`, 'money') : null;
    default:
      return null;
  }
}
