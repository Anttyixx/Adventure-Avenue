/** Grid-snapped group movement shared by the editor preview and placement. */
import { autoEdges, type BoardDef } from '@aa/engine';
import { cellAt, cellCenter } from '../geometry';

type Cell = { x: number; y: number };

/** Translate in axial coordinates on hex grids so odd/even row changes preserve the group. */
export function selectionPositions(
  board: BoardDef,
  selection: ReadonlySet<number>,
  anchor: Cell,
  target: Cell,
): Map<number, Cell> {
  const hex = board.layout === 'hex';
  const q = (c: Cell) => c.x - (hex ? Math.floor(c.y / 2) : 0);
  const dx = q(target) - q(anchor);
  const dy = target.y - anchor.y;
  return new Map(
    [...selection].map((i) => {
      const sq = board.squares[i];
      const y = sq.y + dy;
      return [i, { x: q(sq) + dx + (hex ? Math.floor(y / 2) : 0), y }];
    }),
  );
}

/** Replace destination tiles in one operation, retaining moved properties and connecting all neighboring tiles. */
export function moveSelection(board: BoardDef, selection: ReadonlySet<number>, anchor: Cell, target: Cell) {
  const positions = selectionPositions(board, selection, anchor, target);
  if (
    !positions.size ||
    [...positions.values()].some((c) => c.x < 0 || c.y < 0 || c.x >= board.cols || c.y >= board.rows)
  )
    return null;
  const occupied = new Set([...positions.values()].map((c) => `${c.x},${c.y}`));
  // A group may move the bank, but other tiles must never replace it.
  if (board.squares.some((sq, i) => sq.t === 'bank' && !selection.has(i) && occupied.has(`${sq.x},${sq.y}`)))
    return null;
  const kept = board.squares
    .map((sq, i) => ({ sq, i }))
    .filter(({ sq, i }) => selection.has(i) || !occupied.has(`${sq.x},${sq.y}`));
  const ids = new Map(kept.map(({ i }, index) => [i, index]));
  const squares = kept.map(({ sq, i }) => {
    const result = { ...sq, ...(positions.get(i) ?? {}) };
    if (result.link != null) {
      const link = ids.get(result.link);
      if (link == null) delete result.link;
      else result.link = link;
    }
    return result;
  });
  return {
    board: {
      ...board,
      squares,
      edges: autoEdges(squares, new Set(), board.layout),
      bank: squares.findIndex((sq) => sq.t === 'bank'),
    },
    selection: new Set([...selection].map((i) => ids.get(i)!)),
  };
}

/** The grid cell nearest the group's center, so a move follows the pointer from the middle. */
export function selectionAnchor(board: BoardDef, selection: ReadonlySet<number>): Cell {
  const centers = [...selection].map((i) => cellCenter(board.layout, board.squares[i].x, board.squares[i].y));
  const x = (Math.min(...centers.map((c) => c.x)) + Math.max(...centers.map((c) => c.x))) / 2;
  const y = (Math.min(...centers.map((c) => c.y)) + Math.max(...centers.map((c) => c.y))) / 2;
  return cellAt(board.layout, board.cols, board.rows, x, y) ?? board.squares[[...selection][0]];
}

/** Every editing board starts with exactly one bank, repairing older incomplete boards. */
export function ensureEditorBank(board: BoardDef): BoardDef {
  const first = board.squares.findIndex((sq) => sq.t === 'bank');
  if (first >= 0)
    return {
      ...board,
      squares: board.squares.filter((sq, i) => sq.t !== 'bank' || i === first),
      bank: first,
    };
  const center = { x: Math.floor(board.cols / 2), y: Math.floor(board.rows / 2) };
  const cells = Array.from({ length: board.cols * board.rows }, (_, i) => ({
    x: i % board.cols,
    y: Math.floor(i / board.cols),
  }));
  const used = new Set(board.squares.map((sq) => `${sq.x},${sq.y}`));
  cells.sort(
    (a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y),
  );
  const cell = cells.find((c) => !used.has(`${c.x},${c.y}`));
  const squares = cell
    ? [...board.squares, { ...cell, t: 'bank' as const }]
    : board.squares.map((sq) =>
        sq.x === center.x && sq.y === center.y ? { ...center, t: 'bank' as const } : sq,
      );
  return { ...board, squares, bank: squares.findIndex((sq) => sq.t === 'bank') };
}
