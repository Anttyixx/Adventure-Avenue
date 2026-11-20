/**
 * The version chip (bottom-right corner of the main menu) and the hidden dev menu: on test builds,
 * press and hold the chip for 3 seconds to open it. The stable (main) build shows only the version.
 */
import { BUILD, IS_DEV_BUILD, VERSION_LABEL } from '../build';
import { clearSave, loadSave } from '../save';
import { h } from './dom';
import { LAB_SECTIONS } from './lab-sections';

const HOLD_MS = 3000;

export function installVersionChip() {
  const when = new Date(BUILD.time);
  const stamp = when.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const chip = h(
    'button',
    {
      class: 'version-chip',
      title: IS_DEV_BUILD
        ? `Build ${BUILD.sha} from ${BUILD.branch}, ${when.toLocaleString()}. Hold for the dev menu.`
        : `Adventure Avenue ${VERSION_LABEL}`,
    },
    h('b', null, VERSION_LABEL),
    IS_DEV_BUILD ? ` ${BUILD.branch} build ${BUILD.sha} · ${stamp}` : null,
  );
  document.body.append(chip);
  document.documentElement.classList.add('has-badge');
  if (!IS_DEV_BUILD) return;

  // Hold for 3 seconds: a gold line traces round the chip's edge while the chip swells and glows,
  // shakes for the last moment, then pops and the dev menu opens. Letting go early cancels. The
  // line is an SVG outline sized to the chip (a clipped fill drew outside the pill on iPhones).
  chip.style.setProperty('--hold', `${HOLD_MS}ms`);
  let timer = 0;
  let ring: SVGSVGElement | null = null;
  const cancel = () => {
    clearTimeout(timer);
    chip.classList.remove('holding');
    ring?.remove();
    ring = null;
  };
  chip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    cancel();
    ring = holdRing(chip.offsetWidth, chip.offsetHeight);
    chip.append(ring);
    // Restart the animation from the beginning.
    void chip.offsetWidth;
    chip.classList.add('holding');
    timer = window.setTimeout(() => {
      cancel();
      chip.classList.remove('done');
      void chip.offsetWidth;
      chip.classList.add('done');
      openDevMenu();
    }, HOLD_MS);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) chip.addEventListener(ev, cancel);
  // A long press on a phone would otherwise open the browser's menu.
  chip.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** The outline traced while holding the chip: a pill the chip's size, drawn as a stroke. */
function holdRing(w: number, hgt: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'vc-ring');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('aria-hidden', 'true');
  const rect = document.createElementNS(ns, 'rect');
  const inset = 1.5;
  rect.setAttribute('x', String(inset));
  rect.setAttribute('y', String(inset));
  rect.setAttribute('width', String(w - inset * 2));
  rect.setAttribute('height', String(hgt - inset * 2));
  rect.setAttribute('rx', String(hgt / 2 - inset));
  // pathLength 100 lets the CSS trace it with a dash of 100 whatever the chip's size.
  rect.setAttribute('pathLength', '100');
  svg.append(rect);
  return svg;
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
    {
      class: 'dev-wrap',
      onclick: (e: Event) => {
        if (e.target === wrap) close();
      },
    },
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
            class: 'btn',
            onclick: () => {
              if (
                !inLab &&
                !confirm('Open the Stocks lab? A game in progress is saved at the start of each turn.')
              )
                return;
              location.hash = '#stocks-lab';
              location.reload();
            },
          },
          'Stocks lab',
        ),
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
        h('button', { class: 'btn', onclick: () => go('#arcade-lab') }, 'Arcade Lab'),
        h('button', { class: 'btn', onclick: () => location.reload() }, 'Reload page'),
      ),
    ),
  );
  document.body.append(wrap);
}
