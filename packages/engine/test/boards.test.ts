import { describe, expect, it } from 'vitest';
import { TOWN } from '../src/boards/town';
import {
  autoEdges,
  boardFromFile,
  boardToFile,
  edgeKey,
  neighborCells,
  validateBoard,
} from '../src/boards/format';
import { simulate } from '../src/headless';
import type { BoardDef, BoardSquareDef } from '../src/types';

const sortEdges = (e: [number, number][]) => e.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)).sort();

/** A small loop board: 6 x 5 ring of 18 squares. */
function ringBoard(): BoardDef {
  const cells: [number, number][] = [];
  for (let x = 0; x < 6; x++) cells.push([x, 0]);
  for (let y = 1; y < 5; y++) cells.push([5, y]);
  for (let x = 4; x >= 0; x--) cells.push([x, 4]);
  for (let y = 3; y >= 1; y--) cells.push([0, y]);
  const types = [
    'bank',
    'shop',
    'shop',
    'spade',
    'shop',
    'shop',
    'venture',
    'shop',
    'heart',
    'shop',
    'shop',
    'diamond',
    'shop',
    'shop',
    'club',
    'shop',
    'shop',
    'venture',
  ];
  const squares: BoardSquareDef[] = cells.map(([x, y], i) => {
    const t = types[i] as BoardSquareDef['t'];
    return t === 'shop' ? { x, y, t, d: i < 9 ? 0 : 1, base: 150 + i * 10 } : { x, y, t };
  });
  return {
    id: 'ring',
    name: 'Ring',
    cols: 6,
    rows: 5,
    districts: [
      { name: 'North', color: '#f2a7a0' },
      { name: 'South', color: '#9fd3f0' },
    ],
    squares,
    edges: autoEdges(squares),
    bank: 0,
  };
}

describe('custom boards', () => {
  it('accepts the Town board', () => {
    expect(validateBoard(TOWN).errors).toEqual([]);
  });

  it('auto-connects neighboring cells exactly like the Town board', () => {
    expect(sortEdges(autoEdges(TOWN.squares))).toEqual(sortEdges(TOWN.edges));
  });

  it('respects cut links', () => {
    const b = ringBoard();
    const cut = new Set([edgeKey(b.squares[0], b.squares[1])]);
    expect(autoEdges(b.squares, cut)).toHaveLength(b.edges.length - 1);
  });

  it('round-trips through the file format', () => {
    const file = JSON.parse(JSON.stringify(boardToFile(TOWN)));
    const { board, error } = boardFromFile(file, 'copy');
    expect(error).toBeUndefined();
    expect(board!.squares).toEqual(
      TOWN.squares
        .map((s) => (s.t === 'shop' ? { ...s, plot: s.plot || undefined } : { x: s.x, y: s.y, t: s.t }))
        .map((s) => JSON.parse(JSON.stringify(s))),
    );
    expect(sortEdges(board!.edges)).toEqual(sortEdges(TOWN.edges));
    expect(board!.bank).toBe(TOWN.bank);
    expect(validateBoard(board!).errors).toEqual([]);
  });

  it('rejects files that are not boards', () => {
    expect(boardFromFile({ hello: 1 }, 'x').error).toBeTruthy();
    expect(boardFromFile({ ...boardToFile(TOWN), version: 99 }, 'x').error).toMatch(/newer/);
  });

  it('reports what makes a board unplayable', () => {
    const b = ringBoard();
    b.squares = b.squares.filter((s) => s.t !== 'bank' && s.t !== 'heart');
    b.edges = autoEdges(b.squares);
    const { errors } = validateBoard(b);
    expect(errors.join(' ')).toMatch(/bank/);
    expect(errors.join(' ')).toMatch(/heart/);
  });

  it('finds squares that cannot be reached from the bank', () => {
    const b = ringBoard();
    b.squares.push({ x: 3, y: 2, t: 'arcade' });
    b.edges = autoEdges(b.squares);
    expect(validateBoard(b).errors.join(' ')).toMatch(/not connected/);
  });

  it('plays CPU games to the end on a custom board', async () => {
    const b = ringBoard();
    expect(validateBoard(b).errors).toEqual([]);
    for (let i = 0; i < 40; i++) {
      const r = await simulate(i % 2 ? 'easy' : 'standard', i + 1, 4000, 0, b);
      expect(r.winner).toBeGreaterThanOrEqual(0);
    }
  });
});

/** The winding Lakeside loop from the hex mockup, in hex offset coordinates. */
function hexBoard(): BoardDef {
  const axial = [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, -1],
    [5, -1],
    [6, -2],
    [7, -2],
    [8, -3],
    [9, -4],
    [9, -5],
    [10, -6],
    [10, -7],
    [10, -8],
    [9, -8],
    [9, -9],
    [8, -9],
    [7, -9],
    [6, -9],
    [5, -9],
    [4, -8],
    [3, -8],
    [2, -8],
    [1, -7],
    [0, -7],
    [-1, -6],
    [-2, -5],
    [-2, -4],
    [-3, -3],
    [-3, -2],
    [-3, -1],
    [-2, -1],
    [-2, 0],
    [-1, 0],
  ];
  // Axial -> odd-row offset; shift rows by an even amount so row parity is kept.
  const cells = axial.map(([q, r]) => [q + (r - (r & 1)) / 2 + 8, r + 10]);
  const special: Record<number, BoardSquareDef['t']> = {
    0: 'bank',
    3: 'venture',
    7: 'spade',
    13: 'heart',
    20: 'diamond',
    27: 'club',
    30: 'venture',
  };
  const squares: BoardSquareDef[] = cells.map(([x, y], i) =>
    special[i]
      ? { x, y, t: special[i] }
      : { x, y, t: 'shop', d: Math.floor(i / 9), base: 160 + (i % 5) * 20 },
  );
  return {
    id: 'hex',
    name: 'Lakeside',
    layout: 'hex',
    cols: 16,
    rows: 11,
    districts: ['A', 'B', 'C', 'D'].map((name, i) => ({
      name,
      color: ['#f2a7a0', '#9fd3f0', '#a8e0a0', '#f5d77a'][i],
    })),
    squares,
    edges: autoEdges(squares, new Set(), 'hex'),
    bank: 0,
  };
}

describe('hex boards', () => {
  it('has six neighbors per cell, and neighbors are mutual', () => {
    for (const [x, y] of [
      [3, 4],
      [3, 5],
      [0, 0],
    ]) {
      const nb = neighborCells('hex', x, y);
      expect(nb).toHaveLength(6);
      for (const [nx, ny] of nb) expect(neighborCells('hex', nx, ny)).toContainEqual([x, y]);
    }
  });

  it('connects the winding loop as a single ring', () => {
    const b = hexBoard();
    expect(b.edges).toHaveLength(b.squares.length);
    expect(validateBoard(b).errors).toEqual([]);
  });

  it('keeps the layout through the file format, and old files load as square', () => {
    const file = JSON.parse(JSON.stringify(boardToFile(hexBoard())));
    expect(boardFromFile(file, 'x').board!.layout).toBe('hex');
    delete file.layout;
    expect(boardFromFile(file, 'x').board!.layout).toBe('square');
  });

  it('rejects square-style links on a hex board that are not neighbors', () => {
    const b = hexBoard();
    // (x, y) and (x + 1, y + 1) are neighbors on an odd row but not on an even row.
    b.squares.push({ x: 0, y: 0, t: 'arcade' }, { x: 1, y: 1, t: 'arcade' });
    b.edges = [...b.edges, [b.squares.length - 2, b.squares.length - 1]];
    expect(validateBoard(b).errors.join(' ')).toMatch(/not next to each other/);
  });

  it('plays CPU games to the end on a hex board', async () => {
    const b = hexBoard();
    for (let i = 0; i < 30; i++) {
      const r = await simulate(i % 2 ? 'easy' : 'standard', i + 1, 4000, 0, b);
      expect(r.winner).toBeGreaterThanOrEqual(0);
    }
  });
});
