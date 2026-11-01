/** Grid-snapped group movement shared by the editor preview and placement. */
import { autoEdges, edgeKey, type BoardDef } from '@aa/engine';

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

/** Replace destination tiles in one operation, retaining moved properties and surviving cut links. */
export function moveSelection(
  board: BoardDef,
  selection: ReadonlySet<number>,
  anchor: Cell,
  target: Cell,
  cuts: ReadonlySet<string>,
) {
  const positions = selectionPositions(board, selection, anchor, target);
  if (
    !positions.size ||
    [...positions.values()].some((c) => c.x < 0 || c.y < 0 || c.x >= board.cols || c.y >= board.rows)
  )
    return null;
  const occupied = new Set([...positions.values()].map((c) => `${c.x},${c.y}`));
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
  const nextCuts = new Set<string>();
  for (const [a, b] of autoEdges(squares, new Set(), board.layout)) {
    if (cuts.has(edgeKey(kept[a].sq, kept[b].sq))) nextCuts.add(edgeKey(squares[a], squares[b]));
  }
  return {
    board: {
      ...board,
      squares,
      edges: autoEdges(squares, nextCuts, board.layout),
      bank: squares.findIndex((sq) => sq.t === 'bank'),
    },
    cuts: nextCuts,
    selection: new Set([...selection].map((i) => ids.get(i)!)),
  };
}
