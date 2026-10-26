/**
 * Number picker with an up and a down arrow on each digit (used for share counts and
 * investment amounts). Each arrow turns its digit 0-9 and wraps; the result is kept between
 * 0 and `max`. Quick buttons set 0 or the maximum.
 */
import { h } from './dom';

export interface DigitPicker {
  el: HTMLElement;
  value(): number;
  set(v: number): void;
}

export function digitPicker(opts: {
  max: number;
  value: number;
  /** Step of the last digit (e.g. 10 to pick amounts in tens). */
  unit?: number;
  /** Text after the number, e.g. "shares". */
  suffix?: string;
  onChange(v: number): void;
}): DigitPicker {
  const unit = opts.unit ?? 1;
  const maxSteps = Math.max(0, Math.floor(opts.max / unit));
  const digits = Math.max(1, String(maxSteps).length);
  let steps = clamp(Math.round(opts.value / unit));
  const faces: HTMLElement[] = [];
  const cols: HTMLElement[] = [];

  function clamp(n: number) {
    return Math.max(0, Math.min(maxSteps, n));
  }

  const draw = () => {
    const s = String(steps).padStart(digits, '0');
    faces.forEach((f, i) => (f.textContent = s[i]));
  };

  const set = (n: number, notify = true) => {
    steps = clamp(n);
    draw();
    if (notify) opts.onChange(steps * unit);
  };

  /** Turn digit `i` (0 = leftmost) up or down, wrapping 9 <-> 0. */
  const turn = (i: number, dir: 1 | -1) => {
    const place = 10 ** (digits - 1 - i);
    const d = Math.floor(steps / place) % 10;
    const next = (d + dir + 10) % 10;
    let n = steps + (next - d) * place;
    // Past the maximum: turning up stops at the maximum, turning down from 0 wraps there too.
    if (n > maxSteps) n = dir > 0 ? maxSteps : clamp(n);
    set(n);
  };

  for (let i = 0; i < digits; i++) {
    const face = h('span', { class: 'dg-face' });
    faces.push(face);
    cols.push(
      h(
        'span',
        { class: 'dg-col' },
        h('button', { class: 'dg-arrow', 'aria-label': 'Up', onclick: () => turn(i, 1) }, '▲'),
        face,
        h('button', { class: 'dg-arrow', 'aria-label': 'Down', onclick: () => turn(i, -1) }, '▼'),
      ),
    );
  }
  if (unit > 1) {
    // Fixed trailing zeros for amounts picked in tens or hundreds.
    for (const z of String(unit).slice(1))
      cols.push(h('span', { class: 'dg-col fixed' }, h('span', { class: 'dg-face' }, z)));
  }
  const el = h(
    'div',
    { class: 'digits' },
    h('button', { class: 'btn small ghost', onclick: () => set(0) }, '0'),
    h('span', { class: 'dg-row' }, ...cols),
    opts.suffix ? h('span', { class: 'dg-suffix' }, opts.suffix) : null,
    h('button', { class: 'btn small ghost', onclick: () => set(maxSteps) }, 'Max'),
  );
  draw();
  return { el, value: () => steps * unit, set: (v) => set(Math.round(v / unit), false) };
}
