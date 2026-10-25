/**
 * Sound settings: a speaker button that opens a small popover with music and effects volume
 * sliders and a mute switch. Used on the main menu, game setup and the in-game toolbar.
 */
import { sound } from '../audio';
import { h } from './dom';

const ICON_ON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_OFF =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

let openPop: { el: HTMLElement; close: () => void } | null = null;

/** The sliders and mute switch, on their own (the UI Lab shows them inline too). */
export function soundControls(): HTMLElement {
  const slider = (label: string, key: 'music' | 'sfx') => {
    const out = h('span', { class: 'snd-val' });
    const input = h('input', {
      type: 'range',
      min: '0',
      max: '100',
      value: String(Math.round(sound.prefs[key] * 100)),
      'aria-label': `${label} volume`,
    }) as HTMLInputElement;
    const show = () => (out.textContent = `${input.value}%`);
    input.oninput = () => {
      sound.set({ [key]: +input.value / 100, ...(sound.prefs.muted ? { muted: false } : {}) });
      show();
    };
    // Let players hear the effects level while they set it.
    if (key === 'sfx') input.onchange = () => sound.play('coin');
    show();
    return h('label', { class: 'snd-row' }, h('span', { class: 'snd-label' }, label), input, out);
  };
  const mute = h('input', { type: 'checkbox', checked: sound.prefs.muted }) as HTMLInputElement;
  mute.onchange = () => sound.set({ muted: mute.checked });
  return h(
    'div',
    { class: 'snd-controls' },
    slider('Music', 'music'),
    slider('Effects', 'sfx'),
    h('label', { class: 'check snd-mute' }, mute, 'Mute all sound'),
  );
}

/** A speaker button that opens the sound popover. `text` adds a label after the icon. */
export function soundButton(cls = 'btn small', text = ''): HTMLButtonElement {
  const btn = h('button', { class: `${cls} snd-btn`, 'aria-label': 'Sound settings', title: 'Sound' });
  const icon = h('span', { class: 'snd-icon' });
  btn.append(icon);
  if (text) btn.append(h('span', null, text));
  const sync = () => {
    icon.innerHTML = sound.prefs.muted ? ICON_OFF : ICON_ON;
    btn.classList.toggle('muted', sound.prefs.muted);
  };
  sync();
  const off = sound.onChange(() => {
    if (!btn.isConnected) return off();
    sync();
  });
  btn.onclick = (e) => {
    e.stopPropagation();
    if (openPop) {
      const same = openPop.el.dataset.owner === btn.dataset.sid;
      openPop.close();
      if (same) return;
    }
    btn.dataset.sid = String(Math.random());
    const pop = h(
      'div',
      { class: 'snd-pop glass', 'data-owner': btn.dataset.sid },
      h('div', { class: 'snd-head' }, 'Sound'),
      soundControls(),
    );
    document.body.append(pop);
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth;
    const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w));
    const below = r.bottom + 8 + pop.offsetHeight < window.innerHeight;
    pop.style.left = `${left}px`;
    pop.style.top = below ? `${r.bottom + 8}px` : `${Math.max(8, r.top - pop.offsetHeight - 8)}px`;
    const outside = (ev: PointerEvent) => {
      if (!pop.contains(ev.target as Node) && ev.target !== btn && !btn.contains(ev.target as Node)) close();
    };
    const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && close();
    const close = () => {
      pop.remove();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', esc);
      openPop = null;
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', esc);
    openPop = { el: pop, close };
  };
  return btn;
}

/** Close the popover (e.g. when the screen changes). */
export function closeSoundPopover() {
  openPop?.close();
}
