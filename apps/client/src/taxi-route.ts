import type { GameState } from '@aa/engine';

/**
 * The squares a taxi passes from `from` to `to`, by road and portal link (one-way roads and
 * one-way portals respected; the shortest way), or null when there is none.
 */
export function taxiRoute(G: GameState, from: number, to: number): number[] | null {
  const back = new Map<number, number>([[from, -1]]);
  const queue = [from];
  while (queue.length) {
    const n = queue.shift()!;
    if (n === to) break;
    const sq = G.nodes[n];
    for (const m of sq.nb) {
      if (back.has(m) || sq.noGo?.includes(m)) continue;
      // An exit-only portal can't be entered.
      if (
        sq.portals?.some((p) => p.to === m && p.way === 'out') &&
        !sq.portals.some((p) => p.to === m && p.way !== 'out')
      )
        continue;
      back.set(m, n);
      queue.push(m);
    }
  }
  if (!back.has(to)) return null;
  const path: number[] = [];
  for (let n = to; n >= 0; n = back.get(n)!) path.unshift(n);
  return path;
}
