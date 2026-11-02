/** Event messages get reading time; low-priority activity waits for a quiet gap. */
import { TIMING as T } from '../timing';
import type { IconKind } from './log';
export interface StatusMessage {
  text: string;
  kind?: IconKind;
}
export class StatusMessages {
  current: StatusMessage | null = null;
  waiting: StatusMessage | null = null;
  private activity: StatusMessage | null = null;
  private phaseKey: string | null = null;
  private pending: { message: StatusMessage; hold: number }[] = [];
  private event = false;
  private since = 0;
  private hold = T.actionResult as number;
  private quietSince = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private changed: () => void) {}
  /** A real action boundary always supersedes announcements from the previous action. */
  phase(key: string, message: StatusMessage) {
    if (this.phaseKey === key) {
      this.waiting = null;
      this.activity = message;
      if (!this.event) {
        this.current = message;
        this.changed();
      }
      this.schedule();
      return;
    }
    this.decision();
    this.phaseKey = key;
    this.activity = message;
    this.current = message;
    this.changed();
  }
  push(message: StatusMessage, hold = T.actionResult as number, overlay = false) {
    if (this.current?.text === message.text && this.current.kind === message.kind) return;
    if (this.pending.some((p) => p.message.text === message.text && p.message.kind === message.kind)) return;
    if (!overlay) this.activity = null;
    this.waiting = null;
    this.quietSince = performance.now();
    if (this.event) {
      this.pending.push({ message, hold: hold || T.actionResult });
      // A long burst never leaves the UI replaying an entire old turn. The full log retains it.
      if (this.pending.length > T.actionQueueLimit) this.pending.shift();
    } else this.present(message, hold || T.actionResult);
    this.schedule();
  }
  fallback(message: StatusMessage) {
    const same = this.waiting?.text === message.text && this.waiting.kind === message.kind;
    this.waiting = message;
    if (!same) this.quietSince = performance.now();
    if (!this.current) {
      this.current = message;
      this.changed();
    }
    this.schedule();
  }
  /** Real choices are never delayed by old announcements. */
  decision() {
    clearTimeout(this.timer);
    this.pending = [];
    this.waiting = null;
    this.event = false;
    this.activity = null;
    this.phaseKey = null;
  }
  destroy() {
    clearTimeout(this.timer);
  }
  private present(message: StatusMessage, hold: number) {
    this.current = message;
    this.event = true;
    this.since = performance.now();
    this.hold = hold;
    this.changed();
  }
  private schedule() {
    clearTimeout(this.timer);
    if (!this.event) {
      if (this.waiting && this.current !== this.waiting) {
        this.timer = setTimeout(
          () => {
            this.current = this.waiting;
            this.changed();
          },
          Math.max(0, this.quietSince + T.actionIdleGrace - performance.now()),
        );
      }
      return;
    }
    const now = performance.now();
    if (this.pending.length) {
      const delay = Math.max(0, this.since + Math.min(this.hold, T.actionBurst) - now);
      this.timer = setTimeout(() => {
        const next = this.pending.shift()!;
        this.present(next.message, next.hold);
        this.schedule();
      }, delay);
    } else if (this.activity && !this.waiting) {
      this.timer = setTimeout(
        () => {
          this.event = false;
          this.current = this.activity;
          this.changed();
        },
        Math.max(0, this.since + this.hold - now),
      );
    } else if (this.waiting) {
      const delay = Math.max(0, this.since + this.hold - now, this.quietSince + T.actionIdleGrace - now);
      this.timer = setTimeout(() => {
        this.event = false;
        this.current = this.waiting;
        this.changed();
      }, delay);
    }
  }
}
