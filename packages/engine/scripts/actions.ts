/**
 * How often CPUs use each kind of action, per match, by level (from the game log).
 *   npx tsx packages/engine/scripts/actions.ts [matches]
 */
import { BUILT_IN_BOARDS } from '../src/boards/builtin';
import { cpuSeats, playMatch } from '../src/headless';
import { CPU_LEVELS } from '../src/types';

const n = Number(process.argv[2] ?? 200);
const kinds: [string, RegExp][] = [
  ['trades offered', /accepted|declined .*'s trade/],
  ['trades accepted', /accepted .*'s trade/],
  ['auctions held', /put a property up for auction/],
  ['renovations', /renovated/],
  ['shares sold', /sold \d+ .* shares/],
  ['buyouts', /bought out/],
  ['investments', /invested/],
];
const counts = new Map<string, number>();
for (let i = 0; i < n; i++) {
  const { G } = await playMatch({
    rules: 'standard',
    target: 10000,
    roundCap: 0,
    seats: cpuSeats(4, [...CPU_LEVELS]),
    seed: 9000 + i,
    board: BUILT_IN_BOARDS[i % BUILT_IN_BOARDS.length],
    stocks: 'dynamic',
  } as Parameters<typeof playMatch>[0]);
  for (const line of G.log) {
    const who = G.players.find(
      (p) => line.text.startsWith(p.name) || line.text.includes(`${p.name}'s trade`),
    );
    for (const [k, re] of kinds) {
      if (!re.test(line.text)) continue;
      // Trades are logged by the side answering: credit the one who offered.
      const by = k.startsWith('trades')
        ? G.players.find((p) => line.text.includes(`${p.name}'s trade`))
        : who;
      if (!by) continue;
      const key = `${k}|${by.cpuLevel}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
}
console.log(`Per match (${n} matches, one CPU of each level):`);
console.log(`  ${'action'.padEnd(18)} ${CPU_LEVELS.map((l) => l.padStart(7)).join('')}`);
for (const [k] of kinds)
  console.log(
    `  ${k.padEnd(18)} ${CPU_LEVELS.map((l) => ((counts.get(`${k}|${l}`) ?? 0) / n).toFixed(2).padStart(7)).join('')}`,
  );
