import { describe, expect, it } from 'vitest';
import { autoEdges, areNeighbors, type BoardDef } from '@aa/engine';
import {
  moveSelection,
  selectionPositions,
  selectionAnchor,
  ensureEditorBank,
} from '../src/ui/editor-selection';

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
    const result = moveSelection(board, new Set([0, 1]), board.squares[0], { x: 3, y: 2 })!;
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
  it('always connects neighboring tiles after a move, even if the source had a cut', () => {
    const board = fixture();
    board.edges = [];
    const result = moveSelection(board, new Set([0, 1]), board.squares[0], { x: 3, y: 2 })!;
    expect(result.board.edges).toContainEqual([0, 1]);
  });
  it('anchors a group in its middle rather than at the first tile', () => {
    const board = fixture();
    expect(selectionAnchor(board, new Set([0, 1, 2]))).toEqual({ x: 3, y: 2 });
  });
  it('refuses a move onto an unselected bank', () => {
    const board = fixture();
    expect(moveSelection(board, new Set([3]), board.squares[3], board.squares[0])).toBeNull();
  });
  it('allows the bank to move and remaps surviving warp indices when other tiles are replaced', () => {
    const board = fixture();
    const bankMove = moveSelection(board, new Set([0]), board.squares[0], { x: 9, y: 9 })!;
    expect(bankMove.board.squares.filter((s) => s.t === 'bank')).toEqual([{ x: 9, y: 9, t: 'bank' }]);
    const result = moveSelection(board, new Set([3]), board.squares[3], board.squares[1])!;
    expect(result.board.bank).toBe(0);
    const warps = result.board.squares.filter((s) => s.t === 'warp');
    expect(warps[0].link).toBe(3);
    expect(warps[1].link).toBe(2);
  });
  it('seeds a missing bank without replacing an existing tile, and repairs duplicate banks', () => {
    const board = { ...fixture(), squares: fixture().squares.filter((s) => s.t !== 'bank') };
    const before = structuredClone(board);
    const result = ensureEditorBank(board);
    expect(result.squares).toHaveLength(board.squares.length + 1);
    expect(result.squares[result.bank].t).toBe('bank');
    expect(board).toEqual(before);
    result.squares.push({ x: 0, y: 0, t: 'bank' });
    expect(ensureEditorBank(result).squares.filter((s) => s.t === 'bank')).toHaveLength(1);
  });
  it('refuses placement if any part of the group lies outside the grid', () => {
    const board = fixture();
    expect(moveSelection(board, new Set([0, 1]), board.squares[0], { x: 31, y: 2 })).toBeNull();
    expect(moveSelection(board, new Set([0, 1]), board.squares[1], { x: 0, y: 0 })).toBeNull();
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
      const result = moveSelection(board, selection, board.squares[0], target)!;
      expect(result.selection.size).toBe(3);
    });
});
