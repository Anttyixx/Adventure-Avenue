import type { BoardDef, BoardLayout, BoardSquareDef, District, SquareType } from '../types';
import { autoEdges } from './format';

/**
 * Built-in boards drawn as text maps, one character per grid cell. Neighboring cells are linked
 * automatically, so a map is only valid when its roads are one cell wide and every fork is meant.
 * Hex maps use the editor's grid: odd rows sit half a cell to the right.
 *
 *   .  empty           0-7  shop in district N      a-h  vacant plot in district 0-7
 *   B  bank            V  venture                   S H D C  spade, heart, diamond, club
 *   X  change of suit  R  roll on                   K  take a break
 *   O  boon            M  boom                      T  stockbroker
 *   A  arcade          N  cannon                    Q  backstreet
 */
const GLYPHS: Record<string, SquareType> = {
  B: 'bank',
  V: 'venture',
  S: 'spade',
  H: 'heart',
  D: 'diamond',
  C: 'club',
  X: 'change',
  R: 'roll',
  K: 'break',
  O: 'boon',
  M: 'boom',
  T: 'broker',
  A: 'arcade',
  N: 'cannon',
  Q: 'back',
};

interface MapDistrict extends District {
  /** Base value of the district's first shop (reading order); each later one is 20G more. */
  base: number;
}

interface MapBoard {
  id: string;
  name: string;
  layout: BoardLayout;
  districts: MapDistrict[];
  map: string[];
}

export function fromMap({ id, name, layout, districts, map }: MapBoard): BoardDef {
  const count = districts.map(() => 0);
  const squares: BoardSquareDef[] = [];
  map.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const shop = /[0-7]/.test(ch) ? +ch : /[a-h]/.test(ch) ? ch.charCodeAt(0) - 97 : -1;
      if (shop >= 0) {
        const base = districts[shop].base + count[shop]++ * 20;
        squares.push({ x, y, t: 'shop', d: shop, base, ...(ch > '9' ? { plot: true } : {}) });
      } else if (GLYPHS[ch]) {
        squares.push({ x, y, t: GLYPHS[ch] });
      } else {
        throw new Error(`${name}: unknown map glyph "${ch}" at ${x},${y}`);
      }
    }),
  );
  return {
    id,
    name,
    layout,
    cols: Math.max(...map.map((r) => r.length)),
    rows: map.length,
    districts: districts.map(({ name, color }) => ({ name, color })),
    squares,
    edges: autoEdges(squares, new Set(), layout),
    bank: squares.findIndex((s) => s.t === 'bank'),
  };
}

/** The original board: a ring of shops with the bank on the main road through the middle. */
export const TOWN = fromMap({
  id: 'town',
  name: 'Town',
  layout: 'square',
  districts: [
    { name: 'Brick Row', color: '#ff4d4d', base: 160 },
    { name: 'Bay Market', color: '#2f9bff', base: 200 },
    { name: 'Greenway', color: '#2ecc71', base: 240 },
    { name: 'Gold Street', color: '#ffc21a', base: 280 },
    { name: 'Lilac Lane', color: '#9b5cff', base: 180 },
    { name: 'Tide Walk', color: '#13c4b4', base: 220 },
    { name: 'Plaza', color: '#ff4fa8', base: 320 },
  ],
  map: [
    'S0a0VR1b11VH',
    '0..........2',
    'R..........2',
    'V55A66B66ONT',
    'f..........2',
    '5..........2',
    'CM44e4K3d33D',
  ],
});

/** A harbor ring with the bank and a market loop in the middle, joined by two roads. */
export const HARBOR = fromMap({
  id: 'harbor',
  name: 'Harbor',
  layout: 'square',
  districts: [
    { name: 'Lighthouse', color: '#ff4d4d', base: 160 },
    { name: 'Fish Market', color: '#2f9bff', base: 200 },
    { name: 'Boardwalk', color: '#2ecc71', base: 240 },
    { name: 'Old Docks', color: '#ffc21a', base: 260 },
    { name: 'Shipyard', color: '#9b5cff', base: 180 },
    { name: 'Cliff Path', color: '#13c4b4', base: 170 },
    { name: 'Market Square', color: '#ff4fa8', base: 300 },
    { name: 'Harbor Row', color: '#ff8a1f', base: 320 },
  ],
  map: [
    'S0a00V11b1RH',
    '5....O.....2',
    'f....V.....2',
    'R...6g66...T',
    '5...B..A...2',
    '5...77h7...2',
    'V.....M....V',
    'N.....V....K',
    'CM44e4V3d33D',
  ],
});

/** A city block cut into four quarters by two avenues, with the bank where they cross. */
export const CROSSROADS = fromMap({
  id: 'crossroads',
  name: 'Crossroads City',
  layout: 'square',
  districts: [
    { name: 'Uptown', color: '#ff4d4d', base: 180 },
    { name: 'Gallery Row', color: '#2f9bff', base: 220 },
    { name: 'Eastgate', color: '#2ecc71', base: 240 },
    { name: 'Riverside', color: '#ffc21a', base: 260 },
    { name: 'Station Street', color: '#9b5cff', base: 200 },
    { name: 'Westside', color: '#13c4b4', base: 170 },
    { name: 'West Avenue', color: '#ff4fa8', base: 300 },
    { name: 'East Avenue', color: '#ff8a1f', base: 320 },
  ],
  map: [
    'S0a00V11b1H',
    '5....O....2',
    'f....A....2',
    'M....V....K',
    'R66g6B77h7T',
    'V....M....O',
    '5....N....2',
    '5....V....2',
    'C44e4V3d33D',
  ],
});

/** Two lakes side by side, with the bank on Main Street between them. */
export const TWIN_LAKES = fromMap({
  id: 'twin-lakes',
  name: 'Twin Lakes',
  layout: 'hex',
  districts: [
    { name: 'Pine Shore', color: '#2ecc71', base: 160 },
    { name: 'Cabin Row', color: '#ff4d4d', base: 200 },
    { name: 'Lookout', color: '#ffc21a', base: 240 },
    { name: 'Main Street', color: '#ff4fa8', base: 320 },
    { name: 'Reed Bank', color: '#9b5cff', base: 180 },
    { name: 'Marina', color: '#2f9bff', base: 220 },
    { name: 'Dockside', color: '#13c4b4', base: 260 },
  ],
  map: [
    '..S01bV112H.',
    '.0........c.',
    '.a.........V',
    'K..........2',
    '.0.........2',
    '.A33OBTM33N.',
    '.4.........R',
    'e..........6',
    '.V.........g',
    '.4........6.',
    '..C45fV556D.',
  ],
});

/** An island coast with two roads crossing the hills, and the bank inland. */
export const CORAL_ISLE = fromMap({
  id: 'coral-isle',
  name: 'Coral Isle',
  layout: 'hex',
  districts: [
    { name: 'Coral Point', color: '#2f9bff', base: 220 },
    { name: 'West Beach', color: '#ff4d4d', base: 160 },
    { name: 'Palm Cove', color: '#2ecc71', base: 180 },
    { name: 'Sunset Bay', color: '#ff8a1f', base: 240 },
    { name: 'Harbor Town', color: '#ffc21a', base: 200 },
    { name: 'Hill Pass', color: '#9b5cff', base: 280 },
    { name: 'Volcano Road', color: '#ff4fa8', base: 320 },
  ],
  map: [
    '....0aH00....',
    'S11V....O3dT.',
    '1...5...M...3',
    'b..5...B...D.',
    '2..f...6....3',
    '2.R....6...V.',
    'c..A56gN....4',
    'C2K....V4e4V.',
  ],
});
