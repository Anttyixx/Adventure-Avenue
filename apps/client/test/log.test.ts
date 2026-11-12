import { describe, expect, it } from 'vitest';
import { nestLog, groupLog } from '../src/ui/log';
import { makeGame } from '../../../packages/engine/test/helpers';
import { buildingLandingLabel } from '../src/names';
import { fmt } from '../src/ui/dom';

describe('log branches', () => {
  it('keeps the purchase directly under its landing and the next roll separate', () => {
    const roots = nestLog([
      { id: '1', text: 'Rolled 4', action: 'roll' },
      { id: '2', text: 'Landed on a shop', action: 'land', sq: 3 },
      { id: '3', parent: '2', text: 'Bought it for 200G', sq: 3 },
      { id: '4', text: 'Rolled 2', action: 'roll' },
    ]);
    expect(roots.map((n) => n.line.id)).toEqual(['1', '2', '4']);
    expect(roots[1].children[0].line.id).toBe('3');
  });
  it('retains old entries and actions whose parent was trimmed out of history', () => {
    expect(nestLog([{ text: 'Old entry' }, { id: '3', parent: 'missing', text: 'Purchase' }])).toHaveLength(
      2,
    );
  });
  it('groups turns and keeps their entries chronological', () => {
    const { G } = makeGame();
    G.log = [
      { id: '2', text: 'Bought', round: 1, turn: 0 },
      { id: '1', text: 'Landed', round: 1, turn: 0 },
    ];
    expect(groupLog(G)[0].lines.map((l) => l.id)).toEqual(['1', '2']);
  });
});

describe('active-player building labels', () => {
  it('matches the real Tax Office payment for a rival and the rebate for its owner', async () => {
    const { G, game } = makeGame('standard', (r) => (r.kind === 'buyout' ? false : undefined));
    const sq = G.nodes.find((n) => n.t === 'plot')!;
    sq.b = 'tax';
    sq.owner = 1;
    sq.value = 200;
    const rival = G.players[0];
    G.turn = G.order.indexOf(rival.id);
    const rivalLabel = buildingLandingLabel(G, sq);
    const before = rival.cash;
    await game.landPlot(rival, sq);
    expect(rivalLabel).toBe(fmt(before - rival.cash));
    const owner = G.players[1];
    G.turn = G.order.indexOf(owner.id);
    const ownerLabel = buildingLandingLabel(G, sq);
    const ownerBefore = owner.cash;
    await game.ownPlot(owner, sq);
    expect(ownerLabel).toBe(fmt(owner.cash - ownerBefore));
    expect(buildingLandingLabel(G, sq)).not.toBe(rivalLabel);
  });
  it('shows Buy for the Estate Agency owner and Break for a rival', () => {
    const { G } = makeGame();
    const sq = G.nodes.find((n) => n.t === 'plot')!;
    sq.b = 'agency';
    sq.owner = 1;
    G.turn = G.order.indexOf(1);
    expect(buildingLandingLabel(G, sq)).toBe('Buy');
    G.turn = G.order.indexOf(0);
    expect(buildingLandingLabel(G, sq)).toBe('Break');
  });
});
