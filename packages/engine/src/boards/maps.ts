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

/** A harbor ring with a market loop in the middle, joined by two roads. */
export const HARBOR = fromMap({
  id: 'harbor',
  name: 'Harbor',
  layout: 'square',
  districts: [
    { name: 'Lighthouse', color: '#f2a7a0', base: 160 },
    { name: 'Fish Market', color: '#9fd3f0', base: 200 },
    { name: 'Boardwalk', color: '#a8e0a0', base: 240 },
    { name: 'Old Docks', color: '#cdb4f0', base: 180 },
    { name: 'Shipyard', color: '#f5d77a', base: 220 },
    { name: 'Market Square', color: '#f7bfdc', base: 300 },
  ],
  map: [
    'S00V0a0X11V1..',
    '0.....R....1H2',
    '3.....5......2',
    'Q...555O55...T',
    '3...A....5...2',
    '3...5f5M55...K',
    'R......V.....2',
    '3......4.....2',
    'C44N4B44D4eQ44',
  ],
});

/** A big city block cut into four quarters by two avenues. */
export const CROSSROADS = fromMap({
  id: 'crossroads',
  name: 'Crossroads City',
  layout: 'square',
  districts: [
    { name: 'Uptown', color: '#f2a7a0', base: 180 },
    { name: 'Gallery Row', color: '#9fd3f0', base: 220 },
    { name: 'West Avenue', color: '#a8e0a0', base: 260 },
    { name: 'Riverside', color: '#cdb4f0', base: 160 },
    { name: 'Station Street', color: '#f5d77a', base: 240 },
    { name: 'Eastgate', color: '#8fe3d6', base: 200 },
    { name: 'East Avenue', color: '#f7bfdc', base: 300 },
  ],
  map: [
    'S000V0a0R1111V1H',
    '0......1.......1',
    '0......1.......1',
    '0......1.......T',
    'K......1.......1',
    'Q22222O2M666666X',
    '3......4.......5',
    '3......4.......5',
    'N......4.......Q',
    '3......4.......5',
    'C33V3d3B4444e5D5',
  ],
});

/** Two lakes side by side, with the main street running between them. */
export const TWIN_LAKES = fromMap({
  id: 'twin-lakes',
  name: 'Twin Lakes',
  layout: 'hex',
  districts: [
    { name: 'Pine Shore', color: '#a8e0a0', base: 160 },
    { name: 'Cabin Row', color: '#f2a7a0', base: 200 },
    { name: 'Marina', color: '#9fd3f0', base: 220 },
    { name: 'Reed Bank', color: '#cdb4f0', base: 180 },
    { name: 'Main Street', color: '#f5d77a', base: 300 },
  ],
  map: [
    '..S0a0VR11H.',
    '.0........1.',
    '.0.........Q',
    'K..........T',
    '.0.........1',
    '.A44OB4M44N.',
    '.3.........R',
    '3..........2',
    '.Q.........2',
    '.3........2.',
    '..C3d3V2c2D.',
  ],
});

/** An island coast with two roads crossing the hills inland. */
export const CORAL_ISLE = fromMap({
  id: 'coral-isle',
  name: 'Coral Isle',
  layout: 'hex',
  districts: [
    { name: 'West Beach', color: '#f2a7a0', base: 160 },
    { name: 'Coral Point', color: '#9fd3f0', base: 220 },
    { name: 'Palm Cove', color: '#a8e0a0', base: 200 },
    { name: 'Harbor Town', color: '#f5d77a', base: 180 },
    { name: 'Hill Pass', color: '#cdb4f0', base: 280 },
    { name: 'Volcano Road', color: '#f7bfdc', base: 320 },
  ],
  map: [
    '....1bH11....',
    'S000....O22T.',
    '0...4...5...2',
    'V..4...M...D.',
    '0..e...5....2',
    'Q.4....5...V.',
    '0..A3d3N....2',
    'C0K....X3B3Q.',
  ],
});
