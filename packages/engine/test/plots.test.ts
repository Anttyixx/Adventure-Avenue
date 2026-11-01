import { describe, expect, it } from 'vitest';
import { BUILT_IN_BOARDS } from '../src/boards/builtin';
import { validateBoard } from '../src/boards/format';
import { K } from '../src/constants';
import { cpuSeats } from '../src/headless';
import { buildingAvailable } from '../src/rules';
import { newGame } from '../src/setup';
import type { PlotSetting } from '../src/types';
import { makeGame } from './helpers';

const game = (plots: PlotSetting, boardId = 'town', seed = 3) =>
  newGame({ rules: 'standard', target: 5000, roundCap: 0, seats: cpuSeats(4), seed, boardId, plots });
const plotCount = (plots: PlotSetting, boardId?: string) =>
  game(plots, boardId).nodes.filter((s) => s.t === 'plot').length;

describe('vacant plot setting', () => {
  it.each(['none', 'few', 'some', 'lot', 'all'] as PlotSetting[])(
    '%s selects the exact count in every district on every built-in board',
    (setting) => {
      for (const board of BUILT_IN_BOARDS) {
        const G = game(setting, board.id);
        for (let d = 0; d < G.districts.length; d++) {
          const properties = G.nodes.filter((s) => s.d === d && (s.t === 'shop' || s.t === 'plot'));
          expect(properties).toHaveLength(4);
          expect(
            properties.filter((s) => s.t === 'plot'),
            `${board.name}, district ${d}`,
          ).toHaveLength(K.plotsPerDistrict[setting]);
          expect(properties.filter((s) => s.t === 'shop')).toHaveLength(4 - K.plotsPerDistrict[setting]);
        }
      }
      expect(plotCount(setting)).toBe(8 * K.plotsPerDistrict[setting]);
    },
  );

  it('uses seeded random selection, with no preference for legacy board plot hints', () => {
    const board = BUILT_IN_BOARDS[0];
    const withHints = { ...board, squares: board.squares.map((s, i) => ({ ...s, plot: i % 2 === 0 })) };
    const start = (b: typeof board, seed: number) =>
      newGame({
        rules: 'standard',
        target: 5000,
        roundCap: 0,
        seats: cpuSeats(4),
        seed,
        board: b,
        plots: 'some',
      });
    expect(start(board, 3)).toEqual(start(withHints, 3));
    const choices = new Set(
      Array.from({ length: 12 }, (_, i) =>
        JSON.stringify(
          start(board, i + 1)
            .nodes.filter((s) => s.t === 'plot')
            .map((s) => s.id),
        ),
      ),
    );
    expect(choices.size).toBeGreaterThan(1);
  });

  it('easy rules have no plots whatever the setting', () => {
    const G = newGame({ rules: 'easy', target: 5000, roundCap: 0, seats: cpuSeats(4), plots: 'all' });
    expect(G.nodes.some((s) => s.t === 'plot')).toBe(false);
  });

  it('allows 3 of each building unless every property is a plot', () => {
    const G = game('lot');
    const plots = G.nodes.filter((s) => s.t === 'plot');
    plots.slice(0, 3).forEach((s) => (s.b = 'tax'));
    expect(buildingAvailable(G, 'tax')).toBe(false);
    expect(buildingAvailable(G, 'tax', plots[0].id)).toBe(true);
    expect(buildingAvailable(G, 'home')).toBe(true);
    G.plots = 'all';
    expect(buildingAvailable(G, 'tax')).toBe(true);
  });

  it('only offers buildings under the limit on a vacant plot', async () => {
    const { G, game: g, asked } = makeGame('standard', (req) => (req.kind === 'build' ? null : undefined));
    G.plots = 'some';
    const plots = G.nodes.filter((s) => s.t === 'plot');
    plots.slice(1, 4).forEach((s) => ((s.b = 'circus'), (s.owner = 2)));
    await g.landPlot(G.players[0], plots[0]);
    const req = asked.find((r) => r.kind === 'build');
    expect(req && 'options' in req && req.options.map((o) => o.b)).not.toContain('circus');
  });
});

describe('warps', () => {
  it('every built-in board is valid, and warp boards reach their islands only by warp', () => {
    for (const b of BUILT_IN_BOARDS) expect(validateBoard(b).errors, b.name).toEqual([]);
    const sky = BUILT_IN_BOARDS.find((b) => b.id === 'sky-islands')!;
    expect(sky.squares.filter((s) => s.t === 'warp').every((s) => s.link! >= 0)).toBe(true);
    const cut = { ...sky, squares: sky.squares.map((s) => (s.t === 'warp' ? { ...s, link: undefined } : s)) };
    expect(validateBoard(cut).errors.join(' ')).toMatch(/warp|reachable/i);
  });

  it('landing on a warp moves the player to its linked square', async () => {
    const G = game('none', 'lagoon');
    const { Game } = await import('../src/engine');
    const g = new Game(G, { decide: async () => null as never, emit: () => {} });
    const from = G.nodes.find((s) => s.t === 'warp' && s.x === 6 && s.y === 3)!;
    const p = G.players[0];
    p.node = from.id;
    await g.land(p, from);
    expect(G.nodes[p.node]).toMatchObject({ x: 3, y: 4, t: 'warp' });
  });
});
