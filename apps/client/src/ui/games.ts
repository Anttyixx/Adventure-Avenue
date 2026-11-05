/**
 * The venture board: collect a choice, then reveal the engine result. The arcade games are in
 * arcade.ts.
 */
import { CARDS, PLAYER_COLORS, type GameState } from '@aa/engine';
import { TIMING as T } from '../timing';
import { fmt, h } from './dom';
import type { Hud } from './hud';
import { sound } from '../audio';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    sound.play('flip');
    await wait(T.ventureFlip * speed);
    sound.play('venture');
    this.grid.classList.remove('picking');
    // A bonus line flips over again tile by tile, starting next to the tile just picked and
    // spreading out along the line (both ways at once when the pick is in the middle).
    if (lines.length) {
      b.classList.add('in-line');
      const at = (i: number) => [Math.floor(i / 8), i % 8];
      const [r0, c0] = at(panel);
      const steps = new Map<number, number[]>();
      for (const i of new Set(lines.flat())) {
        if (i === panel) continue;
        const [r, c] = at(i);
        const d = Math.max(Math.abs(r - r0), Math.abs(c - c0));
        steps.set(d, [...(steps.get(d) ?? []), i]);
      }
      for (const d of [...steps.keys()].sort((x, y) => x - y)) {
        for (const i of steps.get(d)!) {
          const tile = this.panels[i];
          tile.classList.add('in-line');
          if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
            tile.animate(
              [
                { transform: 'rotateY(0) scale(1)' },
                { transform: 'rotateY(90deg) scale(1.15)' },
                { transform: 'rotateY(0) scale(1)' },
              ],
              { duration: 360, easing: 'ease-out' },
            );
        }
        sound.play('flip');
        await wait(T.ventureLineStep * speed);
      }
      await wait(250 * speed);
    }
    this.panels.forEach((tile) => (tile.disabled = true));
    const show = async (heading: string, message: string) => {
      const body = h(
        'div',
        { class: 'rich-body venture-result', 'aria-live': 'polite' },
        h('div', { class: 'rich-title' }, heading),
        h('div', { class: 'venture-description' }, message),
      );
      // The player who drew it can press OK; everyone moves on by themselves after a few seconds
      // (people watching have nothing to press).
      const done = this.hud.prompt(
        body,
        human ? [{ label: 'OK', value: undefined, main: true }] : [],
        this.G.players[this.pid].color,
      );
      const timer = window.setTimeout(
        () => this.hud.resolvePrompt(undefined),
        human ? T.ventureResult : T.cpuResult * speed,
      );
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
