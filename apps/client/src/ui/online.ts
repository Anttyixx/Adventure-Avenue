/**
 * Online play helpers: the name a player joins with and the Continue game screen (reopening a saved game so friends can rejoin). Hosting and joining happen
 * in game setup (start.ts): Play opens a room, and players who join see the host's setup.
 */
import { PLAYER_COLORS } from '@aa/engine';
import type { HostRoom } from '../net/hostroom';
import { inviteURL, type LobbySeat } from '../net/protocol';
import { BUILT_IN, listBoards } from '../boardstore';
import {
  boardStage,
  byArrival,
  lobbyRows,
  morphSide,
  playersColumn,
  PLOT_LABEL,
  seatCard,
  setupFrame,
  setupHead,
} from './start';
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

export interface ResumeHandlers {
  onResume(): void;
  onBack(): void;
}

/**
 * Continuing a saved game. It looks like game setup (start.ts): the top bar with the room code
 * chip, one panel showing the saved game's board and settings with Resume, and the players
 * column in the bottom right corner. The room is open again and friends rejoin with the code
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
  /** A player's seat card: their character, name and whether they are back. */
  const seat = (s: LobbySeat, i: number, key: string) => {
    const away = s.kind === 'remote' && !s.online;
    const bot = s.kind === 'cpu' || s.kind === 'open';
    return seatCard({
      key,
      color: PLAYER_COLORS[i],
      look: s.look ?? null,
      name: s.name,
      tag:
        s.kind === 'host'
          ? 'You · host'
          : s.kind === 'local'
            ? 'On this device'
            : bot
              ? 'Bot'
              : s.online
                ? 'Back online'
                : 'Not back yet',
      kind: bot ? 'bot' : 'joined',
      away,
      title: away ? `${s.name} is not back yet: a CPU plays for them until they join.` : null,
    });
  };
  /** Arrival order of the seats for the players column (see `byArrival`). */
  const seen: string[] = [];
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
      'Continue Game',
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
    // Nothing can change here, so one panel shows what was saved: the board, the settings
    // chosen, and Resume.
    const standard = lobby.rules === 'standard';
    const fact = (k: string, v: string | Node) => [h('dt', null, k), h('dd', null, v)];
    f.single(
      h(
        'section',
        { class: 'setup-panel glass su-saved' },
        h(
          'div',
          { class: 'panel-head' },
          h('h3', null, 'Saved Game'),
          round ? h('span', { class: 'su-round' }, `Saved in round ${round}`) : null,
        ),
        h(
          'div',
          { class: 'su-saved-body' },
          h(
            'div',
            { class: 'su-saved-board' },
            board ? boardStage(board, false) : h('p', { class: 'hint' }, lobby.boardName),
          ),
          h(
            'dl',
            { class: 'su-saved-facts' },
            ...fact('Rule Set', standard ? 'Standard' : 'Easy'),
            ...fact('Winning Goal', fmt(lobby.target)),
            ...(standard
              ? fact('Stocks', (lobby.stocks ?? 'dynamic') === 'dynamic' ? 'Dynamic' : 'Classic')
              : []),
            ...(standard ? fact('Vacant Plots', PLOT_LABEL[lobby.plots ?? 'few']) : []),
            // Games saved before the round limit option was removed may still have one.
            ...(lobby.roundCap ? fact('Round Limit', String(lobby.roundCap)) : []),
          ),
        ),
        h(
          'div',
          { class: 'su-saved-foot' },
          h(
            'div',
            { class: 'su-saved-notes' },
            h(
              'span',
              { class: 'hint' },
              !oldCode || room.code === oldCode
                ? 'Friends rejoin with the code and the same name.'
                : `The old code ${oldCode} was taken: friends use the new one.`,
            ),
            missing
              ? h('span', { class: 'hint' }, `${missing} not back yet: a CPU plays for them until they join.`)
              : null,
          ),
          h(
            'button',
            { class: 'btn main big', onclick: () => handlers.onResume() },
            missing ? `Resume (${missing} away)` : 'Resume Game',
          ),
        ),
      ),
    );
    morphSide(f.side, () => {
      clear(f.side);
      f.side.append(
        ...playersColumn(
          // This device's players at the bottom, friends above them as they come back.
          byArrival(
            seen,
            lobbyRows(lobby.seats, (x) => x.kind === 'host' || x.kind === 'local'),
          ).map(({ x, i, key }) => seat(x, i, key)),
        ),
      );
    });
  };
  const off = room.onChange(draw);
  draw();
  return () => {
    off();
    f.close();
  };
}
