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
    case 'ventureRead':
      return is('reading their venture card', 'card');
    case 'reels':
      return is('playing Lucky Reels', 'arcade');
    case 'memory':
      return is('playing Memory Blocks', 'arcade');
    case 'arcadeChoice':
      return is(`choosing in ${req.game}`, 'arcade');
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
        case 'taxi':
          return is('choosing where to take the taxi', 'move');
      }
      return is('choosing a square', 'move');
    case 'cannonTarget':
      return is('aiming the cannon', 'move');
    case 'swapTarget':
      return is('choosing who to swap places with', 'move');
    case 'motelStop':
      return is('deciding whether to stop at the motel', 'move');
    case 'pickDistrict':
      return is(
        req.purpose === 'free20' ? 'choosing a district for free shares' : 'choosing a district',
        'stock',
      );
    case 'answerTrade':
      return is(`deciding on ${G.players[req.offer.from].name}'s trade offer`, 'property');
    case 'auction':
      return { text: 'The auction is on...', kind: 'money' };
    case 'debt':
      return is('selling assets to pay a debt', 'alert');
  }
}

/**
 * What a player goes on to do once they have made a choice, so the waiting line moves on with
 * them ("Rosa is moving..." after she picks where to go). Null when the choice leads to nothing
 * that takes a while (the log then says they are taking their turn).
 */
export function doing(G: GameState, req: DecisionRequest, answer: unknown): Activity | null {
  const name = G.players[req.pid]?.name ?? 'Someone';
  const is = (what: string, kind: IconKind): Activity => ({ text: `${name} is ${what}...`, kind });
  const a = answer as Record<string, unknown> | null | undefined;
  switch (req.kind) {
    case 'preRoll':
      switch ((a as { act?: string } | null)?.act) {
        case 'roll':
          return is('rolling the die', 'move');
        case 'sellStock':
          return is('selling stocks', 'stock');
        case 'trade':
          return is('waiting on a trade', 'property');
        case 'auction':
          return is('auctioning a shop', 'money');
        case 'renovate':
          return is('renovating', 'property');
      }
      return null;
    case 'path':
      return is('moving', 'move');
    case 'buyShop':
      return answer ? is('buying the shop', 'property') : null;
    case 'build':
      return answer ? is(req.renovate ? 'renovating' : 'building', 'property') : null;
    case 'invest':
      return answer ? is('investing', 'money') : null;
    case 'buyout':
      return answer ? is('buying out the shop', 'property') : null;
    case 'circusUpgrade':
      return answer ? is('upgrading the circus', 'property') : null;
    case 'buyStock':
      return answer ? is('buying stocks', 'stock') : null;
    case 'sellStock':
      return answer ? is('selling stocks', 'stock') : null;
    case 'venturePanel':
      return is('flipping a venture card', 'card');
    case 'pickSquare':
      if (answer == null) return null;
      switch (req.purpose) {
        case 'balloon':
          return is('flying the balloon', 'move');
        case 'zoom':
          return is('zooming across the board', 'move');
        case 'taxi':
          return is('riding the taxi', 'move');
        case 'agency':
          return is('buying a shop', 'property');
        case 'forcedBuyout':
          return is('buying out a shop', 'property');
      }
      return null;
    case 'cannonTarget':
      return is('flying from the cannon', 'move');
    case 'swapTarget':
      return is('swapping places', 'move');
    case 'motelStop':
      return answer ? is('checking in at the motel', 'move') : is('moving', 'move');
    case 'answerTrade':
      return null;
  }
  return null;
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
    case 'Gain tile':
      return receiver ? result(`${receiver} gained ${amount}.`, 'money') : null;
    case 'Loss tile':
      return payer ? result(`${payer} lost ${amount}.`, 'money') : null;
    case 'Jackpot contribution':
      return payer ? result(`${payer} added ${amount} to the jackpot.`, 'money') : null;
    case 'Jackpot payout':
      return receiver ? result(`${receiver} collected the ${amount} jackpot!`, 'money') : null;
    case 'Fee':
      return payer && receiver ? result(`${payer} paid ${receiver} ${amount}.`, 'money') : null;
    default:
      return null;
  }
}

/** A transaction's detailed log remains in history, but its early result already filled the bar. */
export function paymentLogMatches(
  G: GameState,
  payment: Extract<GameEvent, { type: 'money' }>,
  text: string,
) {
  const actor =
    G.players[
      ['Stock sale', 'Jackpot payout', 'Gain tile'].includes(payment.reason) ? payment.to : payment.from
    ]?.name;
  if (!actor || !text.startsWith(`${actor} `)) return false;
  const patterns: Record<string, RegExp> = {
    Purchase: / bought a shop for /,
    Construction: / built a /,
    Buyout: / bought out /,
    Renovation: / renovated into /,
    Investment: / invested /,
    'Circus upgrade': / upgraded the circus/,
    Stock: / bought \d+ .+ shares for /,
    'Stock sale': / sold \d+ .+ shares for /,
    Fee: / paid /,
    'Gain tile': / gained .* on Gain /,
    'Loss tile': / lost .* on Lose /,
    'Jackpot contribution': / added .* to the jackpot/,
    'Jackpot payout': / collected .* from the jackpot/,
  };
  return patterns[payment.reason]?.test(text) ?? false;
}
