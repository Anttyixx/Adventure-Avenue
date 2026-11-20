/**
 * The version chip (bottom-right corner of the main menu) and the hidden dev menu: on test builds,
 * press and hold the chip for 1.5 seconds to open it: the chip swells and shakes, then grows into
 * the dev menu in the middle of the screen; closing shrinks the menu back into the chip. The
 * stable (main) build shows only the version.
 */
import { BUILD, IS_DEV_BUILD, VERSION_LABEL } from '../build';
import { clearSave, loadSave } from '../save';
import { h } from './dom';
import { LAB_SECTIONS } from './lab-sections';

const HOLD_MS = 1500;
/** How long the chip takes to grow into the menu (and the menu to shrink back). */
const MORPH_MS = 420;

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

  // Hold for 1.5 seconds: the chip swells and shakes harder and harder (CSS), then grows into
  // the menu. Letting go early cancels.
  chip.style.setProperty('--hold', `${HOLD_MS}ms`);
  let timer = 0;
  const cancel = () => {
    clearTimeout(timer);
    chip.classList.remove('holding');
  };
  chip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    cancel();
    // Restart the animation from the beginning.
    void chip.offsetWidth;
    chip.classList.add('holding');
    timer = window.setTimeout(() => {
      // Open first, so the menu grows from the swollen chip, then let the chip settle (hidden).
      openDevMenu(chip);
      cancel();
    }, HOLD_MS);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) chip.addEventListener(ev, cancel);
  // A long press on a phone would otherwise open the browser's menu.
  chip.addEventListener('contextmenu', (e) => e.preventDefault());
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Grow the dev menu out of the chip (`opening`) or shrink it back in. The menu panel is moved and
 * scaled from the chip's box to its own, its corners kept as round as the chip's pill; its
 * contents fade in once it is nearly full size (out first when closing) and the backdrop fades.
 * Resolves when it ends (at once with reduced motion or no chip on screen).
 */
function morph(wrap: HTMLElement, menu: HTMLElement, chip: HTMLElement | null, opening: boolean) {
  const from = chip?.getBoundingClientRect();
  if (!chip || !from || !from.width || reducedMotion()) return Promise.resolve();
  const to = menu.getBoundingClientRect();
  const sx = from.width / to.width;
  const sy = from.height / to.height;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const r = from.height / 2;
  const small = {
    transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
    borderRadius: `${r / sx}px / ${r / sy}px`,
  };
  const full = { transform: 'none', borderRadius: getComputedStyle(menu).borderRadius };
  const opts: KeyframeAnimationOptions = {
    duration: MORPH_MS,
    easing: opening ? 'cubic-bezier(0.2, 0.9, 0.3, 1.08)' : 'cubic-bezier(0.5, 0, 0.8, 0.4)',
  };
  menu.style.transformOrigin = '0 0';
  const anim = menu.animate(opening ? [small, full] : [full, small], opts);
  wrap.animate(
    { backgroundColor: ['rgba(5, 10, 25, 0)', 'rgba(5, 10, 25, 0.55)'] },
    {
      ...opts,
      direction: opening ? 'normal' : 'reverse',
    },
  );
  // The contents would squash with the panel, so they only show near full size.
  for (const el of menu.children)
    el.animate(
      { opacity: opening ? [0, 0, 1] : [1, 0, 0], offset: opening ? [0, 0.55, 1] : [0, 0.35, 1] },
      { duration: MORPH_MS, fill: 'both' },
    );
  return anim.finished.then(
    () => undefined,
    () => undefined,
  );
}

/** Open the dev menu, grown out of `chip` (which hides while the menu is up) when given. */
function openDevMenu(chip: HTMLElement | null = null) {
  if (document.querySelector('.dev-menu')) return;
  const inLab = location.hash.startsWith('#ui-lab');
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    document.removeEventListener('keydown', onKey);
    await morph(wrap, menu, chip, false);
    wrap.remove();
    if (chip) {
      chip.style.visibility = '';
      chip.animate({ transform: ['scale(1.12)', 'scale(1)'] }, { duration: 200, easing: 'ease-out' });
    }
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && void close();
  document.addEventListener('keydown', onKey);
  const go = (hash: string) => {
    if (!inLab && !confirm('Open the UI Lab? A game in progress is saved at the start of each turn.')) return;
    location.hash = hash;
    location.reload();
  };
  const save = loadSave();
  let menu!: HTMLElement;
  const wrap = h(
    'div',
    {
      class: 'dev-wrap',
      onclick: (e: Event) => {
        if (e.target === wrap) void close();
      },
    },
    (menu = h(
      'div',
      { class: 'dev-menu glass' },
      h(
        'div',
        { class: 'modal-head' },
        h('h2', null, 'Dev menu'),
        h('button', { class: 'btn small ghost', onclick: () => void close() }, 'Close'),
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
    )),
  );
  document.body.append(wrap);
  if (chip) chip.style.visibility = 'hidden';
  void morph(wrap, menu, chip, true);
}
