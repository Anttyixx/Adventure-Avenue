/**
 * Warps and portals. Both link to one other tile of the same kind (a pair, both ways) or to the
 * bank (one way; any number of tiles may lead there). A warp sends players who stop on it; a
 * portal sends players who step on it, and they keep moving from where it leads.
 *
 * Builders never choose colors: a tile is grey until it is linked, a pair gets the first color
 * no other pair of its kind uses, and bank links use the bank's gold. The pair's shared color
 * (`channel`) is also how a pair is stored, so links survive tiles moving or being erased.
 */
import type { BoardDef, BoardSquareDef } from './types';

export const TRANSPORT_COLORS = ['#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#22c55e'];
/** Tiles linked to the bank. */
export const TRANSPORT_BANK_COLOR = '#f5b301';
/** Tiles not linked yet. */
export const TRANSPORT_UNLINKED_COLOR = '#9aa3b5';

export type TransportType = 'warp' | 'portal';
export const isTransport = (t: string): t is TransportType => t === 'warp' || t === 'portal';

/** The color a warp or portal is drawn in. */
export function transportColor(sq: { channel?: number; toBank?: boolean; link?: number }): string {
  if (sq.toBank) return TRANSPORT_BANK_COLOR;
  return TRANSPORT_COLORS[sq.channel ?? -1] ?? TRANSPORT_UNLINKED_COLOR;
}

/** The first pair color no other pair of this kind uses (-1 when all five are taken). */
export function freeChannel(board: BoardDef, type: TransportType, ignore: BoardSquareDef[] = []): number {
  const used = new Set(
    board.squares
      .filter((s) => s.t === type && !ignore.includes(s) && s.channel != null)
      .map((s) => s.channel),
  );
  return TRANSPORT_COLORS.findIndex((_, c) => !used.has(c));
}

/** Unlink a tile; its partner (if it had one) becomes unlinked too. */
export function unlinkTransport(board: BoardDef, sq: BoardSquareDef) {
  if (sq.channel != null)
    for (const other of board.squares)
      if (other !== sq && other.t === sq.t && other.channel === sq.channel) {
        delete other.channel;
        delete other.link;
      }
  delete sq.channel;
  delete sq.link;
  delete sq.toBank;
}

/**
 * Work out every warp's and portal's `link` (an index into `squares`) from its pair color or
 * bank flag. Call after any edit that can move tiles in the list.
 */
export function connectTransports(board: BoardDef) {
  const bank = board.squares.findIndex((s) => s.t === 'bank');
  for (const type of ['warp', 'portal'] as const) {
    const tiles = board.squares.filter((s) => s.t === type);
    // Older boards stored mutual links without a color: give those pairs one.
    for (const s of tiles) {
      if (s.channel != null || s.toBank || s.link == null) continue;
      const partner = board.squares[s.link];
      if (partner && partner !== s && partner.t === type && partner.link === board.squares.indexOf(s)) {
        const c = partner.channel ?? freeChannel(board, type);
        if (c >= 0) s.channel = partner.channel = c;
      }
    }
    for (const s of tiles) {
      if (s.toBank) {
        delete s.channel;
        if (bank >= 0) s.link = bank;
        else delete s.link;
        continue;
      }
      const pair = s.channel == null ? [] : tiles.filter((t) => !t.toBank && t.channel === s.channel);
      const partner = pair.length === 2 ? pair.find((t) => t !== s) : null;
      if (partner) s.link = board.squares.indexOf(partner);
      else {
        // A lone (or over-full) color is not a link: the tile is unlinked and grey.
        delete s.channel;
        delete s.link;
      }
    }
  }
}
