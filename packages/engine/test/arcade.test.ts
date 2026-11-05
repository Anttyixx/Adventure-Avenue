import { describe, expect, it } from 'vitest';
import {
  coinDerby,
  luckyReels,
  luckyWheel,
  treasureSplit,
  reelPrize,
  wheelWins,
  playArcade,
  reelSetSlots,
} from '../src/arcade';
import { K } from '../src/constants';
import { makeGame } from './helpers';
import type { ReelSymbol } from '../src/decisions';

describe('five-slot Lucky Reels', () => {
  it.each([
    [['coin', 'coin', 'wild', 'stock', 'bell'], 'One pair', 5],
    [['coin', 'coin', 'wild', 'wild', 'bell'], 'Two pairs', 10],
    [['coin', 'coin', 'coin', 'stock', 'bell'], 'Three matching', 20],
    [['coin', 'seven', 'wild', 'stock', 'bell'], 'Five different', 40],
    [['coin', 'coin', 'coin', 'wild', 'wild'], 'Full house', 40],
    [['coin', 'coin', 'coin', 'coin', 'bell'], 'Four matching', 60],
    [['coin', 'coin', 'coin', 'coin', 'coin'], 'Five matching', 150],
  ])('scores %j as %s', (symbols, name, amount) => {
    const prize = reelPrize(symbols as ReelSymbol[], 2);
    expect({ name: prize.name, amount: prize.amount }).toEqual({ name, amount: Number(amount) * 2 });
  });
  it('marks the slots that make the set', () => {
    expect(reelSetSlots(['coin', 'coin', 'wild', 'wild', 'bell'])).toEqual([true, true, true, true, false]);
    expect(reelSetSlots(['coin', 'seven', 'wild', 'stock', 'bell'])).toEqual([true, true, true, true, true]);
  });
  it('allows two rerolls, keeps locked slots, and pays only the final set', async () => {
    const { G, game, asked, events } = makeGame('standard', (r) =>
      r.kind === 'reels' ? { locked: [true, false, false, false, false], collect: false } : undefined,
    );
    const cash = G.players[0].cash;
    await luckyReels(game, G.players[0]);
    const requests = asked.filter((r) => r.kind === 'reels');
    expect(requests.map((r) => r.left)).toEqual([2, 1]);
    expect(new Set(requests.map((r) => r.symbols[0])).size).toBe(1);
    const result = events.find((e) => e.type === 'reels')!;
    if (result.type !== 'reels') throw Error('missing result');
    expect(result.result).toHaveLength(5);
    expect(result.result[0]).toBe(requests[0].symbols[0]);
    expect(G.players[0].cash - cash).toBe(reelPrize(result.result).amount);
  });
  it('collects early or safely handles malformed answers', async () => {
    for (const answer of [null, { collect: true }, { locked: [true, true, true, true, true] }]) {
      const { G, game, asked } = makeGame('standard', (r) => (r.kind === 'reels' ? answer : undefined));
      await luckyReels(game, G.players[0]);
      expect(asked.filter((r) => r.kind === 'reels')).toHaveLength(1);
    }
  });
});

describe('all-player arcade games', () => {
  it('asks each active player each derby leg, reveals only after all choices, and pays everyone', async () => {
    const { G, game, asked, events } = makeGame('standard', (r) =>
      r.kind === 'arcadeChoice' ? { choice: 1 } : undefined,
    );
    G.players[3].bankrupt = true;
    const cash = G.players.map((p) => p.cash);
    await coinDerby(game, G.players[0]);
    expect(asked.map((r) => r.pid)).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2]);
    const rounds = events.filter((e) => e.type === 'arcadeRound');
    expect(rounds).toHaveLength(3);
    expect(rounds[2].rows.every((r) => r.amount! >= 90)).toBe(true);
    expect(G.players[3].cash).toBe(cash[3]);
    for (const row of rounds[2].rows) expect(G.players[row.pid].cash - cash[row.pid]).toBe(row.amount);
  });
  it('moves derby racers whole spaces: sprint 3-5, grab coins 1-3 (+30G), never past the finish', async () => {
    const { G, game, events } = makeGame('standard', (r) =>
      r.kind === 'arcadeChoice' ? { choice: r.pid % 2 } : undefined,
    );
    await coinDerby(game, G.players[0]);
    const legs = events.filter((e) => e.type === 'arcadeRound');
    for (const leg of legs)
      for (const row of leg.rows) {
        const moved = row.score! - row.previous!;
        const [lo, hi] = row.pid % 2 ? K.derby.grab : K.derby.sprint;
        expect(moved).toBeGreaterThanOrEqual(lo);
        expect(moved).toBeLessThanOrEqual(hi);
        expect(row.score!).toBeLessThanOrEqual(K.derby.track);
      }
    const final = legs[legs.length - 1].rows;
    const best = Math.max(...final.map((r) => r.score!));
    for (const row of final) {
      const coins = row.pid % 2 ? K.derby.grabCoins * K.derby.legs : 0;
      const bonus = row.score === best ? K.derby.winner * G.players[row.pid].level : 0;
      expect(row.amount).toBe(coins + bonus);
    }
  });
  it('asks the player who landed first', async () => {
    const { G, game, asked } = makeGame('standard', (r) =>
      r.kind === 'arcadeChoice' ? { choice: 0 } : undefined,
    );
    await treasureSplit(game, G.players[2]);
    expect(asked.slice(0, 4).map((r) => r.pid)).toEqual([2, 3, 0, 1]);
  });
  it('splits each chest equally without minting rounding leftovers', async () => {
    const { G, game, asked, events } = makeGame('standard', (r) =>
      r.kind === 'arcadeChoice' ? { choice: 2 } : undefined,
    );
    const before = G.players.map((p) => p.cash);
    await treasureSplit(game, G.players[0]);
    expect(asked).toHaveLength(8);
    expect(G.players.map((p, i) => p.cash - before[i])).toEqual([74, 74, 74, 74]);
    expect(events.filter((e) => e.type === 'arcadeRound')).toHaveLength(2);
  });
  it('hands out treasure only after the last round', async () => {
    const { G, game, events } = makeGame('standard', (r) =>
      r.kind === 'arcadeChoice' ? { choice: r.pid % 3 } : undefined,
    );
    const before = G.players.map((p) => p.cash);
    const seen: number[][] = [];
    const emit = game.emit.bind(game);
    game.emit = async (e) => {
      if (e.type === 'arcadeRound') seen.push(G.players.map((p, i) => p.cash - before[i]));
      return emit(e);
    };
    await treasureSplit(game, G.players[0]);
    expect(seen).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const last = events.filter((e) => e.type === 'arcadeRound').pop()!;
    if (last.type !== 'arcadeRound') throw Error('missing');
    for (const row of last.rows) expect(G.players[row.pid].cash - before[row.pid]).toBe(row.total);
  });
  it('uses predictable wheel groups and even color odds', () => {
    for (let choice = 0; choice < 5; choice++)
      expect(Array.from({ length: 12 }, (_, i) => wheelWins(choice, i + 1)).filter(Boolean)).toHaveLength(
        choice < 2 ? 6 : 4,
      );
  });
  it('caps bets at 100G and cash on hand, supports skipping, and pays net results', async () => {
    const { G, game, events, asked } = makeGame('standard', (r) =>
      r.kind === 'arcadeChoice' ? { choice: 4, stake: r.pid === 2 ? 0 : 10000 } : undefined,
    );
    G.players[0].cash = 35;
    G.players[1].cash = 1000;
    G.players[2].cash = 1000;
    G.players[3].cash = -5;
    const before = G.players.map((p) => p.cash);
    await luckyWheel(game, G.players[0]);
    expect(asked.filter((r) => r.kind === 'arcadeChoice').map((r) => r.maxBet)).toEqual([35, 100, 100, 0]);
    const reveal = events.find((e) => e.type === 'arcadeRound')!;
    if (reveal.type !== 'arcadeRound') throw Error('missing result');
    for (const row of reveal.rows) expect(G.players[row.pid].cash - before[row.pid]).toBe(row.amount);
    expect(G.players[0].cash).toBeGreaterThanOrEqual(0);
    expect(reveal.rows[0].text).toContain('bet 30G');
    expect(Math.abs(G.players[1].cash - before[1])).toBeLessThanOrEqual(200);
    expect(G.players[2].cash).toBe(before[2]);
    expect(G.players[3].cash).toBe(-5);
  });
  it('rejects non-finite and negative stakes', async () => {
    for (const stake of [NaN, Infinity, -100]) {
      const { G, game } = makeGame('standard', (r) =>
        r.kind === 'arcadeChoice' ? { choice: 0, stake } : undefined,
      );
      const before = G.players.map((p) => p.cash);
      await luckyWheel(game, G.players[0]);
      expect(G.players.map((p) => p.cash)).toEqual(before);
    }
  });
  it('replays all five arcade games deterministically', async () => {
    for (const play of [luckyReels, luckyWheel, coinDerby, treasureSplit, playArcade]) {
      const a = makeGame(),
        b = makeGame();
      await play(a.game, a.G.players[0]);
      await play(b.game, b.G.players[0]);
      expect(a.G).toEqual(b.G);
      expect(a.events).toEqual(b.events);
    }
    expect(K.wheel.maxBet).toBe(100);
  });
});

describe('arcade decision replay', () => {
  it('replays published answers and RNG without making new CPU choices', async () => {
    const { Game } = await import('../src/engine');
    const { cpuDecide } = await import('../src/cpu');
    for (const play of [luckyReels, coinDerby, luckyWheel, treasureSplit]) {
      const a = makeGame(),
        b = makeGame();
      const answers: { answer: unknown; rng: number }[] = [];
      const host = new Game(a.G, {
        decide: async (req) => {
          const answer = cpuDecide(a.G, req);
          answers.push({ answer, rng: a.G.rng });
          return answer;
        },
        emit: (e) => {
          a.events.push(e);
        },
      });
      await play(host, a.G.players[0]);
      let index = 0;
      const guest = new Game(b.G, {
        decide: async () => {
          const record = answers[index++];
          b.G.rng = record.rng;
          return record.answer as never;
        },
        emit: (e) => {
          b.events.push(e);
        },
      });
      await play(guest, b.G.players[0]);
      expect(index).toBe(answers.length);
      expect(b.G).toEqual(a.G);
      expect(b.events).toEqual(a.events);
    }
  });
  it('can reach all five games through an actual arcade landing', async () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      const { G, game, asked, events } = makeGame('standard', () => undefined, seed);
      const arcade = G.nodes.find((n) => n.t === 'arcade')!;
      G.players[0].node = arcade.id;
      await game.land(G.players[0], arcade);
      for (const r of asked) {
        if (r.kind === 'reels') seen.add('reels');
        if (r.kind === 'memory') seen.add('memory');
        if (r.kind === 'arcadeChoice') seen.add(r.game);
      }
      expect(events.some((e) => e.type === 'log' && e.text.includes('arcade'))).toBe(true);
    }
    expect(seen).toEqual(new Set(['reels', 'memory', 'Coin Derby', 'Lucky Wheel', 'Treasure Split']));
  });
});
