/**
 * CPU-only simulation: plays N matches per rule set and reports average match length.
 * Usage: npm run sim -- [matches] [target]
 */
import { simulate } from '../src/headless';
import type { RuleSet } from '../src/types';

const n = Number(process.argv[2] ?? 1000);
const target = Number(process.argv[3] ?? 5000);

for (const rules of ['standard', 'easy'] as RuleSet[]) {
  let rounds = 0;
  let levels = 0;
  const reasons: Record<string, number> = {};
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const r = await simulate(rules, i + 1, target);
    rounds += r.rounds;
    levels += r.winnerLevel;
    const key = r.reason.includes('bankrupt') ? 'bankruptcy' : r.reason;
    reasons[key] = (reasons[key] ?? 0) + 1;
  }
  console.log(
    `${rules.padEnd(8)} ${n} matches, target ${target}G: avg round ${(rounds / n).toFixed(1)}, ` +
      `avg winner level ${(levels / n).toFixed(2)}, ${Date.now() - t0}ms`,
    reasons,
  );
}
