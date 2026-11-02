/**
 * A compact number stepper: a minus button, the value, and a plus button. Holding a button keeps
 * stepping, faster after a moment. Used where a long list needs small controls (the board
 * builder's district starting averages); the digit picker (digits.ts) is for single big amounts.
 */
import { fmt, h } from './dom';

export interface Stepper {
  el: HTMLElement;
  set(v: number): void;
}

export function stepper(opts: {
  value: number;
  min: number;
  max: number;
  step: number;
  /** Accessible name, e.g. "Brick Row starting average". */
  label: string;
  /** Called on every step while a button is held. */
  onChange(v: number): void;
  /** Called once when the player starts changing the value (e.g. to save an undo step). */
  onStart?(): void;
}): Stepper {
  let value = opts.value;
  const out = h('output', { class: 'stp-value', 'aria-live': 'polite' });
  const minus = h('button', { class: 'stp-btn', 'aria-label': `Lower ${opts.label}` }, '−');
  const plus = h('button', { class: 'stp-btn', 'aria-label': `Raise ${opts.label}` }, '+');
  const draw = () => {
    out.textContent = fmt(value);
    minus.disabled = value <= opts.min;
    plus.disabled = value >= opts.max;
  };
  const nudge = (dir: number) => {
    const next = Math.max(opts.min, Math.min(opts.max, value + dir * opts.step));
    if (next === value) return false;
    value = next;
    draw();
    opts.onChange(value);
    return true;
  };
  // Hold to repeat: a pause, then steady steps that speed up.
  let timer = 0;
  const stop = () => clearTimeout(timer);
  const hold = (btn: HTMLButtonElement, dir: number) => {
    btn.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      opts.onStart?.();
      nudge(dir);
      let wait = 380;
      const tick = () => {
        if (!nudge(dir)) return;
        wait = Math.max(40, wait * 0.8);
        timer = window.setTimeout(tick, wait);
      };
      timer = window.setTimeout(tick, wait);
    };
    btn.onpointerup = btn.onpointerleave = btn.onpointercancel = stop;
    // Keyboard: one step per press.
    btn.onkeydown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      opts.onStart?.();
      nudge(dir);
    };
  };
  hold(minus, -1);
  hold(plus, 1);
  draw();
  return {
    el: h('div', { class: 'stp', role: 'group', 'aria-label': opts.label }, minus, out, plus),
    set(v) {
      value = v;
      draw();
    },
  };
}
