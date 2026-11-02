import { describe, it, expect, vi } from 'vitest';
import { connectTransports } from '../src/transport';
import { boardFromFile, boardToFile, validateBoard } from '../src/boards/format';
import { BUILT_IN_BOARDS } from '../src/index';
import type { BoardDef } from '../src/types';
import { makeGame } from './helpers';

function board(): BoardDef {
  return structuredClone(BUILT_IN_BOARDS[0]);
}
describe('paired transport', () => {
  it('keeps pair identities through movement and deletion', () => {
    const b = board();
    b.squares.push(
      { x: 0, y: 0, t: 'warp', channel: 0 },
      { x: 1, y: 0, t: 'warp', channel: 0 },
      { x: 2, y: 0, t: 'warp', channel: 1 },
      { x: 3, y: 0, t: 'warp', channel: 1 },
    );
    connectTransports(b);
    const first = b.squares.at(-4)!,
      partner = b.squares.at(-3)!;
    first.x = 20;
    b.squares.splice(1, 1);
    connectTransports(b);
    expect(b.squares[first.link!]).toBe(partner);
    b.squares.splice(b.squares.indexOf(partner), 1);
    connectTransports(b);
    expect(first.link).toBeUndefined();
  });
  it('connects portals only to the same color or bank and round-trips settings', () => {
    const b = board();
    b.squares.push(
      { x: 0, y: 0, t: 'portal', channel: 2 },
      { x: 1, y: 0, t: 'portal', channel: 2, toBank: true },
      { x: 2, y: 0, t: 'portal', channel: 3, toBank: true },
    );
    connectTransports(b);
    expect(b.squares.at(-3)!.link).toBe(b.squares.length - 2);
    expect(b.squares.at(-2)!.link).toBe(b.bank);
    expect(b.squares.at(-1)!.link).toBe(b.bank);
    expect(boardFromFile(boardToFile(b), 'copy').board?.squares).toEqual(boardToFile(b).squares);
  });
  it('rejects missing partners, more than ten tiles and more than two of a color', () => {
    const b = board();
    b.squares.push({ x: 0, y: 0, t: 'warp', channel: 0 });
    connectTransports(b);
    expect(validateBoard(b).errors.join(' ')).toMatch(/does not lead anywhere/);
    for (let i = 0; i < 11; i++) b.squares.push({ x: i, y: 0, t: 'portal', channel: 0, toBank: true });
    connectTransports(b);
    expect(validateBoard(b).errors.join(' ')).toMatch(/at most five/);
    expect(validateBoard(b).errors.join(' ')).toMatch(/Only two/);
  });
  it('a bank portal applies one normal bank visit', async () => {
    const { G, game } = makeGame();
    const bank = G.nodes.find((s) => s.t === 'bank')!;
    const portal = G.nodes.find((s) => s !== bank)!;
    portal.t = 'portal';
    portal.link = bank.id;
    portal.toBank = true;
    const visit = vi.spyOn(game, 'bankVisit').mockResolvedValue(undefined);
    await game.land(G.players[0], portal);
    expect(G.players[0].node).toBe(bank.id);
    expect(visit).toHaveBeenCalledExactlyOnceWith(G.players[0], true);
  });
  it('rejects one-way warp networks and mismatched portal colors', () => {
    const b = board(),
      start = b.squares.length;
    b.squares.push(
      { x: 0, y: 0, t: 'warp', link: start + 1 },
      { x: 1, y: 0, t: 'warp', link: start + 2 },
      { x: 2, y: 0, t: 'warp', link: start },
    );
    expect(validateBoard(b).errors.join(' ')).toMatch(/paired warp/);
    b.squares.splice(start);
    b.squares.push(
      { x: 0, y: 0, t: 'portal', channel: 0, link: start + 1 },
      { x: 1, y: 0, t: 'portal', channel: 1, link: start },
    );
    expect(validateBoard(b).errors.join(' ')).toMatch(/matching color/);
  });
  it('landing teleports once without bouncing back', async () => {
    const { G, game } = makeGame();
    const [a, b, c] = G.nodes;
    a.t = 'warp';
    b.t = 'warp';
    a.link = b.id;
    b.link = a.id;
    const p = G.players[0];
    p.node = a.id;
    await game.land(p, a);
    expect(p.node).toBe(b.id);
    expect(p.prev).toBe(-1);
    a.t = 'portal';
    b.t = 'portal';
    c.t = 'portal';
    a.link = c.id;
    c.link = a.id;
    await game.land(p, a);
    expect(p.node).toBe(c.id);
  });
});
