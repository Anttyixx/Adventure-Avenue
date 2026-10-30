/**
 * What a player is doing while the game waits on their choice, for the status line and the
 * waiting line in the game log ("Rosa is buying stocks...").
 */
import type { DecisionRequest, GameState } from '@aa/engine';
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
