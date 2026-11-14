import { cpuDecide } from './cpu';
import { Game, type GameIO } from './engine';
import { newGame } from './setup';
import type { BoardDef, CpuLevel, GameState, MatchOptions, RuleSet } from './types';

/** An IO where every seat is answered by the CPU rules and events are dropped. */
export function cpuIO(getState: () => GameState): GameIO {
  return {
    decide: async (req) => cpuDecide(getState(), req),
    emit: () => {},
  };
}

/** `n` CPU seats, at `levels` (one per seat; missing: normal). */
export function cpuSeats(n = 4, levels: CpuLevel[] = []): MatchOptions['seats'] {
  return Array.from({ length: n }, (_, i) => ({
    name: `CPU ${i + 1}`,
    cpu: true,
    ch: `cpu${i}`,
    level: levels[i] ?? 'normal',
  }));
}

export interface SimResult {
  rounds: number;
  winner: number;
  winnerLevel: number;
  reason: string;
}

/** Play one CPU-only match to the end. Guards against runaway matches. */
export async function simulate(
  rules: RuleSet,
  seed: number,
  target = 5000,
  roundCap = 0,
  board?: BoardDef,
  players = 4,
  levels: CpuLevel[] = [],
): Promise<SimResult> {
  const G = (await playMatch({ rules, target, roundCap, seats: cpuSeats(players, levels), seed, board })).G;
  return {
    rounds: G.round,
    winner: G.winner,
    winnerLevel: G.players[G.winner].level,
    reason: G.endReason,
  };
}

/** Play one CPU-only match to the end and return its final state. Guards against runaway matches. */
export async function playMatch(opts: MatchOptions): Promise<{ G: GameState }> {
  const G = newGame(opts);
  const seed = opts.seed;
  const game = new Game(
    G,
    cpuIO(() => G),
  );
  let turns = 0;
  while (!G.over) {
    await game.playTurn();
    if (++turns > 4000) throw new Error(`Match with seed ${seed} did not finish`);
  }
  return { G };
}
