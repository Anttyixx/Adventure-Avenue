import { describe, expect, it } from 'vitest';
import { autoEdges, areNeighbors, type BoardDef } from '@aa/engine';
import { boardForPlay } from '../src/boardstore';

function board(layout: 'square' | 'hex', y = 5): BoardDef {
  const squares: BoardDef['squares'] = [
    { x: 9, y, t: 'bank' },
    { x: 10, y, t: 'warp', link: 3 },
    { x: 10, y: y + 1, t: 'shop', d: 0, base: 200 },
    { x: 13, y: y + 3, t: 'warp', link: 1 },
  ];
  return {
    id: 'test',
    name: 'Test',
    layout,
    cols: 32,
    rows: 20,
    squares,
    edges: autoEdges(squares, new Set(), layout),
    bank: 0,
    districts: [{ name: 'Shops', color: '#ff0000' }],
  };
}

describe('boards prepared for play', () => {
  it('trims all four outer margins, keeps inner gaps and leaves the saved board intact', () => {
    const original = board('square');
    const before = structuredClone(original);
    const result = boardForPlay(original);
    expect([result.cols, result.rows]).toEqual([5, 4]);
    expect(result.squares.map((s) => [s.x, s.y])).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [4, 3],
    ]);
    expect(result.edges).toEqual(original.edges);
    expect(result.squares[1].link).toBe(3);
    expect(result.squares[3].link).toBe(1);
    expect(original).toEqual(before);
  });
  for (const y of [4, 5])
    it(`preserves hex adjacency from row ${y}`, () => {
      const original = board('hex', y);
      const result = boardForPlay(original);
      original.squares.forEach((a, i) =>
        original.squares.forEach((b, j) => {
          expect(areNeighbors('hex', result.squares[i], result.squares[j])).toBe(areNeighbors('hex', a, b));
        }),
      );
      expect(Math.min(...result.squares.map((s) => s.x))).toBe(0);
      expect(Math.min(...result.squares.map((s) => s.y))).toBe(0);
      expect(boardForPlay(result)).toEqual(result);
    });
  it('handles an empty board', () => {
    const empty = { ...board('square'), squares: [], edges: [] };
    expect(boardForPlay(empty)).toEqual(empty);
  });
});
