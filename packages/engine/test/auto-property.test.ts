import { describe, expect, it } from 'vitest';
import { K } from '../src/constants';
import { newGame } from '../src/setup';
import { autoEdges, boardFromFile, boardToFile, validateBoard } from '../src/boards/format';
import type { BoardDef } from '../src/types';

function fixture(): BoardDef {
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
  const squares: BoardDef['squares'] = cells.map(([x, y], i) =>
    i === 0
      ? { x, y, t: 'bank' }
      : [1, 4, 8].includes(i)
        ? { x, y, t: 'shop', d: 0, autoBase: true }
        : { x, y, t: 'venture' },
  );
  return {
    id: 'auto-test',
    name: 'Auto test',
    layout: 'square',
    cols: 6,
    rows: 5,
    squares,
    edges: autoEdges(squares),
    bank: 0,
    districts: [{ name: 'Shops', color: '#ff0000' }],
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

describe('automatic starting property values', () => {
  it('uses shortest walking distance rather than straight-line distance and rounds in steps', () => {
    const board = fixture();
    const before = structuredClone(board);
    const G = start(board);
    expect(G.nodes[1].base).toBe(K.autoProperty.min);
    expect(G.nodes[4].base).toBe(270);
    expect(G.nodes[8].base).toBe(K.autoProperty.max);
    expect(G.nodes.filter((s) => s.t === 'shop').every((s) => s.base === s.value)).toBe(true);
    expect(start(board)).toEqual(G);
    expect(board).toEqual(before);
  });
  it('retains fixed starting values and keeps older boards unchanged', () => {
    const board = fixture();
    board.squares[4] = { ...board.squares[4], autoBase: false, base: 350 };
    expect(start(board).nodes[4].base).toBe(350);
    for (const sq of board.squares)
      if (sq.t === 'shop') {
        delete sq.autoBase;
        sq.base = 200;
      }
    expect(
      start(board)
        .nodes.filter((s) => s.t === 'shop')
        .map((s) => s.base),
    ).toEqual([200, 200, 200]);
  });
  it('counts warp shortcuts in the walk used for pricing', () => {
    const board = fixture();
    board.squares[1] = { x: 1, y: 0, t: 'warp', link: 7 };
    board.squares[7] = { x: 1, y: 2, t: 'warp', link: 1 };
    const G = start(board);
    expect(G.nodes[8].base).toBeLessThan(G.nodes[4].base);
  });
  it('uses a finite minimum on incomplete or equal-distance editing previews', () => {
    const board = fixture();
    board.edges = [];
    expect(
      start(board)
        .nodes.filter((s) => s.t === 'shop')
        .map((s) => s.base),
    ).toEqual([100, 100, 100]);
  });
  it('round-trips Auto through board exports and accepts it without a fixed value', () => {
    const board = fixture();
    const imported = boardFromFile(JSON.parse(JSON.stringify(boardToFile(board))), 'imported').board!;
    expect(imported.squares[1].autoBase).toBe(true);
    expect(validateBoard(imported).errors.filter((e) => e.includes('needs a value'))).toEqual([]);
    expect(start(imported).nodes.map((s) => s.base)).toEqual(start(board).nodes.map((s) => s.base));
    delete imported.squares[1].autoBase;
    expect(validateBoard(imported).errors.some((e) => e.includes('needs a value'))).toBe(true);
  });
});
