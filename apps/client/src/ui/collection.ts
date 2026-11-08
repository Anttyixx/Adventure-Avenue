/**
 * Board collection (main menu > Menu): every board the player has, the built-in ones and their
 * own, as cards. View opens a board in the board builder's viewer (Edit there unlocks the
 * tools); the eye button hides a board from game setup or shows it again; Remove deletes one of
 * the player's own boards (built-in boards can't be removed). Boards are added by importing a
 * file or making a new one in the builder.
 */
import { validateBoard, type BoardDef } from '@aa/engine';
import {
  collection,
  deleteBoard,
  pickBoardFile,
  readBoardFile,
  saveBoard,
  setBoardHidden,
  type CollectionBoard,
} from '../boardstore';
import { sound } from '../audio';
import { boardThumb } from './thumb';
import { titleScene } from './menu';
import { closeSoundPopover, soundButton } from './soundpanel';
import { clear, h } from './dom';

export interface CollectionHandlers {
  onBack(): void;
  /** Open a board in the builder's viewer. */
  onView(board: BoardDef): void;
  /** Open the builder on a new board. */
  onNew(): void;
}

/** A small pop-up over the collection (the main menu's pop-up frame). Resolves when closed. */
function dialog(
  root: HTMLElement,
  title: string,
  body: Node,
  buttons: { label: string; cls?: string; value: string }[],
): Promise<string | null> {
  return new Promise((resolve) => {
    const done = (v: string | null) => {
      wrap.remove();
      window.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done(null);
    };
    const wrap = h(
      'div',
      {
        class: 'modal-wrap menu-pop',
        onclick: (e: Event) => {
          if (e.target === wrap) done(null);
        },
      },
      h(
        'div',
        { class: 'modal glass coll-dialog', role: 'dialog', 'aria-label': title },
        h(
          'div',
          { class: 'modal-head' },
          h('h2', null, title),
          h('button', { class: 'btn small ghost', onclick: () => done(null) }, 'Close'),
        ),
        body,
        h(
          'div',
          { class: 'coll-dialog-btns' },
          ...buttons.map((b) =>
            h('button', { class: `btn ${b.cls ?? ''}`, onclick: () => done(b.value) }, b.label),
          ),
        ),
      ),
    );
    window.addEventListener('keydown', onKey);
    root.append(wrap);
    wrap.querySelector<HTMLButtonElement>('.coll-dialog-btns .btn')?.focus();
  });
}

/** An eye (shown in game setup) or a crossed-out eye (hidden). */
function eyeIcon(open: boolean) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const paths = ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 9a3 3 0 100 6 3 3 0 000-6z'];
  if (!open) paths.push('M4 4l16 16');
  for (const d of paths) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export function openCollection(root: HTMLElement, handlers: CollectionHandlers): () => void {
  sound.music('menu');
  const scene = titleScene(false);
  const top = h('header', { class: 'su-top coll-top' });
  const grid = h('div', { class: 'coll-grid' });
  const el = h(
    'div',
    { class: 'coll' },
    scene.el,
    top,
    h('div', { class: 'coll-scroll' }, h('div', { class: 'coll-main' }, grid)),
  );
  root.append(el);

  /** Only problems need saying (the cards show everything else): a small pop-up with OK. */
  const warn = (text: string) =>
    void dialog(el, 'Hold on', h('p', { class: 'coll-dialog-text' }, text), [
      { label: 'OK', cls: 'main', value: 'ok' },
    ]);

  /** Add a board from a file (an exported board), saved to the player's boards. */
  const importBoard = async () => {
    const file = await pickBoardFile();
    if (!file) return;
    const res = await readBoardFile(file);
    if (!res.board) return warn(res.error ?? 'Could not read that file.');
    if (!saveBoard(res.board)) return warn('There is no room left to save boards on this device.');
    draw();
  };

  /** Hide a board from game setup or show it again; at least one board stays shown. */
  const toggleHidden = (b: CollectionBoard) => {
    if (!b.hidden && collection().filter((x) => !x.hidden).length <= 1)
      return warn('Keep at least one board shown for new games.');
    setBoardHidden(b.board.id, !b.hidden);
    draw();
  };

  const remove = async (b: CollectionBoard) => {
    if (!b.mine) return;
    const pick = await dialog(
      el,
      `Remove ${b.board.name}?`,
      h(
        'p',
        { class: 'coll-dialog-text' },
        'It will be deleted from this device. Export it first (View, then Menu) if you want to keep a copy.',
      ),
      [
        { label: 'Remove', cls: 'danger', value: 'remove' },
        { label: 'Cancel', cls: 'ghost', value: 'cancel' },
      ],
    );
    if (pick !== 'remove') return;
    deleteBoard(b.board.id);
    draw();
  };

  const card = (b: CollectionBoard) => {
    const bad = validateBoard(b.board).errors.length > 0;
    return h(
      'article',
      { class: `coll-card glass ${b.hidden ? 'hidden-board' : ''}` },
      h(
        'button',
        {
          class: 'car-thumb coll-thumb',
          'aria-label': `View ${b.board.name}`,
          onclick: () => handlers.onView(b.board),
        },
        boardThumb(b.board, 320, 180),
      ),
      h(
        'button',
        {
          class: 'coll-eye',
          'aria-pressed': String(!b.hidden),
          'aria-label': b.hidden
            ? `Show ${b.board.name} in new games`
            : `Hide ${b.board.name} from new games`,
          title: b.hidden ? 'Hidden from new games: tap to show' : 'Shown in new games: tap to hide',
          onclick: () => toggleHidden(b),
        },
        eyeIcon(!b.hidden),
      ),
      h(
        'div',
        { class: 'coll-name' },
        h('b', null, b.board.name),
        h('span', { class: `car-tag ${b.mine ? 'mine' : ''}` }, b.mine ? 'My board' : 'Built-in'),
        bad
          ? h(
              'span',
              { class: 'car-tag bad', title: 'Has problems: fix it in the board builder to play.' },
              'Needs fixing',
            )
          : null,
      ),
      h(
        'small',
        { class: 'coll-meta' },
        `${b.board.layout === 'hex' ? 'Hex' : 'Square'} · ${b.board.squares.length} squares · ${b.board.districts.length} districts`,
      ),
      h(
        'div',
        { class: 'coll-actions' },
        h('button', { class: 'su-tab', onclick: () => handlers.onView(b.board) }, 'View'),
        h(
          'button',
          {
            class: 'su-tab coll-remove',
            disabled: !b.mine,
            title: b.mine ? undefined : "Built-in boards can't be removed. Hide it instead.",
            onclick: () => remove(b),
          },
          'Remove',
        ),
      ),
    );
  };

  const draw = () => {
    clear(grid);
    grid.append(...collection().map(card));
  };

  top.append(
    h('button', { class: 'btn su-back', onclick: () => handlers.onBack() }, '‹ Back'),
    h('h2', null, 'Board Collection'),
    h('span', { class: 'su-top-gap' }),
    h('button', { class: 'btn coll-add', onclick: importBoard }, 'Add a board'),
    h('button', { class: 'btn main coll-new', onclick: () => handlers.onNew() }, 'New board'),
    soundButton('btn menu-sound', 'Sound'),
  );
  draw();

  return () => {
    closeSoundPopover();
    scene.stop();
    el.remove();
  };
}
