/** Persistent color buttons: full districts shrink away and the remaining colors slide to center. */
import { BOARD_LIMITS } from '@aa/engine';
import { h } from './dom';
import type { DistrictChoice } from './editor-districts';

type Entry = { button: HTMLButtonElement; exit?: Animation; slide?: Animation };

/** Create an accessible district-color row with completion and recentering animations. */
export function districtPicker(onSelect: (choice: DistrictChoice) => void, onLayoutChange: () => void) {
  const el = h('div', { class: 'ed-district-picker', role: 'group', 'aria-label': 'District colors' });
  const entries = new Map<string, Entry>();
  let previous = new Map<string, DOMRect>();
  let focusedKey: string | null = null;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const measure = () => new Map([...entries].map(([key, e]) => [key, e.button.getBoundingClientRect()]));
  const slide = (before: Map<string, DOMRect>) => {
    for (const [key, e] of entries) {
      if (e.exit) continue;
      const from = before.get(key);
      e.slide?.cancel();
      const to = e.button.getBoundingClientRect();
      if (!reduced() && from?.width && to.width && Math.abs(from.x - to.x) > 0.5)
        e.slide = e.button.animate(
          [{ transform: `translateX(${from.x - to.x}px)` }, { transform: 'translateX(0)' }],
          { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
        );
    }
  };
  return {
    el,
    hasButtons() {
      return entries.size > 0;
    },
    capture() {
      previous = measure();
      focusedKey = [...entries].find(([, e]) => e.button === document.activeElement)?.[0] ?? null;
    },
    update(choices: DistrictChoice[], selected: string | null, visible: boolean) {
      el.hidden = !visible;
      const available = new Map(
        choices.filter((d) => d.count < BOARD_LIMITS.districtSize).map((d) => [d.key, d]),
      );
      for (const [key, e] of entries) {
        if (available.has(key)) {
          e.exit?.cancel();
          e.exit = undefined;
          continue;
        }
        e.button.setAttribute('aria-pressed', 'false');
        if (e.exit && visible && !reduced()) continue;
        if (!visible || reduced()) {
          e.exit?.cancel();
          e.slide?.cancel();
          e.button.remove();
          entries.delete(key);
          continue;
        }
        e.button.disabled = true;
        e.exit = e.button.animate(
          [
            { transform: 'scale(1)', opacity: 1 },
            { transform: 'scale(0.25)', opacity: 0 },
          ],
          { duration: 160, easing: 'ease-in' },
        );
        e.exit.onfinish = () => {
          if (entries.get(key) !== e || !e.exit) return;
          const before = measure();
          e.button.remove();
          entries.delete(key);
          slide(before);
          if (!entries.size) el.hidden = true;
          onLayoutChange();
        };
      }
      for (let i = 0; i < choices.length; i++) {
        const choice = choices[i];
        if (!available.has(choice.key)) continue;
        let entry = entries.get(choice.key);
        if (!entry) {
          entry = { button: h('button', { class: 'ed-district-chip', type: 'button' }) };
          entries.set(choice.key, entry);
          const next = choices
            .slice(i + 1)
            .map((d) => entries.get(d.key)?.button)
            .find((b) => b?.parentElement === el);
          el.insertBefore(entry.button, next ?? null);
        }
        const button = entry.button;
        button.disabled = false;
        button.style.setProperty('--dc', choice.color);
        button.title = `${choice.name} · ${choice.count}/${BOARD_LIMITS.districtSize} properties`;
        button.setAttribute(
          'aria-label',
          `${choice.name}, ${choice.count} of ${BOARD_LIMITS.districtSize} properties`,
        );
        button.setAttribute('aria-pressed', String(choice.key === selected));
        button.onclick = () => onSelect(choice);
      }
      if (visible) {
        slide(previous);
        const focused = focusedKey ? entries.get(focusedKey)?.button : null;
        if (focused?.isConnected && !focused.disabled) focused.focus({ preventScroll: true });
      }
      if (!entries.size) el.hidden = true;
      focusedKey = null;
      previous = new Map();
    },
    destroy() {
      for (const e of entries.values()) {
        e.exit?.cancel();
        e.slide?.cancel();
      }
      entries.clear();
    },
  };
}
