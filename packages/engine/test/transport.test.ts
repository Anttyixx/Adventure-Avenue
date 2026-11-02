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

describe('portals during movement', () => {
  function routeGame() {
    const { G, game } = makeGame();
    G.nodes = G.nodes.slice(0, 6);
    for (const s of G.nodes) {
      s.t = 'venture';
      s.nb = [];
    }
    const [start, entry, exit, finish, other, bank] = G.nodes;
    start.nb = [entry.id];
    entry.nb = [start.id];
    exit.nb = [finish.id, other.id];
    finish.nb = [exit.id];
    other.nb = [exit.id];
    entry.t = exit.t = 'portal';
    entry.link = exit.id;
    exit.link = entry.id;
    bank.t = 'bank';
    bank.nb = [finish.id];
    G.players[0].node = start.id;
    G.players[0].prev = -1;
    return { G, game, start, entry, exit, finish, other, bank, p: G.players[0] };
  }
  it('offers destinations after the portal with both directions available', () => {
    const { game, p, entry, exit, finish, other } = routeGame();
    expect(game.destinations(p, 1)).toEqual([{ node: exit.id, path: [entry.id, exit.id] }]);
    expect(game.destinations(p, 2).map((r) => r.node)).toEqual([finish.id, other.id].sort((a, b) => a - b));
  });
  it('continues walking and reports remaining road steps correctly', async () => {
    const { game, p, entry, exit, finish } = routeGame();
    const emit = vi.spyOn(game, 'emit').mockResolvedValue(undefined);
    const land = vi.spyOn(game, 'land').mockResolvedValue(undefined);
    await game.move(p, 2);
    expect(p.node).toBe(finish.id);
    expect(emit.mock.calls.map((c) => c[0]).filter((e) => e.type === 'step')).toMatchObject([
      { to: entry.id, left: 1 },
      { to: finish.id, left: 0 },
    ]);
    expect(emit).toHaveBeenCalledWith({ type: 'warp', pid: p.id, to: exit.id });
    expect(land).toHaveBeenCalledExactlyOnceWith(p, finish);
  });
  it('stops at the exit without bouncing when the portal is the final step', async () => {
    const { game, p, exit } = routeGame();
    const warp = vi.spyOn(game, 'warp');
    await game.move(p, 1);
    expect(p.node).toBe(exit.id);
    expect(warp).toHaveBeenCalledTimes(1);
    expect(p.prev).toBe(-1);
  });
  it('visits the bank when passing through a bank-linked portal', async () => {
    const { game, p, entry, bank, finish } = routeGame();
    entry.link = bank.id;
    entry.toBank = true;
    const visit = vi.spyOn(game, 'bankVisit').mockResolvedValue(undefined);
    vi.spyOn(game, 'land').mockResolvedValue(undefined);
    await game.move(p, 2);
    expect(p.node).toBe(finish.id);
    expect(visit).toHaveBeenCalledExactlyOnceWith(p, false);
  });
  it('treats a final-step bank arrival as a landing', async () => {
    const { game, p, entry, bank } = routeGame();
    entry.link = bank.id;
    entry.toBank = true;
    const visit = vi.spyOn(game, 'bankVisit').mockResolvedValue(undefined);
    await game.move(p, 1);
    expect(p.node).toBe(bank.id);
    expect(visit).toHaveBeenCalledExactlyOnceWith(p, true);
  });
  it('does not trigger a warp while passing over it', async () => {
    const { game, p, entry, exit, start } = routeGame();
    entry.t = 'warp';
    exit.t = 'warp';
    entry.nb = [start.id, exit.id];
    expect(game.destinations(p, 1)[0].node).toBe(entry.id);
    expect(game.destinations(p, 2)[0].path).toEqual([entry.id, exit.id]);
    const warp = vi.spyOn(game, 'warp');
    vi.spyOn(game, 'land').mockResolvedValue(undefined);
    await game.move(p, 2);
    expect(warp).not.toHaveBeenCalled();
  });
});
