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
 *   W  warp (where it leads is listed in the board's `warps`)
 *
 * Which properties start as vacant plots is set when a game starts (the plot setting), so maps
 * use digits for every property.
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
  W: 'warp',
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
  /** Warps: landing on the first cell takes you to the second, as [x, y] pairs. */
  warps?: [[number, number], [number, number]][];
}

export function fromMap({ id, name, layout, districts, map, warps = [] }: MapBoard): BoardDef {
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
  const at = (x: number, y: number) => squares.findIndex((q) => q.x === x && q.y === y);
  for (const [[fx, fy], [tx, ty]] of warps) {
    const from = squares[at(fx, fy)];
    if (!from || from.t !== 'warp') throw new Error(`${name}: no warp at ${fx},${fy}`);
    from.link = at(tx, ty);
  }
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

/** The original board, grown: a ring of shops with the bank on the main road through the middle. */
export const TOWN = fromMap({
  id: 'town',
  name: 'Town',
  layout: 'square',
  districts: [
    { name: 'Brick Row', color: '#ff4d4d', base: 160 },
    { name: 'Bay Market', color: '#2f9bff', base: 200 },
    { name: 'Greenway', color: '#2ecc71', base: 240 },
    { name: 'Gold Street', color: '#ffc21a', base: 280 },
    { name: 'Lilac Lane', color: '#9b5cff', base: 300 },
    { name: 'Tide Walk', color: '#13c4b4', base: 220 },
    { name: 'Plaza', color: '#ff4fa8', base: 260 },
    { name: 'Market Hill', color: '#ff8a1f', base: 180 },
  ],
  map: [
    'S00R111T1V222H',
    '0............2',
    '0............O',
    'V33A33RB44N44V',
    'K............5',
    'M............5',
    'C77V7766V6655D',
  ],
});

/** A harbor ring split by two piers, joined in the middle by the quay with the bank. */
export const HARBOR = fromMap({
  id: 'harbor',
  name: 'Harbor',
  layout: 'square',
  districts: [
    { name: 'Lighthouse', color: '#ff4d4d', base: 160 },
    { name: 'Fish Market', color: '#2f9bff', base: 200 },
    { name: 'Boardwalk', color: '#2ecc71', base: 240 },
    { name: 'Old Docks', color: '#ffc21a', base: 300 },
    { name: 'Shipyard', color: '#9b5cff', base: 260 },
    { name: 'Cliff Path', color: '#13c4b4', base: 220 },
    { name: 'Market Square', color: '#ff4fa8', base: 280 },
    { name: 'Harbor Row', color: '#ff8a1f', base: 180 },
  ],
  map: [
    'S0O0VR11VA22VNH',
    '0....1...4....2',
    '0....1...4....2',
    'V....3...V....V',
    'T....V3B3R....T',
    'K....3...4....R',
    '7....6...4....5',
    '7....V...V....5',
    'C77V6V6K6R55MND',
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
    { name: 'Station Street', color: '#9b5cff', base: 300 },
    { name: 'Westside', color: '#13c4b4', base: 200 },
    { name: 'West Avenue', color: '#ff4fa8', base: 280 },
    { name: 'East Avenue', color: '#ff8a1f', base: 170 },
  ],
  map: [
    'TR00S0V11A11M',
    '0.....5.....2',
    'V.....5.....2',
    '7.....V.....V',
    'C22V44B44AKRD',
    '7.....V.....3',
    'R.....6.....K',
    '7.....6.....3',
    'O7V6V6H55N33T',
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
    { name: 'Reed Bank', color: '#9b5cff', base: 180 },
    { name: 'Main Street', color: '#ff4fa8', base: 300 },
    { name: 'Marina', color: '#2f9bff', base: 280 },
    { name: 'Dockside', color: '#13c4b4', base: 220 },
    { name: 'Birch Hill', color: '#ff8a1f', base: 260 },
  ],
  map: [
    '..S00V1T1112H.',
    '.0..........2.',
    '.0...........2',
    'O............2',
    '.K...........3',
    '.V44A44B55N55.',
    '.6...........3',
    'R............M',
    '.6...........3',
    '.6..........3.',
    '..C677V77VRVD.',
  ],
});

/** An island coast with roads over the hills, and the bank inland. */
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
    { name: 'Lagoon Walk', color: '#13c4b4', base: 260 },
  ],
  map: [
    '......00V00......',
    'S11V11....R22A22.',
    '3.....V...N.....H',
    'T....4...B.....6.',
    '3....4...V......O',
    '3...K....4.....6.',
    '3....V455R......D',
    'C77VM....556V677.',
  ],
});

/**
 * A town with two floating islands: warp squares on the main ring take you over, and every warp
 * on an island brings you back. Each island has all four suits.
 */
export const SKY_ISLANDS = fromMap({
  id: 'sky-islands',
  name: 'Sky Islands',
  layout: 'square',
  districts: [
    { name: 'Cloud Street', color: '#2f9bff', base: 200 },
    { name: 'Windmill Row', color: '#2ecc71', base: 240 },
    { name: 'Kite Lane', color: '#ff4d4d', base: 160 },
    { name: 'Rainbow Way', color: '#ffc21a', base: 280 },
    { name: 'Balloon Yard', color: '#9b5cff', base: 220 },
    { name: 'Low Isle', color: '#13c4b4', base: 320 },
    { name: 'High Isle', color: '#ff4fa8', base: 300 },
    { name: 'Starfall', color: '#ff8a1f', base: 340 },
  ],
  map: [
    '................S66W',
    '................7..H',
    '.....S00VO00R1H.7..6',
    '.....2........W.W..6',
    '.....2........1.C..V',
    '.....V22NBA33VV.77DW',
    '.....R........1.....',
    'S55W.W........1.....',
    'W..H.C44M4T433D.....',
    'V..5................',
    'CDW5................',
  ],
  warps: [
    [
      [5, 7],
      [3, 7],
    ],
    [
      [3, 7],
      [5, 7],
    ],
    [
      [2, 10],
      [5, 7],
    ],
    [
      [0, 8],
      [5, 7],
    ],
    [
      [14, 3],
      [16, 3],
    ],
    [
      [16, 3],
      [14, 3],
    ],
    [
      [19, 0],
      [14, 3],
    ],
    [
      [19, 5],
      [14, 3],
    ],
  ],
});

/** A long lagoon town with an island on each side, reached by warp. */
export const LAGOON = fromMap({
  id: 'lagoon',
  name: 'Lagoon',
  layout: 'square',
  districts: [
    { name: 'North Shore', color: '#2f9bff', base: 200 },
    { name: 'Shell Row', color: '#ff4d4d', base: 160 },
    { name: 'South Shore', color: '#2ecc71', base: 240 },
    { name: 'Reef Street', color: '#ffc21a', base: 220 },
    { name: 'Lagoon Bridge', color: '#9b5cff', base: 280 },
    { name: 'Turtle Bay', color: '#13c4b4', base: 260 },
    { name: 'Pearl Point', color: '#ff4fa8', base: 300 },
    { name: 'Sunrise Key', color: '#ff8a1f', base: 340 },
  ],
  map: [
    '......S00O00H......',
    '......1.....3......',
    '......1.....3......',
    'S55H..W.....V..S77W',
    '6..W..V.....3..W..H',
    '6..5..R44B44K..V..7',
    'W..5..1.....3..CDW7',
    'C66D..1.....W......',
    '......A.....N......',
    '......2.....2......',
    '......CM2T2VD......',
  ],
  warps: [
    [
      [6, 3],
      [3, 4],
    ],
    [
      [3, 4],
      [6, 3],
    ],
    [
      [0, 6],
      [6, 3],
    ],
    [
      [12, 7],
      [15, 4],
    ],
    [
      [15, 4],
      [12, 7],
    ],
    [
      [18, 3],
      [12, 7],
    ],
    [
      [17, 6],
      [12, 7],
    ],
  ],
});
