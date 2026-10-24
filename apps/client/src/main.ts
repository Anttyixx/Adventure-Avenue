import { cloneState, newGame } from '@aa/engine';
import { HotSeat } from './host';
import { installDevBadge } from './ui/devmenu';
import { openLab } from './ui/lab';
import { startScreen } from './ui/start';
import './style.css';

const app = document.getElementById('app')!;

function showStart() {
  const close = startScreen(app, {
    onStart(opts) {
      close();
      play(newGame(opts));
    },
    onContinue(save) {
      close();
      play(cloneState(save.state));
    },
  });
}

function play(G: ReturnType<typeof newGame>) {
  const host = new HotSeat(app, G, showStart);
  void host.start();
}

installDevBadge();
const lab = location.hash.match(/^#ui-lab(?:\/(\w+))?/);
if (lab) void openLab(app, lab[1]);
else showStart();
