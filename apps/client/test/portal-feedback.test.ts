import { describe, expect, it } from 'vitest';
import { newGame } from '../../../packages/engine/src/setup';
import { cpuSeats } from '../../../packages/engine/src/headless';
import { TEST_TOWN } from '../../../packages/engine/test/helpers';
import { portalFlows, portalPartner } from '../src/portal-links';
import { portalTravelPose } from '../src/portal-travel';

const sample = (oneWay = false) => {
  const board = structuredClone(TEST_TOWN);
  board.portalLinks = [{ a: 0, b: 4, sa: 3, sb: 3, oneWay }];
  return newGame({ rules: 'easy', target: 5000, roundCap: 0, seats: cpuSeats(2), board, seed: 42 });
};

describe('portal feedback direction', () => {
  it('flows entrance to exit when either end is selected', () => {
    const G = sample(true);
    const flow = [{ from: { node: 0, side: 3 }, to: { node: 4, side: 3 }, both: false }];
    expect(portalFlows(G, { node: 0, side: 3 })).toEqual(flow);
    expect(portalFlows(G, { node: 4, side: 3 })).toEqual(flow);
  });
  it('shows bidirectional flow and keeps parallel endpoint pairs distinct', () => {
    const G = sample();
    G.nodes[0].portals!.push({ to: 4, side: 2, toSide: 2, way: 'both' });
    G.nodes[4].portals!.push({ to: 0, side: 2, toSide: 2, way: 'both' });
    expect(portalFlows(G, { node: 0, side: 2 })).toEqual([
      { from: { node: 0, side: 2 }, to: { node: 4, side: 2 }, both: true },
    ]);
    expect(portalPartner(G, 0, G.nodes[0].portals![0])?.side).toBe(3);
    expect(portalPartner(G, 0, G.nodes[0].portals![1])?.side).toBe(2);
  });
  it('supports older saves without destination-side metadata', () => {
    const G = sample();
    for (const n of G.nodes) for (const p of n.portals ?? []) delete p.toSide;
    expect(portalFlows(G, { node: 0, side: 3 })[0].to).toEqual({ node: 4, side: 3 });
  });
});

describe('portal travel poses', () => {
  const start = { x: 0, y: 0 },
    entrance = { x: 72, y: 0 },
    exit = { x: 800, y: 700 },
    target = { x: 850, y: 750 };
  const pose = (k: number) => portalTravelPose(k, start, entrance, exit, target);
  it('pulls and shrinks into the entrance, disappears, then launches out of the exit', () => {
    expect(pose(0)).toMatchObject({ x: 0, y: 0, alpha: 1, sx: 1, sy: 1 });
    expect(pose(0.4).x).toBeGreaterThan(50);
    expect(pose(0.4).sx).toBeLessThan(0.3);
    expect(pose(0.5)).toMatchObject({ x: 800, y: 700, alpha: 0 });
    expect(pose(0.7).x).toBeGreaterThan(800);
    expect(pose(0.7).hop).toBeGreaterThan(0);
    expect(pose(1)).toMatchObject({ x: 850, y: 750, alpha: 1 });
    expect(pose(1).sx).toBeCloseTo(1);
    expect(pose(1).sy).toBeCloseTo(1);
    expect(pose(1).turn).toBeCloseTo(0);
    expect(pose(1).hop).toBeCloseTo(0);
  });
});
