/**
 * Names and descriptions of squares for the interface: tooltips, prompts, the log and the guide.
 * `BUILDING_INFO` says what each vacant plot building does for a rival and for its owner.
 */
import { K, buildingName, squareFee, type GameState, type Square } from '@aa/engine';
import { fmt } from './ui/dom';

const SPECIAL: Record<string, string> = {
  bank: 'Bank',
  venture: 'Venture square',
  spade: 'Spade square',
  heart: 'Heart square',
  diamond: 'Diamond square',
  club: 'Club square',
  change: 'Change-of-suit',
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
    rival:
      'Pays 15% of the cash they hold. Anyone passing may stop here instead of moving on, then set off in any direction.',
    owner: 'Invest in any of your shops (you can stop here when passing too).',
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
    warp: `Stop here to jump to ${G.nodes[sq.link ?? -1]?.t === 'bank' ? 'the bank' : 'its partner warp (same color), even in another part of the map'}.`,
  };
  return info[sq.t] ?? '';
}

/**
 * A motel's fee as shown on its tile and in lists: what the player whose turn it is would pay
 * there now (15% of their cash), or just "15%" when it is their own motel.
 */
export function motelFee(G: GameState, sq: Square): string {
  const p = G.players[G.order[G.turn]];
  if (!p || p.id === sq.owner) return `${Math.round(K.motelRate * 100)}%`;
  return fmt(squareFee(G, sq, p));
}
