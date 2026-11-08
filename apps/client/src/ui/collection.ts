/**
 * Board collection (main menu > Menu): every board the player can pick in game setup, the
 * built-in ones and their own, as cards. Each can be viewed (a big picture with its details) or
 * removed; the player's own boards can be edited and exported, built-in ones edited as a copy.
 * Boards are added by importing a file or making a new one in the board editor. Removing a
 * built-in board only hides it (it can be added back under "Removed boards"); removing an own
 * board deletes it from this device.
 */
import { validateBoard, type BoardDef } from '@aa/engine';
import {
  BUILT_IN,
  collection,
  copyBoard,
  deleteBoard,
  exportBoard,
  hiddenBuiltIns,
  pickBoardFile,
  readBoardFile,
  saveBoard,
  setBuiltInHidden,
  type CollectionBoard,
} from '../boardstore';
import { sound } from '../audio';
import { boardThumb } from './thumb';
import { titleScene } from './menu';
import { closeSoundPopover, soundButton } from './soundpanel';
import { clear, h } from './dom';

export interface CollectionHandlers {
  onBack(): void;
  /** Open the board editor on one of the player's boards, or on a new board (null). */
  onEdit(board: BoardDef | null): void;
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
        buttons.length
          ? h(
              'div',
              { class: 'coll-dialog-btns' },
              ...buttons.map((b) =>
                h('button', { class: `btn ${b.cls ?? ''}`, onclick: () => done(b.value) }, b.label),
              ),
            )
          : null,
      ),
    );
    window.addEventListener('keydown', onKey);
    root.append(wrap);
    wrap.querySelector<HTMLButtonElement>('.coll-dialog-btns .btn')?.focus();
  });
}

/** What a board is: built-in or the player's own (when saved), its shape and size. */
function facts(b: CollectionBoard): [string, string][] {
  const board = b.board;
  return [
    ['Kind', b.mine ? 'My board' : 'Built-in'],
    ['Shape', board.layout === 'hex' ? 'Hex' : 'Square'],
    ['Squares', String(board.squares.length)],
    ['Districts', String(board.districts.length)],
    ...(board.author ? ([['Made by', board.author]] as [string, string][]) : []),
    ...(b.savedAt ? ([['Saved', new Date(b.savedAt).toLocaleDateString()]] as [string, string][]) : []),
  ];
}

export function openCollection(root: HTMLElement, handlers: CollectionHandlers): () => void {
  sound.music('menu');
  const scene = titleScene(false);
  const top = h('header', { class: 'su-top coll-top' });
  const grid = h('div', { class: 'coll-grid' });
  const removed = h('section', { class: 'coll-removed' });
  const notice = h('p', { class: 'coll-notice', role: 'status', 'aria-live': 'polite' });
  const el = h(
    'div',
    { class: 'coll' },
    scene.el,
    top,
    h('div', { class: 'coll-scroll' }, h('div', { class: 'coll-main' }, notice, grid, removed)),
  );
  root.append(el);

  const say = (text: string, bad = false) => {
    notice.textContent = text;
    notice.classList.toggle('bad', bad);
  };

  /** Add a board from a file (an exported board), saved to the player's boards. */
  const importBoard = async () => {
    const file = await pickBoardFile();
    if (!file) return;
    const res = await readBoardFile(file);
    if (!res.board) return say(res.error ?? 'Could not read that file.', true);
    if (!saveBoard(res.board)) return say('There is no room left to save boards on this device.', true);
    if (res.check?.errors.length)
      say(
        `Added "${res.board.name}", but it needs fixing before it can be played: ${res.check.errors[0]}`,
        true,
      );
    else say(`Added "${res.board.name}" to your collection.`);
    draw();
  };

  /** Edit one of the player's boards, or a copy of a built-in one (saved first, as theirs). */
  const edit = (b: CollectionBoard) => {
    if (b.mine) return handlers.onEdit(b.board);
    const copy = copyBoard(b.board);
    if (!copy) return say('There is no room left to save boards on this device.', true);
    handlers.onEdit(copy);
  };

  const view = async (b: CollectionBoard) => {
    const body = h(
      'div',
      { class: 'coll-view' },
      h('div', { class: 'car-thumb coll-view-thumb' }, boardThumb(b.board, 640, 360)),
      h('dl', { class: 'coll-facts' }, ...facts(b).flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
    );
    const pick = await dialog(el, b.board.name, body, [
      { label: b.mine ? 'Edit' : 'Edit a copy', cls: 'main', value: 'edit' },
      ...(b.mine ? [{ label: 'Export', cls: 'ghost', value: 'export' }] : []),
    ]);
    if (pick === 'edit') edit(b);
    if (pick === 'export') exportBoard(b.board);
  };

  const remove = async (b: CollectionBoard) => {
    if (collection().length <= 1) return say('Your collection needs at least one board.', true);
    const pick = await dialog(
      el,
      `Remove ${b.board.name}?`,
      h(
        'p',
        { class: 'coll-dialog-text' },
        b.mine
          ? 'Your board will be deleted from this device. Export it first if you want to keep a copy.'
          : 'It leaves your collection and game setup. You can add it back under Removed boards.',
      ),
      [
        { label: 'Remove', cls: 'danger', value: 'remove' },
        { label: 'Cancel', cls: 'ghost', value: 'cancel' },
      ],
    );
    if (pick !== 'remove') return;
    if (b.mine) deleteBoard(b.board.id);
    else setBuiltInHidden(b.board.id, true);
    say(`Removed "${b.board.name}".`);
    draw();
  };

  const card = (b: CollectionBoard) => {
    const bad = validateBoard(b.board).errors.length > 0;
    return h(
      'article',
      { class: `coll-card glass ${b.mine ? 'mine' : ''}` },
      h(
        'button',
        { class: 'car-thumb coll-thumb', 'aria-label': `View ${b.board.name}`, onclick: () => view(b) },
        boardThumb(b.board, 320, 180),
      ),
      h(
        'div',
        { class: 'coll-name' },
        h('b', null, b.board.name),
        h('span', { class: `car-tag ${b.mine ? 'mine' : ''}` }, b.mine ? 'My board' : 'Built-in'),
        bad
          ? h(
              'span',
              { class: 'car-tag bad', title: 'Has problems: fix it in the board editor to play.' },
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
        h('button', { class: 'su-tab', onclick: () => view(b) }, 'View'),
        h('button', { class: 'su-tab', onclick: () => edit(b) }, b.mine ? 'Edit' : 'Edit a copy'),
        h('button', { class: 'su-tab coll-remove', onclick: () => remove(b) }, 'Remove'),
      ),
    );
  };

  const draw = () => {
    clear(grid);
    grid.append(...collection().map(card));
    clear(removed);
    const hidden = BUILT_IN.filter((b) => hiddenBuiltIns().includes(b.id));
    if (hidden.length)
      removed.append(
        h('h3', null, 'Removed boards'),
        h(
          'div',
          { class: 'coll-removed-list' },
          ...hidden.map((board) =>
            h(
              'div',
              { class: 'coll-removed-item glass' },
              h('span', null, board.name),
              h(
                'button',
                {
                  class: 'su-tab',
                  onclick: () => {
                    setBuiltInHidden(board.id, false);
                    say(`Added "${board.name}" back to your collection.`);
                    draw();
                  },
                },
                'Add back',
              ),
            ),
          ),
        ),
      );
  };

  clear(top);
  top.append(
    h('button', { class: 'btn su-back', onclick: () => handlers.onBack() }, '‹ Back'),
    h('h2', null, 'Board Collection'),
    h('span', { class: 'su-top-gap' }),
    h('button', { class: 'btn coll-add', onclick: importBoard }, 'Add a board'),
    h('button', { class: 'btn main coll-new', onclick: () => handlers.onEdit(null) }, 'New board'),
    soundButton('btn menu-sound', 'Sound'),
  );
  draw();

  return () => {
    closeSoundPopover();
    scene.stop();
    el.remove();
  };
}
