import { expect, it } from 'vitest';
import { makeGame } from './helpers';
it('announces the committed trade before ownership or cash animations', async () => {
  const { G, game, events } = makeGame('standard', (req) => (req.kind === 'answerTrade' ? true : undefined));
  const [a, b] = G.players;
  const shop = G.nodes.find((s) => s.t === 'shop')!;
  shop.owner = a.id;
  const before = [a.cash, b.cash];
  const snapshots: number[][] = [];
  const emit = game.io.emit;
  game.io.emit = (e) => {
    if (e.type === 'log' && e.text.includes('accepted') && e.text.includes("'s trade."))
      snapshots.push([shop.owner, a.cash, b.cash]);
    return emit(e);
  };
  await game.trade({ from: a.id, to: b.id, give: [shop.id], get: [], cashGive: 0, cashGet: 100 });
  expect(snapshots).toEqual([[b.id, before[0] + 100, before[1] - 100]]);
  const result = events.findIndex(
    (e) => e.type === 'log' && e.text.includes('accepted') && e.text.includes("'s trade."),
  );
  expect(result).toBeLessThan(events.findIndex((e) => e.type === 'owner'));
  expect(result).toBeLessThan(events.findIndex((e) => e.type === 'money'));
});
