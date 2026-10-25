/**
 * Game setup (opened from Start on the main menu): a looping carousel of boards, the rules,
 * player count, CPU fill, characters and names.
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
import { loadSave } from '../save';
import { titleScene } from './menu';
import { closeSoundPopover, soundButton } from './soundpanel';
import { sound } from '../audio';
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

export interface SetupHandlers {
  onStart(opts: MatchOptions): void;
  onBack(): void;
  /** Open the board editor, optionally on an existing board. */
  onEditor(board: BoardDef | null): void;
}

export function setupScreen(root: HTMLElement, handlers: SetupHandlers) {
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
  /** Direction of the last carousel move, so only that redraw animates the slide. */
  let slide: 'next' | 'prev' | '' = '';
  const typed: string[] = readJSON(NAMES_KEY, ['', '', '', '']);
  let looks: CharLook[] = [];
  let suggested: string[] = [];
  const shuffle = () => {
    looks = [0, 1, 2, 3].map(() => randomLook());
    const pool = NAMES.slice();
    suggested = [0, 1, 2, 3].map(() => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  };
  shuffle();

  sound.music('menu');
  const scene = titleScene(false);
  const wrap = h('div', { class: 'setup-wrap' });
  const el = h('div', { class: 'setup' }, scene.el, wrap);
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

  const playable = (b: BoardDef) => validateBoard(b).errors.length === 0;
  /** Every board in carousel order: built-in first, then the player's saved boards. */
  const boards = () => [
    ...BUILT_IN.map((board) => ({ board, mine: false })),
    ...listBoards().map((b) => ({ board: b.board, mine: true })),
  ];
  const move = (step: number) => {
    const list = boards();
    const i = Math.max(
      0,
      list.findIndex((b) => b.board.id === boardId),
    );
    boardId = list[(i + step + list.length) % list.length].board.id;
    notice = '';
    slide = step > 0 ? 'next' : 'prev';
    draw();
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, select, textarea')) return;
    if (e.key === 'ArrowLeft') move(-1);
    if (e.key === 'ArrowRight') move(1);
  };
  document.addEventListener('keydown', onKey);

  /** Board choice: a looping carousel, plus importing a file and the editor. */
  const boardPanel = () => {
    const list = boards();
    const index = Math.max(
      0,
      list.findIndex((b) => b.board.id === boardId),
    );
    const { board, mine } = list[index];
    const ok = playable(board);
    const importBtn = h('button', { class: 'btn small ghost' }, 'Import board file');
    importBtn.onclick = async () => {
      const file = await pickBoardFile();
      if (!file) return;
      const res = await readBoardFile(file);
      if (!res.board) {
        notice = res.error ?? 'Could not read that file.';
      } else if (res.check?.errors.length) {
        saveBoard(res.board);
        boardId = res.board.id;
        notice = `Imported "${res.board.name}", but it needs fixing before it can be played: ${res.check.errors[0]} Open it in the board editor.`;
      } else {
        saveBoard(res.board);
        boardId = res.board.id;
        notice = `Imported "${res.board.name}" and saved it to My boards.`;
      }
      draw();
    };
    const stage = h(
      'div',
      { class: `car-slide ${slide}` },
      h('div', { class: 'car-thumb' }, boardThumb(board, 440, 230)),
      h(
        'div',
        { class: 'car-info' },
        h(
          'div',
          { class: 'car-title' },
          h('b', null, board.name),
          h('span', { class: 'car-tag' }, board.layout === 'hex' ? 'Hex' : 'Square'),
          mine ? h('span', { class: 'car-tag mine' }, 'My board') : null,
        ),
        h(
          'small',
          { class: 'hint' },
          `${board.squares.length} squares · ${board.districts.length} districts${board.author ? ` · by ${board.author}` : ''}`,
        ),
        ok ? null : h('small', { class: 'car-bad' }, 'Has problems: fix it in the board editor to play.'),
      ),
    );
    // Swipe on touch screens.
    let downX: number | null = null;
    stage.addEventListener('pointerdown', (e) => (downX = e.clientX));
    stage.addEventListener('pointerup', (e) => {
      if (downX != null && Math.abs(e.clientX - downX) > 40) move(e.clientX < downX ? 1 : -1);
      downX = null;
    });
    return h(
      'section',
      { class: 'setup-panel glass board-panel' },
      h('h3', null, 'Board'),
      h(
        'div',
        { class: 'carousel' },
        h('button', { class: 'car-arrow', 'aria-label': 'Previous board', onclick: () => move(-1) }, '‹'),
        stage,
        h('button', { class: 'car-arrow', 'aria-label': 'Next board', onclick: () => move(1) }, '›'),
      ),
      h(
        'div',
        { class: 'car-dots' },
        ...list.map((b, i) =>
          h('button', {
            class: `car-dot ${i === index ? 'on' : ''} ${b.mine ? 'mine' : ''}`,
            'aria-label': b.board.name,
            title: b.board.name,
            onclick: () => {
              if (i === index) return;
              slide = i > index ? 'next' : 'prev';
              boardId = b.board.id;
              notice = '';
              draw();
            },
          }),
        ),
      ),
      h(
        'div',
        { class: 'btn-row center' },
        importBtn,
        h(
          'button',
          { class: 'btn small ghost', onclick: () => handlers.onEditor(mine ? board : null) },
          mine ? 'Edit this board' : 'Board editor',
        ),
      ),
      notice ? h('p', { class: 'hint board-notice' }, notice) : null,
    );
  };

  const draw = () => {
    clear(wrap);
    const seats = fill ? 4 : humans;
    const board = getBoard(boardId) ?? BUILT_IN[0];
    const start = h('button', { class: 'btn main big', disabled: !playable(board) }, 'Start game');
    start.onclick = () => {
      const seatList = Array.from({ length: seats }, (_, i) => {
        const human = i < humans;
        const name = human ? cleanName(typed[i] || '') || suggested[i] : suggested[i];
        return { name, cpu: !human, ch: looks[i] };
      });
      writeJSON(NAMES_KEY, typed);
      writeJSON(OPTS_KEY, { humans, fill, target, roundCap, rules, boardId });
      handlers.onStart({ rules, target, roundCap, seats: seatList, board });
    };
    wrap.append(
      h(
        'header',
        { class: 'setup-head' },
        h('button', { class: 'btn ghost small back', onclick: () => handlers.onBack() }, '‹ Menu'),
        h('h2', null, 'New game'),
        soundButton('btn small ghost setup-sound'),
      ),
      h(
        'div',
        { class: 'setup-grid' },
        boardPanel(),
        h(
          'section',
          { class: 'setup-panel glass rules-panel' },
          h('h3', null, 'Rules'),
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
            'Rule set',
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
        ),
        h(
          'section',
          { class: 'setup-panel glass players-panel' },
          h(
            'div',
            { class: 'panel-head' },
            h('h3', null, 'Players'),
            h(
              'button',
              { class: 'btn ghost small', onclick: () => (shuffle(), draw()) },
              'Shuffle characters',
            ),
          ),
          seg(
            'Humans',
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
        ),
      ),
      h(
        'footer',
        { class: 'setup-foot' },
        loadSave() ? h('small', { class: 'hint' }, 'Starting replaces the game in progress.') : null,
        start,
      ),
    );
    slide = '';
  };
  draw();
  return () => {
    document.removeEventListener('keydown', onKey);
    closeSoundPopover();
    scene.stop();
    el.remove();
  };
}
