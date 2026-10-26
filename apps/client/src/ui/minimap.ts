/**
 * The whole board in a small canvas, for pop-ups that pick properties (trades, auctions) so no
 * tile is hidden behind the interface. Candidate squares stay bright and the rest of the board
 * dims; tapping a candidate calls `onPick`. Marked squares get a colored ring and a label.
 */
import { PLAYER_COLORS, type GameState } from '@aa/engine';
import { paintBoard } from '../board';
import { cellCenter, tileShape, worldSize } from '../geometry';
import { squareName } from '../names';
import { h } from './dom';

const TILE = 86;

export interface Mark {
  text: string;
  color: string;
}

export interface MiniBoardOpts {
  /** Squares that can be tapped (the rest of the board is dimmed). */
  candidates: number[];
  onPick?: (id: number) => void;
  /** Ring and label per square, read on every redraw. */
  marks?: () => Map<number, Mark>;
}

export class MiniBoard {
  el: HTMLElement;
  private canvas = h('canvas', { class: 'mini-canvas' }) as HTMLCanvasElement;
  private tip = h('div', { class: 'mini-tip' });
  private image: HTMLCanvasElement | null = null;
  private scale = 1;
  private hover = -1;
  private ro: ResizeObserver;

  constructor(
    private G: GameState,
    private opts: MiniBoardOpts,
  ) {
    this.el = h('div', { class: 'mini-board' }, this.canvas, this.tip);
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.el);
    this.canvas.addEventListener('pointermove', (e) => {
      const id = this.squareAt(e);
      if (id !== this.hover) {
        this.hover = id;
        this.draw();
      }
      this.canvas.style.cursor = id >= 0 && this.opts.onPick ? 'pointer' : 'default';
      if (id >= 0) {
        this.tip.textContent = squareName(G, G.nodes[id]);
        this.tip.hidden = false;
        // Keep the label inside the board area.
        const half = this.tip.offsetWidth / 2 + 4;
        const x = e.offsetX + this.canvas.offsetLeft;
        this.tip.style.left = `${Math.min(Math.max(x, half), this.el.clientWidth - half)}px`;
        this.tip.style.top = `${Math.max(e.offsetY + this.canvas.offsetTop, this.tip.offsetHeight + 18)}px`;
      } else this.tip.hidden = true;
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = -1;
      this.tip.hidden = true;
      this.draw();
    });
    this.canvas.addEventListener('click', (e) => {
      const id = this.squareAt(e);
      if (id >= 0) this.opts.onPick?.(id);
    });
    this.tip.hidden = true;
  }

  destroy() {
    this.ro.disconnect();
  }

  private squareAt(e: MouseEvent) {
    const wx = e.offsetX / this.scale;
    const wy = e.offsetY / this.scale;
    for (const id of this.opts.candidates) {
      const sq = this.G.nodes[id];
      const c = cellCenter(this.G.layout, sq.x, sq.y);
      if (Math.abs(wx - c.x) <= TILE / 2 + 4 && Math.abs(wy - c.y) <= TILE / 2 + 4) return id;
    }
    return -1;
  }

  draw() {
    const G = this.G;
    const { w: ww, h: wh } = worldSize(G);
    const box = this.el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;
    this.scale = Math.min(box.width / ww, box.height / wh);
    const cw = ww * this.scale;
    const ch = wh * this.scale;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cv = this.canvas;
    cv.style.width = `${cw}px`;
    cv.style.height = `${ch}px`;
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    const k = this.scale * dpr;
    if (!this.image || this.image.width !== cv.width) {
      // The board itself only needs painting once per size.
      this.image = document.createElement('canvas');
      this.image.width = cv.width;
      this.image.height = cv.height;
      const ictx = this.image.getContext('2d')!;
      ictx.setTransform(k, 0, 0, k, 0, 0);
      paintBoard(ictx, G);
    }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.image, 0, 0);
    ctx.setTransform(k, 0, 0, k, 0, 0);

    // Dim everything, then bring the candidates back to full brightness.
    ctx.fillStyle = 'rgba(8,14,30,0.66)';
    ctx.fillRect(0, 0, ww, wh);
    ctx.save();
    ctx.beginPath();
    for (const id of this.opts.candidates) {
      const sq = G.nodes[id];
      const c = cellCenter(G.layout, sq.x, sq.y);
      ctx.rect(c.x - TILE / 2 - 3, c.y - TILE / 2 - 3, TILE + 6, TILE + 6);
    }
    ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.image, 0, 0);
    ctx.restore();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    for (const id of this.opts.candidates) {
      const sq = G.nodes[id];
      const c = cellCenter(G.layout, sq.x, sq.y);
      tileShape(ctx, G.layout, c.x, c.y, TILE / 2 + 1, 12);
      ctx.stroke();
    }

    // Players' positions, so it's clear where everyone stands.
    for (const p of G.players) {
      if (p.bankrupt) continue;
      const sq = G.nodes[p.node];
      const c = cellCenter(G.layout, sq.x, sq.y);
      const o = (p.id - (G.players.length - 1) / 2) * 14;
      ctx.beginPath();
      ctx.arc(c.x + o, c.y + TILE / 2 - 6, 9, 0, Math.PI * 2);
      ctx.fillStyle = PLAYER_COLORS[p.color];
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }

    const marks = this.opts.marks?.() ?? new Map<number, Mark>();
    for (const [id, m] of marks) {
      const sq = G.nodes[id];
      const c = cellCenter(G.layout, sq.x, sq.y);
      ctx.lineWidth = 9;
      ctx.strokeStyle = m.color;
      tileShape(ctx, G.layout, c.x, c.y, TILE / 2 + 2, 14);
      ctx.stroke();
      ctx.font = '700 22px "Atkinson Hyperlegible", sans-serif';
      const tw = ctx.measureText(m.text).width + 20;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.roundRect(c.x - tw / 2, c.y - TILE / 2 - 16, tw, 30, 15);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.text, c.x, c.y - TILE / 2 - 1);
    }
    if (this.hover >= 0 && this.opts.onPick) {
      const sq = G.nodes[this.hover];
      const c = cellCenter(G.layout, sq.x, sq.y);
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#fff';
      tileShape(ctx, G.layout, c.x, c.y, TILE / 2 + 6, 16);
      ctx.stroke();
    }
  }
}

/**
 * A pop-up with the whole board on the left and `side` on the right. Returns the board (to
 * redraw after changes) and a close function.
 */
export function boardPopup(
  layer: HTMLElement,
  G: GameState,
  title: string,
  side: HTMLElement,
  opts: MiniBoardOpts,
) {
  const mini = new MiniBoard(G, opts);
  const wrap = h(
    'div',
    { class: 'modal-wrap' },
    h(
      'div',
      { class: 'modal glass board-pop', role: 'dialog', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', null, title)),
      h('div', { class: 'bp-grid' }, mini.el, h('div', { class: 'bp-side' }, side)),
    ),
  );
  layer.append(wrap);
  requestAnimationFrame(() => mini.draw());
  return {
    mini,
    close: () => {
      mini.destroy();
      wrap.remove();
    },
  };
}
