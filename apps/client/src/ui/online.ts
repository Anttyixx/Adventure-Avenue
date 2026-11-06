/**
 * Online play helpers: the name a player joins with, the seat list shared by the setup screens,
 * and the Continue game screen (reopening a saved game so friends can rejoin). Hosting and joining happen
 * in game setup (start.ts): Play opens a room, and players who join see the host's setup.
 */
import { PLAYER_COLORS } from '@aa/engine';
import type { HostRoom } from '../net/hostroom';
import { inviteURL, type LobbyInfo, type LobbySeat } from '../net/protocol';
import { BUILT_IN, listBoards } from '../boardstore';
import { boardStage, morphWidth, rulesPanel, setupFrame, setupHead } from './start';
import { portraitURL } from '../sprites';
import { charButton } from './charpick';
import { clear, fmt, h } from './dom';

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
            ? 'Bot · a friend who joins can take this seat'
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
        // Who has tapped Ready (bots always are, so they show nothing).
        s.kind !== 'cpu' && s.kind !== 'open' && s.ready != null
          ? h('span', { class: `seat-ready badge ${s.ready ? 'on' : ''}` }, s.ready ? '✓ Ready' : 'Not ready')
          : null,
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
 * Continuing a saved game. It looks like game setup (start.ts): the top bar with the room code
 * chip, the saved game's board and settings (locked, as a joined player sees them), and the
 * players in the bottom bar with Resume. The room is open again and friends rejoin with the code
 * (and the same name); the host resumes when ready, and anyone not back yet is played by a CPU.
 * `round` is the round the game was saved in.
 */
export function resumeLobby(
  root: HTMLElement,
  room: Pick<HostRoom, 'code' | 'lobby' | 'onChange'>,
  oldCode: string,
  handlers: ResumeHandlers,
  round = 0,
) {
  const f = setupFrame();
  root.append(f.el);
  let copied = false;
  const share = async () => {
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
  /** A player's seat card in the bottom bar: their character, name and whether they are back. */
  const seatCard = (s: LobbySeat, i: number) => {
    const away = s.kind === 'remote' && !s.online;
    const tag =
      s.kind === 'host'
        ? 'You · host'
        : s.kind === 'local'
          ? 'On this device'
          : s.kind === 'cpu' || s.kind === 'open'
            ? 'Bot'
            : s.online
              ? 'Back online'
              : 'Not back yet';
    return h(
      'div',
      {
        class: `seat-card ${s.kind === 'cpu' || s.kind === 'open' ? 'bot' : 'joined'} ${away ? 'away' : ''}`,
        style: `--pc:${PLAYER_COLORS[i]}`,
        title: away ? `${s.name} is not back yet: a CPU plays for them until they join.` : null,
      },
      h(
        'div',
        { class: 'seat-stage' },
        s.look ? charButton(s.look, 'body', null) : h('span', { class: 'portrait empty' }, '?'),
      ),
      h('span', { class: `name ${s.kind === 'cpu' ? 'cpu' : ''}` }, s.name),
      h('span', { class: 'seat-tag' }, tag),
      away ? h('span', { class: 'seat-away', 'aria-hidden': 'true' }, 'Away') : null,
    );
  };
  const draw = () => {
    const lobby = room.lobby();
    const missing = lobby.seats.filter((x) => x.kind === 'remote' && !x.online).length;
    // The saved game keeps only the board's name: find it among the built-in and saved boards.
    const board =
      lobby.board ??
      BUILT_IN.find((b) => b.name === lobby.boardName) ??
      listBoards().find((b) => b.board.name === lobby.boardName)?.board;
    setupHead(
      f.top,
      () => handlers.onBack(),
      'Continue game',
      h(
        'button',
        {
          class: 'su-code',
          title: 'Friends rejoin with this code and the same name as before. Tap to share the invite.',
          onclick: share,
        },
        h('small', null, 'Code'),
        h('b', null, room.code),
        h(
          'span',
          { class: 'su-code-act' },
          copied ? 'Copied!' : 'ontouchstart' in window ? 'Share' : 'Copy link',
        ),
      ),
    );
    clear(f.wrap);
    f.wrap.append(
      h(
        'section',
        { class: 'setup-panel glass board-panel' },
        h(
          'div',
          { class: 'panel-head' },
          h('h3', null, 'Map'),
          round ? h('span', { class: 'su-round' }, `Saved in round ${round}`) : null,
        ),
        board
          ? h('div', { class: 'carousel locked' }, boardStage(board, false))
          : h('p', { class: 'hint' }, lobby.boardName),
      ),
      rulesPanel({
        rules: lobby.rules,
        target: lobby.target,
        roundCap: lobby.roundCap,
        plots: lobby.plots ?? 'few',
        stocks: lobby.stocks ?? 'dynamic',
      }),
    );
    const dockFrom = f.dock.getBoundingClientRect().width;
    clear(f.dock);
    f.dock.append(
      h(
        'section',
        { class: 'su-players' },
        h(
          'div',
          { class: 'su-players-head' },
          h('h3', null, `Players · ${lobby.seats.length}`),
          h(
            'span',
            { class: 'hint' },
            !oldCode || room.code === oldCode
              ? 'Friends rejoin with the code and the same name.'
              : `The old code ${oldCode} was taken: friends use the new one.`,
          ),
        ),
        h('div', { class: 'seats' }, ...lobby.seats.map(seatCard)),
      ),
      h(
        'div',
        { class: 'su-start' },
        h(
          'div',
          { class: 'setup-summary' },
          h('strong', null, lobby.boardName),
          h('span', null, `${round ? `Round ${round} · ` : ''}${fmt(lobby.target)} goal`),
          missing
            ? h('small', { class: 'hint' }, `${missing} not back yet: a CPU plays for them until they join.`)
            : null,
        ),
        h(
          'button',
          { class: 'btn main big', onclick: () => handlers.onResume() },
          missing ? `Resume (${missing} away)` : 'Resume game',
        ),
      ),
    );
    morphWidth(f.dock, dockFrom);
  };
  const off = room.onChange(draw);
  draw();
  return () => {
    off();
    f.close();
  };
}
