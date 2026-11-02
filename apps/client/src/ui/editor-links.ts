import {
  connectTransports,
  freeChannel,
  isTransport,
  unlinkTransport,
  type BoardDef,
  type BoardSquareDef,
} from '@aa/engine';

/**
 * Link a warp or portal (`source`) to `target`: another tile of the same kind (they become a
 * pair, both ways, and get a free color) or the bank (one way). A tile has one link at most, so
 * any old partner of either tile is left unlinked. Returns false, changing nothing, when the
 * target can't be linked or every pair color of that kind is taken.
 */
export function linkEditorTiles(board: BoardDef, source: number, target: number): boolean {
  const from = board.squares[source],
    to = board.squares[target];
  if (!from || !to || from === to || !isTransport(from.t)) return false;
  if (to.t === 'bank') {
    unlinkTransport(board, from);
    from.toBank = true;
    connectTransports(board);
    return true;
  }
  if (to.t !== from.t) return false;
  if (from.channel != null && from.channel === to.channel) return true;
  // Colors held by the two tiles' current pairs are freed by this link.
  const partners = (sq: BoardSquareDef) =>
    sq.channel == null ? [] : board.squares.filter((s) => s.t === sq.t && s.channel === sq.channel);
  const c = freeChannel(board, from.t, [...partners(from), ...partners(to)]);
  if (c < 0) return false;
  unlinkTransport(board, from);
  unlinkTransport(board, to);
  from.channel = to.channel = c;
  connectTransports(board);
  return true;
}

/** Remove a warp's or portal's link (its partner becomes unlinked too). */
export function unlinkEditorTile(board: BoardDef, index: number) {
  const sq = board.squares[index];
  if (!sq || !isTransport(sq.t)) return false;
  unlinkTransport(board, sq);
  connectTransports(board);
  return true;
}
