import { afterEach, describe, expect, it, vi } from 'vitest';
import { openingDelay, openingPlayerPose } from '../src/game-opening';
import { TIMING as T } from '../src/timing';

afterEach(() => vi.useRealTimers());

describe('fresh-game player entrance', () => {
  it('keeps every player hidden before the entrance, then reveals them at staggered times', () => {
    expect(Array.from({ length: 5 }, (_, i) => openingPlayerPose(-1, i).visible)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    for (let visible = 1; visible <= 5; visible++) {
      const elapsed = (visible - 1) * T.openingStagger;
      expect(
        Array.from({ length: 5 }, (_, i) => openingPlayerPose(elapsed, i)).filter((p) => p.visible),
      ).toHaveLength(visible);
    }
  });
  it('emerges small, jumps, and settles at full size before the HUD/music phase', () => {
    const start = openingPlayerPose(0, 0);
    expect(start.scale).toBeLessThan(1);
    const middle = openingPlayerPose(T.openingJump / 2, 0);
    expect(middle.hop).toBeGreaterThan(30);
    const end = T.openingJump + 4 * T.openingStagger;
    for (let i = 0; i < 5; i++) {
      const settled = openingPlayerPose(end, i);
      expect(settled).toMatchObject({ visible: true, progress: 1, travel: 1, scale: 1 });
      expect(settled.hop).toBeCloseTo(0);
    }
    expect(openingPlayerPose(end - 1, 4).progress).toBeLessThan(1);
  });
});

describe('opening cancellation', () => {
  it('releases a pending phase immediately when its game is destroyed', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const done = vi.fn();
    const pending = openingDelay(5000, controller.signal).then(done);
    await vi.advanceTimersByTimeAsync(200);
    expect(done).not.toHaveBeenCalled();
    controller.abort();
    await pending;
    expect(done).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not queue a phase for an already destroyed game', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();
    await openingDelay(5000, controller.signal);
    expect(vi.getTimerCount()).toBe(0);
  });
});
