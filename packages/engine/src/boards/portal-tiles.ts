import type { BoardDef, BoardSquareDef, PortalLink } from '../types';
import { neighborCells } from './format';

/**
 * Portal tiles are retired: portal links replace them (a tile side opening onto another tile's
 * side, without taking a tile space). This turns a board's portal tiles into portal links:
 *
 * - A portal at a dead end (one road in) is removed, and the portal link goes on the side of the
 *   tile that led to it, facing where it was.
 * - A portal in the middle of a road (more roads in) becomes a venture square, with the portal
 *   link on its first free side.
 *
 * Each pair keeps its link (two-way); a portal that led to the bank links to a free side of the
 * bank. Boards without portal tiles come back unchanged. Old saved games keep their portal tiles
 * (the engine still plays them); only boards are converted.
 */
export function convertPortalTiles(board: BoardDef): BoardDef {
  if (!board.squares.some((s) => s.t === 'portal')) return board;
  const b = structuredClone(board);
  const sq = b.squares;
  const cells = new Set(sq.map((s) => `${s.x},${s.y}`));
  const roads = (i: number) => b.edges.flatMap(([x, y]) => (x === i ? [y] : y === i ? [x] : []));
  const sides = (i: number) => neighborCells(b.layout, sq[i].x, sq[i].y);
  const links: PortalLink[] = [...(b.portalLinks ?? [])];
  const used = new Set(links.flatMap((l) => [`${l.a}:${l.sa}`, `${l.b}:${l.sb}`]));
  const removed = new Set<number>();
  const freeSide = (i: number) =>
    sides(i).findIndex(([x, y], side) => !cells.has(`${x},${y}`) && !used.has(`${i}:${side}`));

  /** Where a portal tile's link goes: [tile, side], or null when there's no room. */
  const gate = (p: number): [number, number] | null => {
    const n = roads(p);
    if (n.length === 1 && sq[n[0]].t !== 'portal') {
      const side = sides(n[0]).findIndex(([x, y]) => x === sq[p].x && y === sq[p].y);
      if (side >= 0 && !used.has(`${n[0]}:${side}`)) {
        removed.add(p);
        return [n[0], side];
      }
    }
    sq[p] = { x: sq[p].x, y: sq[p].y, t: 'venture' };
    const side = freeSide(p);
    return side >= 0 ? [p, side] : null;
  };

  const done = new Set<number>();
  sq.forEach((s, p) => {
    if (s.t !== 'portal' || done.has(p)) return;
    done.add(p);
    const q = s.link != null && sq[s.link] ? s.link : null;
    const pairedPortal = q != null && sq[q].t === 'portal';
    if (pairedPortal) done.add(q);
    const ga = gate(p);
    if (ga) used.add(`${ga[0]}:${ga[1]}`);
    let gb: [number, number] | null = null;
    if (q != null && pairedPortal) gb = gate(q);
    else if (q != null) {
      const side = freeSide(q);
      gb = side >= 0 ? [q, side] : null;
    }
    if (gb) used.add(`${gb[0]}:${gb[1]}`);
    if (ga && gb && ga[0] !== gb[0]) links.push({ a: ga[0], sa: ga[1], b: gb[0], sb: gb[1] });
  });

  // Drop the removed tiles and renumber everything that points at squares.
  const ids = new Map<number, number>();
  const kept: BoardSquareDef[] = [];
  sq.forEach((s, i) => {
    if (removed.has(i)) return;
    ids.set(i, kept.length);
    kept.push(s);
  });
  for (const s of kept)
    if (s.link != null) {
      if (ids.has(s.link)) s.link = ids.get(s.link);
      else delete s.link;
    }
  const pair = ([x, y]: [number, number]): [number, number][] =>
    ids.has(x) && ids.has(y) ? [[ids.get(x)!, ids.get(y)!]] : [];
  b.squares = kept;
  b.edges = b.edges.flatMap(pair);
  if (b.oneWay) b.oneWay = b.oneWay.flatMap(pair);
  if (!b.oneWay?.length) delete b.oneWay;
  const portalLinks = links.flatMap((l) =>
    ids.has(l.a) && ids.has(l.b) ? [{ ...l, a: ids.get(l.a)!, b: ids.get(l.b)! }] : [],
  );
  if (portalLinks.length) b.portalLinks = portalLinks;
  else delete b.portalLinks;
  b.bank = kept.findIndex((s) => s.t === 'bank');
  return b;
}
