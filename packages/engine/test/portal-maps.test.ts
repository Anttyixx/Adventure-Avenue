import { describe, expect, it } from 'vitest';
import { CROSSGATE_GARDENS, PRISM_JUNCTION, RETURN_RIDGE } from '../src/boards/portal-maps';
import { fromMap } from '../src/boards/maps';
import { boardFromFile, boardToFile, validateBoard } from '../src/boards/format';
import { Game } from '../src/engine';
import { cpuIO, cpuSeats, simulate } from '../src/headless';
import { newGame } from '../src/setup';

for (const board of [CROSSGATE_GARDENS, PRISM_JUNCTION, RETURN_RIDGE])
  describe(board.name, () => {
    const state = () =>
      newGame({
        rules: 'standard',
        target: 10000,
        roundCap: 0,
        seats: cpuSeats(),
        seed: 42,
        board,
        plots: 'none',
      });

    it('keeps every district together with a relief stop between every property', () => {
      expect(validateBoard(board).issues).toEqual([]);
      const G = state();
      for (const s of G.nodes.filter((s) => s.t === 'shop'))
        expect(s.nb.every((i) => G.nodes[i].t !== 'shop')).toBe(true);
      for (let d = 0; d < G.districts.length; d++) {
        const shops = G.nodes.filter((s) => s.t === 'shop' && s.d === d);
        expect(shops).toHaveLength(4);
        for (const from of shops) {
          const dist = new Map([[from.id, 0]]),
            queue = [from.id];
          for (const id of queue)
            for (const next of G.nodes[id].nb) {
              const n = G.nodes[next];
              if (dist.has(next) || n.t === 'portal' || (n.t === 'shop' && n.d !== d)) continue;
              dist.set(next, dist.get(id)! + 1);
              queue.push(next);
            }
          for (const to of shops) expect(dist.get(to.id)).toBeLessThanOrEqual(6);
        }
      }
    });

    it('makes each portal a substantial shortcut, with reciprocal links surviving export', () => {
      const G = state();
      const portals = G.nodes.filter((s) => s.t === 'portal');
      expect(portals).toHaveLength(8);
      for (const portal of portals) {
        expect(G.nodes[portal.link!].link).toBe(portal.id);
        const dist = new Map([[portal.id, 0]]),
          queue = [portal.id];
        for (const id of queue)
          for (const next of G.nodes[id].nb)
            if (!dist.has(next)) {
              dist.set(next, dist.get(id)! + 1);
              queue.push(next);
            }
        expect(dist.get(portal.link!)).toBeGreaterThanOrEqual(8);
        expect(dist.size).toBe(G.nodes.length); // Roads remain connected independently of the gimmick.
      }
      const restored = boardFromFile(JSON.parse(JSON.stringify(boardToFile(board))), 'copy').board!;
      expect(validateBoard(restored).errors).toEqual([]);
      expect(restored.squares.filter((s) => s.t === 'portal')).toEqual(
        board.squares.filter((s) => s.t === 'portal'),
      );
    });

    it('can visit every tile and return to the bank under automatic portal/no-turn-back rules', () => {
      const G = state();
      const key = (node: number, prev: number) => `${node}:${prev}`;
      const states: [number, number][] = [[board.bank, -1]];
      const seen = new Set([key(board.bank, -1)]),
        visited = new Set([board.bank]);
      const reverse = new Map<string, string[]>();
      for (const [node, prev] of states) {
        let nexts = G.nodes[node].nb.filter((i) => i !== prev);
        if (!nexts.length) nexts = G.nodes[node].nb;
        for (const next of nexts) {
          const s = G.nodes[next],
            target = s.t === 'portal' ? s.link! : next;
          const previous = s.t === 'portal' ? -1 : node;
          const k = key(target, previous);
          visited.add(next);
          visited.add(target);
          reverse.set(k, [...(reverse.get(k) ?? []), key(node, prev)]);
          if (!seen.has(k)) {
            seen.add(k);
            states.push([target, previous]);
          }
        }
      }
      expect(visited.size).toBe(G.nodes.length);
      const home = states.filter(([id]) => id === board.bank).map(([id, prev]) => key(id, prev));
      const returns = new Set(home);
      for (const k of home)
        for (const previous of reverse.get(k) ?? [])
          if (!returns.has(previous)) {
            returns.add(previous);
            home.push(previous);
          }
      expect(returns.size).toBe(seen.size);
    });

    it('offers routes that continue walking after a portal jump', () => {
      const G = state(),
        game = new Game(
          G,
          cpuIO(() => G),
        ),
        p = G.players[0];
      for (const portal of G.nodes.filter((s) => s.t === 'portal')) {
        p.node = portal.nb[0];
        p.prev = -1;
        expect(
          game
            .destinations(p, 2)
            .some((r) => r.path[0] === portal.id && r.path[1] === portal.link && r.path.length === 3),
        ).toBe(true);
      }
    });

    it('finishes matches at the default goal with 2–5 players and both rule sets', async () => {
      for (const players of [2, 3, 4, 5])
        for (const rules of ['standard', 'easy'] as const)
          for (let seed = 1; seed <= 5; seed++) {
            const result = await simulate(rules, seed, 10000, 0, board, players);
            expect(result.winner).toBeGreaterThanOrEqual(0);
            expect(result.rounds).toBeLessThan(500);
          }
    }, 30000);
  });

it('rejects mistyped or reused portal endpoints in authored maps', () => {
  const map = { id: 'bad', name: 'Bad pair', layout: 'square' as const, districts: [], map: ['BQQQ'] };
  expect(() =>
    fromMap({
      ...map,
      portals: [
        [
          [0, 0],
          [1, 0],
        ],
      ],
    }),
  ).toThrow(/invalid portal pair/);
  expect(() =>
    fromMap({
      ...map,
      portals: [
        [
          [1, 0],
          [2, 0],
        ],
        [
          [2, 0],
          [3, 0],
        ],
      ],
    }),
  ).toThrow(/invalid portal pair/);
});

it('has eight districts on Prism Junction and returns dead-end portals two steps before the bank', () => {
  expect(PRISM_JUNCTION.districts).toHaveLength(8);
  const G = newGame({
    rules: 'standard',
    target: 10000,
    roundCap: 0,
    seats: cpuSeats(),
    seed: 42,
    board: RETURN_RIDGE,
  });
  const bank = G.nodes.find((n) => n.t === 'bank')!;
  const distance = (start: number) => {
    const dist = new Map([[start, 0]]),
      queue = [start];
    for (const id of queue)
      for (const next of G.nodes[id].nb)
        if (!dist.has(next)) {
          dist.set(next, dist.get(id)! + 1);
          queue.push(next);
        }
    return dist.get(bank.id)!;
  };
  const ends = G.nodes.filter((n) => n.nb.length === 1 && distance(n.id) > 3);
  expect(ends).toHaveLength(4);
  for (const end of ends) {
    expect(end.t).toBe('portal');
    expect(distance(end.link!)).toBe(2);
  }
});
