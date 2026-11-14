/**
 * CPU tournaments: how the CPU levels do against each other, and what each part of a strong CPU's
 * play is worth. Used to tune `CPU_SKILL` and the `K.cpu` numbers.
 *
 *   npm run tournament -- levels [matches]        easy, normal, hard and master in every match
 *   npm run tournament -- vs <a> <b> [matches]    two of level a against two of level b
 *   npm run tournament -- ablate [matches]        master against master with one skill turned off
 *
 * Seats rotate every match so no level always goes first. Matches use the Standard rules, the
 * default goal and every built-in board in turn.
 */
import { CPU_SKILL, type CpuSkill } from '../src/cpu';
import { K } from '../src/constants';
import { BUILT_IN_BOARDS } from '../src/boards/builtin';
import { playMatch, cpuSeats } from '../src/headless';
import { netWorth, ownedSquares, stockValue } from '../src/rules';
import { CPU_LEVELS, type CpuLevel, type GameState } from '../src/types';

const [mode = 'levels', ...rest] = process.argv.slice(2);

interface Tally {
  wins: number;
  seats: number;
  worth: number;
  props: number;
  stock: number;
  invested: number;
  buyouts: number;
}
const blank = (): Tally => ({ wins: 0, seats: 0, worth: 0, props: 0, stock: 0, invested: 0, buyouts: 0 });

/** Play `n` matches with these seat levels (rotated each match); tally results per label. */
async function run(n: number, lineup: CpuLevel[], labels: string[] = lineup, target = 10000) {
  const tally = new Map<string, Tally>();
  let rounds = 0;
  for (let i = 0; i < n; i++) {
    const shift = i % lineup.length;
    const levels = lineup.map((_, k) => lineup[(k + shift) % lineup.length]);
    const names = labels.map((_, k) => labels[(k + shift) % labels.length]);
    const board = BUILT_IN_BOARDS[i % BUILT_IN_BOARDS.length];
    const { G } = await playMatch({
      rules: 'standard',
      target,
      roundCap: 0,
      seats: cpuSeats(levels.length, levels),
      seed: 1000 + i,
      board,
      stocks: 'dynamic',
    } as Parameters<typeof playMatch>[0]);
    rounds += G.round;
    record(G, names, tally);
  }
  return { tally, rounds: rounds / n };
}

function record(G: GameState, names: string[], tally: Map<string, Tally>) {
  G.players.forEach((p, k) => {
    const t = tally.get(names[k]) ?? blank();
    t.seats++;
    if (G.winner === p.id) t.wins++;
    t.worth += netWorth(G, p);
    t.props += ownedSquares(G, p.id).length;
    t.stock += stockValue(G, p);
    t.invested += p.stats.invested ?? 0;
    t.buyouts += p.stats.buyouts ?? 0;
    tally.set(names[k], t);
  });
}

function report(title: string, r: { tally: Map<string, Tally>; rounds: number }) {
  console.log(`\n${title} (avg ${r.rounds.toFixed(1)} rounds)`);
  console.log('  who                 win%   worth  props  stock  invested  buyouts');
  for (const [who, t] of [...r.tally].sort((a, b) => b[1].wins / b[1].seats - a[1].wins / a[1].seats)) {
    const avg = (x: number) => Math.round(x / t.seats);
    console.log(
      `  ${who.padEnd(18)} ${((100 * t.wins) / t.seats).toFixed(1).padStart(5)}  ${String(avg(t.worth)).padStart(6)}  ` +
        `${(t.props / t.seats).toFixed(1).padStart(5)}  ${String(avg(t.stock)).padStart(5)}  ` +
        `${String(avg(t.invested)).padStart(8)}  ${(t.buyouts / t.seats).toFixed(2).padStart(7)}`,
    );
  }
}

const n = Number(rest.at(-1) && !isNaN(Number(rest.at(-1))) ? rest.at(-1) : 400);

if (mode === 'levels') {
  report('All four levels in every match', await run(n, ['easy', 'normal', 'hard', 'master']));
} else if (mode === 'vs') {
  const [a, b] = rest as CpuLevel[];
  report(`${a} x2 vs ${b} x2`, await run(n, [a, b, a, b]));
} else if (mode === 'ablate') {
  // "hard" stands in for master with one skill turned off, two against two real masters.
  const base: CpuSkill = { ...CPU_SKILL.master };
  const hard = { ...CPU_SKILL.hard };
  const tests: [string, Partial<CpuSkill>][] = [
    ['no investing', { investChance: 0 }],
    ['simple investing', { investSmart: false }],
    ['no shares', { stockChance: 0 }],
    ['simple share picks', { stockSmart: false }],
    ['no shop values', { valuesShops: false }],
    ['fixed cushion', { dangerCushion: false, cushion: 300 }],
    ['no liquid shares', { liquidStock: 0 }],
    ['no pre-roll actions', { preRoll: false }],
    ['no trades', { tradeChance: 0 }],
    ['no blocking', { blocks: false }],
    ['simple buyouts', { buyoutSense: false }],
    ['careless paths', { pathSense: 0.15 }],
    ['30% mistakes', { mistakes: 0.3 }],
  ];
  for (const [name, off] of tests) {
    Object.assign(CPU_SKILL.hard, base, off);
    const r = await run(
      n,
      ['hard', 'master', 'hard', 'master'],
      [`master, ${name}`, 'master', `master, ${name}`, 'master'],
    );
    report(`Ablation: ${name}`, r);
  }
  Object.assign(CPU_SKILL.hard, hard);
} else if (mode === 'try') {
  // Master with some skills changed (key=value) against two real masters. K.cpu numbers can be
  // changed for everyone with K.name=value.
  const change: Record<string, number | boolean> = {};
  for (const arg of rest) {
    const m = /^(K\.)?(\w+)=(.+)$/.exec(arg);
    if (!m) continue;
    const v = m[3] === 'true' ? true : m[3] === 'false' ? false : Number(m[3]);
    if (m[1]) (K.cpu as unknown as Record<string, unknown>)[m[2]] = v;
    else change[m[2]] = v;
  }
  Object.assign(CPU_SKILL.hard, CPU_SKILL.master, change);
  const label =
    Object.entries(change)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ') || 'same';
  report(
    `Try: ${label}`,
    await run(n, ['hard', 'master', 'hard', 'master'], [label, 'master', label, 'master']),
  );
} else {
  console.log('Modes: levels | vs <a> <b> | ablate | try key=value...');
}
void CPU_LEVELS;
