/**
 * Build badge (bottom-right corner) and the hidden dev menu: tap the badge 5 times to open it.
 * Only shown on test builds, and not during a game (the UI Lab still shows it); the stable build
 * hides both.
 */
import { BUILD, IS_DEV_BUILD } from '../build';
import { clearSave, loadSave } from '../save';
import { h } from './dom';
import { LAB_SECTIONS } from './lab';

const TAPS = 5;
const TAP_WINDOW_MS = 2500;

export function installDevBadge() {
  if (!IS_DEV_BUILD) return;
  const when = new Date(BUILD.time);
  const stamp = when.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const hint = h('span', { class: 'badge-hint' });
  const badge = h(
    'button',
    { class: 'build-badge', title: `Build ${BUILD.sha} from ${BUILD.branch}, ${when.toLocaleString()}` },
    h('b', null, BUILD.branch === 'dev' ? 'DEV' : BUILD.branch.toUpperCase()),
    ` build ${BUILD.sha} · ${stamp}`,
    hint,
  );
  document.body.append(badge);
  document.documentElement.classList.add('has-badge');

  let taps: number[] = [];
  badge.addEventListener('click', () => {
    const now = Date.now();
    taps = [...taps.filter((t) => now - t < TAP_WINDOW_MS), now];
    const left = TAPS - taps.length;
    if (left <= 0) {
      taps = [];
      hint.textContent = '';
      openDevMenu();
    } else if (taps.length >= 2) {
      hint.textContent = ` · ${left} more`;
      setTimeout(() => {
        if (Date.now() - taps[taps.length - 1] >= TAP_WINDOW_MS) hint.textContent = '';
      }, TAP_WINDOW_MS);
    }
  });
}

function openDevMenu() {
  if (document.querySelector('.dev-menu')) return;
  const inLab = location.hash.startsWith('#ui-lab');
  const close = () => wrap.remove();
  const go = (hash: string) => {
    if (!inLab && !confirm('Open the UI Lab? A game in progress is saved at the start of each turn.')) return;
    location.hash = hash;
    location.reload();
  };
  const save = loadSave();
  const wrap = h(
    'div',
    { class: 'dev-wrap', onclick: (e: Event) => e.target === wrap && close() },
    h(
      'div',
      { class: 'dev-menu glass' },
      h(
        'div',
        { class: 'modal-head' },
        h('h2', null, 'Dev menu'),
        h('button', { class: 'btn small ghost', onclick: close }, 'Close'),
      ),
      h(
        'p',
        { class: 'hint' },
        `Build ${BUILD.sha} from ${BUILD.branch} · ${new Date(BUILD.time).toLocaleString()}`,
      ),
      h('h4', null, 'UI Lab: view and test UI elements'),
      h(
        'div',
        { class: 'dev-grid' },
        h('button', { class: 'btn main', onclick: () => go('#ui-lab') }, 'Open UI Lab'),
        ...LAB_SECTIONS.map((s) =>
          h('button', { class: 'btn', onclick: () => go(`#ui-lab/${s.id}`) }, s.title),
        ),
      ),
      h('h4', null, 'Tools'),
      h(
        'div',
        { class: 'dev-grid' },
        inLab
          ? h(
              'button',
              {
                class: 'btn',
                onclick: () => {
                  location.hash = '';
                  location.reload();
                },
              },
              'Back to the game',
            )
          : null,
        h(
          'button',
          {
            class: 'btn danger',
            disabled: !save,
            onclick: () => {
              if (!confirm('Delete the saved game?')) return;
              clearSave();
              location.reload();
            },
          },
          save ? `Delete saved game (round ${save.state.round})` : 'No saved game',
        ),
        h(
          'button',
          {
            class: 'btn',
            onclick: () => {
              if (
                !inLab &&
                !confirm('Open the board editor? A game in progress is saved at the start of each turn.')
              )
                return;
              location.hash = '#editor';
              location.reload();
            },
          },
          'Board editor',
        ),
        h('button', { class: 'btn', onclick: () => location.reload() }, 'Reload page'),
      ),
    ),
  );
  document.body.append(wrap);
}
