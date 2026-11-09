/** Shared music/sound pop-up and inline controls for menus, setup and the game toolbar. */
import { sound, TRACK_NAMES } from '../audio';
import { h } from './dom';

const ICON_ON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_OFF =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_MUSIC =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 17V5l11-2v12M9 8l11-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="6" cy="18" rx="3" ry="2.5" fill="currentColor"/><ellipse cx="17" cy="16" rx="3" ry="2.5" fill="currentColor"/></svg>';

let openPop: { owner: HTMLButtonElement; close: (focus?: boolean) => void } | null = null;
let nextId = 0;
const controlsOff = new WeakMap<HTMLElement, () => void>();

/** Current track, volume sliders and mute toggle; all instances stay in sync. */
export function soundControls(): HTMLElement {
  const root = h('div', { class: 'snd-controls' });
  const title = h('strong', { class: 'snd-track-title' });
  const caption = h('span', { class: 'snd-track-context' });
  const label = h('span', { class: 'snd-eyebrow' });
  const meter = h('span', { class: 'snd-meter', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
  const now = h(
    'div',
    { class: 'snd-now', 'aria-live': 'polite', 'aria-atomic': 'true' },
    meter,
    h('div', { class: 'snd-track' }, label, title, caption),
  );
  const rows: (() => void)[] = [];
  const slider = (text: string, key: 'music' | 'sfx') => {
    const out = h('output', { class: 'snd-val', 'aria-hidden': 'true' });
    const input = h('input', {
      class: 'snd-range',
      type: 'range',
      min: '0',
      max: '100',
      step: '1',
      'aria-label': `${text} volume`,
    });
    const sync = () => {
      const value = Math.round(sound.prefs[key] * 100);
      input.value = String(value);
      input.style.setProperty('--level', `${value}%`);
      input.setAttribute('aria-valuetext', `${value}%`);
      out.textContent = `${value}%`;
    };
    input.oninput = () =>
      sound.set({ [key]: +input.value / 100, ...(sound.prefs.muted ? { muted: false } : {}) });
    if (key === 'sfx') input.onchange = () => sound.play('coin');
    rows.push(sync);
    return h('label', { class: 'snd-row' }, h('span', { class: 'snd-label' }, text), out, input);
  };
  const mute = h('button', { class: 'btn small snd-mute', 'aria-label': 'Mute all sound' });
  mute.onclick = () => sound.set({ muted: !sound.prefs.muted });
  const sync = () => {
    const track = sound.currentTrack;
    const name = track ? TRACK_NAMES[track] : '';
    const audible = !!track && sound.ready && !sound.prefs.muted && sound.prefs.music > 0;
    now.classList.toggle('playing', audible);
    label.textContent = audible ? 'Now playing' : 'Current track';
    title.textContent = name.replace(/ \(.*\)$/, '') || 'No music playing';
    title.title = name;
    caption.textContent = !track
      ? 'Music returns with the next scene'
      : sound.prefs.muted
        ? 'All sound is muted'
        : sound.prefs.music === 0
          ? 'Music volume is at 0%'
          : !sound.ready
            ? 'Tap or press a key to start sound'
            : (name.match(/\((.*)\)$/)?.[1] ?? 'Background music').replace(/^./, (c) => c.toUpperCase());
    mute.textContent = sound.prefs.muted ? 'Unmute sound' : 'Mute all sound';
    mute.setAttribute('aria-pressed', String(sound.prefs.muted));
    mute.classList.toggle('on', sound.prefs.muted);
    rows.forEach((draw) => draw());
  };
  root.append(
    now,
    h('div', { class: 'snd-volumes' }, slider('Music', 'music'), slider('Effects', 'sfx')),
    mute,
  );
  sync();
  // The game menu keeps these controls detached between openings, so stay subscribed until disposed.
  const off = sound.onChange(sync);
  controlsOff.set(root, off);
  return root;
}

/** Release listeners when a screen with reusable inline sound controls is destroyed. */
export function disposeSoundControls(parent: ParentNode) {
  parent.querySelectorAll<HTMLElement>('.snd-controls').forEach((el) => {
    controlsOff.get(el)?.();
    controlsOff.delete(el);
  });
}

/** A sound chip, or a music-note chip when labelled Music, opening the shared pop-up. */
export function soundButton(cls = 'btn small', text = ''): HTMLButtonElement {
  const music = text === 'Music';
  const btn = h('button', {
    class: `${cls} snd-btn`,
    'aria-label': music ? 'Music settings' : 'Sound settings',
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
  });
  const icon = h('span', { class: 'snd-icon' });
  btn.append(icon);
  if (text) btn.append(h('span', { class: music ? 'tb-long' : '' }, text));
  const sync = () => {
    const muted = sound.prefs.muted || (music && sound.prefs.music === 0);
    icon.innerHTML = muted ? ICON_OFF : music ? ICON_MUSIC : ICON_ON;
    btn.classList.toggle('muted', muted);
    btn.title = `Music & sound · ${sound.currentTrack ? TRACK_NAMES[sound.currentTrack] : 'No music playing'}`;
  };
  sync();
  const off = sound.onChange(() => {
    if (!btn.isConnected) return off();
    sync();
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  });
  btn.onclick = (e) => {
    e.stopPropagation();
    if (openPop) {
      const same = openPop.owner === btn;
      openPop.close();
      if (same) return;
    }
    const closeBtn = h('button', { class: 'snd-close', 'aria-label': 'Close sound settings' }, '×');
    const controls = soundControls();
    const pop = h(
      'div',
      {
        class: 'snd-pop glass',
        id: `sound-pop-${++nextId}`,
        role: 'dialog',
        'aria-label': 'Music and sound',
      },
      h('div', { class: 'snd-head' }, h('h2', null, 'Music & sound'), closeBtn),
      controls,
    );
    // Keep volume keys and button activation from reaching the board's turn shortcuts.
    pop.addEventListener('keydown', (ev) => ev.stopPropagation());
    const position = () => {
      const r = btn.getBoundingClientRect();
      const w = pop.offsetWidth;
      pop.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))}px`;
      pop.style.top = `${Math.max(8, Math.min(r.bottom + 8, window.innerHeight - pop.offsetHeight - 8))}px`;
    };
    const close = (focus = false) => {
      controlsOff.get(controls)?.();
      pop.remove();
      btn.setAttribute('aria-expanded', 'false');
      btn.removeAttribute('aria-controls');
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', esc, true);
      window.removeEventListener('resize', position);
      openPop = null;
      if (focus && btn.isConnected) btn.focus();
    };
    const outside = (ev: PointerEvent) => {
      if (!pop.contains(ev.target as Node) && !btn.contains(ev.target as Node)) close();
    };
    const esc = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      close(true);
    };
    closeBtn.onclick = () => close(true);
    document.body.append(pop);
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-controls', pop.id);
    position();
    closeBtn.focus({ preventScroll: true });
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('resize', position);
    openPop = { owner: btn, close };
  };
  return btn;
}

/** Close the pop-up on navigation; an optional owner leaves other screens' chips alone. */
export function closeSoundPopover(owner?: HTMLButtonElement) {
  if (!owner || openPop?.owner === owner) openPop?.close();
}
