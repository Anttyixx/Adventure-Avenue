import { describe, expect, it } from 'vitest';
import { Game, newGame, cpuSeats, type GameState } from '@aa/engine';
import { activity, paymentActivity } from '../src/ui/activity';

const G = { players: [{ name: 'Rosa' }] } as GameState;
const path = { kind: 'path', pid: 0, steps: 5, dests: [] } as const;

describe('observer movement messages', () => {
  it('keeps the roll result alongside the pending movement choice', () => {
    expect(activity(G, { ...path, dests: [] }, 5).text).toBe(
      'Rosa rolled a 5 and is deciding where to move...',
    );
  });

  it('does not describe card movement as a die roll', () => {
    expect(activity(G, { ...path, steps: 2, dests: [] }, 5).text).toBe(
      'Rosa is deciding where to move 2 spaces...',
    );
    expect(activity(G, { ...path, dests: [] }).text).not.toContain('rolled');
  });

  it('keeps the correct pending choice after landing', () => {
    expect(activity(G, { kind: 'buyShop', pid: 0, sq: 0, price: 200 }).text).toBe(
      'Rosa is deciding whether to buy the shop...',
    );
  });
});

describe('confirmed transaction messages', () => {
  it('announces a purchase as soon as the engine commits it, before the animation and log', async () => {
    const state = newGame({
      rules: 'standard',
      target: 10000,
      roundCap: 0,
      seats: cpuSeats(4),
      seed: 7,
      plots: 'none',
    });
    const p = state.players[0];
    const sq = state.nodes.find((n) => n.t === 'shop')!;
    const cash = p.cash;
    let release!: () => void;
    let committed!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      committed = resolve;
    });
    let message = '';
    const game = new Game(state, {
      decide: async () => true as never,
      emit: async (event) => {
        if (event.type !== 'money') return;
        expect(sq.owner).toBe(p.id);
        expect(p.cash).toBe(cash - sq.value);
        message = paymentActivity(state, event)!.text;
        committed();
        await gate;
      },
    });
    const purchase = game.landShop(p, sq);
    await ready;
    expect(message).toContain('bought a property');
    expect(state.log.some((line) => line.text.includes('bought a shop'))).toBe(false);
    release();
    await purchase;
    expect(state.log.some((line) => line.text.includes('bought a shop'))).toBe(true);
  });

  it('does not claim a purchase succeeded if validation rejects it after the choice', async () => {
    const state = newGame({
      rules: 'standard',
      target: 10000,
      roundCap: 0,
      seats: cpuSeats(4),
      seed: 7,
      plots: 'none',
    });
    const sq = state.nodes.find((n) => n.t === 'shop')!;
    const messages: string[] = [];
    const game = new Game(state, {
      decide: async () => {
        state.players[0].cash = 0;
        return true as never;
      },
      emit: (event) => {
        if (event.type === 'money') messages.push(paymentActivity(state, event)?.text ?? '');
      },
    });
    await game.landShop(state.players[0], sq);
    expect(sq.owner).toBe(-1);
    expect(messages).toEqual([]);
  });

  it('does not describe a split buyout payment as the total price', () => {
    expect(paymentActivity(G, { type: 'money', from: 0, to: -1, amount: 600, reason: 'Buyout' })?.text).toBe(
      'Rosa bought out a rival property.',
    );
  });

  it('leaves unrelated payment presentations unchanged', () => {
    expect(paymentActivity(G, { type: 'money', from: -1, to: 0, amount: 300, reason: 'Venture' })).toBeNull();
  });
});
