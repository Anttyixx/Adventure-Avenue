import { describe, expect, it } from 'vitest';
import { CPU_SKILL, cpuBidLimit, cpuDecide, cpuLevelName, cpuStyleName } from '../src/cpu';
import { BOARDS } from '../src/boards/builtin';
import { Game } from '../src/engine';
import { cpuSeats, playMatch } from '../src/headless';
import { newGame } from '../src/setup';
import { CPU_LEVELS, type CpuLevel, type DecisionRequest } from '../src/index';
import { makeGame } from './helpers';

const match = (seed: number, levels: CpuLevel[], rules: 'standard' | 'easy' = 'standard') =>
  newGame({
    rules,
    target: 6000,
    roundCap: 0,
    seats: cpuSeats(levels.length, levels),
    seed,
    board: BOARDS.town,
  });

describe('CPU levels and styles', () => {
  it('gives every CPU its level and a play style, the same for the same seed', () => {
    const a = match(42, ['easy', 'normal', 'hard', 'master']);
    const b = match(42, ['easy', 'normal', 'hard', 'master']);
    expect(a.players.map((p) => p.cpuLevel)).toEqual(['easy', 'normal', 'hard', 'master']);
    expect(a.players.map((p) => p.style)).toEqual(b.players.map((p) => p.style));
    for (const p of a.players) {
      for (const v of Object.values(p.style!)) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of Object.values(p.style!)) expect(v).toBeLessThan(1);
    }
    // Styles differ from CPU to CPU.
    expect(new Set(a.players.map((p) => JSON.stringify(p.style))).size).toBe(4);
  });

  it("doesn't change the game's own randomness (a style is rolled off to the side)", () => {
    const a = match(7, ['normal', 'normal']);
    const b = match(7, ['master', 'easy']);
    expect(a.rng).toBe(b.rng);
  });

  it('plays old saves without a level or style as a normal CPU', async () => {
    const G = match(3, ['hard', 'hard']);
    for (const p of G.players) {
      delete p.cpuLevel;
      delete p.style;
    }
    const game = new Game(G, { decide: async (req) => cpuDecide(G, req), emit: () => {} });
    for (let i = 0; i < 20 && !G.over; i++) await game.playTurn();
    expect(G.round).toBeGreaterThan(1);
  });

  it('names levels and styles in plain words', () => {
    expect(cpuLevelName('master')).toBe('Master');
    expect(cpuLevelName(undefined)).toBe('Normal');
    expect(cpuStyleName({ risk: 0.9, stocks: 0.9, trader: 0.1 })).toBe('Bold investor');
    expect(cpuStyleName({ risk: 0.1, stocks: 0.1, trader: 0.1 })).toBe('Careful shopkeeper');
  });

  it('finishes matches at every level in both rule sets', async () => {
    for (let i = 0; i < 12; i++) {
      const { G } = await playMatch({
        rules: i % 2 ? 'easy' : 'standard',
        target: 5000,
        roundCap: 0,
        seats: cpuSeats(4, [...CPU_LEVELS]),
        seed: 300 + i,
        board: BOARDS.town,
      });
      expect(G.winner).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives harder levels more skills', () => {
    expect(CPU_SKILL.easy.mistakes).toBeGreaterThan(CPU_SKILL.normal.mistakes);
    expect(CPU_SKILL.normal.mistakes).toBeGreaterThan(CPU_SKILL.hard.mistakes);
    expect(CPU_SKILL.hard.mistakes).toBeGreaterThan(CPU_SKILL.master.mistakes);
    expect(CPU_SKILL.easy.preRoll).toBe(false);
    expect(CPU_SKILL.master.plansAhead && CPU_SKILL.master.investOnShares && CPU_SKILL.master.blocks).toBe(
      true,
    );
  });
});

describe('sharper CPU decisions', () => {
  it('a sharp CPU turns down a buyout that only loses net worth; a simple one takes it', () => {
    const { G } = makeGame();
    const [p, q] = G.players;
    p.cash = 20000;
    const sq = G.nodes.find((s) => s.t === 'shop')!;
    const mate = G.nodes.find((s) => s.t === 'shop' && s.g === sq.g && s !== sq)!;
    mate.owner = p.id;
    sq.owner = q.id;
    const req = { kind: 'buyout', pid: p.id, sq: sq.id, price: sq.value * 5 } as DecisionRequest;
    p.cpuLevel = 'normal';
    expect(cpuDecide(G, req)).toBe(true);
    p.cpuLevel = 'master';
    expect(cpuDecide(G, req)).toBe(false);
  });

  it('a sharp CPU sells shares before a roll that could land on a fee it cannot pay', () => {
    const { G } = makeGame();
    const [p, q] = G.players;
    p.cpuLevel = 'master';
    p.cash = 50;
    p.shares[0] = 60;
    // A rival's pricey shop a few squares ahead.
    const ahead = G.nodes[G.nodes[p.node].nb[0]];
    const near = G.nodes.find((s) => s.t === 'shop' && s.id !== ahead.id && s.nb.includes(ahead.id)) ?? ahead;
    const shop = near.t === 'shop' ? near : G.nodes.find((s) => s.t === 'shop')!;
    shop.owner = q.id;
    shop.value = 3000;
    const ans = cpuDecide(G, {
      kind: 'preRoll',
      pid: p.id,
      canStock: true,
      canAuction: false,
      canRenovate: false,
      canTrade: false,
    });
    expect(ans).toMatchObject({ act: 'sellStock', d: 0 });
  });

  it('a sharp CPU bids what a shop is worth to it, counting shares it could sell', () => {
    const { G } = makeGame();
    const [p] = G.players;
    const sq = G.nodes.find((s) => s.t === 'shop')!;
    p.cash = 100;
    p.cpuLevel = 'normal';
    expect(cpuBidLimit(G, p.id, sq.id)).toBeLessThan(sq.value);
    p.cpuLevel = 'master';
    p.shares[0] = 400;
    expect(cpuBidLimit(G, p.id, sq.id)).toBeGreaterThan(p.cash);
  });

  it('easy CPUs never act before rolling', () => {
    const { G } = makeGame();
    const p = G.players[0];
    p.cpuLevel = 'easy';
    p.shares[0] = 60;
    p.cash = 0;
    for (let i = 0; i < 20; i++)
      expect(
        cpuDecide(G, {
          kind: 'preRoll',
          pid: p.id,
          canStock: true,
          canAuction: true,
          canRenovate: true,
          canTrade: true,
        }),
      ).toEqual({ act: 'roll' });
  });
});
