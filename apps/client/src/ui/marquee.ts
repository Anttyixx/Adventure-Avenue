/**
 * Player names that may not fit their space (player cards, seat cards): the name sits in an inner
 * span; when it is wider than its space, the end fades a little and the name slides slowly to its
 * end and back, so all of it can be read. Rechecked whenever its size changes.
 */
import { h } from './dom';

const watch = new ResizeObserver((entries) => {
  for (const e of entries) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.name-fit');
    if (el) fit(el);
  }
});

function fit(el: HTMLElement) {
  const run = el.firstElementChild as HTMLElement | null;
  if (!run) return;
  const over = Math.ceil(run.scrollWidth - el.clientWidth);
  el.classList.toggle('name-long', over > 1);
  el.style.setProperty('--name-shift', `${-Math.max(0, over)}px`);
  // Longer overflows take longer, so the slide reads at the same easy pace.
  el.style.setProperty('--name-time', `${Math.max(5, 4 + over / 12).toFixed(1)}s`);
}

/** The name `text` in an element of class `cls` that slides back and forth when it doesn't fit. */
export function nameText(text: string, cls: string): HTMLElement {
  const run = h('span', { class: 'name-run' }, text);
  const el = h('span', { class: `${cls} name-fit`, title: text }, run);
  watch.observe(el);
  watch.observe(run);
  return el;
}
