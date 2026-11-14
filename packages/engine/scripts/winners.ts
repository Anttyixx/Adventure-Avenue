/**
 * What winners do differently: plays CPU matches and compares the winner's game with the others'
 * (income by source, spending, holdings at the end). Helps decide which parts of the game a CPU
 * should push hardest.  npm run tournament:winners -- [matches] [level]
 */
import { BUILT_IN_BOARDS } from '../src/boards/builtin';
import { cpuSeats, playMatch } from '../src/headless';
import { netWorth, ownedSquares, propertyValue, stockValue } from '../src/rules';
import type { CpuLevel, Player } from '../src/types';
import { cpuStyleName } from '../src/cpu';

const n = Number(process.argv[2] ?? 400);
const level = (process.argv[3] ?? 'master') as CpuLevel;

const keys = [
  'salary',
  'feesEarned',
  'dividends',
  'commission',
  'feesPaid',
  'invested',
  'stockBought',
  'stockSold',
  'shopsBought',
  'level',
  'props',
  'propValue',
  'stockValue',
  'cash',
  'worth',
] as const;
type Key = (typeof keys)[number];
const val = (G: Parameters<typeof netWorth>[0], p: Player, k: Key): number => {
  switch (k) {
    case 'level':
      return p.level;
    case 'props':
      return ownedSquares(G, p.id).length;
    case 'propValue':
      return propertyValue(G, p);
    case 'stockValue':
      return stockValue(G, p);
    case 'cash':
      return p.cash;
    case 'worth':
      return netWorth(G, p);
    default:
      return (p.stats as unknown as Record<string, number>)[k] ?? 0;
  }
};

/** Wins and seats per style word ("Bold", "investor"...). */
const styles = new Map<string, [number, number]>();
const win = Object.fromEntries(keys.map((k) => [k, 0])) as Record<Key, number>;
const lose = { ...win };
let rounds = 0;
for (let i = 0; i < n; i++) {
  const { G } = await playMatch({
    rules: 'standard',
    target: 10000,
    roundCap: 0,
    seats: cpuSeats(4, [level, level, level, level]),
    seed: 5000 + i,
    board: BUILT_IN_BOARDS[i % BUILT_IN_BOARDS.length],
    stocks: 'dynamic',
  } as Parameters<typeof playMatch>[0]);
  rounds += G.round;
  for (const p of G.players) {
    for (const word of cpuStyleName(p.style).split(' ')) {
      const t = styles.get(word) ?? [0, 0];
      styles.set(word, [t[0] + (p.id === G.winner ? 1 : 0), t[1] + 1]);
    }
    const into = p.id === G.winner ? win : lose;
    const w = p.id === G.winner ? 1 : 1 / 3;
    for (const k of keys) into[k] += val(G, p, k) * w;
  }
}
console.log(
  `${n} matches of four ${level} CPUs, avg ${(rounds / n).toFixed(1)} rounds. Per player, at the end:`,
);
console.log('  stat           winner   others   ratio');
for (const k of keys) {
  const a = win[k] / n;
  const b = lose[k] / n;
  console.log(
    `  ${k.padEnd(13)} ${a.toFixed(0).padStart(7)}  ${b.toFixed(0).padStart(7)}   ${(a / Math.max(1, b)).toFixed(2)}`,
  );
}
console.log('\n  style word     win%   (25% = average)');
for (const [word, [w, seats]] of [...styles].sort((a, b) => b[1][0] / b[1][1] - a[1][0] / a[1][1]))
  console.log(`  ${word.padEnd(13)} ${((100 * w) / seats).toFixed(1).padStart(5)}   (${seats} seats)`);
