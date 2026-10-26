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
    { name: 'Brick Row', color: '#f2a7a0', base: 160 },
    { name: 'Bay Market', color: '#9fd3f0', base: 200 },
    { name: 'Greenway', color: '#a8e0a0', base: 240 },
    { name: 'Gold Street', color: '#f5d77a', base: 280 },
    { name: 'Lilac Lane', color: '#cdb4f0', base: 180 },
    { name: 'Tide Walk', color: '#8fe3d6', base: 220 },
    { name: 'Plaza', color: '#f7bfdc', base: 320 },
  ],
  map: [
    'S0a0VX1b11QH',
    '0..........2',
    'R..........2',
    'V55A66B66ONT',
    'f..........2',
    '5..........2',
    'CQ44e4K3d33D',
  ],
});

/** A harbor ring with the bank and a market loop in the middle, joined by two roads. */
export const HARBOR = fromMap({
  id: 'harbor',
  name: 'Harbor',
  layout: 'square',
  districts: [
    { name: 'Lighthouse', color: '#f2a7a0', base: 160 },
    { name: 'Fish Market', color: '#9fd3f0', base: 200 },
    { name: 'Boardwalk', color: '#a8e0a0', base: 240 },
    { name: 'Old Docks', color: '#f5d77a', base: 260 },
    { name: 'Shipyard', color: '#cdb4f0', base: 180 },
    { name: 'Cliff Path', color: '#8fe3d6', base: 170 },
    { name: 'Market Square', color: '#f7bfdc', base: 300 },
    { name: 'Harbor Row', color: '#ffc49b', base: 320 },
  ],
  map: [
    'S0a00V11b1QH',
    '5....O.....2',
    'f....V.....2',
    'R...6g66...T',
    '5...B..A...2',
    '5...77h7...2',
    'V.....M....V',
    'N.....V....K',
    'CQ44e4X3d33D',
  ],
});

/** A city block cut into four quarters by two avenues, with the bank where they cross. */
export const CROSSROADS = fromMap({
  id: 'crossroads',
  name: 'Crossroads City',
  layout: 'square',
  districts: [
    { name: 'Uptown', color: '#f2a7a0', base: 180 },
    { name: 'Gallery Row', color: '#9fd3f0', base: 220 },
    { name: 'Eastgate', color: '#a8e0a0', base: 240 },
    { name: 'Riverside', color: '#f5d77a', base: 260 },
    { name: 'Station Street', color: '#cdb4f0', base: 200 },
    { name: 'Westside', color: '#8fe3d6', base: 170 },
    { name: 'West Avenue', color: '#f7bfdc', base: 300 },
    { name: 'East Avenue', color: '#ffc49b', base: 320 },
  ],
  map: [
    'S0a00V11b1H',
    '5....O....2',
    'f....A....2',
    'Q....V....K',
    'R66g6B77h7T',
    'V....M....Q',
    '5....N....2',
    '5....V....2',
    'C44e4X3d33D',
  ],
});

/** Two lakes side by side, with the bank on Main Street between them. */
export const TWIN_LAKES = fromMap({
  id: 'twin-lakes',
  name: 'Twin Lakes',
  layout: 'hex',
  districts: [
    { name: 'Pine Shore', color: '#a8e0a0', base: 160 },
    { name: 'Cabin Row', color: '#f2a7a0', base: 200 },
    { name: 'Lookout', color: '#f5d77a', base: 240 },
    { name: 'Main Street', color: '#f7bfdc', base: 320 },
    { name: 'Reed Bank', color: '#cdb4f0', base: 180 },
    { name: 'Marina', color: '#9fd3f0', base: 220 },
    { name: 'Dockside', color: '#8fe3d6', base: 260 },
  ],
  map: [
    '..S01bV112H.',
    '.0........c.',
    '.a.........Q',
    'K..........2',
    '.0.........2',
    '.A33OBTM33N.',
    '.4.........R',
    'e..........6',
    '.Q.........g',
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
    { name: 'Coral Point', color: '#9fd3f0', base: 220 },
    { name: 'West Beach', color: '#f2a7a0', base: 160 },
    { name: 'Palm Cove', color: '#a8e0a0', base: 180 },
    { name: 'Sunset Bay', color: '#ffc49b', base: 240 },
    { name: 'Harbor Town', color: '#f5d77a', base: 200 },
    { name: 'Hill Pass', color: '#cdb4f0', base: 280 },
    { name: 'Volcano Road', color: '#f7bfdc', base: 320 },
  ],
  map: [
    '....0aH00....',
    'S11V....O3dT.',
    '1...5...M...3',
    'b..5...B...D.',
    '2..f...6....3',
    '2.Q....6...V.',
    'c..A56gN....4',
    'C2K....X4e4Q.',
  ],
});
