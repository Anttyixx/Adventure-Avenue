import { describe, expect, it, vi } from 'vitest';
import { Game } from '../src/engine';
import { CARDS } from '../src/cards';
import { makeGame } from './helpers';

describe('structured game history', () => {
  it('records a landing and links its purchase amount and tile beneath it', async () => {
    const { G, game } = makeGame('standard', (r) => (r.kind === 'buyShop' ? true : undefined));
    const sq = G.nodes.find((n) => n.t === 'shop')!;
    sq.owner = -1;
    await game.land(G.players[0], sq);
    const landing = G.log.find((l) => l.action === 'land')!;
    const purchase = G.log.find((l) => l.text.includes('bought a shop'))!;
    expect(landing.text).toContain('landed on');
    expect(landing.text).not.toMatch(/\d+G/);
    expect(purchase.text).toContain(`${sq.value}G`);
    expect(purchase).toMatchObject({ parent: landing.id, sq: sq.id });
    expect(landing.sq).toBe(sq.id);
  });
  it('starts a new root on another roll, rather than nesting later events under the old landing', async () => {
    const { G, game } = makeGame();
    await game.logArrival(G.players[0], G.nodes[0]);
    vi.spyOn(game, 'move').mockResolvedValue(undefined);
    await game.rollAndMove(G.players[0]);
    await game.log('A passing effect.', 0, 'effect');
    expect(G.log[0].parent).toBeUndefined();
    const roll = G.log.find((l) => l.action === 'roll')!;
    expect(roll.text).toContain('rolled');
    expect(roll.parent).toBeUndefined();
  });
  it('keeps stable IDs and parent links when continuing a saved state', async () => {
    const { G, game } = makeGame();
    await game.logArrival(G.players[0], G.nodes[0]);
    const root = G.log[0];
    const saved = JSON.parse(JSON.stringify(G));
    const resumed = new Game(saved, { decide: async () => null as never, emit: () => {} });
    await resumed.log('A follow-up action.', 0, 'effect');
    expect(saved.log[0].id).not.toBe(root.id);
    expect(saved.log[0].parent).toBe(root.id);
  });
  it('records one arrival when transport is followed by a landing effect', async () => {
    const { G, game } = makeGame();
    const p = G.players[0];
    const sq = G.nodes.find((n) => n.t === 'spade')!;
    game.venture = async () => {};
    await game.warp(p, sq.id, 'card');
    await game.landAfterWarp(p);
    expect(G.log.filter((l) => l.action === 'land')).toHaveLength(1);
  });
  it('names a drawn venture card once and nests what it did beneath it', async () => {
    const { G, game } = makeGame();
    // Make the next panel hold "Give every other player 30G".
    G.vg.cards = G.vg.cards.map(() => 'giveAll30');
    await game.logArrival(G.players[0], G.nodes[0]);
    const landing = G.log[0];
    await game.venture(G.players[0]);
    const cardLine = G.log.find((l) => l.card === 'giveAll30')!;
    expect(cardLine.text).toBe(`${G.players[0].name} drew ${CARDS.giveAll30.title}.`);
    expect(cardLine.parent).toBe(landing.id);
    const effects = G.log.filter((l) => l.parent === cardLine.id);
    expect(effects.map((l) => l.text)).toEqual([`${G.players[0].name} gave everyone 30G.`]);
    // The card's own text is not repeated in the log.
    expect(G.log.some((l) => l.text.includes(CARDS.giveAll30.text))).toBe(false);
  });
  it('gives every venture card a line saying what it did', async () => {
    for (const id of Object.keys(CARDS)) {
      const { G, game } = makeGame();
      G.vg.cards = G.vg.cards.map(() => id);
      await game.logArrival(G.players[0], G.nodes[0]);
      await game.venture(G.players[0]);
      const cardLine = G.log.find((l) => l.card === id)!;
      const after = G.log.slice(0, G.log.indexOf(cardLine));
      expect(after.length, id).toBeGreaterThan(0);
    }
  });
});
