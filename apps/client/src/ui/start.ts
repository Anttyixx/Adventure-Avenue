/**
 * Start screen: player count, CPU fill, target, round limit, rule set, characters and names,
 * and "Continue saved game" when a save exists.
 */
import {
  K,
  PLAYER_COLORS,
  validateBoard,
  type BoardDef,
  type CharLook,
  type MatchOptions,
  type RuleSet,
} from '@aa/engine';
import { boardThumb } from './thumb';
import { BUILT_IN, getBoard, listBoards, pickBoardFile, readBoardFile, saveBoard } from '../boardstore';
import { portraitURL, randomLook } from '../sprites';
import { loadSave, type SaveInfo } from '../save';
import { clear, fmt, h } from './dom';

const NAMES = [
  'Rosa',
  'Milo',
  'Juno',
  'Pip',
  'Kai',
  'Nell',
  'Otto',
  'Ivy',
  'Bram',
  'Wren',
  'Theo',
  'Luz',
  'Remy',
  'Ada',
  'Finn',
  'Suki',
];
const NAMES_KEY = 'adventure-avenue-names';
const OPTS_KEY = 'adventure-avenue-options';

export function cleanName(s: string): string {
  return s
    .replace(/[<>&"'`\\]/g, '')
    .trim()
    .slice(0, 12);
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

export interface StartHandlers {
  onStart(opts: MatchOptions): void;
  onContinue(save: SaveInfo): void;
  /** Open the board editor, optionally on an existing board. */
  onEditor(board: BoardDef | null): void;
}

export function startScreen(root: HTMLElement, handlers: StartHandlers) {
  const saved = readJSON(OPTS_KEY, {
    humans: 1,
    fill: true,
    target: K.defaultTarget as number,
    roundCap: 0,
    rules: 'standard' as RuleSet,
    boardId: 'town',
  });
  let humans = saved.humans;
  let fill = saved.fill;
  let target = saved.target;
  let roundCap = saved.roundCap;
  let rules: RuleSet = saved.rules;
  let boardId: string = getBoard(saved.boardId) ? saved.boardId : 'town';
  let notice = '';
  const typed: string[] = readJSON(NAMES_KEY, ['', '', '', '']);
  let looks: CharLook[] = [];
  let suggested: string[] = [];
  const shuffle = () => {
    looks = [0, 1, 2, 3].map(() => randomLook());
    const pool = NAMES.slice();
    suggested = [0, 1, 2, 3].map(() => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  };
  shuffle();

  const el = h('div', { class: 'start' });
  root.append(el);

  const seg = <T>(label: string, values: T[], cur: T, text: (v: T) => string, set: (v: T) => void) =>
    h(
      'div',
      { class: 'opt' },
      h('div', { class: 'opt-label' }, label),
      h(
        'div',
        { class: 'seg' },
        ...values.map((v) =>
          h(
            'button',
            {
              class: `seg-btn ${v === cur ? 'on' : ''}`,
              onclick: () => {
                set(v);
                draw();
              },
            },
            text(v),
          ),
        ),
      ),
    );

  /** Board choice: the built-in board, saved boards, importing a file, and the editor. */
  const boardPicker = () => {
    const saved = listBoards();
    const playable = (b: BoardDef) => validateBoard(b).errors.length === 0;
    const select = h(
      'select',
      {
        class: 'board-select',
        onchange: (e: Event) => {
          boardId = (e.target as HTMLSelectElement).value;
          notice = '';
          draw();
        },
      },
      h(
        'optgroup',
        { label: 'Built-in' },
        ...BUILT_IN.map((b) => h('option', { value: b.id, selected: b.id === boardId }, b.name)),
      ),
      saved.length
        ? h(
            'optgroup',
            { label: 'My boards' },
            ...saved.map((b) =>
              h(
                'option',
                { value: b.id, selected: b.id === boardId, disabled: !playable(b.board) },
                b.board.name + (playable(b.board) ? '' : ' (has problems)'),
              ),
            ),
          )
        : null,
    );
    const board = getBoard(boardId) ?? BUILT_IN[0];
    const custom = !BUILT_IN.some((b) => b.id === board.id);
    const importBtn = h('button', { class: 'btn small' }, 'Import board file');
    importBtn.onclick = async () => {
      const file = await pickBoardFile();
      if (!file) return;
      const res = await readBoardFile(file);
      if (!res.board) {
        notice = res.error ?? 'Could not read that file.';
      } else if (res.check?.errors.length) {
        saveBoard(res.board);
        notice = `Imported "${res.board.name}", but it needs fixing before it can be played: ${res.check.errors[0]} Open it in the board editor.`;
      } else {
        saveBoard(res.board);
        boardId = res.board.id;
        notice = `Imported "${res.board.name}" and saved it to My boards.`;
      }
      draw();
    };
    return h(
      'div',
      { class: 'opt board-pick' },
      h('div', { class: 'opt-label' }, 'Board'),
      h(
        'div',
        { class: 'board-row' },
        boardThumb(board, 180, 100),
        h(
          'div',
          { class: 'board-side' },
          select,
          h(
            'small',
            { class: 'hint' },
            `${board.squares.length} squares · ${board.districts.length} districts${board.author ? ` · by ${board.author}` : ''}`,
          ),
          h(
            'div',
            { class: 'btn-row left' },
            importBtn,
            h(
              'button',
              { class: 'btn small', onclick: () => handlers.onEditor(custom ? board : null) },
              custom ? 'Edit this board' : 'Board editor',
            ),
          ),
        ),
      ),
      notice ? h('p', { class: 'hint board-notice' }, notice) : null,
    );
  };

  const draw = () => {
    clear(el);
    const save = loadSave();
    const seats = fill ? 4 : humans;
    const start = h('button', { class: 'btn main big nudge' }, 'Start game');
    start.onclick = () => {
      const seatList = Array.from({ length: seats }, (_, i) => {
        const human = i < humans;
        const name = human ? cleanName(typed[i] || '') || suggested[i] : suggested[i];
        return { name, cpu: !human, ch: looks[i] };
      });
      writeJSON(NAMES_KEY, typed);
      writeJSON(OPTS_KEY, { humans, fill, target, roundCap, rules, boardId });
      const board = getBoard(boardId) ?? BUILT_IN[0];
      handlers.onStart({ rules, target, roundCap, seats: seatList, board });
    };
    el.append(
      h(
        'div',
        { class: 'start-card glass' },
        h('h1', { class: 'logo-big' }, 'Adventure Avenue'),
        h('p', { class: 'tag-line' }, 'Buy shops, grow districts, trade stocks and race to the target.'),
        save
          ? h(
              'button',
              { class: 'btn continue', onclick: () => handlers.onContinue(save) },
              `Continue saved game (round ${save.state.round}, ${save.state.players.map((p) => p.name).join(', ')})`,
            )
          : null,
        start,
        seg(
          'Players',
          [1, 2, 3, 4],
          humans,
          (v) => `${v} human${v > 1 ? 's' : ''}`,
          (v) => (humans = v),
        ),
        h(
          'label',
          { class: 'check' },
          h('input', {
            type: 'checkbox',
            checked: fill,
            onchange: (e: Event) => {
              fill = (e.target as HTMLInputElement).checked;
              draw();
            },
          }),
          'Fill empty seats with CPU',
        ),
        seg(
          'Target net worth',
          K.targetOptions as unknown as number[],
          target,
          (v) => fmt(v),
          (v) => (target = v),
        ),
        seg(
          'Round limit',
          K.roundCapOptions as unknown as number[],
          roundCap,
          (v) => (v ? String(v) : 'None'),
          (v) => (roundCap = v),
        ),
        seg(
          'Rules',
          ['standard', 'easy'] as RuleSet[],
          rules,
          (v) => (v === 'standard' ? 'Standard' : 'Easy'),
          (v) => (rules = v),
        ),
        h(
          'p',
          { class: 'hint' },
          rules === 'standard'
            ? 'Standard: districts, vacant plots and the stock market.'
            : 'Easy: rows of connected shops, no plots and no stock market.',
        ),
        boardPicker(),
        h(
          'div',
          { class: 'seats' },
          ...Array.from({ length: seats }, (_, i) => {
            const human = i < humans;
            const input = human
              ? (h('input', {
                  class: 'name',
                  maxlength: '12',
                  placeholder: suggested[i],
                  value: typed[i] ?? '',
                  oninput: (e: Event) => (typed[i] = cleanName((e.target as HTMLInputElement).value)),
                }) as HTMLInputElement)
              : h('span', { class: 'name cpu' }, suggested[i]);
            return h(
              'div',
              { class: 'seat-card', style: `--pc:${PLAYER_COLORS[i]}` },
              h('img', { class: 'portrait', src: portraitURL(looks[i], PLAYER_COLORS[i], 5), alt: '' }),
              input,
              h('span', { class: 'seat-tag' }, human ? `P${i + 1}` : 'CPU'),
            );
          }),
        ),
        h('button', { class: 'btn ghost small', onclick: () => (shuffle(), draw()) }, 'Shuffle characters'),
      ),
    );
  };
  draw();
  return () => el.remove();
}
