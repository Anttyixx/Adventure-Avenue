import type { BoardDef } from './types';

export const TRANSPORT_COLORS = ['#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#22c55e'];
export const TRANSPORT_NAMES = ['Purple', 'Cyan', 'Orange', 'Pink', 'Green'];

/** Keep transport identities stable when tiles move or array indices change. */
export function connectTransports(board: BoardDef) {
  for (const type of ['warp', 'portal'] as const) {
    const tiles = board.squares.filter((s) => s.t === type);
    for (const s of tiles) {
      if (s.channel == null) {
        const partner = s.link == null ? null : board.squares[s.link];
        s.channel =
          partner?.t === type && partner.channel != null
            ? partner.channel
            : TRANSPORT_COLORS.findIndex(
                (_, c) => tiles.filter((t) => t !== s && t.channel === c).length < 2,
              );
        if (partner?.t === type && partner.channel == null && partner.link === board.squares.indexOf(s))
          partner.channel = s.channel;
      }
    }
    for (const s of tiles) {
      const target =
        type === 'portal' && s.toBank
          ? board.squares.find((t) => t.t === 'bank')
          : tiles.find((t) => t !== s && t.channel === s.channel);
      if (target) s.link = board.squares.indexOf(target);
      else delete s.link;
    }
  }
}
