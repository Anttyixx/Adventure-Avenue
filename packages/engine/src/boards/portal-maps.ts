import { fromMap } from './maps';

/**
 * Four courtyard rings around the bank's promenade. Each half-courtyard is one district,
 * alternating properties with relief squares. Corner portals exchange courtyards mid-roll;
 * the inward paths remain a reliable road home without requiring a particular die result.
 */
export const CROSSGATE_GARDENS = fromMap({
  id: 'crossgate-gardens',
  name: 'Crossgate Gardens',
  layout: 'square',
  districts: [
    { name: 'Rose Terrace', color: '#e5484d', base: 160 },
    { name: 'Willow Walk', color: '#30a46c', base: 160 },
    { name: 'Bluebell Court', color: '#3e7bfa', base: 200 },
    { name: 'Marigold Row', color: '#f5b301', base: 200 },
    { name: 'Lavender Lane', color: '#9b5cff', base: 240 },
    { name: 'Mint Garden', color: '#13b4b4', base: 240 },
    { name: 'Orchid Square', color: '#ed5caa', base: 280 },
    { name: 'Amber Grove', color: '#f78a28', base: 280 },
  ],
  map: [
    'Q0S0V...Q2H2V',
    '1...0...3...2',
    'K...O...K...O',
    '1...0...3...2',
    'T1V1Q...T3V3Q',
    '..V.......V..',
    '..RVAVBVAVR..',
    '..V.......V..',
    'Q4C4V...Q6D6V',
    '5...4...7...6',
    'K...O...K...O',
    '5...4...7...6',
    'T5V5Q...T7V7Q',
  ],
  portals: [
    [
      [0, 0],
      [12, 12],
    ],
    [
      [4, 4],
      [8, 0],
    ],
    [
      [12, 4],
      [0, 8],
    ],
    [
      [4, 12],
      [8, 8],
    ],
  ],
});

/**
 * Three hexagonal petals with a three-way bank junction. Long portal jumps connect the
 * outer rims into a second circuit, while the inner spokes offer a deliberate return route.
 * Each petal holds two compact districts, with non-property stops between every shop.
 */
export const PRISM_JUNCTION = fromMap({
  id: 'prism-junction',
  name: 'Prism Junction',
  layout: 'hex',
  districts: [
    { name: 'Ruby Rim', color: '#e5484d', base: 160 },
    { name: 'Amber Arc', color: '#f78a28', base: 180 },
    { name: 'Sapphire Bend', color: '#3e7bfa', base: 220 },
    { name: 'Jade Crescent', color: '#30a46c', base: 240 },
    { name: 'Violet Reach', color: '#9b5cff', base: 280 },
    { name: 'Golden Curve', color: '#f5b301', base: 300 },
  ],
  map: [
    '..................',
    '..O0V0......O2V2..',
    '..0...S.....2...H.',
    '.T....0....T....2.',
    '.Q.....Q...Q.....Q',
    '.1....KV..V3....K.',
    '..V...1.R.A.V...3.',
    '..1D1V..BV..3K3V..',
    '........V.........',
    '.......R..........',
    '.......V..........',
    '.......O4V4.......',
    '.......4...C......',
    '......T....4......',
    '......Q.....Q.....',
    '......5....K......',
    '.......V...5......',
    '.......5A5V.......',
  ],
  portals: [
    [
      [1, 4],
      [17, 4],
    ],
    [
      [7, 4],
      [6, 14],
    ],
    [
      [11, 4],
      [12, 14],
    ],
  ],
});
