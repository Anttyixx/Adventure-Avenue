/**
 * Online play helpers: the name a player joins with, the seat list shared by the setup screens,
 * and the screen for reopening a saved game so friends can rejoin. Hosting and joining happen
 * in game setup (start.ts): Play opens a room, and players who join see the host's setup.
 */
import { PLAYER_COLORS } from '@aa/engine';
import { sound } from '../audio';
import type { HostRoom } from '../net/hostroom';
import { inviteURL, type LobbyInfo } from '../net/protocol';
import { portraitURL } from '../sprites';
import { charButton } from './charpick';
import { clear, h } from './dom';
import { titleScene } from './menu';
import { closeSoundPopover, soundButton } from './soundpanel';

const NAME_KEY = 'adventure-avenue-online-name';

/** The name this device last joined a game with. */
export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function keepName(n: string) {
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

/**
 * The seat list, shared by the host's and the guests' lobbies. With `pick`, the player's own
 * seat (`mine`) has a button to change character.
 */
export function lobbySeats(
  lobby: LobbyInfo,
  mine: number,
  kick?: (i: number) => void,
  pick?: (i: number) => void,
): HTMLElement {
  return h(
    'div',
    { class: 'lobby-seats' },
    ...lobby.seats.map((s, i) => {
      const open = s.kind === 'open';
      const label = open
        ? 'CPU · a friend who joins takes this seat'
        : s.kind === 'host'
          ? 'Host'
          : s.kind === 'cpu'
            ? 'CPU'
            : s.kind === 'local'
              ? `On the host's device · a friend can join as "${s.name}"`
              : s.online
                ? 'Joined'
                : 'Not back yet · a CPU plays for now';
      return h(
        'div',
        { class: `lobby-seat ${open ? 'open' : ''}`, style: `--pc:${PLAYER_COLORS[i]}` },
        s.look && pick && i === mine
          ? charButton(s.look, 'small', () => pick(i))
          : s.look
            ? h('img', { class: 'portrait', src: portraitURL(s.look, 4), alt: '' })
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
  const f = frame('Continue game', () => handlers.onBack(), card);
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
        !oldCode
          ? 'Friends can join this game: Join on the main menu, this code, and the name of their player in the game. Seats nobody takes stay on this device.'
          : room.code === oldCode
            ? 'Your friends rejoin the same way as before: Join on the main menu, this code and the same name (or their old invite link).'
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
