import { K, cloneState, newGame, type BoardDef } from '@aa/engine';
import { HotSeat } from './host';
import { randomLook } from './sprites';
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
      play(cloneState(save.state));
    },
    onEditor() {
      close();
      showEditor(null);
    },
  });
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
  history.replaceState(null, '', '#editor');
  openEditor(app, board, {
    onExit() {
      history.replaceState(null, '', location.pathname + location.search);
      showStart();
    },
    onPlay(b) {
      // Test play: one human against three CPUs, then back to the editor.
      const seats = ['You', 'Rosa', 'Milo', 'Juno'].map((name, i) => ({
        name,
        cpu: i > 0,
        ch: randomLook(),
      }));
      play(
        newGame({ rules: 'standard', target: K.defaultTarget, roundCap: 0, seats, board: b }),
        () => showEditor(b),
        false,
      );
    },
  });
}

installDevBadge();
const lab = location.hash.match(/^#ui-lab(?:\/(\w+))?/);
if (lab) void openLab(app, lab[1]);
else if (location.hash.startsWith('#editor')) showEditor(null);
else showStart();
