/**
 * Start-up and screen routing. Loads the art, checks for a newer build, then opens the screen the
 * address asks for (#ui-lab, #stocks-lab, #editor, an invite link) or the main menu, and wires
 * the screens together: menu -> setup -> game, hosting, joining, resuming and the board editor.
 */
import { K, cloneState, newGame, type BoardDef } from '@aa/engine';
import { sound } from './audio';
import { HotSeat } from './host';
import { checkForUpdate } from './update';
import { installCoins } from './coins';
import type { GuestEvents, GuestRoom } from './net/guestroom';
import type { HostRoom } from './net/hostroom';
import { cleanCode, type StartInfo } from './net/protocol';
import { h } from './ui/dom';
import { keepName, resumeLobby, savedName } from './ui/online';
import { clearGuest, guestInGame, loadGuest, saveGuest, setGuestInGame, type SaveInfo } from './save';
import { freeCharacter, loadCharacters, shuffledCharacters } from './sprites';
import { loadProps } from './props';
import { installVersionChip } from './ui/devmenu';
import { IS_DEV_BUILD } from './build';
import { openEditor } from './ui/editor';
import { openLab } from './ui/lab';
import { applyLiveStockSettings, openStocksLab } from './ui/stockslab';
import { mainMenu, type MenuOptions } from './ui/menu';
import { guestSetup, randomName, setupScreen } from './ui/start';
import './style.css';

const app = document.getElementById('app')!;

function showStart(opts: MenuOptions = {}) {
  const close = mainMenu(
    app,
    {
      onPlay() {
        close();
        showSetup();
      },
      onJoin(code, name) {
        close();
        void joinGame(code, name || savedName() || randomName());
      },
      onContinue(save) {
        close();
        // Every saved game reopens as a room, so friends can join (or rejoin) before it resumes.
        void resumeOnline(save);
      },
      onRejoin(g) {
        close();
        void joinGame(g.code, g.name);
      },
      onEditor() {
        close();
        showEditor(null);
      },
    },
    undefined,
    opts,
  );
}

/**
 * Game setup. It opens a room with a join code straight away: if friends join, starting plays
 * online with them; if not, it is a game on this device and the room closes.
 */
function showSetup() {
  let room: HostRoom | null = null;
  const close = setupScreen(
    app,
    {
      onStart(opts, online) {
        close();
        const G = newGame(opts);
        if (online && room) startHosted(room, G);
        else play(G);
      },
      onBack() {
        close();
        showStart();
      },
      onEditor(board) {
        close();
        showEditor(board);
      },
    },
    async () => {
      try {
        // The networking code loads when the setup screen opens, after the menu has shown.
        const { HostRoom } = await import('./net/hostroom');
        room = await HostRoom.open('Host', freeCharacter([]));
        return room;
      } catch {
        room = null;
        return null;
      }
    },
  );
}

/** Run a hosted online game on this device. */
function startHosted(room: HostRoom, G: ReturnType<typeof newGame>) {
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

/**
 * Join the game hosted under `code`. Until the host starts, the player sees the host's setup
 * (locked) and can change only their name and character.
 */
async function joinGame(code: string, name: string) {
  const wait = h('div', { class: 'net-wait' }, h('span', { class: 'spinner' }), `Joining ${code}...`);
  app.append(wait);
  let room: GuestRoom | null = null;
  let view: ReturnType<typeof guestSetup> | null = null;
  const closeView = () => {
    view?.close();
    view = null;
  };
  const events: GuestEvents = {
    lobby: () => view?.update(),
    start: (s) => {
      if (!room) return;
      closeView();
      playGuest(room, s);
    },
    closed: (reason) => {
      closeView();
      clearGuest();
      showStart({ code, error: reason });
    },
    status: () => {},
    seat: () => {},
  };
  try {
    // The networking code loads only when someone plays online.
    const { GuestRoom } = await import('./net/guestroom');
    room = await GuestRoom.join(code, name, events);
  } catch (err) {
    wait.remove();
    const error = (err as Error).message;
    // A running game takes players back only under their player's name: ask for it.
    showStart({ code, error, askName: /name/i.test(error) ? name : undefined });
    return;
  }
  wait.remove();
  keepName(name);
  // Remembered so a reload, or the main menu later, can bring this player back in.
  saveGuest(code, name);
  // Rejoining a running game: the host sends the game right after the welcome.
  if (room.started) {
    playGuest(room, room.started);
    return;
  }
  view = guestSetup(app, room, {
    onBack() {
      closeView();
      clearGuest();
      showStart();
    },
  });
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
installVersionChip();
// Dev builds can play with the Stocks lab's settings (see the lab).
if (IS_DEV_BUILD) applyLiveStockSettings();
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
  else if (location.hash.startsWith('#stocks-lab'))
    openStocksLab(app, () => {
      location.hash = '';
      location.reload();
    });
  else if (location.hash.startsWith('#editor')) showEditor(null);
  else if (guestInGame() && loadGuest() && (!joinCode || cleanCode(joinCode) === loadGuest()!.code)) {
    // This tab was in an online game as a guest: reloading goes straight back in.
    const g = loadGuest()!;
    void joinGame(g.code, g.name);
  } else if (joinCode) {
    // An invite link: the menu with the code in the Join box, then tidy the address bar.
    const q = new URLSearchParams(location.search);
    q.delete('join');
    history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
    showStart({ code: joinCode });
  } else showStart();
}

// Characters and properties are drawn from images, so load them before the first screen.
Promise.all([loadCharacters(), loadProps()])
  .catch((err) => console.error(err))
  .finally(route);
