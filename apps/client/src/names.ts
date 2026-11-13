/**
 * Names and descriptions of squares for the interface: tooltips, prompts, the log and the guide.
 * `BUILDING_INFO` says what each vacant plot building does for a rival and for its owner.
 */
import { K, netWorth, buildingName, squareFee, type GameState, type Square } from '@aa/engine';
import { fmt } from './ui/dom';

const SPECIAL: Record<string, string> = {
  bank: 'Bank',
  venture: 'Venture square',
  spade: 'Spade square',
  heart: 'Heart square',
  diamond: 'Diamond square',
  club: 'Club square',
  change: 'Change-of-suit',
  randomSuit: 'Random suit',
  roll: 'Roll-on',
  break: 'Take-a-break',
  boon: 'Boon',
  boom: 'Boom',
  broker: 'Stockbroker',
  portal: 'Portal',
  arcade: 'Arcade',
  cannon: 'Cannon',
  hike: 'Price Up',
  taxi: 'Taxi',
  swap: 'Swap',
  warp: 'Warp',
  blank: 'Blank tile',
};

export function squareName(G: GameState, sq: Square): string {
  if (sq.t === 'shop') return `${G.districts[sq.d]?.name ?? 'Row'} shop (${sq.base}G)`;
  if (sq.t === 'plot') {
    const d = G.districts[sq.d]?.name ?? '';
    return sq.b ? `${d} ${buildingName(sq.b)}` : `${d} vacant plot`;
  }
  if (sq.t === 'broker' && G.rules === 'easy') return 'Venture square';
  return SPECIAL[sq.t] ?? sq.t;
}

/** The name without a shop's price, for questions whose chips already show it. */
export function shortName(G: GameState, sq: Square): string {
  return sq.t === 'shop' ? `${G.districts[sq.d]?.name ?? 'Row'} shop` : squareName(G, sq);
}

export const BUILDING_INFO: Record<string, { rival: string; owner: string }> = {
  checkpoint: {
    rival: 'Pays the toll (also when passing). Starts at 20G, +10G each time.',
    owner: 'Invest in any of your shops.',
  },
  circus: { rival: 'Pays the show fee: 100G.', owner: 'Upgrade to 500 / 1,000 / 2,000G shows.' },
  balloon: { rival: 'Pays 150G.', owner: 'Fly to any square; its landing effect applies.' },
  tax: { rival: 'Pays you 10% of their own net worth.', owner: 'The bank pays you 5% of your net worth.' },
  motel: {
    rival: 'Pays 100G. Check in while passing to save unused spaces for the next roll.',
    owner: 'Land normally to invest. Check in while passing to save spaces instead; pay 100G to the bank.',
  },
  home: { rival: 'Pays 60G x your level.', owner: 'Every other player is pulled to this square.' },
  agency: {
    rival: 'Takes a break: their shops close until their next turn.',
    owner: 'Buy any unowned shop at its value.',
  },
  star3: {
    rival: 'Pays a shop fee on a 1,000G base. Buyouts allowed.',
    owner: 'Invest in any of your shops.',
  },
};

/** What a non-property square does, for its tooltip. */
export function squareInfo(G: GameState, sq: Square): string {
  const suit = 'Collect this suit, then draw a venture card. Get all four, then visit the bank to level up.';
  const info: Record<string, string> = {
    bank: 'Your salary when you level up here with all four suits. Landing lets you buy stock. Arrive with the target net worth to win.',
    venture: 'Draw a venture card: pick a panel on the venture board.',
    spade: suit,
    heart: suit,
    diamond: suit,
    club: suit,
    change: 'Collect the suit shown (it changes each time someone passes).',
    randomSuit:
      'Step on it to collect one random missing suit. If you have all four, no suit is given. Landing also draws a venture card.',
    roll: 'Roll again and keep moving.',
    break: 'Take a break: your shops close until your next turn.',
    boon: 'Boon: earn 20% commission on every fee other players pay, until your next turn.',
    boom: 'Boom: earn 50% commission on every fee other players pay, until your next turn.',
    broker:
      G.rules === 'easy'
        ? 'Draw a venture card: pick a panel on the venture board.'
        : 'Stockbroker: buy shares in any district.',
    portal: `Step on it to jump to ${G.nodes[sq.link ?? -1]?.t === 'bank' ? 'the bank' : 'its partner portal (same color)'}, then keep moving.`,
    arcade: 'Play an arcade game for prizes: Lucky Reels, Memory Blocks or Coin Derby.',
    cannon: 'Fire yourself to any other player on the board.',
    hike: 'Price Up: your fees are 10% higher until your next turn.',
    taxi: 'Taxi: ride to any special square and use it.',
    swap: 'Swap: trade places with any other player.',
    blank: 'A placeholder: choose what it becomes in the board builder.',
    warp: `Stop here to jump to ${G.nodes[sq.link ?? -1]?.t === 'bank' ? 'the bank' : 'its partner warp (same color), even in another part of the map'}.`,
  };
  return info[sq.t] ?? '';
}

/** The motel's fixed fee, including the owner's fee boost, on tiles and in lists. */
export function motelFee(G: GameState, sq: Square): string {
  return fmt(squareFee(G, sq));
}

/** What the active player would pay or receive at a built property right now. */
export function buildingLandingLabel(G: GameState, sq: Square): string {
  const active = G.players[G.order[G.turn]];
  if (sq.b === 'agency') return active?.id === sq.owner ? 'Buy' : 'Break';
  if (sq.b === 'tax') {
    const amount =
      active?.id === sq.owner
        ? Math.floor(Math.max(0, netWorth(G, active)) * K.taxOwner)
        : squareFee(G, sq, active);
    return fmt(amount);
  }
  return fmt(squareFee(G, sq, active));
}
