import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusMessages } from '../src/ui/status-messages';
import { TIMING as T } from '../src/timing';
describe('action bar priorities', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => vi.useRealTimers());
  it('holds events through movement and returns only after a quiet buffer', () => {
    const q = new StatusMessages(() => {});
    q.fallback({ text: 'Moving' });
    q.push({ text: 'Collected spade' });
    q.fallback({ text: 'Moving' });
    vi.advanceTimersByTime(T.actionResult + T.actionIdleGrace - 1);
    expect(q.current?.text).toBe('Collected spade');
    vi.advanceTimersByTime(1);
    expect(q.current?.text).toBe('Moving');
    q.destroy();
  });
  it('never flashes waiting between a burst of events', () => {
    const seen: string[] = [];
    const q = new StatusMessages(() => seen.push(q.current?.text ?? ''));
    q.push({ text: 'Suit' });
    q.fallback({ text: 'Moving' });
    vi.advanceTimersByTime(300);
    q.push({ text: 'Fee' });
    q.fallback({ text: 'Moving' });
    vi.advanceTimersByTime(T.actionBurst - 300);
    expect(q.current?.text).toBe('Fee');
    vi.advanceTimersByTime(2000);
    q.push({ text: 'Promotion' });
    q.fallback({ text: 'Waiting' });
    vi.advanceTimersByTime(1);
    expect(q.current?.text).toBe('Promotion');
    expect(seen).toEqual(['Suit', 'Fee', 'Promotion']);
    q.destroy();
  });
  it('deduplicates events and never postpones them for repeated waiting updates', () => {
    const q = new StatusMessages(() => {});
    q.push({ text: 'Bought shop' });
    q.push({ text: 'Bought shop' });
    q.push({ text: 'Suit' });
    q.push({ text: 'Suit' });
    for (let i = 0; i < 6; i++) {
      q.fallback({ text: 'Moving' });
      vi.advanceTimersByTime(200);
    }
    expect(q.current?.text).toBe('Suit');
    vi.advanceTimersByTime(4000);
    expect(q.current?.text).toBe('Moving');
    q.destroy();
  });
  it('drops stale queued results at real choices and cancels timers on destruction', () => {
    const changed = vi.fn();
    const q = new StatusMessages(changed);
    q.push({ text: 'A' });
    q.push({ text: 'B' });
    q.decision();
    vi.advanceTimersByTime(5000);
    expect(q.current?.text).toBe('A');
    q.push({ text: 'C' });
    q.fallback({ text: 'Waiting' });
    q.destroy();
    changed.mockClear();
    vi.advanceTimersByTime(10000);
    expect(changed).not.toHaveBeenCalled();
  });
  it('bounds a flood and retains the latest events', () => {
    const q = new StatusMessages(() => {});
    q.push({ text: 'First' });
    for (let i = 0; i < 20; i++) q.push({ text: `Event ${i}` });
    vi.advanceTimersByTime(T.actionBurst);
    expect(q.current?.text).toBe('Event 14');
    q.destroy();
  });
});
