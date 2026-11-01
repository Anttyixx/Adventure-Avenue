/** Starting prices come from district averages, ranked by walking distance to the bank. */
import { K } from './constants';
import type { BoardDef } from './types';

/** Resolve distance-based defaults and property values without changing the saved board. */
export function districtStartingValues(board: BoardDef) {
  const pricing = K.districtProperty;
  const distances = new Array<number>(board.squares.length).fill(Infinity);
  const neighbors: number[][] = board.squares.map(() => []);
  for (const [a, b] of board.edges) {
    if (!neighbors[a] || !neighbors[b]) continue;
    neighbors[a].push(b);
    neighbors[b].push(a);
  }
  for (const [i, sq] of board.squares.entries())
    if (sq.t === 'warp' && sq.link != null && neighbors[sq.link]) neighbors[i].push(sq.link);
  const queue = board.squares[board.bank] ? [board.bank] : [];
  if (queue.length) distances[board.bank] = 0;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    for (const j of neighbors[i])
      if (distances[j] === Infinity) {
        distances[j] = distances[i] + 1;
        queue.push(j);
      }
  }
  const groups = board.districts.map((_, d) =>
    board.squares.flatMap((sq, i) => (sq.t === 'shop' && sq.d === d ? [i] : [])),
  );
  const walks = groups.map((ids) => {
    const reachable = ids.filter((i) => Number.isFinite(distances[i]));
    return reachable.length ? reachable.reduce((sum, i) => sum + distances[i], 0) / reachable.length : NaN;
  });
  const known = walks.filter(Number.isFinite);
  const near = Math.min(...known);
  const far = Math.max(...known);
  const defaults = walks.map((walk) => {
    const ratio = far > near && Number.isFinite(walk) ? (walk - near) / (far - near) : 0;
    return (
      Math.round((pricing.defaultMin + ratio * (pricing.defaultMax - pricing.defaultMin)) / pricing.step) *
      pricing.step
    );
  });
  const averages = board.districts.map((d, i) =>
    Number.isFinite(d.startingValue)
      ? Math.max(pricing.minAverage, Math.min(pricing.maxAverage, d.startingValue!))
      : defaults[i],
  );
  const values: number[] = board.squares.map((sq) => (sq.t === 'shop' ? pricing.defaultMin : 0));
  for (const [d, ids] of groups.entries()) {
    const ranked = [...ids].sort((a, b) => {
      const walk = distances[a] - distances[b];
      return (
        (Number.isNaN(walk) ? 0 : walk) ||
        board.squares[a].y - board.squares[b].y ||
        board.squares[a].x - board.squares[b].x ||
        a - b
      );
    });
    for (const i of ranked) values[i] = averages[d];
    if (ranked.length > 1) {
      values[ranked[0]] -= pricing.spread;
      values[ranked[ranked.length - 1]] += pricing.spread;
    }
  }
  return { defaults, averages, values };
}
