/**
 * Main menu: the title screen with Start (opens game setup), Continue (resumes the saved game)
 * and the board editor. `titleScene` is the animated backdrop shared with the setup screen.
 */
import { PLAYER_COLORS } from '@aa/engine';
import { propertyIconURL, SHOP_TIERS } from '../art';
import { Facing, FRAME_H, FRAME_W, drawCharacter, shuffledCharacters } from '../sprites';
import { loadGuest, loadSave, type GuestSave, type SaveInfo } from '../save';
import { sound } from '../audio';
import { h } from './dom';
import { hasUnseenUpdate } from '../changelog';
import { openCredits } from './credits';
import { openWhatsNew } from './whatsnew';
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
    const cast = shuffledCharacters(5);
    cast.forEach((_, i) => {
      const cv = h('canvas', { class: 'walker', width: FRAME_W, height: FRAME_H, style: `--i:${i}` });
      people.push(cv);
    });
    let tick = 0;
    const step = () => {
      people.forEach((cv, i) => {
        const ctx = cv.getContext('2d')!;
        ctx.clearRect(0, 0, FRAME_W, FRAME_H);
        drawCharacter(ctx, cast[i], true, Facing.Right, tick + i, FRAME_W / 2, FRAME_H, 1);
      });
      tick++;
    };
    step();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = window.setInterval(step, 140);
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
  onOnline(): void;
  /** Go back into the online game this device last joined as a guest. */
  onRejoin(g: GuestSave): void;
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
        ? `${save!.online ? `Online game · room ${save!.online.code} · ` : ''}Round ${s.round}${s.boardName ? ` · ${s.boardName}` : ''} · saved ${ago(save!.savedAt)}`
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
  // A guest's last online game, until it ends (the host may have paused it to continue later).
  const guest = loadGuest();
  const rejoin = guest
    ? h(
        'button',
        { class: 'menu-btn rejoin', onclick: () => handlers.onRejoin(guest) },
        h('span', { class: 'menu-btn-title' }, 'Rejoin online game'),
        h('span', { class: 'menu-btn-sub' }, `Room ${guest.code} as ${guest.name} · joined ${ago(guest.at)}`),
      )
    : null;
  // Release notes, with a "New" badge until the latest update has been read on this device.
  const whatsNew = h('button', { class: 'btn ghost menu-editor whats-new-btn' }, "What's new");
  const badge = () => {
    whatsNew.querySelector('.new-dot')?.remove();
    if (hasUnseenUpdate()) whatsNew.append(h('span', { class: 'new-dot' }, 'New'));
  };
  badge();
  whatsNew.onclick = () => openWhatsNew(root, badge);
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
        rejoin,
        h(
          'button',
          { class: 'menu-btn online', onclick: () => handlers.onOnline() },
          h('span', { class: 'menu-btn-title' }, 'Play online'),
          h('span', { class: 'menu-btn-sub' }, 'Host a game or join friends with a room code'),
        ),
        h(
          'div',
          { class: 'menu-small' },
          whatsNew,
          h('button', { class: 'btn ghost menu-editor', onclick: () => handlers.onEditor() }, 'Board editor'),
          h('button', { class: 'btn ghost menu-editor', onclick: () => openCredits(root) }, 'Credits'),
        ),
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
