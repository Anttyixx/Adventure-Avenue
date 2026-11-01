import { describe, expect, it } from 'vitest';
import { K } from '../src/constants';
import { newGame } from '../src/setup';
import { districtStartingValues } from '../src/property-values';
import { autoEdges, boardFromFile, boardToFile, validateBoard } from '../src/boards/format';
import type { BoardDef } from '../src/types';

function fixture(): BoardDef {
  const squares: BoardDef['squares'] = Array.from({ length: 13 }, (_, i) => ({
    x: i,
    y: 0,
    t: i === 0 ? 'bank' : [1, 2, 3, 4, 6, 7, 8, 9].includes(i) ? 'shop' : 'venture',
    ...([1, 2, 3, 4, 6, 7, 8, 9].includes(i) ? { d: i < 5 ? 0 : 1 } : {}),
  }));
  return {
    id: 'district-test',
    name: 'District test',
    layout: 'square',
    cols: 16,
    rows: 4,
    squares,
    edges: autoEdges(squares),
    bank: 0,
    districts: [
      { name: 'Near', color: '#ff0000' },
      { name: 'Far', color: '#00ff00' },
    ],
  };
}
function start(board: BoardDef) {
  return newGame({
    board,
    rules: 'standard',
    target: 10000,
    roundCap: 0,
    plots: 'none',
    seats: [{ name: 'Test', cpu: true, ch: 'farmer' }],
    seed: 7,
  });
}

describe('district starting averages', () => {
  it('uses distance-based defaults and gives four properties the exact average twice and +/-30G', () => {
    const board = fixture(),
      before = structuredClone(board);
    const pricing = districtStartingValues(board);
    expect(pricing.defaults).toEqual([100, 500]);
    expect(pricing.values.slice(1, 5)).toEqual([70, 100, 100, 130]);
    expect(pricing.values.slice(6, 10)).toEqual([470, 500, 500, 530]);
    const G = start(board);
    expect(G.nodes.map((s) => s.base)).toEqual(pricing.values);
    expect(G.nodes.every((s) => s.value === s.base)).toBe(true);
    expect(start(board)).toEqual(G);
    expect(board).toEqual(before);
  });
  it('uses an exact custom district average and Reset restores the independent distance default', () => {
    const board = fixture();
    board.districts[0].startingValue = 300;
    expect(districtStartingValues(board).values.slice(1, 5)).toEqual([270, 300, 300, 330]);
    expect(districtStartingValues(board).defaults).toEqual([100, 500]);
    delete board.districts[0].startingValue;
    expect(districtStartingValues(board).averages).toEqual([100, 500]);
  });
  it('ranks properties by walking distance, even when the farthest is geometrically closer', () => {
    const board = fixture();
    const cells = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [3, 1],
      [3, 2],
      [2, 2],
      [1, 2],
      [0, 2],
    ];
    board.squares = cells.map(([x, y], i) => ({
      x,
      y,
      t: i === 0 ? 'bank' : [1, 4, 5, 8].includes(i) ? 'shop' : 'venture',
      ...([1, 4, 5, 8].includes(i) ? { d: 0 } : {}),
    }));
    board.edges = autoEdges(board.squares);
    board.districts = board.districts.slice(0, 1);
    const prices = districtStartingValues(board).values;
    expect(prices[1]).toBe(70);
    expect(prices[4]).toBe(100);
    expect(prices[5]).toBe(100);
    expect(prices[8]).toBe(130);
  });
  it('uses warp shortcuts when ranking the nearest and farthest properties', () => {
    const board = fixture();
    board.squares[1] = { x: 1, y: 0, t: 'warp', link: 11 };
    board.squares[11] = { x: 11, y: 0, t: 'warp', link: 1 };
    const pricing = districtStartingValues(board);
    expect(pricing.values[9]).toBe(pricing.averages[1] - K.districtProperty.spread);
    expect(pricing.values[7]).toBe(pricing.averages[1] + K.districtProperty.spread);
  });
  it('handles incomplete boards and tied distances deterministically, keeping the district average', () => {
    const board = fixture();
    board.edges = [];
    const pricing = districtStartingValues(board);
    expect(pricing.defaults).toEqual([100, 100]);
    expect(pricing.values.slice(1, 5)).toEqual([70, 100, 100, 130]);
    board.squares = board.squares.slice(0, 2);
    board.edges = [[0, 1]];
    expect(districtStartingValues(board).values[1]).toBe(100);
  });
  it('round-trips district overrides, supports legacy per-tile fields and validates average limits', () => {
    const board = fixture();
    board.districts[1].startingValue = 450;
    board.squares[1].base = 1234;
    board.squares[2].autoBase = true;
    const imported = boardFromFile(JSON.parse(JSON.stringify(boardToFile(board))), 'imported').board!;
    expect(imported.districts[1].startingValue).toBe(450);
    expect(districtStartingValues(imported).values).toEqual(districtStartingValues(board).values);
    expect(
      validateBoard(imported).errors.filter((e) => e.includes('value') || e.includes('average')),
    ).toEqual([]);
    imported.districts[1].startingValue = 10;
    expect(validateBoard(imported).errors.some((e) => e.includes('starting average'))).toBe(true);
    imported.districts[1].startingValue = 1970;
    expect(Math.max(...districtStartingValues(imported).values)).toBe(2000);
  });
});
