/**
 * Main menu: the title screen with Start (opens game setup), Continue (resumes the saved game)
 * and the board editor. `titleScene` is the animated backdrop shared with the setup screen.
 */
import { PLAYER_COLORS } from '@aa/engine';
import { propertyIconURL, SHOP_TIERS } from '../art';
import { randomLook, SPRITE_H, SPRITE_W, spriteFrames } from '../sprites';
import { loadSave, type SaveInfo } from '../save';
import { sound } from '../audio';
import { h } from './dom';
import { closeSoundPopover, soundButton } from './soundpanel';

const TOWN_COLORS = ['#f2a7a0', '#9fd3f0', '#a8e0a0', '#f5d77a', '#cdb4f0', '#f7bfdc', '#8fe3d6'];

/**
 * Sky, drifting clouds, hills and a little street of shops. With `walkers`, four pixel
 * characters stroll along the road. Returns the element and a cleanup function.
 */
export function titleScene(walkers = true): { el: HTMLElement; stop: () => void } {
  const clouds = [0, 1, 2, 3].map((i) => h('div', { class: `cloud c${i}` }));
  const shops = Array.from({ length: 9 }, (_, i) =>
    h('img', {
      class: 'scene-shop',
      src: propertyIconURL('shop', i % SHOP_TIERS.length, TOWN_COLORS[i % TOWN_COLORS.length]),
      alt: '',
      style: `--i:${i}`,
    }),
  );
  const people: HTMLCanvasElement[] = [];
  let timer = 0;
  if (walkers) {
    const frames = PLAYER_COLORS.map((c) => spriteFrames(randomLook(), c));
    frames.forEach((_, i) => {
      const cv = h('canvas', { class: 'walker', width: SPRITE_W, height: SPRITE_H, style: `--i:${i}` });
      people.push(cv);
    });
    let tick = 0;
    const step = () => {
      people.forEach((cv, i) => {
        const ctx = cv.getContext('2d')!;
        ctx.clearRect(0, 0, SPRITE_W, SPRITE_H);
        ctx.drawImage(frames[i][(tick + i) % 2], 0, 0);
      });
      tick++;
    };
    step();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = window.setInterval(step, 260);
  }
  const el = h(
    'div',
    { class: 'scene', 'aria-hidden': 'true' },
    h('div', { class: 'sun' }),
    ...clouds,
    h('div', { class: 'hill back' }),
    h('div', { class: 'hill mid' }),
    h('div', { class: 'street' }, ...shops),
    h('div', { class: 'hill front' }, h('div', { class: 'road' }, ...people)),
  );
  return { el, stop: () => clearInterval(timer) };
}

export interface MenuHandlers {
  onStart(): void;
  onContinue(save: SaveInfo): void;
  onEditor(): void;
}

function ago(t: number): string {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.round(hr / 24);
  return `${d} day${d > 1 ? 's' : ''} ago`;
}

/** The title screen. `save` overrides the stored save (the UI Lab uses it to preview both states). */
export function mainMenu(root: HTMLElement, handlers: MenuHandlers, save: SaveInfo | null = loadSave()) {
  sound.music('menu');
  const scene = titleScene();
  const s = save?.state;
  const cont = h(
    'button',
    {
      class: 'menu-btn continue',
      disabled: !save,
      onclick: () => save && handlers.onContinue(save),
    },
    h('span', { class: 'menu-btn-title' }, 'Continue'),
    h(
      'span',
      { class: 'menu-btn-sub' },
      s
        ? `Round ${s.round}${s.boardName ? ` · ${s.boardName}` : ''} · saved ${ago(save!.savedAt)}`
        : 'No game in progress',
    ),
    s
      ? h(
          'span',
          { class: 'menu-chips' },
          ...s.players.map((p) =>
            h('span', { class: 'menu-chip', style: `--pc:${PLAYER_COLORS[p.color]}` }, p.name),
          ),
        )
      : null,
  );
  const el = h(
    'div',
    { class: 'menu' },
    scene.el,
    soundButton('btn menu-sound', 'Sound'),
    h(
      'div',
      { class: 'menu-center' },
      h(
        'h1',
        { class: 'menu-logo' },
        h('span', { class: 'l1' }, 'Adventure'),
        h('span', { class: 'l2' }, 'Avenue'),
      ),
      h('p', { class: 'menu-tag' }, 'Buy shops, grow districts, trade stocks and race to the target.'),
      h(
        'div',
        { class: 'menu-buttons' },
        h(
          'button',
          { class: 'menu-btn start', onclick: () => handlers.onStart() },
          h('span', { class: 'menu-btn-title' }, 'Start'),
          h('span', { class: 'menu-btn-sub' }, 'Pick players, a board and the rules'),
        ),
        cont,
        h('button', { class: 'btn ghost menu-editor', onclick: () => handlers.onEditor() }, 'Board editor'),
      ),
    ),
  );
  root.append(el);
  return () => {
    closeSoundPopover();
    scene.stop();
    el.remove();
  };
}
