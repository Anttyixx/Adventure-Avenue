import { cpuDecide } from '../src/cpu';
import type { DecisionKind, DecisionRequest } from '../src/decisions';
import { Game } from '../src/engine';
import type { GameEvent } from '../src/events';
import { cpuSeats } from '../src/headless';
import { newGame } from '../src/setup';
import type { GameState, RuleSet } from '../src/types';

export type Answerer = (req: DecisionRequest) => unknown;

/** A game whose decisions go to `answer` first (return undefined to fall back to the CPU). */
export function makeGame(rules: RuleSet = 'standard', answer: Answerer = () => undefined, seed = 7) {
  const G: GameState = newGame({ rules, target: 5000, roundCap: 0, seats: cpuSeats(4), seed });
  const events: GameEvent[] = [];
  const asked: DecisionRequest[] = [];
  const game = new Game(G, {
    decide: async <T extends DecisionKind>(req: DecisionRequest<T>) => {
      asked.push(req as DecisionRequest);
      const a = answer(req as DecisionRequest);
      return (a === undefined ? cpuDecide(G, req) : a) as any;
    },
    emit: (e) => {
      events.push(e);
    },
  });
  return { G, game, events, asked };
}

export const at = (G: GameState, x: number, y: number) => G.nodes.find((s) => s.x === x && s.y === y)!;
