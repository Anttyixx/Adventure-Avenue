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
    { name: 'Spruce Lane', color: '#3e7bfa', base: 200 },
    { name: 'Sunset Road', color: '#30a46c', base: 220 },
    { name: 'Copper Bend', color: '#9b5cff', base: 240 },
    { name: 'Amber Lane', color: '#f5b301', base: 260 },
    { name: 'River Road', color: '#ed5caa', base: 280 },
    { name: 'Willow Bend', color: '#13b4b4', base: 300 },
    { name: 'Reed Lane', color: '#a16b3b', base: 320 },
    { name: 'Hill Road', color: '#5c6bc0', base: 340 },
    { name: 'Orchard Bend', color: '#a3be36', base: 360 },
    { name: 'Meadow Lane', color: '#ce7eab', base: 380 },
  ],
  map: [
    '11XT00OV00SXKTKXT33XK33AM44',
    'K............O............T',
    'A............A............X',
    '1............K............4',
    '1MT22XO22KQ..R..QO55VH55KO4',
    '............QXQ............',
    '.............B.............',
    '............QXQ............',
    '7VO88TX88KQ..O..QTJJMAJJKXI',
    '7............K............I',
    'C............X............T',
    'K............X............O',
    '77OX66TM66AXKTKXX99OK99DVII',
  ],
  portals: [
    [
      [10, 4],
      [12, 5],
    ],
    [
      [16, 4],
      [14, 5],
    ],
    [
      [10, 8],
      [12, 7],
    ],
    [
      [16, 8],
      [14, 7],
    ],
  ],
});
