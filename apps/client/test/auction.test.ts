import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  vi.stubGlobal('__BUILD__', { branch: 'dev', sha: 'test', time: '' });
});
vi.mock('../src/audio', () => ({ sound: {} }));
import { LiveAuction, type AuctionView, type AuctionReq } from '../src/ui/auction';
import { makeGame } from '../../../packages/engine/test/helpers';
import { TIMING } from '../src/timing';

function setup(bidders = [1]) {
  const { G } = makeGame();
  const view = {
    canBid: () => true,
    next: (live: { high: number }) => (live.high ? live.high + 10 : 100),
    show: vi.fn(),
  } as unknown as AuctionView;
  const req = { kind: 'auction', pid: 0, sq: 1, seller: -1, opening: 100, step: 10, bidders } as AuctionReq;
  return new LiveAuction(G, req, view, { cpu: () => false, anyPerson: true, speed: 1 });
}
describe('optional bidding', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('lets a sole bidder pass without buying', async () => {
    const auction = setup();
    const result = auction.run();
    auction.act(1, 'pass');
    expect(await result).toEqual({ winner: -1, price: 0 });
  });
  it('lets a sole bidder wait out the clock without buying', async () => {
    const auction = setup();
    const result = auction.run();
    vi.advanceTimersByTime(TIMING.auctionWindow);
    expect(await result).toEqual({ winner: -1, price: 0 });
  });
  it('requires the last eligible bidder to choose a bid after everyone else passes', async () => {
    const auction = setup([1, 2]);
    const result = auction.run();
    const done = vi.fn();
    void result.then(done);
    auction.act(2, 'pass');
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    auction.act(1, 'bid');
    expect(await result).toEqual({ winner: 1, price: 100 });
  });
});
