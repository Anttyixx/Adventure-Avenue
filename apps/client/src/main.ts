import { K, cloneState, newGame, type BoardDef } from '@aa/engine';
import { sound } from './audio';
import { HotSeat } from './host';
import { checkForUpdate } from './update';
import { installCoins } from './coins';
import type { GuestRoom } from './net/guestroom';
import type { HostRoom } from './net/hostroom';
import { cleanCode, type StartInfo } from './net/protocol';
import { h } from './ui/dom';
import { joinScreen, onlineHub, resumeLobby } from './ui/online';
import { clearGuest, guestInGame, loadGuest, setGuestInGame, type SaveInfo } from './save';
import { freeCharacter, loadCharacters, shuffledCharacters } from './sprites';
import { loadProps } from './props';
import { installDevBadge } from './ui/devmenu';
import { openEditor } from './ui/editor';
import { openLab } from './ui/lab';
import { mainMenu } from './ui/menu';
import { setupScreen } from './ui/start';
import './style.css';

const app = document.getElementById('app')!;

function showStart() {
  const close = mainMenu(app, {
    onStart() {
      close();
      showSetup();
    },
    onContinue(save) {
      close();
      // Every saved game reopens as a room, so friends can join (or rejoin) before it resumes.
      void resumeOnline(save);
    },
    onOnline() {
      close();
      showOnline();
    },
    onRejoin(g) {
      close();
      showJoin(g.code, { name: g.name });
    },
    onEditor() {
      close();
      showEditor(null);
    },
  });
}

// ------------------------------------------------------------ online play

function showOnline(error = '') {
  const close = onlineHub(app, {
    onHost() {
      close();
      void hostOnline();
    },
    onJoin() {
      close();
      showJoin();
    },
    onBack() {
      close();
      showStart();
    },
  });
  if (error) window.alert(error);
}

async function hostOnline() {
  const wait = h('div', { class: 'net-wait' }, h('span', { class: 'spinner' }), 'Opening a room...');
  app.append(wait);
  let room: HostRoom;
  try {
    // The networking code loads only when someone plays online.
    const { HostRoom } = await import('./net/hostroom');
    room = await HostRoom.open('Host', freeCharacter([]));
  } catch (err) {
    wait.remove();
    showOnline((err as Error).message);
    return;
  }
  wait.remove();
  const close = setupScreen(
    app,
    {
      onStart(opts) {
        close();
        const G = newGame(opts);
        room.begin(G);
        const game = new HotSeat(
          app,
          G,
          () => {
            room.leave();
            showStart();
          },
          true,
          room,
        );
        room.onNotice = (text) => game.hud.banner(text, '#ffd166', 3500);
        void game.start();
      },
      onBack() {
        close();
        showOnline();
      },
      onEditor(board) {
        room.leave();
        close();
        showEditor(board);
      },
    },
    room,
  );
}

/** Reopen a saved online game: the same room code, and friends rejoin before the host resumes. */
async function resumeOnline(save: SaveInfo) {
  const wait = h('div', { class: 'net-wait' }, h('span', { class: 'spinner' }), 'Reopening the room...');
  app.append(wait);
  let room: HostRoom;
  try {
    const { HostRoom } = await import('./net/hostroom');
    room = await HostRoom.reopen(save);
  } catch (err) {
    wait.remove();
    if (save.online) {
      window.alert(`${(err as Error).message} The game is still saved; try Continue again.`);
      showStart();
    } else {
      // No connection: a game from one device simply continues on this device.
      play(cloneState(save.state));
    }
    return;
  }
  wait.remove();
  const close = resumeLobby(app, room, save.online?.code ?? '', {
    onResume() {
      close();
      const game = new HotSeat(
        app,
        room.game!,
        () => {
          room.leave();
          showStart();
        },
        true,
        room,
      );
      room.onNotice = (text) => game.hud.banner(text, '#ffd166', 3500);
      void game.start();
    },
    onBack() {
      close();
      room.leave();
      showStart();
    },
  });
}

function showJoin(code = '', rejoin?: { name: string }) {
  const close = joinScreen(
    app,
    {
      onStart(room, start) {
        close();
        playGuest(room, start);
      },
      onBack() {
        close();
        showOnline();
      },
    },
    code,
    rejoin,
  );
}

/** A guest's copy of the game; rebuilt from the host's turn snapshot on rejoin or resync. */
function playGuest(room: GuestRoom, first: StartInfo) {
  let game: HotSeat | null = null;
  let ended = false;
  setGuestInGame(true);
  const finish = () => {
    if (ended) return;
    ended = true;
    setGuestInGame(false);
    // A finished game can't be rejoined; one the host only paused (quit to save) can.
    if (game?.G.over) clearGuest();
    room.leave();
    game?.destroy();
    game = null;
    showStart();
  };
  const run = (s: StartInfo) => {
    game?.destroy();
    game = new HotSeat(
      app,
      cloneState(s.state),
      () => {
        game = null;
        finish();
      },
      false,
      room,
    );
    game.seq = s.seq;
    void game.start();
  };
  room.on.start = run;
  room.on.closed = (reason) => {
    if (ended) return;
    game?.hud.banner(reason, '#e5484d', 4000);
    setTimeout(finish, 4000);
  };
  room.on.status = (text) => {
    if (text) game?.hud.banner(text, '#e5484d', 3000);
    else game?.hud.tick('Reconnected to the host.');
  };
  room.on.seat = (pid, online) => {
    const name = game?.G.players[pid]?.name ?? 'A player';
    game?.hud.tick(online ? `${name} reconnected.` : `${name} disconnected. A CPU plays for them for now.`);
  };
  run(first);
}

function showSetup() {
  const close = setupScreen(app, {
    onStart(opts) {
      close();
      play(newGame(opts));
    },
    onBack() {
      close();
      showStart();
    },
    onEditor(board) {
      close();
      showEditor(board);
    },
  });
}

function play(G: ReturnType<typeof newGame>, onExit = showStart, saving = true) {
  const host = new HotSeat(app, G, onExit, saving);
  void host.start();
}

function showEditor(board: BoardDef | null) {
  sound.music('menu');
  history.replaceState(null, '', '#editor');
  openEditor(app, board, {
    onExit() {
      history.replaceState(null, '', location.pathname + location.search);
      showStart();
    },
    onPlay(b) {
      // Test play: one human against three CPUs, then back to the editor.
      const chars = shuffledCharacters(4);
      const seats = ['You', 'Rosa', 'Milo', 'Juno'].map((name, i) => ({
        name,
        cpu: i > 0,
        ch: chars[i],
      }));
      play(
        newGame({ rules: 'standard', target: K.defaultTarget, roundCap: 0, seats, board: b }),
        () => showEditor(b),
        false,
      );
    },
  });
}

void checkForUpdate();
installCoins();
installDevBadge();
// A soft click for every button press.
document.addEventListener(
  'click',
  (e) => {
    const b = (e.target as HTMLElement).closest?.('button');
    if (b && !b.disabled) sound.play('click');
  },
  true,
);
function route() {
  const lab = location.hash.match(/^#ui-lab(?:\/(\w+))?/);
  const joinCode = new URLSearchParams(location.search).get('join');
  if (lab) void openLab(app, lab[1]);
  else if (location.hash.startsWith('#editor')) showEditor(null);
  else if (guestInGame() && loadGuest() && (!joinCode || cleanCode(joinCode) === loadGuest()!.code)) {
    // This tab was in an online game as a guest: reloading goes straight back in.
    const g = loadGuest()!;
    showJoin(g.code, { name: g.name });
  } else if (joinCode) {
    // An invite link: open the join form with the code filled in, then tidy the address bar.
    const q = new URLSearchParams(location.search);
    q.delete('join');
    history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
    showJoin(joinCode);
  } else showStart();
}

// Characters and properties are drawn from images, so load them before the first screen.
Promise.all([loadCharacters(), loadProps()])
  .catch((err) => console.error(err))
  .finally(route);
