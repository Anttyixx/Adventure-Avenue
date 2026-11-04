/**
 * Venture panels and Memory Blocks: collect a choice, then reveal the engine result.
 * The other arcade games use ArcadeView in arcade.ts.
 */
import { CARDS, PLAYER_COLORS, MEMORY_SHOW_MS, type GameState, type MemoryPrize } from '@aa/engine';
import { TIMING as T } from '../timing';
import { fmt, h } from './dom';
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
  panels: HTMLButtonElement[] = [];
  private resolvePick: ((i: number) => void) | null = null;

  constructor(
    private hud: Hud,
    private G: GameState,
    private pid: number,
  ) {
    const p = G.players[pid];
    this.grid.setAttribute('aria-label', `Venture board · ${p.name}`);
    const box = h('div', { class: 'venture-board glass' }, this.grid);
    const layer = h('div', { class: 'venture-layer' }, box);
    hud.root.append(layer);
    this.m = { el: box, body: this.grid, close: () => layer.remove() };
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
    this.hud.status(`${name} is picking a venture tile…`, 'card');
  }

  paint(owner: number[]) {
    owner.forEach((o, i) => {
      const b = this.panels[i];
      b.classList.toggle('flipped', o >= 0);
      b.style.background = o >= 0 ? PLAYER_COLORS[this.G.players[o].color] : '';
      b.disabled = o >= 0;
      const card = o >= 0 ? CARDS[this.G.vg.cards[i]] : undefined;
      b.textContent = card ? String(card.number) : '';
      b.setAttribute(
        'aria-label',
        card ? `Venture card ${card.number}: ${card.title}` : `Venture tile ${i + 1}`,
      );
    });
  }

  pick(): Promise<number> {
    this.hud.status('Choose a venture tile to flip.', 'card');
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
      const body = h(
        'div',
        { class: 'rich-body venture-result', 'aria-live': 'polite' },
        h('div', { class: 'rich-title' }, heading),
        h('div', { class: 'venture-description' }, message),
      );
      const done = this.hud.prompt(
        body,
        [{ label: human ? 'OK' : 'Close', value: undefined, main: true }],
        this.G.players[this.pid].color,
      );
      // Observers can dismiss early, or let the result advance automatically.
      const timer = human
        ? undefined
        : window.setTimeout(() => this.hud.resolvePrompt(undefined), T.cpuResult * speed);
      try {
        await done;
      } finally {
        clearTimeout(timer);
      }
    };
    if (bonus) {
      await show(
        'Line bonus!',
        `${lines.length > 1 ? `${lines.length} lines` : `Line of ${lines[0].length}`}! +${fmt(bonus)}`,
      );
    }
    const card = CARDS[this.G.vg.cards[panel]];
    await show(card ? `#${card.number} · ${title}` : title, text);
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
