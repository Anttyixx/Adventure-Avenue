import { cpuDecide } from './cpu';
import { Game, type GameIO } from './engine';
import { newGame } from './setup';
import type { BoardDef, GameState, MatchOptions, RuleSet } from './types';

/** An IO where every seat is answered by the CPU rules and events are dropped. */
export function cpuIO(getState: () => GameState): GameIO {
  return {
    decide: async (req) => cpuDecide(getState(), req),
    emit: () => {},
  };
}

export function cpuSeats(n = 4): MatchOptions['seats'] {
  return Array.from({ length: n }, (_, i) => ({
    name: `CPU ${i + 1}`,
    cpu: true,
    ch: `cpu${i}`,
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
): Promise<SimResult> {
  const G = newGame({ rules, target, roundCap, seats: cpuSeats(players), seed, board });
  const game = new Game(
    G,
    cpuIO(() => G),
  );
  let turns = 0;
  while (!G.over) {
    await game.playTurn();
    if (++turns > 4000) throw new Error(`Match with seed ${seed} did not finish`);
  }
  return {
    rounds: G.round,
    winner: G.winner,
    winnerLevel: G.players[G.winner].level,
    reason: G.endReason,
  };
}
