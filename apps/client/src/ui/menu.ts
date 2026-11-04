/**
 * Main menu: the title screen with one big Play button (game setup, which also gives friends a
 * join code) whose code field turns it into Join, plus Continue / Rejoin when there is a game to
 * go back to.
 * `titleScene` is the animated backdrop shared with the setup screens.
 */
import { PLAYER_COLORS } from '@aa/engine';
import { propertyIconURL, SHOP_TIERS } from '../art';
import { Facing, FRAME_H, FRAME_W, drawCharacter, shuffledCharacters } from '../sprites';
import { loadGuest, loadSave, type GuestSave, type SaveInfo } from '../save';
import { sound } from '../audio';
import { cleanCode } from '../net/protocol';
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
  onPlay(): void;
  /** Join the game hosted under this 4-letter code (`name` when the player typed one). */
  onJoin(code: string, name?: string): void;
  onContinue(save: SaveInfo): void;
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

/** Extras for the menu: a code to put in the Join box (invite link) and why joining failed. */
export interface MenuOptions {
  code?: string;
  error?: string;
  /**
   * Show a name box in Join: a game already running only lets a player back in under their
   * player's name (e.g. coming back on another device).
   */
  askName?: string;
}

/**
 * The title screen. `save` overrides the stored save (the UI Lab uses it to preview both
 * states).
 */
export function mainMenu(
  root: HTMLElement,
  handlers: MenuHandlers,
  save: SaveInfo | null = loadSave(),
  opts: MenuOptions = {},
) {
  sound.music('menu');
  const scene = titleScene();
  const s = save?.state;
  // Only when there is a game to go back to.
  // Only when there is a game to go back to: a slim row under Play (round, board, players' colors).
  const cont =
    save && s
      ? h(
          'button',
          {
            class: 'menu-row continue',
            onclick: () => handlers.onContinue(save),
            'aria-label': `Continue: ${s.players.map((p) => p.name).join(', ')}`,
          },
          h(
            'span',
            { class: 'menu-row-text' },
            h('span', { class: 'menu-row-title' }, 'Continue'),
            h(
              'span',
              { class: 'menu-row-sub' },
              `${save.online ? `Online · ${save.online.code} · ` : ''}Round ${s.round}${s.boardName ? ` · ${s.boardName}` : ''} · ${ago(save.savedAt)}`,
            ),
          ),
          h(
            'span',
            { class: 'menu-dots', 'aria-hidden': 'true' },
            ...s.players.map((p) =>
              h('span', { class: 'menu-dot', title: p.name, style: `--pc:${PLAYER_COLORS[p.color]}` }),
            ),
          ),
        )
      : null;

  // Play and Join share one big button: the code field sits on its right. Once all four letters
  // are in, Play becomes a blue Join button for that game.
  const codeIn = h('input', {
    class: 'join-code',
    maxlength: '4',
    placeholder: 'CODE',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    value: cleanCode(opts.code ?? ''),
    'aria-label': 'Join code',
  }) as HTMLInputElement;
  const ready = () => cleanCode(codeIn.value).length === 4;
  const playTitle = h('span', { class: 'menu-btn-title' });
  const playSub = h('span', { class: 'menu-btn-sub' });
  const playGo = h('button', { class: 'menu-play-go' }, playTitle, playSub);
  const play = h(
    'div',
    { class: 'menu-btn start menu-play' },
    playGo,
    h('label', { class: 'menu-code' }, h('span', { class: 'menu-code-label' }, 'Have a code?'), codeIn),
  );
  const nameIn =
    opts.askName != null
      ? (h('input', {
          class: 'join-name',
          maxlength: '12',
          placeholder: 'Your name in that game',
          value: opts.askName,
          'aria-label': 'Your name in that game',
        }) as HTMLInputElement)
      : null;
  const refresh = () => {
    const joining = ready();
    const wasJoining = play.classList.contains('join');
    play.classList.toggle('join', joining);
    playTitle.textContent = joining ? 'Join' : 'Play';
    playSub.textContent = joining
      ? `Join game ${cleanCode(codeIn.value)}`
      : 'Set up a game. Friends can join with its code.';
    // A little pop when it turns into Join (or back), so the change is noticed.
    if (joining !== wasJoining && play.isConnected && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      play.animate([{ scale: '1' }, { scale: '1.03' }, { scale: '1' }], {
        duration: 260,
        easing: 'ease-out',
      });
  };
  const go = () => {
    if (ready()) handlers.onJoin(cleanCode(codeIn.value), nameIn?.value.trim() || undefined);
    else handlers.onPlay();
  };
  // The whole button acts, except its code field.
  play.onclick = (e) => {
    if (!(e.target as HTMLElement).closest('.menu-code')) go();
  };
  // Block bodies: an on-handler that returns false cancels the key, so typing would not work.
  const onEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && ready()) go();
  };
  if (nameIn) nameIn.onkeydown = onEnter;
  codeIn.oninput = () => {
    codeIn.value = cleanCode(codeIn.value);
    refresh();
  };
  codeIn.onkeydown = onEnter;
  refresh();
  // Only when rejoining a running game needs the player's name there, or joining failed.
  const joinExtra =
    nameIn || opts.error
      ? h(
          'div',
          { class: 'menu-join-extra' },
          nameIn,
          opts.error ? h('p', { class: 'join-error' }, opts.error) : null,
        )
      : null;
  // A guest's last online game, until it ends (the host may have paused it to continue later).
  const guest = loadGuest();
  // A small chip in the top left corner, out of the way of the main actions.
  const rejoin = guest
    ? h(
        'button',
        { class: 'menu-rejoin', onclick: () => handlers.onRejoin(guest) },
        h('span', { class: 'menu-rejoin-icon', 'aria-hidden': 'true' }, '↻'),
        h(
          'span',
          { class: 'menu-rejoin-text' },
          h('b', null, `Rejoin ${guest.code}`),
          h('small', null, `as ${guest.name} · ${ago(guest.at)}`),
        ),
      )
    : null;
  // The Menu button (top right, beside Sound) holds What's new, the board editor and Credits.
  // It carries a "New" badge until the latest update has been read on this device.
  const menuBtn = h(
    'button',
    { class: 'btn menu-sound menu-more', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' },
    '☰ Menu',
  );
  const badge = () => {
    menuBtn.querySelector('.new-dot')?.remove();
    if (hasUnseenUpdate()) menuBtn.append(h('span', { class: 'new-dot' }, 'New'));
  };
  badge();
  menuBtn.onclick = () => openMenu();
  let closeMenu: (() => void) | null = null;
  /** The Menu pop-up: a row per destination, each with a line on what it is. */
  const openMenu = () => {
    if (closeMenu) return closeMenu();
    const item = (title: string, hint: string, act: () => void, isNew = false) =>
      h(
        'button',
        {
          class: 'pop-menu-item',
          onclick: () => {
            closeMenu?.();
            act();
          },
        },
        h('b', null, title, isNew ? h('span', { class: 'tag menu-new-tag' }, 'New') : null),
        h('small', null, hint),
      );
    const wrap = h('div', { class: 'modal-wrap menu-pop' });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu?.();
    };
    closeMenu = () => {
      wrap.remove();
      window.removeEventListener('keydown', onKey);
      menuBtn.setAttribute('aria-expanded', 'false');
      closeMenu = null;
      menuBtn.focus();
    };
    window.addEventListener('keydown', onKey);
    wrap.onclick = (e) => {
      if (e.target === wrap) closeMenu?.();
    };
    wrap.append(
      h(
        'div',
        { class: 'modal glass', role: 'dialog', 'aria-label': 'Menu' },
        h(
          'div',
          { class: 'modal-head' },
          h('h2', null, 'Menu'),
          h('button', { class: 'btn small ghost', onclick: () => closeMenu?.() }, 'Close'),
        ),
        h(
          'div',
          { class: 'pop-menu' },
          item(
            "What's new",
            'The latest changes to the game',
            () => openWhatsNew(root, badge),
            hasUnseenUpdate(),
          ),
          item('Board editor', 'Build your own boards and play them', () => handlers.onEditor()),
          item('Credits', 'Everyone whose art and music the game uses', () => openCredits(root)),
        ),
      ),
    );
    el.append(wrap);
    menuBtn.setAttribute('aria-expanded', 'true');
    wrap.querySelector<HTMLButtonElement>('.pop-menu-item')?.focus();
  };
  const el = h(
    'div',
    { class: 'menu' },
    scene.el,
    rejoin,
    h('div', { class: 'menu-top' }, soundButton('btn menu-sound', 'Sound'), menuBtn),
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
      h('div', { class: 'menu-buttons' }, play, joinExtra, cont),
    ),
  );
  root.append(el);
  if (nameIn) nameIn.focus();
  else if (opts.code || opts.error) codeIn.focus();
  // Keep every menu action visible, including Continue and the join name box, without a scrolling title page.
  const center = el.querySelector<HTMLElement>('.menu-center')!;
  const fit = () => {
    if (!el.isConnected) return;
    const available = Math.max(1, el.clientHeight - 84);
    center.style.setProperty('--menu-fit', String(Math.min(1, available / center.offsetHeight)));
  };
  const resize = new ResizeObserver(fit);
  resize.observe(el);
  resize.observe(center);
  fit();
  document.fonts.ready.then(fit);

  return () => {
    resize.disconnect();
    closeMenu?.();
    closeSoundPopover();
    scene.stop();
    el.remove();
  };
}
