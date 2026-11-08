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
  it('pairs tiles of one color, sends bank links to the bank, and round-trips', () => {
    const b = board();
    b.squares.push(
      { x: 0, y: 0, t: 'portal', channel: 2 },
      { x: 1, y: 0, t: 'portal', channel: 2 },
      { x: 2, y: 0, t: 'portal', channel: 3, toBank: true },
      { x: 3, y: 0, t: 'warp', toBank: true },
      { x: 4, y: 0, t: 'warp' },
    );
    connectTransports(b);
    const n = b.squares.length;
    expect(b.squares[n - 5].link).toBe(n - 4);
    expect(b.squares[n - 4].link).toBe(n - 5);
    // Bank links lose any color; an unlinked tile has neither link nor color.
    expect(b.squares[n - 3]).toMatchObject({ link: b.bank, toBank: true });
    expect(b.squares[n - 3].channel).toBeUndefined();
    expect(b.squares[n - 2]).toMatchObject({ link: b.bank, toBank: true });
    expect(b.squares[n - 1].link).toBeUndefined();
    // Files round-trip, except that retired portal tiles come back as portal links.
    const back = boardFromFile(boardToFile(b), 'copy').board!;
    expect(back.squares.some((s) => s.t === 'portal')).toBe(false);
    expect(back.portalLinks?.length).toBeGreaterThan(0);
    const warps = (list: typeof b.squares) =>
      list.filter((s) => s.t === 'warp').map(({ x, y, toBank }) => ({ x, y, toBank }));
    expect(warps(back.squares)).toEqual(warps(boardToFile(b).squares));
  });
  it('rejects unlinked tiles and more than two tiles of a color', () => {
    const b = board();
    b.squares.push({ x: 0, y: 0, t: 'warp' });
    connectTransports(b);
    expect(validateBoard(b).errors.join(' ')).toMatch(/not linked yet/);
    b.squares.pop();
    const start = b.squares.length;
    b.squares.push(
      { x: 0, y: 0, t: 'portal', channel: 0, link: start + 1 },
      { x: 1, y: 0, t: 'portal', channel: 0, link: start },
      { x: 2, y: 0, t: 'portal', channel: 0, link: start },
    );
    expect(validateBoard(b).errors.join(' ')).toMatch(/Only two/);
  });
  it('a bank warp applies one bank visit when stopped on', async () => {
    const { G, game } = makeGame();
    const bank = G.nodes.find((s) => s.t === 'bank')!;
    const warp = G.nodes.find((s) => s !== bank)!;
    warp.t = 'warp';
    warp.link = bank.id;
    warp.toBank = true;
    const visit = vi.spyOn(game, 'bankVisit').mockResolvedValue(undefined);
    await game.land(G.players[0], warp);
    expect(G.players[0].node).toBe(bank.id);
    expect(visit).toHaveBeenCalledExactlyOnceWith(G.players[0], true);
  });
  it('rejects one-way links and pairs of different colors', () => {
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
    expect(validateBoard(b).errors.join(' ')).toMatch(/paired portal/);
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
