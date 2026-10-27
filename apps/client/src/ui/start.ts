/**
 * Game setup (opened from Play on the main menu): a looping carousel of boards, the rules,
 * player count, characters (each player picks a different one) and names. It also opens a
 * room with a join code: friends who join take CPU seats and the game is played online; if
 * nobody joins it is a game on this device. Players who join see the same screen with every
 * setting shown but locked (`guestSetup`).
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
import type { GuestRoom } from '../net/guestroom';
import type { HostRoom, LocalSeat } from '../net/hostroom';
import { inviteURL, type LobbyInfo } from '../net/protocol';
import { lobbySeats } from './online';
import { digitPicker } from './digits';
import { closeSoundPopover, soundButton } from './soundpanel';
import { sound } from '../audio';
import { clear, h } from './dom';

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
/** A friendly random name (for joining before a name has been typed). */
export function randomName(): string {
  return NAMES[Math.floor(Math.random() * NAMES.length)];
}

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
  /** `online`: friends joined, so the room stays open and the game is played online. */
  onStart(opts: MatchOptions, online: boolean): void;
  onBack(): void;
  /** Open the board editor, optionally on an existing board. */
  onEditor(board: BoardDef | null): void;
}

/** What game setup uses of the host's room (a HostRoom; the UI Lab passes a stand-in). */
export type SetupRoom = Pick<
  HostRoom,
  'code' | 'joined' | 'lobby' | 'configure' | 'setSettings' | 'kick' | 'onChange' | 'seatConfigs' | 'leave'
>;

/** What the locked setup a joined player sees uses of their room. */
export type GuestSetupRoom = Pick<GuestRoom, 'code' | 'seat' | 'lobby' | 'setLook' | 'setName' | 'leave'>;

/** The rules part of the settings. */
interface RuleSettings {
  rules: RuleSet;
  target: number;
  roundCap: number;
  plots: PlotSetting;
}

/** A target in 1,000G steps from 1,000G to 90,000G. */
const cleanTarget = (v: number) =>
  Math.min(K.targetMax, Math.max(K.targetStep, Math.round(v / K.targetStep) * K.targetStep)) ||
  K.defaultTarget;

/**
 * A row of choices. Without `set` it only shows the current one (a joined player's view).
 * `off` greys out choices that can't be picked right now.
 */
function seg<T>(
  label: string,
  values: T[],
  cur: T,
  text: (v: T) => string,
  set?: (v: T) => void,
  off?: (v: T) => boolean,
) {
  return h(
    'div',
    { class: 'opt' },
    h('div', { class: 'opt-label' }, label),
    h(
      'div',
      { class: `seg ${set ? '' : 'ro'}` },
      ...values.map((v) =>
        h(
          'button',
          {
            class: `seg-btn ${v === cur ? 'on' : ''}`,
            disabled: !set || !!off?.(v),
            onclick: () => set?.(v),
          },
          text(v),
        ),
      ),
    ),
  );
}

/**
 * The rules panel: target net worth (arrows on each digit, in 1,000G steps), round limit, rule
 * set and vacant plots. Without `edit` everything is shown but locked.
 */
function rulesPanel(st: RuleSettings, edit?: (patch: Partial<RuleSettings>) => void): HTMLElement {
  const target = digitPicker({
    max: K.targetMax,
    min: K.targetStep,
    unit: K.targetStep,
    value: st.target,
    suffix: 'G',
    readOnly: !edit,
    onChange: (v) => edit?.({ target: cleanTarget(v) }),
  });
  return h(
    'section',
    { class: 'setup-panel glass rules-panel' },
    h('h3', null, 'Rules'),
    h('div', { class: 'opt target-opt' }, h('div', { class: 'opt-label' }, 'Target net worth'), target.el),
    seg(
      'Round limit',
      K.roundCapOptions as unknown as number[],
      st.roundCap,
      (v) => (v ? String(v) : 'None'),
      edit && ((v) => edit({ roundCap: v })),
    ),
    seg(
      'Rule set',
      ['standard', 'easy'] as RuleSet[],
      st.rules,
      (v) => (v === 'standard' ? 'Standard' : 'Easy'),
      edit && ((v) => edit({ rules: v })),
    ),
    h(
      'p',
      { class: 'hint' },
      st.rules === 'standard'
        ? 'Standard: districts, vacant plots and the stock market.'
        : 'Easy: rows of connected shops, no plots and no stock market.',
    ),
    st.rules === 'standard'
      ? seg(
          'Vacant plots',
          ['none', 'few', 'some', 'lot', 'all'] as PlotSetting[],
          st.plots,
          (v) => PLOT_LABEL[v],
          edit && ((v) => edit({ plots: v })),
        )
      : null,
    st.rules === 'standard'
      ? h(
          'p',
          { class: 'hint' },
          st.plots === 'all'
            ? 'Every property starts as a vacant plot, and any building can be built any number of times.'
            : `Some properties start as vacant plots (up to ${K.plotMax}). Each building can be built at most ${K.buildingLimit} times.`,
        )
      : null,
  );
}

/** The chosen board: its picture, name and size. */
function boardStage(board: BoardDef, mine: boolean, slide = ''): HTMLElement {
  return h(
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
      validateBoard(board).errors.length
        ? h('small', { class: 'car-bad' }, 'Has problems: fix it in the board editor to play.')
        : null,
    ),
  );
}

/** The screen around the panels: the title scene, a header with Back, and the panels. */
function setupFrame() {
  sound.music('menu');
  const scene = titleScene(false);
  const wrap = h('div', { class: 'setup-wrap' });
  const el = h('div', { class: 'setup' }, scene.el, wrap);
  return {
    el,
    wrap,
    close: () => {
      closeSoundPopover();
      scene.stop();
      el.remove();
    },
  };
}

function setupHead(back: string, onBack: () => void, title: string) {
  return h(
    'header',
    { class: 'setup-head' },
    h('button', { class: 'btn ghost small back', onclick: onBack }, back),
    h('h2', null, title),
    soundButton('btn small ghost setup-sound'),
  );
}

/**
 * Game setup. `openRoom` gets a room with a join code (null when there is no connection, which
 * still allows a game on this device); without it there is no join code at all.
 */
export function setupScreen(
  root: HTMLElement,
  handlers: SetupHandlers,
  openRoom?: () => Promise<SetupRoom | null>,
) {
  const saved = readJSON(OPTS_KEY, {
    humans: 1,
    total: 4,
    target: K.defaultTarget as number,
    roundCap: 0,
    plots: 'few' as PlotSetting,
    rules: 'standard' as RuleSet,
    boardId: 'town',
  });
  let humans = saved.humans;
  /** Players in the match: the humans on this device, then friends who joined, then CPUs. */
  let total = Math.max(2, Math.min(MAX_PLAYERS, saved.total ?? 4));
  humans = Math.max(1, Math.min(humans, total));
  const st: RuleSettings = {
    target: cleanTarget(saved.target),
    roundCap: saved.roundCap,
    plots: saved.plots ?? 'few',
    rules: saved.rules,
  };
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

  // The room for the join code: opening, open, or unavailable.
  let room: SetupRoom | null = null;
  let roomState: 'none' | 'opening' | 'open' | 'failed' = openRoom ? 'opening' : 'none';
  let closed = false;
  /** Set while this screen updates the room, so the room's change event doesn't redraw it. */
  let syncing = false;
  let sentSeats = '';
  let sentSettings = '';
  let offRoom: (() => void) | null = null;
  let copied = false;

  const joined = () => room?.joined ?? 0;
  const nameOf = (i: number) => cleanName(typed[i] || '') || suggested[i];
  /** Seats of joined players, in seat order (they come right after the humans on this device). */
  const lobbySeatsNow = () => room?.lobby().seats ?? [];
  /** Characters held by people (this device's humans and joined friends), except seat `but`. */
  const peopleLooks = (but: number) => {
    const out = new Map<CharId, string>();
    for (let j = 0; j < humans; j++) if (j !== but) out.set(looks[j], nameOf(j));
    lobbySeatsNow().forEach((s, j) => {
      if (j !== but && s.kind === 'remote' && s.look) out.set(s.look, s.name);
    });
    return out;
  };
  /** A CPU seat's character: its own unless a person has it. */
  const cpuLook = (i: number) => {
    const taken = peopleLooks(i);
    return taken.has(looks[i]) ? freeCharacter([...taken.keys()]) : looks[i];
  };
  /**
   * Give seat `i` a character. A CPU seat that had it switches to a free one; human seats never
   * share, because the picker greys out what other people have.
   */
  const setLook = (i: number, id: CharId) => {
    looks[i] = id;
    looks.forEach((l, j) => {
      if (j !== i && l === id) looks[j] = freeCharacter(looks.filter((_, k) => k !== j));
    });
  };
  const choose = async (i: number) => {
    const id = await pickCharacter({ current: looks[i], taken: peopleLooks(i), color: PLAYER_COLORS[i] });
    if (id) {
      setLook(i, id);
      draw();
    }
  };

  /** Tell the room about the seats and settings (only what changed). */
  const sync = () => {
    if (!room) return;
    syncing = true;
    const locals: LocalSeat[] = Array.from({ length: humans }, (_, i) => ({
      name: nameOf(i),
      look: looks[i],
    }));
    const seatKey = JSON.stringify([total, locals]);
    if (seatKey !== sentSeats) {
      sentSeats = seatKey;
      room.configure(total, locals);
    }
    const board = getBoard(boardId) ?? BUILT_IN[0];
    const settingsKey = JSON.stringify([board.id, st]);
    if (settingsKey !== sentSettings) {
      sentSettings = settingsKey;
      room.setSettings({ boardName: board.name, board, ...st });
    }
    syncing = false;
  };

  const connect = () => {
    if (!openRoom) return;
    roomState = 'opening';
    void openRoom().then((r) => {
      if (closed) {
        r?.leave();
        return;
      }
      room = r;
      roomState = r ? 'open' : 'failed';
      sentSeats = sentSettings = '';
      offRoom = r?.onChange(() => !syncing && draw()) ?? null;
      draw();
    });
  };

  const frame = setupFrame();
  const { wrap } = frame;
  root.append(frame.el);

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
    const stage = boardStage(board, mine, slide);
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
          {
            class: 'btn small ghost',
            onclick: () => {
              leaveRoom();
              handlers.onEditor(mine ? board : null);
            },
          },
          mine ? 'Edit this board' : 'Board editor',
        ),
      ),
      notice ? h('p', { class: 'hint board-notice' }, notice) : null,
    );
  };

  const share = async () => {
    if (!room) return;
    const url = inviteURL(room.code);
    const text = `Join my Adventure Avenue game! Code: ${room.code}`;
    try {
      if (navigator.share && 'ontouchstart' in window)
        await navigator.share({ title: 'Adventure Avenue', text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        copied = true;
        draw();
      }
    } catch {
      /* cancelled */
    }
  };

  /** The join code box at the top of the Players panel. */
  const joinBox = () => {
    if (roomState === 'none') return null;
    if (roomState === 'opening')
      return h(
        'div',
        { class: 'room-code pending' },
        h('small', null, 'Join code'),
        h('span', { class: 'spinner' }),
        h('small', null, 'Getting a code...'),
      );
    if (roomState === 'failed' || !room)
      return h(
        'div',
        { class: 'room-code failed' },
        h('small', null, 'No join code (no connection?). You can still play on this device.'),
        h('button', { class: 'btn small', onclick: () => (connect(), draw()) }, 'Try again'),
      );
    return h(
      'div',
      { class: 'room-code' },
      h('small', null, 'Join code'),
      h('b', null, room.code),
      h(
        'button',
        { class: 'btn small', onclick: share },
        copied ? 'Copied!' : 'ontouchstart' in window ? 'Share invite' : 'Copy invite link',
      ),
    );
  };

  /** One seat: this device's humans have a name box and a character button. */
  const seatCard = (i: number) => {
    const color = PLAYER_COLORS[i];
    if (i < humans) {
      const input = h('input', {
        class: 'name',
        maxlength: '12',
        placeholder: suggested[i],
        value: typed[i] ?? '',
        'aria-label': `Player ${i + 1} name`,
        oninput: (e: Event) => {
          typed[i] = cleanName((e.target as HTMLInputElement).value);
          sync();
        },
      }) as HTMLInputElement;
      return h(
        'div',
        { class: 'seat-card', style: `--pc:${color}` },
        charButton(looks[i], '', () => void choose(i)),
        input,
        h('span', { class: 'seat-tag' }, i === 0 ? 'You' : `P${i + 1}`),
      );
    }
    const seat = lobbySeatsNow()[i];
    if (seat?.kind === 'remote') {
      return h(
        'div',
        { class: 'seat-card joined', style: `--pc:${color}` },
        charButton(seat.look ?? looks[i], '', null),
        h('span', { class: 'name' }, seat.name),
        h('span', { class: 'seat-tag' }, seat.online ? 'Joined' : 'Away'),
        h(
          'button',
          {
            class: 'seat-kick',
            title: `Remove ${seat.name}`,
            'aria-label': `Remove ${seat.name}`,
            onclick: () => room?.kick(i),
          },
          '×',
        ),
      );
    }
    return h(
      'div',
      { class: 'seat-card', style: `--pc:${color}` },
      charButton(cpuLook(i), '', null),
      h('span', { class: 'name cpu' }, suggested[i]),
      h('span', { class: 'seat-tag', title: room ? 'A friend who joins takes this seat' : '' }, 'CPU'),
    );
  };

  const playersPanel = () => {
    const j = joined();
    return h(
      'section',
      { class: 'setup-panel glass players-panel' },
      h(
        'div',
        { class: 'panel-head' },
        h('h3', null, 'Players'),
        h('button', { class: 'btn ghost small', onclick: () => (shuffle(), draw()) }, 'Shuffle characters'),
      ),
      joinBox(),
      room
        ? h(
            'p',
            { class: 'hint' },
            j
              ? `${j} friend${j > 1 ? 's' : ''} joined: this will be an online game.`
              : 'Friends tap Join on the main menu and type this code; they take a CPU seat. If nobody joins, you play on this device.',
          )
        : null,
      seg(
        'Players in the game',
        Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2),
        total,
        (v) => `${v} players`,
        (v) => {
          total = v;
          humans = Math.min(humans, v - joined());
          draw();
        },
        // Never fewer seats than the people already in them.
        (v) => v < humans + j,
      ),
      seg(
        'Humans on this device (the rest are friends or CPUs)',
        Array.from({ length: total }, (_, i) => i + 1),
        humans,
        (v) => `${v} human${v > 1 ? 's' : ''}`,
        (v) => {
          humans = v;
          draw();
        },
        (v) => v > total - j,
      ),
      h('div', { class: 'seats' }, ...Array.from({ length: total }, (_, i) => seatCard(i))),
    );
  };

  const leaveRoom = () => {
    closed = true;
    offRoom?.();
    room?.leave();
    room = null;
  };

  const draw = () => {
    clear(wrap);
    // Joining fills seats: make room for everyone already here.
    total = Math.max(total, humans + joined());
    sync();
    const board = getBoard(boardId) ?? BUILT_IN[0];
    const online = joined() > 0;
    const start = h(
      'button',
      { class: 'btn main big', disabled: !playable(board) },
      online ? 'Start online game' : 'Start game',
    );
    start.onclick = () => {
      writeJSON(NAMES_KEY, typed);
      writeJSON(OPTS_KEY, { humans, total, boardId, ...st });
      const base = { ...st, board };
      if (room && online) {
        const seats = room.seatConfigs((i) => ({ name: suggested[i], ch: cpuLook(i) }));
        offRoom?.();
        closed = true;
        handlers.onStart({ ...base, seats }, true);
        return;
      }
      const seats = Array.from({ length: total }, (_, i) => ({
        name: i < humans ? nameOf(i) : suggested[i],
        cpu: i >= humans,
        ch: i < humans ? looks[i] : cpuLook(i),
      }));
      leaveRoom();
      handlers.onStart({ ...base, seats }, false);
    };
    wrap.append(
      setupHead(
        '‹ Menu',
        () => {
          if (online && !window.confirm('Close the game? Friends who joined will be sent back.')) return;
          leaveRoom();
          handlers.onBack();
        },
        'New game',
      ),
      h(
        'div',
        { class: 'setup-grid' },
        boardPanel(),
        rulesPanel(st, (patch) => {
          Object.assign(st, patch);
          draw();
        }),
        playersPanel(),
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
  connect();
  draw();
  return () => {
    if (!closed) leaveRoom();
    document.removeEventListener('keydown', onKey);
    frame.close();
  };
}

export interface GuestSetupHandlers {
  onBack(): void;
}

/**
 * What a player who joined sees until the host starts: the host's setup with every setting
 * shown but locked. They can change only their own name and character. Call `update` when the
 * lobby changes.
 */
export function guestSetup(root: HTMLElement, room: GuestSetupRoom, handlers: GuestSetupHandlers) {
  const frame = setupFrame();
  root.append(frame.el);
  // Kept across redraws so typing isn't interrupted when the lobby changes.
  const nameIn = h('input', {
    class: 'name',
    maxlength: '12',
    'aria-label': 'Your name',
  }) as HTMLInputElement;
  const rename = () => {
    const n = cleanName(nameIn.value);
    if (n) room.setName(n);
  };
  nameIn.onchange = rename;
  // (A handler that returns false would cancel every key, so no expression body here.)
  nameIn.onkeydown = (e) => {
    if (e.key === 'Enter') nameIn.blur();
  };

  const pick = (lobby: LobbyInfo, i: number) => {
    // Characters other people have can't be picked; CPUs take whatever is left.
    const taken = new Map<CharId, string>();
    lobby.seats.forEach((s, j) => {
      if (j !== i && s.look && s.kind !== 'open' && s.kind !== 'cpu') taken.set(s.look, s.name);
    });
    void pickCharacter({ current: lobby.seats[i].look ?? '', taken, color: PLAYER_COLORS[i] }).then(
      (id) => id && room.setLook(id),
    );
  };

  const draw = () => {
    const lobby = room.lobby;
    clear(frame.wrap);
    const board = lobby ? (lobby.board ?? BUILT_IN.find((b) => b.name === lobby.boardName)) : undefined;
    const me = lobby?.seats[room.seat];
    if (me && document.activeElement !== nameIn) nameIn.value = me.name;
    frame.wrap.append(
      setupHead(
        '‹ Leave',
        () => {
          room.leave();
          handlers.onBack();
        },
        'Joined game',
      ),
      h(
        'div',
        { class: 'setup-grid' },
        h(
          'section',
          { class: 'setup-panel glass board-panel' },
          h('h3', null, 'Board'),
          board
            ? h('div', { class: 'carousel locked' }, boardStage(board, false))
            : h('p', { class: 'hint' }, lobby ? lobby.boardName : 'Loading...'),
          h('p', { class: 'hint center' }, 'The host picks the board and the rules.'),
        ),
        lobby
          ? rulesPanel({
              rules: lobby.rules,
              target: lobby.target,
              roundCap: lobby.roundCap,
              plots: lobby.plots ?? 'few',
            })
          : h('section', { class: 'setup-panel glass rules-panel' }, h('h3', null, 'Rules')),
        h(
          'section',
          { class: 'setup-panel glass players-panel' },
          h('div', { class: 'panel-head' }, h('h3', null, 'Players')),
          h('div', { class: 'room-code small' }, h('small', null, 'Join code'), h('b', null, room.code)),
          me ? h('label', { class: 'opt' }, h('div', { class: 'opt-label' }, 'Your name'), nameIn) : null,
          lobby
            ? lobbySeats(lobby, room.seat, undefined, (i) => pick(lobby, i))
            : h('p', { class: 'hint' }, 'Connected. Waiting for the lobby...'),
          h('p', { class: 'hint' }, 'Tap your picture to pick a different character.'),
        ),
      ),
      h(
        'footer',
        { class: 'setup-foot' },
        h(
          'p',
          { class: 'waiting' },
          h('span', { class: 'spinner' }),
          'Waiting for the host to start the game...',
        ),
      ),
    );
  };
  draw();
  return { update: draw, close: () => frame.close() };
}
