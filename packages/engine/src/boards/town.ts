import type { BoardDef, BoardSquareDef, District, SquareType } from '../types';

export type { BoardDef, BoardSquareDef } from '../types';

const districts: District[] = [
  { name: 'Brick Row', color: '#f2a7a0' },
  { name: 'Bay Market', color: '#9fd3f0' },
  { name: 'Greenway', color: '#a8e0a0' },
  { name: 'Gold Street', color: '#f5d77a' },
  { name: 'Lilac Lane', color: '#cdb4f0' },
  { name: 'Tide Walk', color: '#8fe3d6' },
  { name: 'Plaza', color: '#f7bfdc' },
];

type Row = [number, number, SquareType, number?, number?, boolean?];

// Outer ring, clockwise from the spade corner, then the middle road left to right.
const ring: Row[] = [
  [0, 0, 'spade'],
  [1, 0, 'shop', 0, 160],
  [2, 0, 'shop', 0, 180, true],
  [3, 0, 'shop', 0, 200],
  [4, 0, 'venture'],
  [5, 0, 'change'],
  [6, 0, 'shop', 1, 200],
  [7, 0, 'shop', 1, 220, true],
  [8, 0, 'shop', 1, 240],
  [9, 0, 'shop', 1, 260],
  [10, 0, 'back'],
  [11, 0, 'heart'],
  [11, 1, 'shop', 2, 240],
  [11, 2, 'shop', 2, 260],
  [11, 3, 'broker'],
  [11, 4, 'shop', 3, 280],
  [11, 5, 'shop', 3, 300, true],
  [11, 6, 'diamond'],
  [10, 6, 'shop', 3, 320],
  [9, 6, 'shop', 3, 340],
  [8, 6, 'venture'],
  [7, 6, 'break'],
  [6, 6, 'bank'],
  [5, 6, 'shop', 4, 180],
  [4, 6, 'shop', 4, 200, true],
  [3, 6, 'shop', 4, 220],
  [2, 6, 'shop', 4, 240],
  [1, 6, 'back'],
  [0, 6, 'club'],
  [0, 5, 'shop', 5, 220],
  [0, 4, 'shop', 5, 240, true],
  [0, 3, 'venture'],
  [0, 2, 'roll'],
  [0, 1, 'shop', 0, 220],
];
const middle: Row[] = [
  [1, 3, 'shop', 5, 260],
  [2, 3, 'shop', 5, 280],
  [3, 3, 'arcade'],
  [4, 3, 'shop', 6, 320],
  [5, 3, 'shop', 6, 340],
  [6, 3, 'shop', 6, 360],
  [7, 3, 'boon'],
  [8, 3, 'boom'],
  [9, 3, 'cannon'],
  [10, 3, 'shop', 2, 280],
];

const rows = [...ring, ...middle];
const squares: BoardSquareDef[] = rows.map(([x, y, t, d, base, plot]) => ({ x, y, t, d, base, plot }));
const at = (x: number, y: number) => rows.findIndex((r) => r[0] === x && r[1] === y);

const edges: [number, number][] = [];
for (let i = 0; i < ring.length; i++) edges.push([i, (i + 1) % ring.length]);
const road = [at(0, 3), ...middle.map((r) => at(r[0], r[1])), at(11, 3)];
for (let i = 0; i < road.length - 1; i++) edges.push([road[i], road[i + 1]]);

export const TOWN: BoardDef = {
  id: 'town',
  name: 'Town',
  cols: 12,
  rows: 7,
  districts,
  squares,
  edges,
  bank: at(6, 6),
};

export const BOARDS: Record<string, BoardDef> = { town: TOWN };
