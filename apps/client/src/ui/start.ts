/**
 * Game setup (opened from Play on the main menu): the players (the host is always in; add
 * bots or more players on this device), a looping carousel of boards and the rules. It also
 * opens a room with a join code: friends who join take a free seat, or a bot's when the game is
 * full, and the game is played online; if nobody joins it is a game on this device. Players who join see the same screen with every
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
  type StockSystem,
  type RuleSet,
} from '@aa/engine';
import { boardThumb } from './thumb';
import { BUILT_IN, getBoard, listBoards, pickBoardFile, readBoardFile, saveBoard } from '../boardstore';
import { freeCharacter, shuffledCharacters } from '../sprites';
import { cleanName, loadProfile } from '../profile';
import { charButton, pickCharacter } from './charpick';
import { loadSave } from '../save';
import { titleScene } from './menu';
import type { GuestRoom } from '../net/guestroom';
import type { HostRoom, LocalSeat } from '../net/hostroom';
import { inviteURL, type LobbyInfo } from '../net/protocol';
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

const OPTS_KEY = 'adventure-avenue-options';

export { cleanName };

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
  | 'code'
  | 'joined'
  | 'lobby'
  | 'configure'
  | 'setSettings'
  | 'setStarting'
  | 'kick'
  | 'onChange'
  | 'seatConfigs'
  | 'leave'
>;

/** What the locked setup a joined player sees uses of their room. */
export type GuestSetupRoom = Pick<GuestRoom, 'code' | 'seat' | 'lobby' | 'setLook' | 'setReady' | 'leave'>;

/** Seconds between everyone being ready and the game starting (to change their mind). */
const START_COUNTDOWN = 3;

/** A joined player's ready state on their seat card. */
function readyBadge(on: boolean): HTMLElement {
  return h('span', { class: `seat-ready badge ${on ? 'on' : ''}` }, on ? '✓ Ready' : 'Not ready');
}

/** A player's name plate on their seat card: a pill in their color, as over tokens on the board. */
export function seatName(name: string): HTMLElement {
  return h('span', { class: 'seat-name' }, name);
}

/** The rules part of the settings. */
interface RuleSettings {
  rules: RuleSet;
  target: number;
  roundCap: number;
  plots: PlotSetting;
  stocks: StockSystem;
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
export function rulesPanel(st: RuleSettings, edit?: (patch: Partial<RuleSettings>) => void): HTMLElement {
  const target = digitPicker({
    max: K.targetMax,
    min: K.targetStep,
    unit: K.targetStep,
    value: st.target,
    suffix: 'G',
    minButton: false,
    maxButton: false,
    readOnly: !edit,
    onChange: (v) => edit?.({ target: cleanTarget(v) }),
  });
  const standard = st.rules === 'standard';
  return h(
    'section',
    { class: 'setup-panel glass rules-panel' },
    h('h3', null, 'Game settings'),
    h(
      'div',
      { class: 'su-rules' },
      h(
        'div',
        { class: 'su-rule su-r-rules' },
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
          standard
            ? 'Districts, vacant plots and the stock market.'
            : 'Rows of connected shops, no plots or stocks.',
        ),
      ),
      h(
        'div',
        { class: 'su-rule opt target-opt su-r-goal' },
        h('div', { class: 'opt-label' }, 'Winning goal'),
        target.el,
        h('p', { class: 'hint' }, 'Reach it, then return to the bank.'),
      ),
      h(
        'div',
        { class: 'su-rule su-r-round' },
        seg(
          'Round limit',
          K.roundCapOptions as unknown as number[],
          st.roundCap,
          (v) => (v ? String(v) : 'None'),
          edit && ((v) => edit({ roundCap: v })),
        ),
      ),
      standard
        ? h(
            'div',
            { class: 'su-rule su-r-plots' },
            seg(
              'Vacant plots',
              ['none', 'few', 'some', 'lot', 'all'] as PlotSetting[],
              st.plots,
              (v) => PLOT_LABEL[v],
              edit && ((v) => edit({ plots: v })),
            ),
            h(
              'p',
              { class: 'hint' },
              st.plots === 'all'
                ? 'Every property starts as a vacant plot.'
                : `${K.plotsPerDistrict[st.plots]} of each district's 4 properties start as plots.`,
            ),
          )
        : null,
      standard
        ? h(
            'div',
            { class: 'su-rule su-r-stocks' },
            seg(
              'Stocks',
              ['dynamic', 'classic'] as StockSystem[],
              st.stocks,
              (v) => (v === 'dynamic' ? 'Dynamic' : 'Classic'),
              edit && ((v) => edit({ stocks: v })),
            ),
            h(
              'p',
              { class: 'hint' },
              st.stocks === 'dynamic'
                ? `Buying lifts prices; selling ${K.sellOff}+ shakes a district.`
                : 'Trading 10+ shares at once moves the price 10%.',
            ),
          )
        : null,
    ),
  );
}

/** The chosen board: its picture, name and size. */
export function boardStage(board: BoardDef, mine: boolean, slide = ''): HTMLElement {
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

/**
 * The screen around the panels: the title scene; a top bar (Back, the title, the join code chip,
 * Sound) and a bottom container (the players and Start) that stay put; and between them the
 * panels, which scroll on small screens (no scroll bar).
 */
export function setupFrame() {
  sound.music('setup');
  const scene = titleScene(false);
  const top = h('header', { class: 'su-top' });
  const wrap = h('div', { class: 'su-main' });
  const dock = h('footer', { class: 'su-dock glass' });
  const el = h('div', { class: 'setup su' }, scene.el, top, h('div', { class: 'su-scroll' }, wrap), dock);
  return {
    el,
    top,
    wrap,
    dock,
    close: () => {
      closeSoundPopover();
      scene.stop();
      el.remove();
    },
  };
}

/** How long the bottom bar takes to grow, shrink and move its seats (ms). */
const DOCK_MS = 320;
const DOCK_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * Rebuild the bottom bar (`rebuild` replaces its contents) and animate the change: the bar eases
 * from its old size to its new one, seats that stayed slide to their new places, new seats pop
 * in, and seats that left fade out where they were. Seats are matched by `data-key` (their
 * character, which no two seats share). Safe to call while an earlier change is still animating:
 * it starts from wherever things are on screen.
 */
export function morphDock(dock: HTMLElement, rebuild: () => void) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const from = dock.getBoundingClientRect();
  const before = new Map<string, { el: HTMLElement; r: DOMRect }>();
  for (const el of dock.querySelectorAll<HTMLElement>('[data-key]'))
    if (!el.classList.contains('dock-ghost'))
      before.set(el.dataset.key!, { el, r: el.getBoundingClientRect() });
  // Stop what is still running (measured above, so nothing jumps) and drop old ghosts.
  for (const a of dock.getAnimations({ subtree: true })) a.cancel();
  dock.querySelectorAll('.dock-ghost').forEach((g) => g.remove());
  rebuild();
  if (reduce || !from.width || !before.size) return;
  const to = dock.getBoundingClientRect();
  const opts = { duration: DOCK_MS, easing: DOCK_EASE };
  if (Math.abs(to.width - from.width) > 0.5 || Math.abs(to.height - from.height) > 0.5)
    dock.animate(
      [
        { width: `${from.width}px`, height: `${from.height}px` },
        { width: `${to.width}px`, height: `${to.height}px` },
      ],
      opts,
    );
  const seen = new Set<string>();
  for (const el of dock.querySelectorAll<HTMLElement>('[data-key]')) {
    const key = el.dataset.key!;
    seen.add(key);
    const old = before.get(key);
    const r = el.getBoundingClientRect();
    if (!old) {
      el.animate(
        [
          { opacity: 0, transform: 'scale(0.85)' },
          { opacity: 1, transform: 'none' },
        ],
        { ...opts, delay: 60, fill: 'backwards' },
      );
      continue;
    }
    // Positions inside the bar (the bar itself is moving too while it resizes).
    const dx = old.r.left - from.left - (r.left - to.left);
    const dy = old.r.top - from.top - (r.top - to.top);
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], opts);
  }
  // Seats that left: a copy fades and shrinks away where the seat was.
  for (const [key, { el, r }] of before) {
    if (seen.has(key)) continue;
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.add('dock-ghost');
    Object.assign(ghost.style, {
      position: 'absolute',
      left: `${r.left - to.left}px`,
      top: `${r.top - to.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      margin: '0',
      pointerEvents: 'none',
    });
    dock.append(ghost);
    ghost
      .animate(
        [
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'scale(0.85)' },
        ],
        { duration: DOCK_MS * 0.7, easing: 'ease-in', fill: 'forwards' },
      )
      .finished.then(
        () => ghost.remove(),
        () => ghost.remove(),
      );
  }
}

/** The top bar: Back, the title, the join code chip (if any) and Sound (as on the main menu). */
export function setupHead(top: HTMLElement, onBack: () => void, title: string, code: Node | null) {
  clear(top);
  top.append(
    h('button', { class: 'btn small su-back', onclick: onBack }, '‹ Back'),
    h('h2', null, title),
    h('span', { class: 'su-top-gap' }),
    code ?? '',
    soundButton('btn menu-sound', 'Sound'),
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
  // The board and settings are remembered from the last game; the players are not.
  const saved = readJSON(OPTS_KEY, {
    target: K.defaultTarget as number,
    roundCap: 0,
    plots: 'few' as PlotSetting,
    stocks: 'dynamic' as StockSystem,
    rules: 'standard' as RuleSet,
    boardId: 'town',
  });
  /**
   * Players on this device (the host first), then friends who joined, then bots. Setup starts
   * with only the host: bots and other players are added by hand (or join with the code).
   */
  let humans = 1;
  let bots = 0;
  const st: RuleSettings = {
    target: cleanTarget(saved.target),
    roundCap: saved.roundCap,
    plots: saved.plots ?? 'few',
    stocks: saved.stocks ?? 'dynamic',
    rules: saved.rules,
  };
  let boardId: string = getBoard(saved.boardId) ? saved.boardId : 'town';
  let notice = '';
  /** Direction of the last carousel move, so only that redraw animates the slide. */
  let slide: 'next' | 'prev' | '' = '';
  /** Which players on this device have tapped Ready (by seat). */
  const ready: boolean[] = [];
  /** The board and settings the Ready taps were for: changing them asks everyone again. */
  let readyFor = '';
  /** Seconds left before the game starts once everyone is ready (0: not counting down). */
  let countdown = 0;
  let countTimer = 0;
  /** The line above the seats saying who we are waiting for, or the countdown. */
  const statusEl = h('span', { class: 'su-status', role: 'status', 'aria-live': 'polite' });
  let looks: CharId[] = [];
  let suggested: string[] = [];
  const shuffle = () => {
    looks = shuffledCharacters(PLAYER_COLORS.length);
    const pool = NAMES.slice();
    suggested = PLAYER_COLORS.map(() => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  };
  shuffle();
  // The host sits down as their player card (set on the main menu).
  const card = loadProfile();

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
  /** Names are set before game setup (the host's on the main menu's player card); other players
   * on this device and bots get a suggested name. */
  const nameOf = (i: number) => (i === 0 && cleanName(card.name)) || suggested[i];
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
  if (card.look) setLook(0, card.look);
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
      ready: !!ready[i],
    }));
    const first = humans + joined();
    const botSeats: LocalSeat[] = Array.from({ length: bots }, (_, k) => ({
      name: suggested[first + k],
      look: cpuLook(first + k),
    }));
    const seatKey = JSON.stringify([locals, botSeats]);
    if (seatKey !== sentSeats) {
      sentSeats = seatKey;
      room.configure(locals, botSeats);
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
    const importBtn = h('button', { class: 'su-chip' }, 'Import board');
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
      // The board tools sit as chips in the panel's top right corner.
      h(
        'div',
        { class: 'panel-head' },
        h('h3', null, 'Map'),
        h(
          'div',
          { class: 'su-chips' },
          importBtn,
          h(
            'button',
            {
              class: 'su-chip',
              onclick: () => {
                leaveRoom();
                handlers.onEditor(mine ? board : null);
              },
            },
            mine ? 'Edit this board' : 'Board editor',
          ),
        ),
      ),
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

  /**
   * The join code as a chip in the top bar (it never scrolls away): tap it to share or copy the
   * invite. While opening it says so; with no connection it offers to try again.
   */
  const codeChip = () => {
    if (roomState === 'none') return null;
    if (roomState === 'opening')
      return h('span', { class: 'su-code pending' }, h('span', { class: 'spinner' }), 'Getting a code...');
    if (roomState === 'failed' || !room)
      return h(
        'button',
        {
          class: 'su-code failed',
          title: 'No join code (no connection?). You can still play on this device.',
          onclick: () => (connect(), draw()),
        },
        'Offline · Try again',
      );
    return h(
      'button',
      {
        class: 'su-code',
        title:
          "Friends join with this code: they take a free seat, or a bot's if the game is full. Tap to share the invite.",
        onclick: share,
      },
      h('small', null, 'Code'),
      h('b', null, room.code),
      h(
        'span',
        { class: 'su-code-act' },
        copied ? 'Copied!' : 'ontouchstart' in window ? 'Share' : 'Copy link',
      ),
    );
  };

  /** Everyone in the game, in seat order. */
  const total = () => humans + joined() + bots;
  const room4 = () => total() < MAX_PLAYERS;

  /**
   * One seat card: the player's name plate over the character standing on a spot (as on the
   * board), the Ready chip under their feet, what kind of player, and remove.
   */
  const seatCard = (i: number) => {
    const color = PLAYER_COLORS[i];
    const card = (
      kind: string,
      look: CharId,
      pick: (() => void) | null,
      name: string,
      tag: string,
      remove?: { label: string; act: () => void },
      readyEl?: Node,
    ) =>
      h(
        'div',
        { class: `seat-card ${kind}`, style: `--pc:${color}`, 'data-key': look },
        seatName(name),
        h('div', { class: 'seat-stage' }, charButton(look, 'body', pick)),
        // Bots have no chip; an empty one keeps every card's rows lined up.
        readyEl ?? h('span', { class: 'seat-ready ghost', 'aria-hidden': 'true' }, 'Ready'),
        h('span', { class: 'seat-tag' }, tag),
        remove
          ? h(
              'button',
              { class: 'seat-kick', title: remove.label, 'aria-label': remove.label, onclick: remove.act },
              '×',
            )
          : null,
      );
    if (i < humans) {
      return card(
        'human',
        looks[i],
        () => void choose(i),
        nameOf(i),
        i === 0 ? 'You · host' : 'On this device',
        i === 0
          ? undefined
          : {
              label: 'Remove this player',
              act: () => {
                // The players after them move up a seat, keeping their names and characters.
                suggested.push(suggested.splice(i, 1)[0]);
                ready.splice(i, 1);
                looks.push(looks.splice(i, 1)[0]);
                humans--;
                draw();
              },
            },
        // Each player on this device says they are ready with their own button.
        h(
          'button',
          {
            class: `seat-ready ${ready[i] ? 'on' : ''}`,
            'aria-pressed': String(!!ready[i]),
            title: ready[i] ? 'Tap if you are not ready after all' : 'Tap when you are ready to play',
            onclick: () => {
              ready[i] = !ready[i];
              draw();
            },
          },
          ready[i] ? '✓ Ready' : 'Ready',
        ),
      );
    }
    const seat = lobbySeatsNow()[i];
    if (seat?.kind === 'remote')
      return card(
        'joined',
        seat.look ?? looks[i],
        null,
        seat.name,
        seat.online ? 'Joined online' : 'Away',
        { label: `Remove ${seat.name}`, act: () => room?.kick(i) },
        readyBadge(!!seat.ready),
      );
    return card('bot', cpuLook(i), null, suggested[i], 'Bot', {
      label: 'Remove this bot',
      act: () => {
        bots--;
        draw();
      },
    });
  };

  /** The empty spots: add a bot, or (smaller) a player on this device. */
  const addCard = () =>
    h(
      'div',
      { class: 'seat-card add', 'data-key': 'add' },
      h(
        'button',
        {
          class: 'seat-add',
          onclick: () => {
            bots++;
            draw();
          },
        },
        h('span', { class: 'seat-plus', 'aria-hidden': 'true' }, '+'),
        h('b', null, 'Add bot'),
      ),
      h(
        'button',
        {
          class: 'btn small ghost',
          title: 'Add a player who plays on this device',
          onclick: () => {
            humans++;
            draw();
          },
        },
        '+ Local player',
      ),
    );

  /** The players, in the bottom container: a seat card each and the empty spot. */
  const playersPanel = () =>
    h(
      'section',
      { class: 'su-players' },
      h(
        'div',
        { class: 'su-players-head' },
        h('h3', null, `Players · ${total()} of ${MAX_PLAYERS}`),
        statusEl,
        loadSave() ? h('span', { class: 'hint' }, 'Starting replaces your saved game.') : null,
      ),
      h(
        'div',
        { class: 'seats' },
        ...Array.from({ length: total() }, (_, i) => seatCard(i)),
        room4() ? addCard() : null,
      ),
    );

  const leaveRoom = () => {
    closed = true;
    offRoom?.();
    room?.leave();
    room = null;
  };

  const draw = () => {
    clear(wrap);
    // Someone joined a full game: they took a bot's seat (checked again once the room has the
    // latest seats).
    const fit = () => (bots = Math.max(0, Math.min(bots, MAX_PLAYERS - humans - joined())));
    // A different board or settings: everyone says Ready again (the room asks joined players).
    const key = JSON.stringify([boardId, st]);
    if (readyFor && key !== readyFor) ready.fill(false);
    readyFor = key;
    fit();
    sync();
    fit();
    sync();
    const online = joined() > 0;
    setupHead(
      frame.top,
      () => {
        if (online && !window.confirm('Close the game? Friends who joined will be sent back.')) return;
        leaveRoom();
        handlers.onBack();
      },
      'New game',
      codeChip(),
    );
    wrap.append(
      boardPanel(),
      rulesPanel(st, (patch) => {
        Object.assign(st, patch);
        draw();
      }),
    );
    // The bottom bar fits its contents like the action bar, morphing when players come and go.
    morphDock(frame.dock, () => {
      clear(frame.dock);
      frame.dock.append(playersPanel());
      // The status line's new text is part of the bar's new size, so set it before measuring.
      checkReady();
    });
    slide = '';
  };

  /** Start the game with the seats as they are now. */
  const startGame = () => {
    stopCountdown();
    writeJSON(OPTS_KEY, { boardId, ...st });
    const board = getBoard(boardId) ?? BUILT_IN[0];
    const base = { ...st, board };
    if (room && joined() > 0) {
      const seats = room.seatConfigs((i) => ({ name: suggested[i], ch: cpuLook(i) }));
      offRoom?.();
      closed = true;
      handlers.onStart({ ...base, seats }, true);
      return;
    }
    const seats = Array.from({ length: total() }, (_, i) => ({
      name: i < humans ? nameOf(i) : suggested[i],
      cpu: i >= humans,
      ch: i < humans ? looks[i] : cpuLook(i),
    }));
    leaveRoom();
    handlers.onStart({ ...base, seats }, false);
  };

  const stopCountdown = () => {
    clearInterval(countTimer);
    countTimer = 0;
    countdown = 0;
    if (room) {
      syncing = true;
      room.setStarting(false);
      syncing = false;
    }
  };

  /**
   * Start once every person is ready (bots always are). With only one person it starts right
   * away; with more, a short countdown gives anyone a moment to change their mind.
   */
  const checkReady = () => {
    const board = getBoard(boardId) ?? BUILT_IN[0];
    const remotes = lobbySeatsNow().filter((x) => x.kind === 'remote');
    const people = [
      ...Array.from({ length: humans }, (_, i) => ({ name: nameOf(i), ready: !!ready[i] })),
      ...remotes.map((x) => ({ name: x.name, ready: !!x.ready && x.online })),
    ];
    const waiting = people.filter((x) => !x.ready);
    const blocked = !playable(board)
      ? 'Fix this board in the board editor to play.'
      : total() < 2
        ? 'Add a bot, a local player or a friend to play'
        : '';
    statusEl.classList.toggle('go', !waiting.length && !blocked);
    // Too few players is just the next step (add someone), not an error.
    statusEl.classList.toggle('bad', !playable(board));
    if (blocked || waiting.length) {
      if (countTimer) stopCountdown();
      statusEl.textContent =
        blocked ||
        (waiting.length === people.length
          ? people.length > 1
            ? 'Everyone taps Ready to start'
            : 'Tap Ready to start'
          : `Waiting for ${waiting.map((x) => x.name).join(', ')}`);
      return;
    }
    if (people.length === 1) {
      statusEl.textContent = 'Starting...';
      // Let the button show its tick before the screen changes.
      if (!countTimer) countTimer = window.setTimeout(startGame, 250);
      return;
    }
    if (countdown) return;
    countdown = START_COUNTDOWN;
    statusEl.textContent = `Everyone's ready! Starting in ${countdown}...`;
    if (room) {
      syncing = true;
      room.setStarting(true);
      syncing = false;
    }
    countTimer = window.setInterval(() => {
      countdown--;
      if (countdown <= 0) startGame();
      else statusEl.textContent = `Everyone's ready! Starting in ${countdown}...`;
    }, 1000);
  };
  connect();
  draw();
  return () => {
    clearInterval(countTimer);
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
 * shown but locked. They can change only their character (their name was set before joining)
 * and say they are ready. Call `update` when the lobby changes.
 */
export function guestSetup(root: HTMLElement, room: GuestSetupRoom, handlers: GuestSetupHandlers) {
  const frame = setupFrame();
  root.append(frame.el);
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
    setupHead(
      frame.top,
      () => {
        room.leave();
        handlers.onBack();
      },
      'Joined game',
      h(
        'span',
        { class: 'su-code', title: 'The code of the game you joined' },
        h('small', null, 'Code'),
        h('b', null, room.code),
      ),
    );
    frame.wrap.append(
      h(
        'section',
        { class: 'setup-panel glass board-panel' },
        h(
          'div',
          { class: 'panel-head' },
          h('h3', null, 'Map'),
          h('span', { class: 'hint' }, 'The host picks the board and the rules.'),
        ),
        board
          ? h('div', { class: 'carousel locked' }, boardStage(board, false))
          : h('p', { class: 'hint' }, lobby ? lobby.boardName : 'Loading...'),
      ),
      lobby
        ? rulesPanel({
            rules: lobby.rules,
            target: lobby.target,
            roundCap: lobby.roundCap,
            plots: lobby.plots ?? 'few',
            stocks: lobby.stocks ?? 'dynamic',
          })
        : h('section', { class: 'setup-panel glass rules-panel' }, h('h3', null, 'Game settings')),
    );
    const status = !lobby
      ? 'Connected. Waiting for the lobby...'
      : lobby.starting
        ? "Everyone's ready! Starting..."
        : me?.ready
          ? 'Waiting for everyone else...'
          : 'Tap Ready when you are set';
    morphDock(frame.dock, () => {
      clear(frame.dock);
      frame.dock.append(
        h(
          'section',
          { class: 'su-players' },
          h(
            'div',
            { class: 'su-players-head' },
            h('h3', null, lobby ? `Players · ${lobby.seats.length}` : 'Players'),
            h('span', { class: `su-status ${lobby?.starting ? 'go' : ''}`, role: 'status' }, status),
          ),
          lobby
            ? h(
                'div',
                { class: 'seats' },
                ...lobby.seats.map((x, i) => {
                  const mine = i === room.seat;
                  const bot = x.kind === 'cpu' || x.kind === 'open';
                  return h(
                    'div',
                    {
                      class: `seat-card ${bot ? 'bot' : mine ? 'human' : 'joined'}`,
                      'data-key': x.look ?? `open${i}`,
                      style: `--pc:${PLAYER_COLORS[i]}`,
                    },
                    seatName(x.kind === 'open' ? 'Open' : x.name),
                    h(
                      'div',
                      { class: 'seat-stage' },
                      x.look
                        ? charButton(x.look, 'body', mine ? () => pick(lobby, i) : null)
                        : h('span', { class: 'portrait empty' }, '?'),
                    ),
                    mine
                      ? h(
                          'button',
                          {
                            class: `seat-ready ${x.ready ? 'on' : ''}`,
                            'aria-pressed': String(!!x.ready),
                            title: x.ready
                              ? 'Tap if you are not ready after all'
                              : 'Tap when you are ready to play',
                            onclick: () => room.setReady(!x.ready),
                          },
                          x.ready ? '✓ Ready' : 'Ready',
                        )
                      : bot
                        ? h('span', { class: 'seat-ready ghost', 'aria-hidden': 'true' }, 'Ready')
                        : readyBadge(!!x.ready),
                    h(
                      'span',
                      { class: 'seat-tag' },
                      mine
                        ? 'You'
                        : x.kind === 'host'
                          ? 'Host'
                          : x.kind === 'open'
                            ? 'A friend can join'
                            : bot
                              ? 'Bot'
                              : x.kind === 'local'
                                ? "Host's device"
                                : 'Joined',
                    ),
                  );
                }),
              )
            : null,
        ),
      );
    });
  };
  draw();
  return {
    update: draw,
    close: () => frame.close(),
  };
}
