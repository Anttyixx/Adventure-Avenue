import { describe, expect, it } from 'vitest';
import { coinDerby } from '../src/arcade';
import { K } from '../src/constants';
import type { DecisionKind, DecisionRequest } from '../src/decisions';
import { Game } from '../src/engine';
import { shopFee } from '../src/rules';
import { at, makeGame } from './helpers';

describe('Price Up, Taxi and Swap squares', () => {
  it('Price Up raises the lander’s fees by 10% until their next turn', async () => {
    const { G, game } = makeGame();
    const p = G.players[0];
    const shop = at(G, 1, 0);
    shop.owner = p.id;
    const before = shopFee(G, shop);
    const sq = at(G, 4, 0);
    sq.t = 'hike';
    await game.land(p, sq);
    expect(p.boost).toBeCloseTo(K.hike);
    expect(shopFee(G, shop)).toBeGreaterThan(before);
  });

  it('Taxi rides to the chosen special square and uses it', async () => {
    const { G, game, asked } = makeGame('standard', (r) =>
      r.kind === 'pickSquare' ? G.nodes.find((s) => s.t === 'break')!.id : undefined,
    );
    const p = G.players[0];
    const sq = at(G, 4, 0);
    sq.t = 'taxi';
    await game.land(p, sq);
    const req = asked.find((r) => r.kind === 'pickSquare');
    expect(req && req.kind === 'pickSquare' && req.purpose).toBe('taxi');
    // Only special squares: no shops, plots, bank or other taxis.
    if (req?.kind === 'pickSquare')
      for (const id of req.options) expect(['shop', 'plot', 'bank', 'taxi']).not.toContain(G.nodes[id].t);
    expect(G.nodes[p.node].t).toBe('break');
    expect(p.onBreak).toBe(true);
  });

  it('Swap trades places with the chosen player', async () => {
    const { G, game } = makeGame('standard', (r) => (r.kind === 'swapTarget' ? 2 : undefined));
    const [p, , q] = G.players;
    p.node = at(G, 4, 0).id;
    q.node = at(G, 0, 6).id;
    const mine = p.node;
    const theirs = q.node;
    const sq = G.nodes[mine];
    sq.t = 'swap';
    await game.land(p, sq);
    expect(p.node).toBe(theirs);
    expect(q.node).toBe(mine);
  });
});

describe('Motel', () => {
  /** Player 0 walks right along the top row from (1,0); the motel is the next square. */
  function setup(answer: (r: DecisionRequest) => unknown, owner = 1) {
    const made = makeGame('standard', answer);
    const { G } = made;
    const motel = at(G, 2, 0);
    motel.t = 'plot';
    motel.b = 'motel';
    motel.owner = owner;
    motel.value = K.plotCost;
    const p = G.players[0];
    p.node = at(G, 1, 0).id;
    p.prev = at(G, 0, 0).id;
    return { ...made, motel, p };
  }

  it('asks passers-by and stops them there, charging 25% of their cash', async () => {
    const { G, game, asked, motel, p } = setup((r) =>
      r.kind === 'motelStop' ? true : r.kind === 'buyout' ? false : undefined,
    );
    p.cash = 2000;
    await game.move(p, 3);
    const req = asked.find((r) => r.kind === 'motelStop');
    expect(req && req.kind === 'motelStop' && req.fee).toBe(500);
    expect(p.node).toBe(motel.id);
    expect(p.cash).toBe(1500);
    expect(G.players[1].cash).toBe(K.startCash + 500);
  });

  it('lets passers-by keep moving', async () => {
    const { G, game, p } = setup((r) => (r.kind === 'motelStop' ? false : undefined));
    const cash = p.cash;
    await game.move(p, 3);
    expect(p.node).toBe(at(G, 4, 0).id);
    expect(G.players[1].cash).toBe(K.startCash);
    expect(p.cash).toBeLessThanOrEqual(cash);
  });

  it('lets its owner stop to invest in a shop', async () => {
    const { G, game, asked, motel, p } = setup(
      (r) => (r.kind === 'motelStop' ? true : r.kind === 'invest' ? null : undefined),
      0,
    );
    at(G, 1, 0).owner = 0;
    await game.move(p, 3);
    expect(p.node).toBe(motel.id);
    expect(asked.find((r) => r.kind === 'motelStop')).toMatchObject({ fee: 0 });
    expect(asked.some((r) => r.kind === 'invest')).toBe(true);
  });

  it('is offered instead of the Home, which can no longer be built', async () => {
    const { G, game, asked } = makeGame('standard', (r) => (r.kind === 'build' ? null : undefined));
    const plot = G.nodes.find((s) => s.t === 'plot')!;
    await game.land(G.players[0], plot);
    const req = asked.find((r) => r.kind === 'build');
    const keys = req && req.kind === 'build' ? req.options.map((o) => o.b) : [];
    expect(keys).toContain('motel');
    expect(keys).not.toContain('home');
  });
});

describe('party games', () => {
  it('asks everyone at once and waits until all have locked in', async () => {
    const { G } = makeGame();
    const waiting: { req: DecisionRequest; done: (a: unknown) => void }[] = [];
    const game = new Game(G, {
      decide: <T extends DecisionKind>(req: DecisionRequest<T>) =>
        new Promise<any>((done) => waiting.push({ req: req as DecisionRequest, done })),
      emit: () => {},
    });
    const race = coinDerby(game, G.players[1]);
    await new Promise((r) => setTimeout(r, 0));
    // Every racer is asked before anyone answers, the lander first.
    expect(waiting.map((w) => w.req.pid)).toEqual([1, 2, 3, 0]);
    // Answering out of order changes nothing until the last one locks in.
    for (const w of waiting.slice().reverse()) w.done({ choice: 0 });
    waiting.length = 0;
    await new Promise((r) => setTimeout(r, 0));
    expect(waiting.map((w) => w.req.pid)).toEqual([1, 2, 3, 0]);
    // Finish the race.
    for (let leg = 0; leg < K.derby.legs; leg++) {
      const now = waiting.splice(0);
      for (const w of now) w.done({ choice: 1 });
      await new Promise((r) => setTimeout(r, 0));
    }
    await race;
  });
});
