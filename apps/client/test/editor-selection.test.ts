import { describe, expect, it } from 'vitest';
import { autoEdges, areNeighbors, edgeKey, type BoardDef } from '@aa/engine';
import { moveSelection, selectionPositions } from '../src/ui/editor-selection';

function fixture(layout: 'square' | 'hex' = 'square'): BoardDef {
  const squares: BoardDef['squares'] = [
    { x: 2, y: 2, t: 'bank' },
    { x: 3, y: 2, t: 'shop', base: 350, d: 0, plot: true },
    { x: 4, y: 2, t: 'heart' },
    { x: 3, y: 3, t: 'warp', link: 4 },
    { x: 8, y: 8, t: 'warp', link: 3 },
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

describe('board editor group movement', () => {
  it('replaces occupied destinations, including overlapping source cells, and keeps properties', () => {
    const board = fixture();
    const before = structuredClone(board);
    const result = moveSelection(board, new Set([0, 1]), board.squares[0], { x: 3, y: 2 }, new Set())!;
    expect(result.board.squares).toHaveLength(4);
    expect(result.board.squares.slice(0, 2)).toEqual([
      { x: 3, y: 2, t: 'bank' },
      { x: 4, y: 2, t: 'shop', base: 350, d: 0, plot: true },
    ]);
    expect(result.selection).toEqual(new Set([0, 1]));
    expect(result.board.squares.find((s) => s.t === 'heart')).toBeUndefined();
    expect(result.board.squares[2].link).toBe(3);
    expect(result.board.squares[3].link).toBe(2);
    expect(board).toEqual(before);
  });
  it('keeps moved cut links, and discards cuts belonging to overwritten tiles', () => {
    const board = fixture();
    const cuts = new Set([
      edgeKey(board.squares[0], board.squares[1]),
      edgeKey(board.squares[1], board.squares[2]),
    ]);
    const result = moveSelection(board, new Set([0, 1]), board.squares[0], { x: 3, y: 2 }, cuts)!;
    expect(result.cuts).toEqual(new Set([edgeKey(result.board.squares[0], result.board.squares[1])]));
    expect(result.board.edges).not.toContainEqual([0, 1]);
    expect(cuts.size).toBe(2);
  });
  it('remaps bank and surviving warp indices after replacing earlier tiles', () => {
    const board = fixture();
    const result = moveSelection(board, new Set([3]), board.squares[3], board.squares[0], new Set())!;
    expect(result.board.bank).toBe(-1);
    const warps = result.board.squares.filter((s) => s.t === 'warp');
    expect(warps[0].link).toBe(3);
    expect(warps[1].link).toBe(2);
  });
  it('refuses placement if any part of the group lies outside the grid', () => {
    const board = fixture();
    expect(moveSelection(board, new Set([0, 1]), board.squares[0], { x: 31, y: 2 }, new Set())).toBeNull();
    expect(moveSelection(board, new Set([0, 1]), board.squares[1], { x: 0, y: 0 }, new Set())).toBeNull();
  });
  for (const target of [
    { x: 5, y: 5 },
    { x: 6, y: 6 },
  ])
    it(`preserves hex group shape and adjacency when moving to row ${target.y}`, () => {
      const board = fixture('hex');
      const selection = new Set([0, 1, 3]);
      const cells = selectionPositions(board, selection, board.squares[0], target);
      for (const a of selection)
        for (const b of selection) {
          expect(areNeighbors('hex', cells.get(a)!, cells.get(b)!)).toBe(
            areNeighbors('hex', board.squares[a], board.squares[b]),
          );
        }
      expect(cells.get(0)).toEqual(target);
      const result = moveSelection(board, selection, board.squares[0], target, new Set())!;
      expect(result.selection.size).toBe(3);
    });
});
