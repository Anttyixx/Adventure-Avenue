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
import { BUILT_IN, getBoard, listBoards } from '../boardstore';
import { freeCharacter } from '../sprites';
import { NAME_MAX, PLAYER_NAMES, cleanName, loadProfile } from '../profile';
import { nameText } from './marquee';
import { charButton, pickCharacter } from './charpick';
import { loadSave } from '../save';
import { titleScene } from './menu';
import type { GuestRoom } from '../net/guestroom';
import type { HostRoom, LocalSeat } from '../net/hostroom';
import { inviteURL, type LobbyInfo, type LobbySeat } from '../net/protocol';
import { digitPicker } from './digits';
import { closeSoundPopover, soundButton } from './soundpanel';
import { sound } from '../audio';
import { clear, h } from './dom';

const NAMES = PLAYER_NAMES;
/** A friendly random name (for joining before a name has been typed). */
export function randomName(): string {
  return NAMES[Math.floor(Math.random() * NAMES.length)];
}

/** What each vacant plot amount is called on screen. */
export const PLOT_LABEL: Record<PlotSetting, string> = {
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
export type GuestSetupRoom = Pick<
  GuestRoom,
  'code' | 'seat' | 'lobby' | 'setLook' | 'setName' | 'setReady' | 'leave'
>;

/** Seconds between everyone being ready and the game starting (to change their mind). */
const START_COUNTDOWN = 3;

/** A joined player's ready state on their seat card. */
function readyBadge(on: boolean): HTMLElement {
  return h('span', { class: `seat-ready badge ${on ? 'on' : ''}` }, on ? '✓ Ready' : 'Not ready');
}

/** What one seat card in the players column shows. */
export interface SeatView {
  /** Matches the card between redraws (its character, which no two seats share). */
  key: string;
  color: string;
  /** The character, or null for an open seat (a dashed "?" box). */
  look: CharId | null;
  /** Opens the character picker (players on this device), or null when it can't change. */
  pick?: (() => void) | null;
  name: string;
  /** What kind of player: "You · host", "Bot", "Joined online"... */
  tag: string;
  /** 'human', 'joined' or 'bot'. */
  kind: string;
  /** The Ready chip (a button for this device's players, a badge for others); none for bots. */
  ready?: Node | null;
  remove?: { label: string; act: () => void };
  /** A player who hasn't come back to a continued game yet: faded, with an "Away" chip. */
  away?: boolean;
  title?: string | null;
  /** Players who may rename themselves here: tapping the name edits it (see `NameEdit`). */
  rename?: NameEdit;
}

/** Renaming a seat in game setup: the screen keeps the draft, so a redraw doesn't lose it. */
export interface NameEdit {
  /** The name being typed, or null while not editing. */
  draft: string | null;
  start(): void;
  input(v: string): void;
  /** Done typing: `save` keeps the new name (an empty one keeps the old). */
  done(save: boolean): void;
}

/** The seat's name: plain, a button that starts renaming, or the box while renaming. */
function seatNameEl(s: SeatView): HTMLElement {
  const cls = `pname ${s.name.length > 7 ? 'long' : ''}`;
  const r = s.rename;
  if (!r) return nameText(s.name, cls);
  if (r.draft == null)
    return h(
      'button',
      {
        class: 'su-rename',
        title: 'Tap to change the name',
        'aria-label': `Rename ${s.name}`,
        onclick: r.start,
      },
      nameText(s.name, cls),
    );
  const box = h('input', {
    class: 'su-name-input',
    maxlength: String(NAME_MAX),
    value: r.draft,
    'aria-label': 'Name',
    autocomplete: 'off',
    spellcheck: 'false',
  }) as HTMLInputElement;
  box.oninput = () => r.input(box.value);
  box.onkeydown = (e) => {
    if (e.key === 'Enter') r.done(true);
    else if (e.key === 'Escape') {
      e.stopPropagation();
      r.done(false);
    }
  };
  // A redraw replaces the box (removing it blurs it) and focuses the new one, so wait a moment
  // and only finish for a box that is still there and really lost the cursor.
  box.onblur = () =>
    setTimeout(() => {
      if (box.isConnected && document.activeElement !== box) r.done(true);
    });
  return box;
}

/** After a redraw, put the cursor back in the name box being typed in (if any), at the end. */
export function refocusName(scope: HTMLElement) {
  const box = scope.querySelector<HTMLInputElement>('.su-name-input');
  if (!box || document.activeElement === box) return;
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
}

/**
 * One seat card, laid out like the player cards in the game: the character on the left (tap it
 * to change it), the name (and the remove button) on the top row, and what kind of player it is
 * with the Ready chip on the bottom row.
 */
export function seatCard(s: SeatView): HTMLElement {
  return h(
    'div',
    {
      class: `pcard su-seat ${s.kind} ${s.away ? 'away' : ''}`,
      style: `--pc:${s.color}`,
      'data-key': s.key,
      title: s.title ?? null,
    },
    h(
      'div',
      { class: 'pc-side' },
      s.look ? charButton(s.look, 'body', s.pick ?? null) : h('span', { class: 'portrait empty' }, '?'),
    ),
    h(
      'div',
      { class: 'pc-main' },
      h(
        'div',
        { class: 'pc-row pc-top' },
        seatNameEl(s),
        s.remove
          ? h(
              'button',
              {
                class: 'seat-kick',
                title: s.remove.label,
                'aria-label': s.remove.label,
                onclick: s.remove.act,
              },
              '×',
            )
          : null,
      ),
      h(
        'div',
        { class: 'pc-row su-seat-foot' },
        h('span', { class: 'seat-tag' }, s.tag),
        s.away ? h('span', { class: 'seat-away', 'aria-hidden': 'true' }, 'Away') : null,
        s.ready ?? null,
      ),
    ),
  );
}

/** A player on the host's device or a bot, in game setup. */
interface Spot {
  /** Lasting, so the seat keeps its place in the players column as others come and go. */
  id: number;
  name: string;
  look: CharId;
  /** Tapped Ready (bots always are). */
  ready: boolean;
}

/**
 * The players column's order on this device: this device's own player at the bottom, and
 * everyone else above them in the order they arrived, the newest on top. So each device lists
 * the players differently. `seen` remembers the arrival order between redraws (oldest first);
 * seats that are already there the first time keep their seat order.
 */
export function byArrival<T extends { key: string; mine?: boolean }>(seen: string[], seats: T[]): T[] {
  const keys = new Set(seats.map((x) => x.key));
  for (let i = seen.length - 1; i >= 0; i--) if (!keys.has(seen[i])) seen.splice(i, 1);
  for (const x of seats) if (x.mine && !seen.includes(x.key)) seen.unshift(x.key);
  for (const x of seats) if (!seen.includes(x.key)) seen.push(x.key);
  return seats.slice().sort((a, b) => seen.indexOf(b.key) - seen.indexOf(a.key));
}

/**
 * A lobby's seats for the players column, without open seats (a CPU plays them unless a friend
 * joins). Each gets a key that stays the same between redraws (its name, unlike the character,
 * doesn't change); `mine` marks this device's own seats.
 */
export function lobbyRows(seats: LobbySeat[], mine: (x: LobbySeat, i: number) => boolean) {
  const used = new Map<string, number>();
  return seats.flatMap((x, i) => {
    if (x.kind === 'open') return [];
    // This device's own seat and the host keep their key when renamed; others go by name.
    let key = mine(x, i) ? 'me' : x.kind === 'host' ? 'host' : `${x.kind === 'cpu' ? 'b' : 'p'}:${x.name}`;
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    if (n) key += `#${n}`;
    return [{ x, i, key, mine: mine(x, i) }];
  });
}

/**
 * The two chips above the top player in game setup (the host only, until the game is full):
 * Add local player (a player on this device) and Add bot, against the right edge.
 */
export function addChips(addLocal: () => void, addBot: () => void): HTMLElement {
  return h(
    'div',
    { class: 'su-add', 'data-key': 'add' },
    h(
      'button',
      { class: 'seat-add-local', title: 'Add a player who plays on this device', onclick: addLocal },
      'Add local player',
    ),
    h('button', { class: 'seat-add', title: 'Add a computer player', onclick: addBot }, 'Add bot'),
  );
}

/**
 * The players column's contents, top to bottom: optional chips (`top`), the seat cards and an
 * optional footer (Resume on the Continue game screen).
 */
export function playersColumn(cards: Node[], foot: Node | null = null, top: Node | null = null): Node[] {
  return [...(top ? [top] : []), h('div', { class: 'su-seats' }, ...cards), ...(foot ? [foot] : [])];
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
 * One choice shown as its value between two arrows that cycle through `values` (looping). Without
 * `set` only the value shows (a joined player's view).
 */
function cycler<T>(label: string, values: T[], cur: T, text: (v: T) => string, set?: (v: T) => void) {
  const i = Math.max(0, values.indexOf(cur));
  const step = (d: number) => set?.(values[(i + d + values.length) % values.length]);
  return h(
    'div',
    { class: 'opt' },
    h('div', { class: 'opt-label' }, label),
    h(
      'div',
      { class: `su-cycle ${set ? '' : 'ro'}` },
      set
        ? h(
            'button',
            { class: 'su-cycle-btn', 'aria-label': `Previous: ${label}`, onclick: () => step(-1) },
            '‹',
          )
        : null,
      h('output', { class: 'su-cycle-value', 'aria-live': 'polite' }, text(cur)),
      set
        ? h('button', { class: 'su-cycle-btn', 'aria-label': `Next: ${label}`, onclick: () => step(1) }, '›')
        : null,
    ),
  );
}

/**
 * The rules panel, in one column: rule set, target net worth (arrows on each digit, in 1,000G
 * steps), stocks and vacant plots (arrows cycle through the amounts). Without `edit` everything is
 * shown but locked.
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
    h('h3', null, 'Game Settings'),
    h(
      'div',
      { class: 'su-rules' },
      h(
        'div',
        { class: 'su-rule su-r-rules' },
        seg(
          'Rule Set',
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
        h('div', { class: 'opt-label' }, 'Winning Goal'),
        target.el,
        h('p', { class: 'hint' }, 'Reach it, then return to the bank.'),
      ),
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
      standard
        ? h(
            'div',
            { class: 'su-rule su-r-plots' },
            cycler(
              'Vacant Plots',
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
    ),
  );
}

/** The chosen board: its picture, name and size. */
export function boardStage(board: BoardDef, mine: boolean): HTMLElement {
  return h('div', { class: 'mapcar locked' }, mapSlide(board, mine));
}

/** Board pictures already drawn, so the carousel doesn't redraw five boards on every change. */
const thumbs = new Map<string, HTMLCanvasElement>();

/** A copy of the board's picture (drawn once per board version). */
function thumbOf(board: BoardDef): HTMLCanvasElement {
  const key = `${board.id}|${board.name}|${JSON.stringify(board.squares).length}`;
  let src = thumbs.get(key);
  if (!src) {
    src = boardThumb(board, 440, 230);
    thumbs.set(key, src);
  }
  const copy = src.cloneNode() as HTMLCanvasElement;
  copy.getContext('2d')?.drawImage(src, 0, 0);
  return copy;
}

/** One board in the map carousel: its picture with its name under it. */
function mapSlide(board: BoardDef, mine: boolean): HTMLElement {
  return h(
    'div',
    { class: 'mapcar-card' },
    h('div', { class: 'car-thumb' }, thumbOf(board)),
    h(
      'div',
      { class: 'mapcar-name' },
      h('b', null, board.name),
      mine ? h('span', { class: 'car-tag mine' }, 'My board') : null,
      // In the name row (not a line of its own), so the card stays the same height.
      validateBoard(board).errors.length
        ? h(
            'span',
            { class: 'car-tag bad', title: 'Has problems: fix it in the board editor to play.' },
            'Needs fixing',
          )
        : null,
    ),
  );
}

/** How far a move slides the carousel: one card (62% of the width) and the gap. */
const MAP_STEP = 'calc(62% + 14px)';
const MAP_MS = 380;
const MAP_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * The map carousel: the chosen board in the middle with its neighbours peeking out on both sides
 * (it loops), and a line under it whose colored bar shows how far into the list it is (a bar,
 * not dots, so any number of boards fits). Tap a side board, swipe, use the arrow keys or tap
 * the line to move. `from` is the board shown before (its index), so the move slides into place.
 */
function mapCarousel(
  list: { board: BoardDef; mine: boolean }[],
  index: number,
  from: number,
  go: (i: number) => void,
): HTMLElement {
  const n = list.length;
  const wrapAt = (k: number) => ((k % n) + n) % n;
  const reach = n > 1 ? 2 : 0;
  const track = h('div', { class: 'mapcar-track' });
  for (let d = -reach; d <= reach; d++) {
    const k = wrapAt(index + d);
    const card = mapSlide(list[k].board, list[k].mine);
    track.append(
      h(
        'div',
        {
          class: `mapcar-slide ${d === 0 ? 'on' : d < 0 ? 'before' : 'after'}`,
          'aria-hidden': d === 0 ? null : 'true',
          onclick: d === 0 ? null : () => go(wrapAt(index + d)),
        },
        card,
      ),
    );
  }
  const view = h('div', { class: 'mapcar', role: 'group', 'aria-label': 'Boards' }, track);
  // Swipe on touch screens (and drag with a mouse).
  let downX: number | null = null;
  view.addEventListener('pointerdown', (e) => (downX = e.clientX));
  view.addEventListener('pointerup', (e) => {
    if (downX != null && Math.abs(e.clientX - downX) > 40) go(wrapAt(index + (e.clientX < downX ? 1 : -1)));
    downX = null;
  });
  // The position line: the bar is one board's share of the line (at least 18px).
  const barW = `max(${100 / n}%, 18px)`;
  const left = (i: number) => `calc(${n > 1 ? i / (n - 1) : 0} * (100% - ${barW}))`;
  const bar = h('div', { class: 'mapcar-pos', style: `width: ${barW}; left: ${left(index)}` });
  const line = h(
    'div',
    {
      class: 'mapcar-line',
      role: 'slider',
      tabindex: '0',
      'aria-label': 'Board',
      'aria-valuemin': '1',
      'aria-valuemax': String(n),
      'aria-valuenow': String(index + 1),
      'aria-valuetext': `${list[index].board.name}, ${index + 1} of ${n}`,
      onclick: (e: MouseEvent) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const i = Math.round(((e.clientX - r.left) / (r.width || 1)) * (n - 1));
        go(Math.max(0, Math.min(n - 1, i)));
      },
    },
    bar,
  );
  if (from >= 0 && from !== index && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // The shortest way round the loop: one step back from the first board is the last one.
    let step = index - from;
    if (step > n / 2) step -= n;
    if (step < -n / 2) step += n;
    const k = Math.max(-reach, Math.min(reach, step));
    const opts = { duration: MAP_MS, easing: MAP_EASE };
    track.animate([{ transform: `translateX(calc(${k} * ${MAP_STEP}))` }, { transform: 'none' }], opts);
    const slides = [...track.children] as HTMLElement[];
    // The board coming to the middle grows, the one leaving shrinks back.
    slides[reach]?.animate([{ transform: 'scale(0.8)', opacity: 0.45 }, {}], opts);
    slides[reach - k]?.animate([{ transform: 'none', opacity: 1 }, {}], opts);
    bar.animate([{ left: left(from) }, { left: left(index) }], opts);
  }
  return h('div', { class: 'mapcar-wrap' }, view, n > 1 ? line : null);
}

/**
 * The screen around the panels: the title scene; a top bar (Back, the title, the join code chip,
 * Sound) that stays put; the players column in the bottom right corner (seat cards stacked like
 * the player cards in the game); and the panels beside it, which scroll on small screens (no
 * scroll bar).
 */
export function setupFrame() {
  sound.music('setup');
  const scene = titleScene(false);
  const top = h('header', { class: 'su-top' });
  const wrap = h('div', { class: 'su-main' });
  const side = h('aside', { class: 'su-side', 'aria-label': 'Players' });
  const scroll = h('div', { class: 'su-scroll' }, wrap);
  /** Which panel shows when only one fits (kept between redraws). */
  let tab: 'board' | 'rules' = 'board';
  /**
   * Put the Board and Game Settings panels in the middle. Where only one fits, two chips above it
   * (under the title) pick which; see `fit` for when.
   */
  const panels = (board: HTMLElement, rules: HTMLElement) => {
    const chip = (t: 'board' | 'rules', label: string) =>
      h('button', { class: 'su-tab', role: 'tab', onclick: () => ((tab = t), paint()) }, label);
    const chips = { board: chip('board', 'Board'), rules: chip('rules', 'Game Settings') };
    const paint = () => {
      for (const t of ['board', 'rules'] as const) {
        chips[t].classList.toggle('on', tab === t);
        chips[t].setAttribute('aria-selected', String(tab === t));
      }
      board.classList.toggle('shown', tab === 'board');
      rules.classList.toggle('shown', tab === 'rules');
    };
    solo = false;
    clear(wrap);
    wrap.append(h('div', { class: 'su-tabs', role: 'tablist' }, chips.board, chips.rules), board, rules);
    paint();
    fit();
  };
  /** One panel in the middle instead of two (the Continue game screen: nothing to change). */
  let solo = false;
  const single = (panel: HTMLElement) => {
    solo = true;
    clear(wrap);
    wrap.append(panel);
    fit();
  };
  const el = h(
    'div',
    { class: 'setup su' },
    scene.el,
    // The top bar across the top (Back and the title in the left corner, Sound in the right),
    // the panels under it and the players column beside them.
    top,
    h('div', { class: 'su-body' }, scroll, side),
  );
  /**
   * Fit the screen to the window. One scale (`--s`, at least 1, at most 2) grows the top bar,
   * the panels and the player cards together on bigger windows: 1 at 1366 x 768 sideways or
   * 820 x 1180 upright (phones keep their own compact sizes at 1). Then the panels get one of three
   * layouts (a class on the screen), whichever fits, so nothing ever needs scrolling:
   * - `layout-side`: sideways windows with room for both panels side by side.
   * - `layout-stack`: upright windows where Board fits on top of Game Settings.
   * - `layout-tabs`: otherwise one panel at a time, picked with the chips under the title, filling
   *   the room from the chips to the bottom of the screen.
   * Upright windows span the panels across the room left of the player cards and scale them down
   * if that room is narrower than they need. Sizes are set in pixels (not percentages), so zoom
   * works the same in every browser.
   */
  const fit = () => {
    if (!el.isConnected) return;
    const W = innerWidth;
    const H = innerHeight;
    const upright = H > W;
    const sc = Math.min(2, Math.max(1, upright ? Math.min(W / 820, H / 1180) : Math.min(W / 1366, H / 768)));
    const compact = matchMedia('(max-height: 500px), (max-width: 760px)').matches;
    el.style.setProperty('--s', String(sc));
    top.style.zoom = String(sc);
    side.style.zoom = String((compact ? 1 : CARDS_ZOOM) * sc);
    // The room for the panels (left of the player cards, under the top bar), on screen.
    wrap.style.zoom = wrap.style.width = wrap.style.height = '';
    const roomW = scroll.clientWidth;
    const roomH = scroll.clientHeight;
    const layout = (mode: 'side' | 'stack' | 'tabs' | 'solo') => {
      for (const m of ['side', 'stack', 'tabs', 'solo']) el.classList.toggle(`layout-${m}`, m === mode);
    };
    if (solo) {
      // One panel: as wide as it likes (up to SOLO_MAX), scaled down if the room is too small.
      layout('solo');
      let z = upright ? Math.min(sc, roomW / SOLO_MIN) : sc;
      const width = (k: number) => `${Math.min(SOLO_MAX, roomW / k)}px`;
      wrap.style.width = width(z);
      const hgt = wrap.offsetHeight;
      if (hgt * z > roomH) {
        z = Math.max(0.5, roomH / hgt);
        wrap.style.width = width(z);
      }
      wrap.style.zoom = String(z);
      return;
    }
    /** Try a layout at zoom `z` and width `w` (CSS px); true if its height fits the room. */
    const tryLayout = (mode: 'side' | 'stack', z: number, w: number) => {
      layout(mode);
      wrap.style.zoom = '';
      wrap.style.width = `${w}px`;
      // Measured without zoom (browsers report zoomed sizes differently), then scaled.
      const fits = wrap.offsetHeight * z <= roomH + 1;
      wrap.style.zoom = String(z);
      return fits;
    };
    const tabs = (z: number) => {
      layout('tabs');
      wrap.style.zoom = String(z);
      wrap.style.width = `${roomW / z}px`;
      wrap.style.height = `${roomH / z}px`;
    };
    if (!upright) {
      const w = roomW / sc;
      if (w >= SIDE_WIDTH && tryLayout('side', sc, Math.min(SIDE_MAX, w))) return;
      tabs(sc);
      return;
    }
    // Upright: as wide as the room, scaled down when the room is narrower than the panels need.
    const z = Math.min(sc, roomW / UPRIGHT_WIDTH);
    if (!tryLayout('stack', z, roomW / z)) tabs(z);
  };
  const resize = new ResizeObserver(fit);
  resize.observe(el);
  // Web fonts change the panels' heights once they load.
  void document.fonts?.ready.then(fit);
  return {
    el,
    top,
    wrap,
    side,
    panels,
    single,
    close: () => {
      resize.disconnect();
      closeSoundPopover();
      scene.stop();
      el.remove();
    },
  };
}

/** How wide (CSS px) the panels need to be in an upright window before they are scaled down. */
const UPRIGHT_WIDTH = 540;
/** The widest (and, upright, the narrowest before scaling down) a single panel gets (CSS px). */
const SOLO_MAX = 720;
const SOLO_MIN = 460;
/** The room (CSS px, before scaling) both panels need side by side, with the settings' two columns. */
const SIDE_WIDTH = 950;
/** The widest the two panels side by side get (CSS px, before scaling). */
const SIDE_MAX = 1120;
/** The player cards' size on bigger screens (times the screen's scale); phones use 1. */
const CARDS_ZOOM = 1.2;

/** How long the players column takes to grow, shrink and move its seats (ms). */
const DOCK_MS = 320;
const DOCK_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * Rebuild the players column (`rebuild` replaces its contents) and animate the change: the
 * column eases from its old height to its new one (growing upward, as it sits in the bottom
 * corner), seats that stayed slide to their new places, new seats pop in, and seats that left
 * fade out where they were. Seats are matched by `data-key` (their character, which no two seats
 * share). Safe to call while an earlier change is still animating: it starts from wherever things
 * are on screen.
 */
export function morphSide(dock: HTMLElement, rebuild: () => void) {
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
  // The column is zoomed on bigger screens: screen pixels to its own CSS pixels.
  const z = to.width / (dock.offsetWidth || 1) || 1;
  const opts = { duration: DOCK_MS, easing: DOCK_EASE };
  if (Math.abs(to.width - from.width) > 0.5 || Math.abs(to.height - from.height) > 0.5)
    dock.animate(
      [
        { width: `${from.width / z}px`, height: `${from.height / z}px` },
        { width: `${to.width / z}px`, height: `${to.height / z}px` },
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
    // Positions inside the column, from its bottom edge: it stays put while the column resizes
    // and the seats are stacked against it.
    const dx = (old.r.left - from.left - (r.left - to.left)) / z;
    const dy = (old.r.bottom - from.bottom - (r.bottom - to.bottom)) / z;
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
      left: `${(r.left - to.left) / z}px`,
      bottom: `${(to.bottom - r.bottom) / z}px`,
      width: `${r.width / z}px`,
      height: `${r.height / z}px`,
      margin: '0',
      boxSizing: 'border-box',
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

/**
 * The top bar: Back and the title in the top left corner with the join code chip (if any) beside
 * the title, and Sound (as on the main menu) in the top right corner. `status` (who we wait for,
 * the countdown) is only for screen readers.
 */
export function setupHead(
  top: HTMLElement,
  onBack: () => void,
  title: string,
  code: Node | null,
  status: Node | null = null,
) {
  clear(top);
  top.append(
    h('button', { class: 'btn su-back', onclick: onBack }, '‹ Back'),
    h('h2', null, title),
    code ?? '',
    h('span', { class: 'su-top-gap' }),
    soundButton('btn menu-sound', 'Sound'),
    // The status (who we wait for, the countdown) is read out by screen readers only: the Ready
    // chips show it on screen.
    status ? h('div', { class: 'sr-only' }, status) : '',
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
   * Seats are players on this device (the host first), then friends who joined, then bots.
   * Setup starts with only the host: bots and other players are added by hand (or join with the
   * code). Each keeps its name and character when others come and go.
   */
  const people: Spot[] = [];
  /** Bots, oldest first (a friend joining a full game takes the newest one's seat). */
  const bots: Spot[] = [];
  let nextSpot = 0;
  const st: RuleSettings = {
    target: cleanTarget(saved.target),
    // The round limit option was removed: games have none (older saved options may have one).
    roundCap: 0,
    plots: saved.plots ?? 'few',
    stocks: saved.stocks ?? 'dynamic',
    rules: saved.rules,
  };
  let boardId: string = getBoard(saved.boardId) ? saved.boardId : 'town';
  /** The board shown before the last carousel move (its index), so only that redraw slides. */
  let mapFrom = -1;
  /** The board and settings the Ready taps were for: changing them asks everyone again. */
  let readyFor = '';
  /** Seconds left before the game starts once everyone is ready (0: not counting down). */
  let countdown = 0;
  let countTimer = 0;
  /** Who we are waiting for, or the countdown (read out by screen readers). */
  const statusEl = h('span', { class: 'su-status', role: 'status', 'aria-live': 'polite' });
  /** Arrival order of the seats for the players column (see `byArrival`). */
  const seen: string[] = [];
  /** The player on this device being renamed, with what has been typed so far. */
  let renaming: { id: number; draft: string } | null = null;
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
  /** Seats of joined players, in seat order (they come right after the people on this device). */
  const lobbySeatsNow = () => room?.lobby().seats ?? [];
  const remotes = () => lobbySeatsNow().filter((x) => x.kind === 'remote');
  /**
   * A new seat on this device: a friendly name and a character nobody has yet. Names are set
   * before game setup (the host's is on the main menu's player card); other players on this
   * device and bots get a suggested one.
   */
  const newSpot = (): Spot => {
    const names = new Set([...people, ...bots, ...remotes()].map((x) => x.name));
    const pool = NAMES.filter((n) => !names.has(n));
    const list = pool.length ? pool : NAMES;
    const looks = [...people, ...bots].map((x) => x.look);
    for (const r of remotes()) if (r.look) looks.push(r.look);
    return {
      id: nextSpot++,
      name: list[Math.floor(Math.random() * list.length)],
      look: freeCharacter(looks),
      ready: false,
    };
  };
  {
    const host = newSpot();
    people.push({ ...host, name: cleanName(card.name) || host.name, look: card.look || host.look });
  }
  /** The seat number (and so the color) of a player on this device or a bot. */
  const seatOf = (x: Spot) => {
    const i = people.indexOf(x);
    return i >= 0 ? i : people.length + joined() + bots.indexOf(x);
  };
  /** Characters held by people (this device's players and joined friends), except `but`'s. */
  const peopleLooks = (but: Spot | null) => {
    const out = new Map<CharId, string>();
    for (const x of people) if (x !== but) out.set(x.look, x.name);
    for (const r of remotes()) if (r.look) out.set(r.look, r.name);
    return out;
  };
  /** Bots give up a character a person picked (people never share: the picker greys them out). */
  const freeBots = () => {
    for (const b of bots) {
      const taken = [...peopleLooks(null).keys(), ...bots.filter((x) => x !== b).map((x) => x.look)];
      if (taken.includes(b.look)) b.look = freeCharacter(taken);
    }
  };
  const choose = async (x: Spot) => {
    const id = await pickCharacter({
      current: x.look,
      taken: peopleLooks(x),
      color: PLAYER_COLORS[seatOf(x)],
    });
    if (id) {
      x.look = id;
      freeBots();
      draw();
    }
  };

  /** Tell the room about the seats and settings (only what changed). */
  const sync = () => {
    if (!room) return;
    syncing = true;
    const locals: LocalSeat[] = people.map((x) => ({ name: x.name, look: x.look, ready: x.ready }));
    const botSeats: LocalSeat[] = bots.map((x) => ({ name: x.name, look: x.look }));
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
    pickBoard(list, i, (i + step + list.length) % list.length);
  };
  /** Show board `to` of `list` (board `from` was shown): the carousel slides over to it. */
  const pickBoard = (list: { board: BoardDef }[], from: number, to: number) => {
    if (from === to) return;
    boardId = list[to].board.id;
    mapFrom = from;
    draw();
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, select, textarea')) return;
    if (e.key === 'ArrowLeft') move(-1);
    if (e.key === 'ArrowRight') move(1);
  };
  document.addEventListener('keydown', onKey);

  /** Board choice: a looping carousel of the built-in and saved boards. */
  const boardPanel = () => {
    const list = boards();
    const index = Math.max(
      0,
      list.findIndex((b) => b.board.id === boardId),
    );
    return h(
      'section',
      { class: 'setup-panel glass board-panel' },
      h('h3', null, 'Board'),
      mapCarousel(list, index, mapFrom, (to) => pickBoard(list, index, to)),
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

  /** Everyone in the game. */
  const total = () => people.length + joined() + bots.length;
  const room4 = () => total() < MAX_PLAYERS;

  /** Renaming a player on this device: tap the name, type, then Enter or tap away. */
  const renameOf = (x: Spot): NameEdit => ({
    draft: renaming?.id === x.id ? renaming.draft : null,
    start: () => {
      renaming = { id: x.id, draft: x.name };
      draw();
    },
    input: (v) => {
      if (renaming?.id === x.id) renaming.draft = v;
    },
    done: (save) => {
      if (renaming?.id !== x.id) return;
      if (save) x.name = cleanName(renaming.draft) || x.name;
      renaming = null;
      draw();
    },
  });

  /** A player on this device: the character (tap to change), the name (tap to change), remove and Ready. */
  const personCard = (x: Spot) =>
    seatCard({
      rename: renameOf(x),
      key: `s${x.id}`,
      color: PLAYER_COLORS[seatOf(x)],
      look: x.look,
      pick: () => void choose(x),
      name: x.name,
      tag: x === people[0] ? 'You · host' : 'On this device',
      kind: 'human',
      remove:
        x === people[0]
          ? undefined
          : {
              label: 'Remove this player',
              act: () => {
                people.splice(people.indexOf(x), 1);
                draw();
              },
            },
      // Each player on this device says they are ready with their own button.
      ready: h(
        'button',
        {
          class: `seat-ready ${x.ready ? 'on' : ''}`,
          'aria-pressed': String(x.ready),
          title: x.ready
            ? 'Tap if you are not ready after all'
            : `Tap when you are ready to play${loadSave() ? '. Starting replaces your saved game.' : ''}`,
          onclick: () => {
            x.ready = !x.ready;
            draw();
          },
        },
        x.ready ? '✓ Ready' : 'Ready',
      ),
    });

  const botCard = (x: Spot) =>
    seatCard({
      key: `s${x.id}`,
      color: PLAYER_COLORS[seatOf(x)],
      look: x.look,
      name: x.name,
      tag: 'Bot',
      kind: 'bot',
      remove: {
        label: 'Remove this bot',
        act: () => {
          bots.splice(bots.indexOf(x), 1);
          draw();
        },
      },
    });

  /** The players column: the add chips (until the game is full), then everyone, newest on top. */
  const playersPanel = () => {
    const seats = [
      ...people.map((x, i) => ({ key: `s${x.id}`, mine: i === 0, el: personCard(x) })),
      ...lobbySeatsNow()
        .map((x, i) => ({ x, i }))
        .filter(({ x }) => x.kind === 'remote')
        .map(({ x, i }) => {
          const look = x.look ?? null;
          return {
            key: `r:${x.name}`,
            el: seatCard({
              key: `r:${x.name}`,
              color: PLAYER_COLORS[i],
              look,
              name: x.name,
              tag: x.online ? 'Joined online' : 'Away',
              kind: 'joined',
              remove: { label: `Remove ${x.name}`, act: () => room?.kick(i) },
              ready: readyBadge(!!x.ready),
            }),
          };
        }),
      ...bots.map((x) => ({ key: `s${x.id}`, el: botCard(x) })),
    ];
    return playersColumn(
      byArrival(seen, seats).map((x) => x.el),
      null,
      room4()
        ? addChips(
            () => {
              people.push(newSpot());
              draw();
            },
            () => {
              bots.push(newSpot());
              draw();
            },
          )
        : null,
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
    // Someone joined a full game: they took a bot's seat (checked again once the room has the
    // latest seats).
    const fit = () => {
      bots.splice(Math.max(0, MAX_PLAYERS - people.length - joined()));
      freeBots();
    };
    // A different board or settings: everyone says Ready again (the room asks joined players).
    const key = JSON.stringify([boardId, st]);
    if (readyFor && key !== readyFor) for (const x of people) x.ready = false;
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
      'New Game',
      codeChip(),
      statusEl,
    );
    frame.panels(
      boardPanel(),
      rulesPanel(st, (patch) => {
        Object.assign(st, patch);
        draw();
      }),
    );
    // The players column fits its seats, morphing when players come and go.
    morphSide(frame.side, () => {
      clear(frame.side);
      frame.side.append(...playersPanel());
      // The status line's new text is part of the column's new size, so set it before measuring.
      checkReady();
    });
    refocusName(frame.side);
    mapFrom = -1;
  };

  /** Start the game with the seats as they are now. */
  const startGame = () => {
    stopCountdown();
    writeJSON(OPTS_KEY, { boardId, ...st });
    const board = getBoard(boardId) ?? BUILT_IN[0];
    const base = { ...st, board };
    if (room && joined() > 0) {
      const seats = room.seatConfigs((i) => {
        const b = bots[i - people.length - joined()] ?? newSpot();
        return { name: b.name, ch: b.look };
      });
      offRoom?.();
      closed = true;
      handlers.onStart({ ...base, seats }, true);
      return;
    }
    const seats = [
      ...people.map((x) => ({ name: x.name, cpu: false, ch: x.look })),
      ...bots.map((x) => ({ name: x.name, cpu: true, ch: x.look })),
    ];
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
    const remoteSeats = remotes();
    const everyone = [
      ...people.map((x) => ({ name: x.name, ready: x.ready })),
      ...remoteSeats.map((x) => ({ name: x.name, ready: !!x.ready && x.online })),
    ];
    const waiting = everyone.filter((x) => !x.ready);
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
        (waiting.length === everyone.length
          ? everyone.length > 1
            ? 'Everyone taps Ready to start'
            : 'Tap Ready to start'
          : `Waiting for ${waiting.map((x) => x.name).join(', ')}`);
      return;
    }
    if (everyone.length === 1) {
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
  /** Arrival order of the seats for the players column (see `byArrival`). */
  const seen: string[] = [];
  /** What this player has typed while renaming themselves (null while not renaming). */
  let draft: string | null = null;
  const rename = (name: string): NameEdit => ({
    draft,
    start: () => {
      draft = name;
      draw();
    },
    input: (v) => {
      if (draft != null) draft = v;
    },
    done: (save) => {
      if (draft == null) return;
      const clean = cleanName(draft);
      draft = null;
      if (save && clean && clean !== name) room.setName(clean);
      draw();
    },
  });

  const draw = () => {
    const lobby = room.lobby;
    clear(frame.wrap);
    const board = lobby ? (lobby.board ?? BUILT_IN.find((b) => b.name === lobby.boardName)) : undefined;
    const me = lobby?.seats[room.seat];
    const status = !lobby
      ? 'Connected. Waiting for the lobby...'
      : lobby.starting
        ? "Everyone's ready! Starting..."
        : me?.ready
          ? 'Waiting for everyone else...'
          : 'Tap Ready when you are set';
    setupHead(
      frame.top,
      () => {
        room.leave();
        handlers.onBack();
      },
      'Joined Game',
      h(
        'span',
        { class: 'su-code', title: 'The code of the game you joined' },
        h('small', null, 'Code'),
        h('b', null, room.code),
      ),
      h('span', { class: 'su-status', role: 'status' }, status),
    );
    frame.panels(
      h(
        'section',
        { class: 'setup-panel glass board-panel' },
        h(
          'div',
          { class: 'panel-head' },
          h('h3', null, 'Board'),
          h('span', { class: 'hint' }, 'The host picks the board and the rules.'),
        ),
        board ? boardStage(board, false) : h('p', { class: 'hint' }, lobby ? lobby.boardName : 'Loading...'),
      ),
      lobby
        ? rulesPanel({
            rules: lobby.rules,
            target: lobby.target,
            roundCap: lobby.roundCap,
            plots: lobby.plots ?? 'few',
            stocks: lobby.stocks ?? 'dynamic',
          })
        : h('section', { class: 'setup-panel glass rules-panel' }, h('h3', null, 'Game Settings')),
    );
    morphSide(frame.side, () => {
      clear(frame.side);
      frame.side.append(
        ...playersColumn(
          byArrival(
            seen,
            lobbyRows(lobby?.seats ?? [], (_, i) => i === room.seat),
          ).map(({ x, i, key }) => {
            const mine = i === room.seat;
            const bot = x.kind === 'cpu';
            return seatCard({
              key,
              color: PLAYER_COLORS[i],
              look: x.look ?? null,
              pick: mine ? () => pick(lobby!, i) : null,
              rename: mine ? rename(x.name) : undefined,
              name: x.name,
              tag: mine
                ? 'You'
                : x.kind === 'host'
                  ? 'Host'
                  : bot
                    ? 'Bot'
                    : x.kind === 'local'
                      ? "Host's device"
                      : 'Joined',
              kind: bot ? 'bot' : mine ? 'human' : 'joined',
              ready: mine
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
                  ? null
                  : readyBadge(!!x.ready),
            });
          }),
        ),
      );
    });
    refocusName(frame.side);
  };
  draw();
  return {
    update: draw,
    close: () => frame.close(),
  };
}
