/**
 * Online play screens: the hub (host or join), the join form, and the lobby a guest waits in
 * until the host starts. The host's lobby lives in game setup (start.ts, online mode).
 */
import { PLAYER_COLORS, type CharLook } from '@aa/engine';
import { sound } from '../audio';
import type { GuestEvents, GuestRoom } from '../net/guestroom';
import type { HostRoom } from '../net/hostroom';
import { cleanCode, inviteURL, type LobbyInfo, type StartInfo } from '../net/protocol';
import { portraitURL, randomLook } from '../sprites';
import { clear, fmt, h } from './dom';
import { titleScene } from './menu';
import { closeSoundPopover, soundButton } from './soundpanel';
import { cleanName } from './start';

const NAME_KEY = 'adventure-avenue-online-name';

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function keepName(n: string) {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* storage unavailable */
  }
}

/** Shared frame: the title scene, a header with Back, and a card. */
function frame(title: string, onBack: () => void, ...body: HTMLElement[]) {
  sound.music('menu');
  const scene = titleScene(false);
  const el = h(
    'div',
    { class: 'setup online' },
    scene.el,
    h(
      'div',
      { class: 'setup-wrap narrow' },
      h(
        'header',
        { class: 'setup-head' },
        h('button', { class: 'btn ghost small back', onclick: onBack }, '‹ Back'),
        h('h2', null, title),
        soundButton('btn small ghost setup-sound'),
      ),
      ...body,
    ),
  );
  return {
    el,
    close: () => {
      closeSoundPopover();
      scene.stop();
      el.remove();
    },
  };
}

export interface OnlineHubHandlers {
  onHost(): void;
  onJoin(): void;
  onBack(): void;
}

/** Host or join. */
export function onlineHub(root: HTMLElement, handlers: OnlineHubHandlers) {
  const f = frame(
    'Play online',
    () => handlers.onBack(),
    h(
      'div',
      { class: 'menu-buttons online-hub' },
      h(
        'button',
        { class: 'menu-btn start', onclick: () => handlers.onHost() },
        h('span', { class: 'menu-btn-title' }, 'Host a game'),
        h('span', { class: 'menu-btn-sub' }, 'Get a room code to share. The game runs on this device.'),
      ),
      h(
        'button',
        { class: 'menu-btn online', onclick: () => handlers.onJoin() },
        h('span', { class: 'menu-btn-title' }, 'Join a game'),
        h('span', { class: 'menu-btn-sub' }, "Type the 4-letter code from the host's screen"),
      ),
    ),
    h(
      'p',
      { class: 'online-note glass' },
      'Players connect straight to the host. The host needs to keep the game open until it ends; if they leave, everyone stops. Free, no accounts needed.',
    ),
  );
  root.append(f.el);
  return f.close;
}

export interface JoinHandlers {
  /** The host started (or we rejoined a running game). */
  onStart(room: GuestRoom, start: StartInfo): void;
  onBack(): void;
}

/** Join form, then the waiting lobby. `code` pre-fills the room code (from a shared link). */
export function joinScreen(root: HTMLElement, handlers: JoinHandlers, code = '') {
  const look: CharLook = randomLook();
  let room: GuestRoom | null = null;
  let busy = false;
  let error = '';
  let lobby: LobbyInfo | null = null;
  const card = h('section', { class: 'setup-panel glass join-card' });
  const f = frame(
    'Join a game',
    () => {
      room?.leave();
      handlers.onBack();
    },
    card,
  );
  root.append(f.el);

  const codeIn = h('input', {
    class: 'name code-input',
    maxlength: '4',
    placeholder: 'ABCD',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    value: cleanCode(code),
    'aria-label': 'Room code',
  }) as HTMLInputElement;
  codeIn.oninput = () => (codeIn.value = cleanCode(codeIn.value));
  const nameIn = h('input', {
    class: 'name',
    maxlength: '12',
    placeholder: 'Your name',
    value: savedName(),
    'aria-label': 'Your name',
  }) as HTMLInputElement;

  const events: GuestEvents = {
    lobby: (l) => {
      lobby = l;
      draw();
    },
    start: (s) => {
      if (room) handlers.onStart(room, s);
    },
    closed: (reason) => {
      room = null;
      lobby = null;
      error = reason;
      draw();
    },
    status: () => {},
    seat: () => {},
  };

  const join = async () => {
    const c = cleanCode(codeIn.value);
    const name = cleanName(nameIn.value);
    if (c.length !== 4) {
      error = 'Room codes have 4 letters.';
      return draw();
    }
    if (!name) {
      error = 'Type your name first.';
      return draw();
    }
    keepName(name);
    busy = true;
    error = '';
    draw();
    try {
      const { GuestRoom } = await import('../net/guestroom');
      room = await GuestRoom.join(c, name, look, events);
      // Rejoining a running game: the host sends the game right after the welcome, which can
      // arrive before this screen knows the room.
      if (room.started) {
        handlers.onStart(room, room.started);
        return;
      }
    } catch (err) {
      error = (err as Error).message;
    }
    busy = false;
    draw();
  };

  const draw = () => {
    clear(card);
    if (room) {
      card.append(...guestLobby(room, lobby));
      return;
    }
    const btn = h(
      'button',
      { class: 'btn main big', disabled: busy, onclick: join },
      busy ? 'Connecting...' : 'Join',
    );
    card.append(
      h('img', { class: 'join-portrait', src: portraitURL(look, PLAYER_COLORS[1], 6), alt: '' }),
      h('label', { class: 'opt' }, h('div', { class: 'opt-label' }, 'Room code'), codeIn),
      h('label', { class: 'opt' }, h('div', { class: 'opt-label' }, 'Your name'), nameIn),
      ...(error ? [h('p', { class: 'join-error' }, error)] : []),
      btn,
    );
    (cleanCode(codeIn.value).length === 4 ? nameIn : codeIn).focus();
  };
  const onEnter = (e: KeyboardEvent) => e.key === 'Enter' && !room && !busy && void join();
  codeIn.addEventListener('keydown', onEnter);
  nameIn.addEventListener('keydown', onEnter);
  draw();
  return () => f.close();
}

/** What a guest sees while waiting for the host to start. */
function guestLobby(room: GuestRoom, lobby: LobbyInfo | null): HTMLElement[] {
  if (!lobby) return [h('p', { class: 'hint' }, 'Connected. Waiting for the lobby...')];
  const rules = lobby.rules === 'standard' ? 'Standard rules' : 'Easy rules';
  return [
    h('div', { class: 'room-code small' }, h('small', null, 'Room'), h('b', null, room.code)),
    h(
      'p',
      { class: 'lobby-settings' },
      h('b', null, lobby.boardName),
      ` · ${rules} · Target ${fmt(lobby.target)}${lobby.roundCap ? ` · ${lobby.roundCap} rounds` : ''}`,
    ),
    lobbySeats(lobby, room.seat),
    h(
      'p',
      { class: 'waiting' },
      h('span', { class: 'spinner' }),
      'Waiting for the host to start the game...',
    ),
  ];
}

/** The seat list, shared by the host's and the guests' lobbies. */
export function lobbySeats(lobby: LobbyInfo, mine: number, kick?: (i: number) => void): HTMLElement {
  return h(
    'div',
    { class: 'lobby-seats' },
    ...lobby.seats.map((s, i) => {
      const open = s.kind === 'open';
      const label = open
        ? lobby.fill
          ? 'Open · a CPU plays if no one joins'
          : 'Open · waiting for a friend'
        : s.kind === 'host'
          ? 'Host'
          : s.kind === 'cpu'
            ? 'CPU'
            : s.kind === 'local'
              ? "On the host's device"
              : s.online
                ? 'Joined'
                : 'Not back yet · a CPU plays for now';
      return h(
        'div',
        { class: `lobby-seat ${open ? 'open' : ''}`, style: `--pc:${PLAYER_COLORS[i]}` },
        s.look
          ? h('img', { class: 'portrait', src: portraitURL(s.look, PLAYER_COLORS[i], 4), alt: '' })
          : h('span', { class: 'portrait empty' }, '?'),
        h(
          'span',
          { class: 'lobby-seat-text' },
          h('b', null, open ? `Seat ${i + 1}` : s.name + (i === mine ? ' (you)' : '')),
          h('small', null, label),
        ),
        kick && s.kind === 'remote'
          ? h('button', { class: 'btn ghost small', onclick: () => kick(i) }, 'Remove')
          : null,
      );
    }),
  );
}

export interface ResumeHandlers {
  onResume(): void;
  onBack(): void;
}

/**
 * Reopening a saved online game: the room is open again and players rejoin with the code (and
 * the same name). The host resumes when ready; anyone not back yet is played by a CPU.
 */
export function resumeLobby(
  root: HTMLElement,
  room: Pick<HostRoom, 'code' | 'lobby' | 'onChange'>,
  oldCode: string,
  handlers: ResumeHandlers,
) {
  const card = h('section', { class: 'setup-panel glass join-card resume-card' });
  const f = frame('Continue online game', () => handlers.onBack(), card);
  root.append(f.el);
  let copied = false;
  const share = async () => {
    const url = inviteURL(room.code);
    try {
      if (navigator.share && 'ontouchstart' in window)
        await navigator.share({ title: 'Adventure Avenue', url });
      else {
        await navigator.clipboard.writeText(url);
        copied = true;
        draw();
      }
    } catch {
      /* cancelled */
    }
  };
  const draw = () => {
    clear(card);
    const lobby = room.lobby();
    const missing = lobby.seats.filter((x) => x.kind === 'remote' && !x.online).length;
    card.append(
      h(
        'div',
        { class: 'room-code' },
        h('small', null, 'Room code'),
        h('b', null, room.code),
        h('button', { class: 'btn small', onclick: share }, copied ? 'Copied!' : 'Share invite'),
      ),
      h(
        'p',
        { class: 'hint' },
        room.code === oldCode
          ? 'Your friends rejoin the same way as before: Play online, Join a game, this code and the same name (or their old invite link).'
          : `The old code ${oldCode} was taken, so this game has a new one. Friends join with it and the same name as before.`,
      ),
      lobbySeats(lobby, -1),
      h(
        'button',
        { class: 'btn main big', onclick: () => handlers.onResume() },
        missing ? `Resume game (${missing} not back yet)` : 'Resume game',
      ),
      missing
        ? h('p', { class: 'hint' }, 'Players who are not back yet are played by a CPU until they join.')
        : '',
    );
  };
  const off = room.onChange(draw);
  draw();
  return () => {
    off();
    f.close();
  };
}
