import { cpuDecide } from '../src/cpu';
import type { DecisionKind, DecisionRequest } from '../src/decisions';
import { Game } from '../src/engine';
import type { GameEvent } from '../src/events';
import { cpuSeats } from '../src/headless';
import { fromMap } from '../src/boards/maps';
import { newGame } from '../src/setup';
import type { GameState, RuleSet } from '../src/types';

/**
 * The original 44-square Town (12 x 7, 28 properties, 5 vacant plots marked a-h), kept as a
 * fixed board for rules tests so they do not depend on the shipped boards.
 */
export const TEST_TOWN = fromMap({
  id: 'test-town',
  name: 'Test Town',
  layout: 'square',
  districts: [
    { name: 'Brick Row', color: '#ff4d4d', base: 160 },
    { name: 'Bay Market', color: '#2f9bff', base: 200 },
    { name: 'Greenway', color: '#2ecc71', base: 240 },
    { name: 'Gold Street', color: '#ffc21a', base: 280 },
    { name: 'Lilac Lane', color: '#9b5cff', base: 180 },
    { name: 'Tide Walk', color: '#13c4b4', base: 220 },
    { name: 'Plaza', color: '#ff4fa8', base: 320 },
  ],
  map: [
    'S0a0VR1b11VH',
    '0..........2',
    'R..........2',
    'V55A66B66ONT',
    'f..........2',
    '5..........2',
    'CM44e4K3d33D',
  ],
});

export type Answerer = (req: DecisionRequest) => unknown;

/** A game whose decisions go to `answer` first (return undefined to fall back to the CPU). */
export function makeGame(rules: RuleSet = 'standard', answer: Answerer = () => undefined, seed = 7) {
  const G: GameState = newGame({
    rules,
    target: 5000,
    roundCap: 0,
    seats: cpuSeats(4),
    seed,
    board: TEST_TOWN,
    plots: 'none',
  });
  // The map's own prices, without the near-bank discount, so rule tests use round numbers.
  TEST_TOWN.squares.forEach((s, i) => {
    G.nodes[i].base = s.base ?? 0;
    G.nodes[i].value = s.base ?? 0;
  });
  // Standard rules: exactly the squares the map marks become vacant plots.
  if (rules === 'standard')
    TEST_TOWN.squares.forEach((s, i) => {
      if (!s.plot) return;
      G.nodes[i].t = 'plot';
      G.nodes[i].value = 0;
    });
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
