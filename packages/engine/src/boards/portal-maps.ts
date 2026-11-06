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

/** Four hexagonal petals, eight districts and cross-map portal shortcuts. */
export const PRISM_JUNCTION = fromMap({
  id: 'prism-junction',
  name: 'Prism Junction',
  layout: 'hex',
  districts: [
    { name: 'Ruby Rim', color: '#e5484d', base: 160 },
    { name: 'Amber Arc', color: '#f78a28', base: 180 },
    { name: 'Sapphire Bend', color: '#3e7bfa', base: 200 },
    { name: 'Jade Crescent', color: '#30a46c', base: 220 },
    { name: 'Violet Reach', color: '#9b5cff', base: 240 },
    { name: 'Golden Curve', color: '#f5b301', base: 260 },
    { name: 'Rose Reach', color: '#ed5caa', base: 280 },
    { name: 'Opal Walk', color: '#13b4b4', base: 300 },
  ],
  map: [
    '.......................',
    '..O0V0......O2V2.......',
    '..0...S.....2...H......',
    '.T....0....T....2......',
    '.Q.....Q...Q.....Q.....',
    '.1....KV...3....K......',
    '..V...1.VV.VV...3......',
    '..1K1V...VVV3K3V.......',
    '...........V...........',
    '..........VBV..........',
    '.........VV..VVV.......',
    '.......O4V4....VVO6V6..',
    '.......4...C.....6...D.',
    '......T....4....T....6.',
    '......Q.....Q...Q.....Q',
    '......5....K....7....K.',
    '.......V...5.....V...7.',
    '.......5K5V......7K7V..',
  ],
  portals: [
    [
      [1, 4],
      [22, 14],
    ],
    [
      [7, 4],
      [6, 14],
    ],
    [
      [11, 4],
      [12, 14],
    ],
    [
      [17, 4],
      [16, 14],
    ],
  ],
});

/** Long district branches end in portals returning two walking steps before the bank. */
export const RETURN_RIDGE = fromMap({
  id: 'return-ridge',
  name: 'Return Ridge',
  layout: 'square',
  districts: [
    { name: 'Pine Road', color: '#e5484d', base: 160 },
    { name: 'Cedar Bend', color: '#f78a28', base: 180 },
    { name: 'Sunset Road', color: '#3e7bfa', base: 200 },
    { name: 'Copper Bend', color: '#30a46c', base: 220 },
    { name: 'River Road', color: '#9b5cff', base: 240 },
    { name: 'Willow Bend', color: '#f5b301', base: 260 },
    { name: 'Hill Road', color: '#ed5caa', base: 280 },
    { name: 'Orchard Bend', color: '#13b4b4', base: 300 },
  ],
  map: [
    'O0V0S0VVVVVVV2H2V2O',
    '0........V........2',
    'T........V........T',
    '1........V........3',
    'V1K1V1Q..V..Q3V3K3V',
    '........QVQ........',
    '.........B.........',
    '........QVQ........',
    'V5K5V5Q..V..Q7V7K7V',
    '5........V........7',
    'T........V........T',
    '4........V........6',
    'O4V4C4VVVVVVV6D6V6O',
  ],
  portals: [
    [
      [6, 4],
      [8, 5],
    ],
    [
      [12, 4],
      [10, 5],
    ],
    [
      [6, 8],
      [8, 7],
    ],
    [
      [12, 8],
      [10, 7],
    ],
  ],
});
