/**
 * Game setup (opened from Start on the main menu): a looping carousel of boards, the rules,
 * player count, CPU fill, characters (each player picks a different one) and names.
 */
import {
  K,
  MAX_PLAYERS,
  PLAYER_COLORS,
  validateBoard,
  type BoardDef,
  type CharId,
  type MatchOptions,
  type PlotSetting,
  type RuleSet,
} from '@aa/engine';
import { boardThumb } from './thumb';
import { BUILT_IN, getBoard, listBoards, pickBoardFile, readBoardFile, saveBoard } from '../boardstore';
import { freeCharacter, shuffledCharacters } from '../sprites';
import { charButton, pickCharacter } from './charpick';
import { loadSave } from '../save';
import { titleScene } from './menu';
import type { HostRoom } from '../net/hostroom';
import { inviteURL } from '../net/protocol';
import { lobbySeats } from './online';
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
const PLOT_LABEL: Record<PlotSetting, string> = {
  none: 'None',
  few: 'A few',
  some: 'Some',
  lot: 'A lot',
  all: 'All',
};

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

/**
 * Game setup. With a `room` it is the online host's lobby: the Players panel shows the room
 * code and who has joined instead of the hot-seat options.
 */
export function setupScreen(root: HTMLElement, handlers: SetupHandlers, room: HostRoom | null = null) {
  const saved = readJSON(OPTS_KEY, {
    humans: 1,
    fill: true,
    total: 4,
    target: K.defaultTarget as number,
    roundCap: 0,
    plots: 'few' as PlotSetting,
    rules: 'standard' as RuleSet,
    boardId: 'town',
  });
  let humans = saved.humans;
  let fill = saved.fill;
  /** Hot-seat: players in the match; seats after the humans are CPUs. */
  let total = Math.max(2, Math.min(MAX_PLAYERS, saved.total ?? 4));
  humans = Math.min(humans, total);
  /** A target in 1,000G steps from 1,000G to 90,000G. */
  const cleanTarget = (v: number) =>
    Math.min(K.targetMax, Math.max(K.targetStep, Math.round(v / K.targetStep) * K.targetStep)) ||
    K.defaultTarget;
  let target = cleanTarget(saved.target);
  /** Custom target picked (stays on even when the amount matches a preset). */
  let customTarget = !(K.targetOptions as unknown as number[]).includes(target);
  let roundCap = saved.roundCap;
  let plots: PlotSetting = saved.plots ?? 'few';
  let rules: RuleSet = saved.rules;
  let boardId: string = getBoard(saved.boardId) ? saved.boardId : 'town';
  let notice = '';
  /** Direction of the last carousel move, so only that redraw animates the slide. */
  let slide: 'next' | 'prev' | '' = '';
  const typed: string[] = readJSON(NAMES_KEY, []);
  let looks: CharId[] = [];
  let suggested: string[] = [];
  const shuffle = () => {
    looks = shuffledCharacters(PLAYER_COLORS.length);
    const pool = NAMES.slice();
    suggested = PLAYER_COLORS.map(() => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  };
  shuffle();
  /**
   * Give seat `i` a character. A CPU seat that had it switches to a free one; human seats never
   * share, because the picker greys out what other humans have.
   */
  const setLook = (i: number, id: CharId) => {
    looks[i] = id;
    looks.forEach((l, j) => {
      if (j !== i && l === id) looks[j] = freeCharacter(looks.filter((_, k) => k !== j));
    });
  };
  /** Open the picker for seat `i`; `humanNames` maps the other human seats to their names. */
  const choose = async (i: number, others: Map<CharId, string>, after: () => void) => {
    const id = await pickCharacter({ current: looks[i], taken: others, color: PLAYER_COLORS[i] });
    if (id) {
      setLook(i, id);
      after();
    }
  };

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

  /**
   * Target net worth: the preset amounts, plus Custom with minus/plus buttons and a box to type
   * any amount in 1,000G steps up to 90,000G.
   */
  const targetPicker = () => {
    const presets = K.targetOptions as unknown as number[];
    const custom = customTarget;
    const input = h('input', {
      class: 'num target-in',
      type: 'number',
      min: String(K.targetStep),
      max: String(K.targetMax),
      step: String(K.targetStep),
      value: String(target),
      'aria-label': 'Custom target net worth',
    }) as HTMLInputElement;
    const set = (v: number) => {
      target = cleanTarget(v);
      draw();
    };
    input.onchange = () => set(Number(input.value));
    return h(
      'div',
      { class: 'opt' },
      h('div', { class: 'opt-label' }, 'Target net worth'),
      h(
        'div',
        { class: 'seg' },
        ...presets.map((v) =>
          h(
            'button',
            {
              class: `seg-btn ${!custom && v === target ? 'on' : ''}`,
              onclick: () => {
                customTarget = false;
                set(v);
              },
            },
            fmt(v),
          ),
        ),
        h(
          'button',
          {
            class: `seg-btn ${custom ? 'on' : ''}`,
            onclick: () => {
              customTarget = true;
              draw();
            },
          },
          'Custom',
        ),
      ),
      custom
        ? h(
            'div',
            { class: 'target-custom' },
            h(
              'button',
              { class: 'btn small', onclick: () => set(target - K.targetStep), 'aria-label': 'Lower' },
              '−',
            ),
            input,
            h('span', { class: 'tb-g' }, 'G'),
            h(
              'button',
              { class: 'btn small', onclick: () => set(target + K.targetStep), 'aria-label': 'Higher' },
              '+',
            ),
            h('small', { class: 'hint' }, `Steps of ${fmt(K.targetStep)}, up to ${fmt(K.targetMax)}`),
          )
        : null,
    );
  };

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

  // ------------------------------------------------------------ online lobby (host)

  const lobbyBox = h('section', { class: 'setup-panel glass players-panel lobby-panel' });
  const hostName = h('input', {
    class: 'name',
    maxlength: '12',
    placeholder: suggested[0],
    value: typed[0] ?? '',
    'aria-label': 'Your name',
  }) as HTMLInputElement;
  hostName.oninput = () => {
    typed[0] = cleanName(hostName.value);
    room?.setHost(typed[0] || suggested[0], looks[0]);
  };
  let startBtn: HTMLButtonElement | null = null;
  const onlineReady = () => !!room && (fill || room.joined > 0);
  const inviteLink = () => inviteURL(room!.code);
  let copied = false;
  const share = async () => {
    const url = inviteLink();
    const text = `Join my Adventure Avenue game! Room code: ${room!.code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Adventure Avenue', text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        copied = true;
        drawLobby();
      }
    } catch {
      /* cancelled */
    }
  };
  const drawLobby = () => {
    if (!room) return;
    clear(lobbyBox);
    lobbyBox.append(
      h('div', { class: 'panel-head' }, h('h3', null, 'Players')),
      h(
        'div',
        { class: 'room-code' },
        h('small', null, 'Room code'),
        h('b', null, room.code),
        h(
          'button',
          { class: 'btn small', onclick: share },
          copied ? 'Copied!' : 'ontouchstart' in window ? 'Share invite' : 'Copy invite link',
        ),
      ),
      h(
        'p',
        { class: 'hint' },
        'Friends open the game, tap Play online, then Join a game and type this code.',
      ),
      h(
        'div',
        { class: 'host-me' },
        charButton(looks[0], 'big', () => {
          const taken = new Map<CharId, string>();
          room.lobby().seats.forEach((st, j) => {
            if (j > 0 && st.look && st.kind !== 'open') taken.set(st.look, st.name);
          });
          void choose(0, taken, draw);
        }),
        h('label', { class: 'opt' }, h('div', { class: 'opt-label' }, 'Your name'), hostName),
      ),
      lobbySeats(room.lobby(), 0, (i) => room.kick(i)),
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
    );
    if (startBtn) startBtn.disabled = !onlineReady() || !playable(getBoard(boardId) ?? BUILT_IN[0]);
  };
  if (room) {
    room.setHost(typed[0] || suggested[0], looks[0]);
    room.onChange(drawLobby);
  }

  const draw = () => {
    clear(wrap);
    const seats = total;
    const board = getBoard(boardId) ?? BUILT_IN[0];
    const start = h('button', { class: 'btn main big', disabled: !playable(board) }, 'Start game');
    startBtn = start;
    if (room) {
      room.setHost(typed[0] || suggested[0], looks[0]);
      room.setSettings({ boardName: board.name, rules, target, roundCap, fill });
    }
    start.onclick = () => {
      if (room) {
        writeJSON(NAMES_KEY, typed);
        writeJSON(OPTS_KEY, { humans, fill, total, target, roundCap, rules, boardId, plots });
        const list = room.seatConfigs((i) => suggested[i], fill);
        handlers.onStart({ rules, target, roundCap, seats: list, board, plots });
        return;
      }
      const seatList = Array.from({ length: seats }, (_, i) => {
        const human = i < humans;
        const name = human ? cleanName(typed[i] || '') || suggested[i] : suggested[i];
        return { name, cpu: !human, ch: looks[i] };
      });
      writeJSON(NAMES_KEY, typed);
      writeJSON(OPTS_KEY, { humans, fill, total, target, roundCap, rules, boardId, plots });
      handlers.onStart({ rules, target, roundCap, seats: seatList, board, plots });
    };
    wrap.append(
      h(
        'header',
        { class: 'setup-head' },
        h(
          'button',
          {
            class: 'btn ghost small back',
            onclick: () => {
              if (room?.joined && !window.confirm('Close the room? Players who joined will be sent back.'))
                return;
              room?.leave();
              handlers.onBack();
            },
          },
          room ? '‹ Back' : '‹ Menu',
        ),
        h('h2', null, room ? 'Host online game' : 'New game'),
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
          targetPicker(),
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
          rules === 'standard'
            ? seg(
                'Vacant plots',
                ['none', 'few', 'some', 'lot', 'all'] as PlotSetting[],
                plots,
                (v) => PLOT_LABEL[v],
                (v) => (plots = v),
              )
            : null,
          rules === 'standard'
            ? h(
                'p',
                { class: 'hint' },
                plots === 'all'
                  ? 'Every property starts as a vacant plot, and any building can be built any number of times.'
                  : `Some properties start as vacant plots (up to ${K.plotMax}). Each building can be built at most ${K.buildingLimit} times.`,
              )
            : null,
        ),
        room
          ? lobbyBox
          : h(
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
                'Players in the game',
                Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2),
                total,
                (v) => `${v} players`,
                (v) => {
                  total = v;
                  humans = Math.min(humans, v);
                },
              ),
              seg(
                'Humans on this device (the rest are CPUs)',
                Array.from({ length: total }, (_, i) => i + 1),
                humans,
                (v) => `${v} human${v > 1 ? 's' : ''}`,
                (v) => (humans = v),
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
                  const others = new Map<CharId, string>();
                  for (let j = 0; j < humans; j++)
                    if (j !== i) others.set(looks[j], cleanName(typed[j] || '') || suggested[j]);
                  return h(
                    'div',
                    { class: 'seat-card', style: `--pc:${PLAYER_COLORS[i]}` },
                    charButton(looks[i], '', human ? () => void choose(i, others, draw) : null),
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
        room && !onlineReady() ? h('small', { class: 'hint' }, 'Waiting for a friend to join.') : null,
        start,
      ),
    );
    slide = '';
    drawLobby();
  };
  draw();
  return () => {
    document.removeEventListener('keydown', onKey);
    closeSoundPopover();
    scene.stop();
    el.remove();
  };
}
