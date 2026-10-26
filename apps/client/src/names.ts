import { BUILDINGS, type GameState, type Square } from '@aa/engine';

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
  back: 'Backstreet',
  arcade: 'Arcade',
  cannon: 'Cannon',
};

export function squareName(G: GameState, sq: Square): string {
  if (sq.t === 'shop') return `${G.districts[sq.d]?.name ?? 'Row'} shop (${sq.base}G)`;
  if (sq.t === 'plot') {
    const d = G.districts[sq.d]?.name ?? '';
    return sq.b ? `${d} ${BUILDINGS.find((b) => b.b === sq.b)!.name}` : `${d} vacant plot`;
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
