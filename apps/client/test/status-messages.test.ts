import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusMessages } from '../src/ui/status-messages';
import { TIMING as T } from '../src/timing';
describe('action bar lifecycle priorities', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => vi.useRealTimers());
  it('replaces the roll immediately when movement actually starts', () => {
    const q = new StatusMessages(() => {});
    q.phase('roll-result', { text: 'Rolled 4' });
    q.push({ text: 'Older result' });
    q.phase('moving', { text: 'Moving' });
    expect(q.current?.text).toBe('Moving');
    vi.advanceTimersByTime(5000);
    expect(q.current?.text).toBe('Moving');
    q.destroy();
  });
  it('holds a handoff for its real duration without an idle timer', () => {
    const q = new StatusMessages(() => {});
    q.push({ text: 'Bought shop' });
    q.phase('handoff', { text: 'Passing turn to Rosa' });
    vi.advanceTimersByTime(3700);
    expect(q.current?.text).toBe('Passing turn to Rosa');
    q.phase('rolling', { text: 'Rosa is rolling' });
    expect(q.current?.text).toBe('Rosa is rolling');
    q.destroy();
  });
  it('protects a suit pickup across steps, then resumes the current movement', () => {
    const q = new StatusMessages(() => {});
    q.phase('moving', { text: 'Moving' });
    q.push({ text: 'Collected spade' }, T.actionResult, true);
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(200);
      q.phase('moving', { text: 'Moving' });
      expect(q.current?.text).toBe('Collected spade');
    }
    vi.advanceTimersByTime(200);
    expect(q.current?.text).toBe('Moving');
    q.destroy();
  });
  it('does not flash deciding during a short CPU choice', () => {
    const seen: string[] = [];
    const q = new StatusMessages(() => seen.push(q.current?.text ?? ''));
    q.phase('landing', { text: 'Landed' });
    q.fallback({ text: 'Deciding' });
    vi.advanceTimersByTime(1100);
    q.phase('payment', { text: 'Bought shop' });
    vi.advanceTimersByTime(200);
    expect(seen).toEqual(['Landed', 'Bought shop']);
    q.destroy();
  });
  it('shows a genuine ongoing wait after the quiet buffer, without adding two holds', () => {
    const q = new StatusMessages(() => {});
    q.push({ text: 'Result' });
    q.fallback({ text: 'Waiting' });
    vi.advanceTimersByTime(T.actionIdleGrace - 1);
    expect(q.current?.text).toBe('Result');
    vi.advanceTimersByTime(1);
    expect(q.current?.text).toBe('Waiting');
    q.destroy();
  });
  it('queues a same-action burst without flashing movement between messages', () => {
    const seen: string[] = [];
    const q = new StatusMessages(() => seen.push(q.current?.text ?? ''));
    q.phase('moving', { text: 'Moving' });
    q.push({ text: 'Suit' }, T.actionResult, true);
    q.push({ text: 'Fee' }, T.actionResult, true);
    q.push({ text: 'Fee' }, T.actionResult, true);
    vi.advanceTimersByTime(T.actionBurst);
    expect(q.current?.text).toBe('Fee');
    vi.advanceTimersByTime(T.actionResult);
    expect(seen).toEqual(['Moving', 'Suit', 'Fee', 'Moving']);
    q.destroy();
  });
  it('real choices and destruction discard pending updates', () => {
    const changed = vi.fn();
    const q = new StatusMessages(changed);
    q.push({ text: 'A' });
    q.push({ text: 'B' });
    q.decision();
    vi.advanceTimersByTime(5000);
    expect(q.current?.text).toBe('A');
    q.phase('next', { text: 'Next' });
    q.push({ text: 'C' }, T.actionResult, true);
    q.destroy();
    changed.mockClear();
    vi.advanceTimersByTime(10000);
    expect(changed).not.toHaveBeenCalled();
  });
  it('bounds floods within an action and discards them at the next action', () => {
    const q = new StatusMessages(() => {});
    q.push({ text: 'First' });
    for (let i = 0; i < 20; i++) q.push({ text: `Event ${i}` });
    vi.advanceTimersByTime(T.actionBurst);
    expect(q.current?.text).toBe('Event 14');
    q.phase('next', { text: 'New action' });
    vi.advanceTimersByTime(10000);
    expect(q.current?.text).toBe('New action');
    q.destroy();
  });
});
