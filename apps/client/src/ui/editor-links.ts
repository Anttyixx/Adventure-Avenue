import { connectTransports, type BoardDef } from '@aa/engine';

/** Re-pair two transport tiles, swapping their previous partners without exceeding color limits. */
export function linkEditorTiles(board: BoardDef, source: number, target: number): boolean {
  const from = board.squares[source],
    to = board.squares[target];
  if (!from || !to || from === to || (from.t !== 'warp' && from.t !== 'portal')) return false;
  if (from.t === 'portal' && to.t === 'bank') {
    from.toBank = true;
  } else {
    if (from.t !== to.t || from.channel == null || to.channel == null) return false;
    if (from.channel !== to.channel) {
      const previous = board.squares.find((s) => s !== from && s.t === from.t && s.channel === from.channel);
      const displaced = board.squares.find((s) => s !== to && s.t === to.t && s.channel === to.channel);
      if (displaced) displaced.channel = from.channel;
      from.channel = to.channel;
      // The previous and displaced partners now occupy the old pair slot.
      if (previous && displaced && from.t === 'warp') previous.toBank = displaced.toBank = false;
    }
    from.toBank = to.toBank = false;
  }
  connectTransports(board);
  return true;
}
