/**
 * The venture grid and arcade minigames. Each one is a modal that can take a human's input
 * (pick a panel, stop the reels, pick a block, back a racer) and then reveal the engine's result.
 */
import {
  DERBY_LENGTH,
  DERBY_RACERS,
  MEMORY_SHOW_MS,
  PLAYER_COLORS,
  REEL_LENGTH,
  REEL_TICK_MS,
  type GameState,
  type MemoryPrize,
  type ReelSymbol,
} from '@aa/engine';
import { portraitURL } from '../sprites';
import { TIMING as T } from '../timing';
import { clear, fmt, h } from './dom';
import type { Hud } from './hud';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function okButton(label = 'OK'): { el: HTMLButtonElement; done: Promise<void> } {
  let res!: () => void;
  const done = new Promise<void>((r) => (res = r));
  const el = h('button', { class: 'btn main', onclick: () => res() }, label);
  setTimeout(() => el.focus(), 30);
  return { el, done };
}

/**
 * Wait for OK from the player who played, or for everyone else a short delay, which their
 * Close button cuts short.
 */
async function confirm(row: HTMLElement, human: boolean, speed: number) {
  if (!human) {
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, T.cpuResult * speed);
      row.append(
        h(
          'button',
          {
            class: 'btn',
            onclick: () => {
              clearTimeout(t);
              resolve();
            },
          },
          'Close',
        ),
      );
    });
    return;
  }
  {
    const ok = okButton();
    row.append(ok.el);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        ok.el.click();
      }
    };
    window.addEventListener('keydown', key);
    await ok.done;
    window.removeEventListener('keydown', key);
  }
}

// ------------------------------------------------------------------ venture grid

export class VentureView {
  m: ReturnType<Hud['modal']>;
  grid = h('div', { class: 'vgrid' });
  info = h('div', { class: 'v-info', 'aria-live': 'polite' });
  row = h('div', { class: 'btn-row' });
  panels: HTMLButtonElement[] = [];
  private resolvePick: ((i: number) => void) | null = null;

  constructor(
    hud: Hud,
    private G: GameState,
    pid: number,
  ) {
    const p = G.players[pid];
    this.grid.setAttribute('aria-label', `Venture board · ${p.name}`);
    this.m = hud.modal('', h('div', { class: 'venture' }, this.grid, this.info));
    this.m.el.classList.add('venture-modal');
    this.m.el.querySelector('.modal-head')?.remove();
    for (let i = 0; i < 64; i++) {
      const b = h('button', { class: 'panel', 'aria-label': `Venture tile ${i + 1}` });
      b.onclick = () => {
        if (this.resolvePick && G.vg.owner[i] < 0) {
          const r = this.resolvePick;
          this.resolvePick = null;
          this.grid.classList.remove('picking');
          r(i);
        }
      };
      this.panels.push(b);
      this.grid.append(b);
    }
    this.paint(G.vg.owner);
    this.grid.setAttribute('aria-description', 'Choose a face-down tile.');
  }

  /** Someone else is picking: show the grid with a note. */
  watch(name: string) {
    this.grid.setAttribute('aria-description', `${name} is picking a tile.`);
  }

  paint(owner: number[]) {
    owner.forEach((o, i) => {
      const b = this.panels[i];
      b.classList.toggle('flipped', o >= 0);
      b.style.background = o >= 0 ? PLAYER_COLORS[this.G.players[o].color] : '';
      b.disabled = o >= 0;
    });
  }

  pick(): Promise<number> {
    this.grid.classList.add('picking');
    return new Promise((r) => (this.resolvePick = r));
  }

  /** Flip the panel, light up any bonus lines through it and show the card. */
  async reveal(
    panel: number,
    title: string,
    text: string,
    lines: number[][],
    bonus: number,
    human: boolean,
    speed: number,
  ) {
    this.paint(this.G.vg.owner);
    const b = this.panels[panel];
    b.classList.add('flip');
    await wait(T.ventureFlip * speed);
    for (const l of lines) for (const i of l) this.panels[i].classList.add('in-line');
    this.grid.classList.remove('picking');
    this.panels.forEach((tile) => (tile.disabled = true));
    const show = async (heading: string, message: string) => {
      clear(this.info);
      clear(this.row);
      this.info.append(
        h(
          'div',
          { class: 'vcard' },
          h('div', { class: 'vc-title' }, heading),
          h('div', { class: 'vc-text' }, message),
          this.row,
        ),
      );
      await confirm(this.row, human, speed);
    };
    if (bonus) {
      await show(
        'Line bonus!',
        `${lines.length > 1 ? `${lines.length} lines` : `Line of ${lines[0].length}`}! +${fmt(bonus)}`,
      );
    }
    await show(title, text);
    this.m.close();
  }
}

// ------------------------------------------------------------------ Lucky Reels

const SYMBOL_EL: Record<ReelSymbol, () => HTMLElement> = {
  seven: () => h('span', { class: 'sym seven' }, '7'),
  coin: () => h('span', { class: 'sym coin' }, 'G'),
  wild: () => h('span', { class: 'sym wild' }, '★'),
  stock: () => h('span', { class: 'sym stock' }, '↗'),
};

export class ReelsView {
  m: ReturnType<Hud['modal']>;
  reels: HTMLElement[] = [];
  row = h('div', { class: 'btn-row' });
  result = h('div', { class: 'g-result', 'aria-live': 'polite', role: 'status' });
  private idx = [0, 0, 0];
  private stopped = [false, false, false];
  private timer = 0;

  constructor(
    hud: Hud,
    private strips: ReelSymbol[][],
    name: string,
  ) {
    const wrap = h('div', { class: 'reels' });
    for (let i = 0; i < 3; i++) {
      const r = h('div', { class: 'reel' });
      this.reels.push(r);
      wrap.append(r);
      this.idx[i] = Math.floor(Math.random() * REEL_LENGTH);
    }
    this.m = hud.modal(
      `Lucky Reels · ${name}`,
      h(
        'div',
        { class: 'minigame' },
        h(
          'p',
          { class: 'hint' },
          'Three 7s, three coins, three wilds or three stocks win big. Any pair wins a little.',
        ),
        wrap,
        this.result,
        this.row,
      ),
    );
    this.m.el.classList.add('arcade-modal');
    this.draw();
  }

  private draw() {
    this.reels.forEach((r, i) => {
      clear(r);
      r.append(SYMBOL_EL[this.strips[i][this.idx[i] % REEL_LENGTH]]());
      r.classList.toggle('stopped', this.stopped[i]);
      r.classList.toggle('next-reel', i === this.stopped.indexOf(false));
      r.setAttribute('aria-label', `Reel ${i + 1}${this.stopped[i] ? ', stopped' : ', spinning'}`);
    });
  }

  /** Spectators: the reels spin until the result arrives. */
  watch(name: string) {
    this.result.textContent = `${name} is playing...`;
    clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      for (let i = 0; i < 3; i++) if (!this.stopped[i]) this.idx[i] = (this.idx[i] + 1) % REEL_LENGTH;
      this.draw();
    }, REEL_TICK_MS);
  }

  /** Human play: reels cycle every 120 ms; each press stops the next reel. */
  play(): Promise<number[]> {
    this.result.textContent = 'Stop each reel to find a match!';
    return new Promise((resolve) => {
      const btn = h('button', { class: 'btn main' }, 'Stop reel 1') as HTMLButtonElement;
      this.row.append(btn);
      setTimeout(() => btn.focus(), 30);
      this.timer = window.setInterval(() => {
        for (let i = 0; i < 3; i++) if (!this.stopped[i]) this.idx[i] = (this.idx[i] + 1) % REEL_LENGTH;
        this.draw();
      }, REEL_TICK_MS);
      btn.onclick = () => {
        const i = this.stopped.indexOf(false);
        this.stopped[i] = true;
        btn.textContent = `Stop reel ${Math.min(3, i + 2)}`;
        this.result.textContent = `${i + 1} of 3 reels stopped`;
        this.draw();
        if (i === 2) {
          clearInterval(this.timer);
          btn.remove();
          resolve(this.idx.slice());
        }
      };
    });
  }

  async show(result: ReelSymbol[], prize: string, human: boolean, speed: number) {
    clearInterval(this.timer);
    this.stopped = [true, true, true];
    this.reels.forEach((r, i) => {
      clear(r);
      r.append(SYMBOL_EL[result[i]]());
      r.classList.add('stopped');
    });
    this.result.textContent = prize === 'No match' ? 'No match this time!' : `You won: ${prize}`;
    this.result.classList.add('pop');
    await confirm(this.row, human, speed);
    this.m.close();
  }
}

// ------------------------------------------------------------------ Memory Blocks

const PRIZE_TEXT: Record<MemoryPrize, string> = {
  shopsUp: 'Shops +10%',
  gold: 'Gold',
  wild: 'Wild card',
  shopsDown: 'Shops -5%',
  small: '20G',
};

export class MemoryView {
  m: ReturnType<Hud['modal']>;
  grid = h('div', { class: 'mgrid' });
  row = h('div', { class: 'btn-row' });
  result = h('div', { class: 'g-result', 'aria-live': 'polite', role: 'status' });
  blocks: HTMLButtonElement[] = [];

  constructor(hud: Hud, prizes: MemoryPrize[], name: string) {
    this.m = hud.modal(
      `Memory Blocks · ${name}`,
      h(
        'div',
        { class: 'minigame' },
        h('p', { class: 'hint' }, 'Remember where the prizes are, then pick one.'),
        this.grid,
        this.result,
        this.row,
      ),
    );
    this.m.el.classList.add('arcade-modal', 'memory-modal');
    prizes.forEach((p, i) => {
      const b = h('button', { class: `block show ${p}` }, PRIZE_TEXT[p]) as HTMLButtonElement;
      b.disabled = true;
      b.setAttribute('aria-label', `Block ${i + 1}: ${PRIZE_TEXT[p]}`);
      this.blocks.push(b);
      this.grid.append(b);
    });
  }

  /** Spectators: show the prizes, then hide them, while the player picks. */
  watch(name: string) {
    this.result.textContent = `${name} is playing...`;
    void this.hide(1);
  }

  async hide(speed: number) {
    await wait(MEMORY_SHOW_MS * Math.max(0.6, speed));
    this.blocks.forEach((b, i) => {
      b.classList.remove('show');
      b.setAttribute('aria-label', `Block ${i + 1}`);
    });
  }

  async play(): Promise<number> {
    this.result.textContent = 'Remember the prizes…';
    await this.hide(1);
    this.result.textContent = 'Pick one block!';
    return new Promise((resolve) => {
      this.grid.classList.add('picking');
      this.blocks.forEach((b, i) => {
        b.disabled = false;
        b.setAttribute('aria-label', `Pick block ${i + 1}`);
        b.onclick = () => {
          this.grid.classList.remove('picking');
          this.blocks.forEach((x) => {
            x.onclick = null;
            x.disabled = true;
          });
          this.result.textContent = 'Revealing your prize…';
          resolve(i);
        };
      });
    });
  }

  async show(picked: number, prize: string, human: boolean, speed: number) {
    this.blocks[picked].classList.add('show', 'picked', 'pop');
    await wait(T.memoryReveal * speed);
    this.blocks.forEach((b) => {
      b.classList.add('show');
      b.setAttribute('aria-label', b.textContent ?? 'Prize');
    });
    this.result.textContent = prize;
    this.result.classList.add('pop');
    await confirm(this.row, human, speed);
    this.m.close();
  }
}

// ------------------------------------------------------------------ Coin Derby

export class DerbyView {
  m: ReturnType<Hud['modal']>;
  track = h('div', { class: 'track' });
  row = h('div', { class: 'btn-row' });
  result = h('div', { class: 'g-result', 'aria-live': 'polite', role: 'status' });
  lanes: { runner: HTMLElement; tag: HTMLElement; coins: HTMLElement }[] = [];

  constructor(
    hud: Hud,
    private G: GameState,
    name: string,
  ) {
    this.m = hud.modal(
      `Coin Derby · ${name}`,
      h(
        'div',
        { class: 'minigame' },
        h('p', { class: 'hint' }, 'Each coin pays its backer 10G; the winner pays 100G x level.'),
        this.track,
        this.result,
        this.row,
      ),
      { wide: true },
    );
    this.m.el.classList.add('arcade-modal', 'derby-modal');
    for (let i = 0; i < DERBY_RACERS; i++) {
      const runner = h('div', { class: 'runner' }, String(i + 1));
      const tag = h('div', { class: 'lane-tag' }, `Racer ${i + 1}`);
      const coins = h('div', { class: 'lane-coins' }, '');
      this.lanes.push({ runner, tag, coins });
      this.track.append(h('div', { class: 'lane' }, tag, h('div', { class: 'lane-run' }, runner), coins));
    }
  }

  /** Spectators: the track, while the player backs a racer. */
  watch(name: string) {
    this.result.textContent = `${name} is picking a racer...`;
  }

  pick(): Promise<number> {
    this.result.textContent = 'Choose your racer!';
    return new Promise((resolve) => {
      for (let i = 0; i < DERBY_RACERS; i++) {
        this.row.append(
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                clear(this.row);
                this.lanes[i].runner.classList.add('backed');
                this.result.textContent = `You backed racer ${i + 1}`;
                resolve(i);
              },
            },
            `Back racer ${i + 1}`,
          ),
        );
      }
    });
  }

  async race(
    backers: number[],
    frames: number[][],
    coins: number[],
    winner: number,
    human: boolean,
    speed: number,
  ) {
    clear(this.row);
    backers.forEach((pid, i) => {
      const l = this.lanes[i];
      clear(l.tag);
      if (pid >= 0) {
        const p = this.G.players[pid];
        l.tag.append(h('img', { class: 'portrait tiny', src: portraitURL(p.ch), alt: '' }), p.name);
        l.runner.style.background = PLAYER_COLORS[p.color];
      } else l.tag.append(`Racer ${i + 1}`);
    });
    for (const count of ['3', '2', '1', 'Go!']) {
      this.result.textContent = count;
      await wait(300 * speed);
    }
    const step = Math.max(8, Math.round(36 * speed));
    const seen = new Array(DERBY_RACERS).fill(0);
    const total = frames.length;
    for (let f = 0; f < total; f++) {
      frames[f].forEach((x, i) => {
        this.lanes[i].runner.style.left = `calc(${(x / DERBY_LENGTH) * 100}% - ${(x / DERBY_LENGTH) * 28}px)`;
        // Reveal coins gradually as the race runs.
        const c = Math.floor((coins[i] * f) / total);
        if (c > seen[i]) {
          seen[i] = c;
          this.lanes[i].coins.textContent = `${c} coins`;
        }
      });
      await wait(step);
    }
    coins.forEach((c, i) => (this.lanes[i].coins.textContent = `${c} coins`));
    this.lanes[winner].runner.classList.add('winner');
    const wp = backers[winner] >= 0 ? this.G.players[backers[winner]] : null;
    this.result.textContent = `Racer ${winner + 1} wins${wp ? ` for ${wp.name}` : ''}!`;
    this.result.classList.add('pop');
    await confirm(this.row, human, speed);
    this.m.close();
  }
}
