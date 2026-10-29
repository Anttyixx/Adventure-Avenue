/**
 * The HD board: a 1300 x 800 logical canvas with 100-unit squares, scaled to the container
 * and devicePixelRatio. The static board is cached offscreen and redrawn only when the state
 * changes; each frame draws the cache, then highlights, sprites, coins, floating text and the die.
 */
import {
  K,
  PLAYER_COLORS,
  SUITS,
  isClosed,
  squareFee,
  type BoardLayout,
  type GameState,
  type Square,
} from '@aa/engine';
import { cellCenter, tileShape, tileTop, worldSize } from './geometry';
import { SHOP_TIERS, STAR3_TIERS, badge, darken, drawShop, drawStar3, tierFor, tint } from './art';
import { drawProp, type PropKey } from './props';
import { drawBoonIcon, drawCoin, drawSparkle, SUIT_CHARS } from './icons';
import { Facing, FRAME_H, FRAME_W, drawCharacter, drawCharacterGlow, facingFor } from './sprites';
import { TIMING as T } from './timing';

export { worldSize };

/** Center of a square's cell for the board's layout. */
export const squareCenter = (sq: { x: number; y: number }, layout?: BoardLayout) =>
  cellCenter(layout, sq.x, sq.y);

const isTown = (G: GameState | null) => !G || G.boardId === 'town';
const TILE = 86;
/** Ways the steps-left die can flip over: sideways, up and over, and the two diagonals. */
const DIE_FLIPS = 4;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** How long one ring takes to spread out from a highlighted square. */
const RING_MS = 1400;

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

interface Token {
  x: number;
  y: number;
  hop: number;
  walking: boolean;
  visible: boolean;
  /** Which way the character faces: the way it is walking, or toward the viewer at rest. */
  facing: Facing;
  /** Drawn size, easing toward bigger for the active player and smaller for the others. */
  size: number;
  /** Mid-walk: stops the walk cycle if the next step does not start soon (a stop for a choice). */
  pause?: number;
}

interface Fx {
  t0: number;
  dur: number;
  draw(ctx: CanvasRenderingContext2D, k: number, now: number): void;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Furthest zoom-out, in steps: the whole board fitted into the area the HUD leaves free. */
const ZOOM_MAX_OUT = 1.3;
/** One wheel notch or key press: 1/30 of the range, shown as 5% on the zoom chip. */
export const ZOOM_STEP = ZOOM_MAX_OUT / 30;
/**
 * From 250% to 200% on the zoom chip the camera stays on the player; between 200% and 150% (a
 * third and two thirds of the way out) it moves to the board's center, and stays there below.
 */
const ZOOM_BLEND = ZOOM_MAX_OUT / 3;
const ZOOM_BLEND_END = (ZOOM_MAX_OUT * 2) / 3;

export class BoardView {
  /** Center of a square on this board. */
  center(sq: { x: number; y: number }) {
    return cellCenter(this.G?.layout, sq.x, sq.y);
  }

  /** World size in board units: 100 per grid cell plus a 50-unit margin. */
  get ww() {
    return worldSize(this.G).w;
  }
  get wh() {
    return worldSize(this.G).h;
  }

  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  G: GameState | null = null;
  tokens = new Map<number, Token>();
  fx: Fx[] = [];
  screenFx: Fx[] = [];
  dirty = true;
  cache: HTMLCanvasElement = document.createElement('canvas');
  cacheScale = 0;

  // Camera: world point at the focus, and zoom in CSS px per world unit.
  cam = { x: 650, y: 400, z: 1 };
  camTarget = { x: 650, y: 400, z: 1 };
  /**
   * How far the player has zoomed out with the wheel or a pinch: 0 = close on the active
   * player, up to ZOOM_MAX_OUT = the whole board clear of the HUD. Past
   * ZOOM_BLEND the camera stops following and drifts to the board's center.
   */
  zoomOut = 0;
  private pinch = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  fitIds: number[] = [];
  insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private grass: CanvasPattern | null = null;
  followPid = -1;
  activePid = -1;
  /** While set, the camera shows the whole board (e.g. to watch shops close), whatever the zoom. */
  overviewHold = false;
  /**
   * The player overview is open: the camera shows the whole board and every property not owned
   * by `focusOwner` is greyed out.
   */
  focusOwner = -1;
  /**
   * While set, the camera frames these squares in the space the HUD leaves free (e.g. after a
   * roll: the player and everywhere they could land), refitting as the HUD changes.
   */
  frameIds: number[] | null = null;
  /** While set, the camera frames this spot instead of following anyone (e.g. a district). */
  lookAt: { x: number; y: number; z: number } | null = null;
  /** Squares whose gates are moving: when each starts, and whether it is opening. */
  private gates = new Map<number, { start: number; opening: boolean }>();
  private lastFrame = 0;

  // Highlights for choices
  glow: number[] = [];
  glowColor = '#fff';
  /** Text shown in a pill over choice squares (e.g. "Invest up to 250G"). */
  choiceLabels = new Map<number, string>();
  /** Draw a bouncing pin over each choice square. */
  choicePins = true;
  /** Squares lit up without being choices (e.g. the district a button would pick). */
  highlight: number[] = [];
  routes = new Map<number, number[]>();
  hoverRoute: number[] | null = null;
  walkTarget = -1;
  /** Before a roll: the player whose possible first steps are shown as sliding arrows, or -1. */
  directionsPid = -1;
  onPick: ((id: number) => void) | null = null;
  onHover: ((id: number | null, cx: number, cy: number) => void) | null = null;
  /** Called when the shown zoom changes: 250% fully zoomed in on the player, 100% fully out. */
  onZoom: ((pct: number) => void) | null = null;
  private zoomPct = 0;

  /**
   * The die: tumbling, then showing the roll, then shrunk next to the walking player as a
   * steps-left counter that flips to the new number on each step.
   */
  die: {
    value: number;
    t0: number;
    phase: 'rolling' | 'shown' | 'small';
    /** Steps left (small phase), the number before the last step, and when it changed. */
    count: number;
    prev: number;
    changed: number;
    /** How the last change flipped the die (never the same twice running). */
    flip?: number;
  } | null = null;
  w = 0;
  h = 0;
  dpr = 1;
  private raf = 0;
  private alive = true;

  constructor(private host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'board-canvas';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', this.resize);
    this.canvas.addEventListener('pointermove', this.pointerMove);
    this.canvas.addEventListener('pointerleave', () => this.onHover?.(null, 0, 0));
    this.canvas.addEventListener('click', this.click);
    this.canvas.addEventListener('wheel', this.wheel, { passive: false });
    this.canvas.addEventListener('pointerdown', this.pinchDown);
    this.canvas.addEventListener('pointerup', this.pinchUp);
    this.canvas.addEventListener('pointercancel', this.pinchUp);
    this.raf = requestAnimationFrame(this.frame);
    // The static board is cached; redraw it once the web fonts arrive so labels use them.
    document.fonts?.ready.then(() => (this.dirty = true));
    document.fonts?.addEventListener('loadingdone', this.fontsLoaded);
    for (const f of ['20px "Lilita One"', '700 12px "Atkinson Hyperlegible"']) void document.fonts?.load(f);
  }

  private fontsLoaded = () => {
    this.dirty = true;
  };

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    document.fonts?.removeEventListener('loadingdone', this.fontsLoaded);
    this.canvas.remove();
  }

  // ------------------------------------------------------------ state

  setState(G: GameState) {
    this.G = G;
    this.dirty = true;
    for (const p of G.players) {
      if (!this.tokens.has(p.id)) {
        const c = this.slotPos(p.id, p.node);
        this.tokens.set(p.id, {
          x: c.x,
          y: c.y,
          hop: 0,
          walking: false,
          visible: true,
          facing: Facing.Down,
          size: 1,
        });
      }
    }
    this.snapTokens();
  }

  /** Put every non-walking token at its square (with slot offsets when sharing). */
  snapTokens() {
    if (!this.G) return;
    for (const p of this.G.players) {
      const t = this.tokens.get(p.id)!;
      t.visible = !p.bankrupt;
      if (t.walking) continue;
      const c = this.slotPos(p.id, p.node);
      t.x = c.x;
      t.y = c.y;
    }
  }

  slotPos(pid: number, node: number) {
    const G = this.G!;
    const sq = G.nodes[node];
    const c = this.center(sq);
    const here = G.players.filter((q) => !q.bankrupt && q.node === node).map((q) => q.id);
    if (here.length <= 1) return { x: c.x, y: c.y - 12 };
    const i = Math.max(0, here.indexOf(pid));
    const offs = [
      [-20, -16],
      [20, -16],
      [-20, 14],
      [20, 14],
      [0, -2],
    ];
    return { x: c.x + offs[i % offs.length][0], y: c.y + offs[i % offs.length][1] - 4 };
  }

  tokenPos(pid: number) {
    const t = this.tokens.get(pid);
    return t ? { x: t.x, y: t.y } : { x: this.ww / 2, y: this.wh / 2 };
  }

  bankPos() {
    const bank = this.G?.nodes.find((s) => s.t === 'bank');
    return bank ? this.center(bank) : { x: this.ww / 2, y: this.wh - 100 };
  }

  // ------------------------------------------------------------ animation helpers

  speed = 1;

  wait(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms * this.speed));
  }

  async step(pid: number, to: number, left: number) {
    const t = this.tokens.get(pid)!;
    const from = { x: t.x, y: t.y };
    const dest = this.center(this.G!.nodes[to]);
    dest.y -= 12;
    // The die beside the player counts down as the step starts.
    if (this.die?.phase === 'small' && pid === this.activePid && this.die.count !== left) {
      this.die.prev = this.die.count;
      this.die.count = left;
      this.die.changed = performance.now();
      // A different flip from last time: sideways, up and over, or along either diagonal.
      const last = this.die.flip ?? -1;
      const pick = Math.floor(Math.random() * (DIE_FLIPS - 1));
      this.die.flip = pick >= last && last >= 0 ? pick + 1 : pick;
    }
    clearTimeout(t.pause);
    t.walking = true;
    t.facing = facingFor(dest.x - from.x, dest.y - from.y);
    const dur = T.step * this.speed;
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / dur);
        const e = ease(k);
        t.x = from.x + (dest.x - from.x) * e;
        t.y = from.y + (dest.y - from.y) * e;
        t.hop = Math.sin(k * Math.PI) * 14;
        if (k < 1 && this.alive) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
    t.hop = 0;
    // Steps follow each other at once; if the walk stalls (a pop-up or a choice on the way),
    // the character stands still until it carries on.
    if (left > 0) t.pause = window.setTimeout(() => (t.walking = false), 150);
    if (left === 0) {
      t.walking = false;
      t.facing = Facing.Down;
      this.snapTokens();
    }
  }

  async warp(pid: number, to: number) {
    const t = this.tokens.get(pid)!;
    const dest = this.slotPos(pid, to);
    const from = { x: t.x, y: t.y };
    t.walking = true;
    const dur = T.warp * this.speed;
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / dur);
        const e = ease(k);
        t.x = from.x + (dest.x - from.x) * e;
        t.y = from.y + (dest.y - from.y) * e;
        t.hop = Math.sin(k * Math.PI) * 90;
        if (k < 1 && this.alive) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
    t.hop = 0;
    t.walking = false;
    this.snapTokens();
    this.ring(to, '#ffffff');
  }

  /**
   * Shops closing: zoom out to the whole board, bring each shop's shutter down in turn, then go
   * back to the player's zoom.
   */
  async closeShops(sqs: number[]) {
    await this.moveGates(sqs, false);
  }

  /**
   * Shops reopening at the start of their owner's turn: the same as closing, with the gates
   * rolling back up.
   */
  async openShops(sqs: number[]) {
    await this.moveGates(sqs, true);
  }

  private async moveGates(sqs: number[], opening: boolean) {
    if (!sqs.length) return;
    this.overviewHold = true;
    // Gates start moving once the camera has pulled back, one after another; until then they
    // stay as they were (up for closing, down for opening).
    const t0 = performance.now() + T.closeZoom * this.speed;
    sqs.forEach((id, i) => this.gates.set(id, { start: t0 + i * T.closeStagger * this.speed, opening }));
    await this.wait(T.closeZoom + T.closeStagger * (sqs.length - 1) + T.closeShutter + T.closeHold);
    // Closed gates stay drawn from the state; opened ones stay up until the state says open.
    if (!opening) for (const id of sqs) this.gates.delete(id);
    this.overviewHold = false;
    await this.wait(T.closeZoom);
  }

  /** A ring that grows and fades on a square. Gold rings also burst 8 sparkles. */
  ring(sqId: number, color: string, sparkles = false) {
    if (!this.G) return;
    const c = this.center(this.G.nodes[sqId]);
    this.fx.push({
      t0: performance.now(),
      dur: 700,
      draw: (ctx, k) => {
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = color;
        ctx.lineWidth = 6 * (1 - k) + 1;
        const s = TILE / 2 + 4 + k * 26;
        tileShape(ctx, this.G?.layout, c.x, c.y, s, 14);
        ctx.stroke();
        if (sparkles) {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const r = 30 + k * 50;
            drawSparkle(ctx, c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 8 * (1 - k * 0.5), '#ffe066');
          }
        }
        ctx.restore();
      },
    });
  }

  /** A square's value changed: the tile swells and a +/- label floats up from it. */
  valueFx(sqId: number, delta: number) {
    if (!this.G || !delta) return;
    const c = this.center(this.G.nodes[sqId]);
    const up = delta > 0;
    const color = up ? '#3ccf6e' : '#ff6b6b';
    const text = `${up ? '▲ +' : '▼ -'}${Math.abs(delta).toLocaleString('en-US')}G`;
    this.fx.push({
      t0: performance.now(),
      dur: 1600,
      draw: (ctx, k) => {
        ctx.save();
        // A tile outline that swells and fades.
        const sw = k < 0.3 ? k / 0.3 : 1;
        ctx.globalAlpha = Math.max(0, 1 - k * 1.3);
        ctx.strokeStyle = color;
        ctx.lineWidth = 8;
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
        tileShape(ctx, this.G?.layout, c.x, c.y, TILE / 2 + 4 + sw * 16, 16);
        ctx.stroke();
        ctx.restore();
        const s = this.worldToScreen(c.x, c.y - TILE / 2 - 10 - ease(Math.min(1, k * 1.4)) * 40);
        ctx.save();
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.globalAlpha = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
        const scale = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : k < 0.25 ? 1.1 - ((k - 0.15) / 0.1) * 0.1 : 1;
        const fs = Math.round(22 * scale);
        ctx.font = `${fs}px "Lilita One", sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(16,26,51,0.85)';
        ctx.fillStyle = color;
        fillMoney(ctx, text, s.x, s.y, fs, 'rgba(16,26,51,0.85)');
        ctx.restore();
      },
    });
  }

  /** A suit picked up in passing: sparkles swirl round the walking token and the suit pops up. */
  collectFx(pid: number, text: string, color: string) {
    this.fx.push({
      t0: performance.now(),
      dur: 900,
      draw: (ctx, k) => {
        const t = this.tokenPos(pid);
        ctx.save();
        ctx.globalAlpha = 1 - k * k;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + k * 5;
          const r = 22 + k * 30;
          drawSparkle(
            ctx,
            t.x + Math.cos(a) * r,
            t.y - 30 + Math.sin(a) * r * 0.6,
            7 * (1 - k * 0.6),
            '#ffe066',
          );
        }
        ctx.font = '34px "Lilita One", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(16,26,51,0.85)';
        const y = t.y - 70 - ease(k) * 40;
        ctx.strokeText(text, t.x, y);
        ctx.fillStyle = color;
        ctx.fillText(text, t.x, y);
        ctx.restore();
      },
    });
  }

  floatText(x: number, y: number, text: string, color: string) {
    this.fx.push({
      t0: performance.now(),
      dur: 1300,
      draw: (ctx, k) => {
        const s = this.worldToScreen(x, y - 40 - k * 50);
        ctx.save();
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
        ctx.font = '22px "Lilita One", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(16,26,51,0.85)';
        ctx.fillStyle = color;
        fillMoney(ctx, text, s.x, s.y, 22, 'rgba(16,26,51,0.85)');
        ctx.restore();
      },
    });
  }

  coins(from: { x: number; y: number }, to: { x: number; y: number }, n: number) {
    const count = Math.max(1, Math.min(8, n));
    for (let i = 0; i < count; i++) {
      const delay = i * 60;
      const arc = 60 + Math.random() * 40;
      this.fx.push({
        t0: performance.now() + delay,
        dur: 650,
        draw: (ctx, k) => {
          if (k <= 0) return;
          const e = ease(k);
          const x = from.x + (to.x - from.x) * e;
          const y = from.y + (to.y - from.y) * e - Math.sin(k * Math.PI) * arc;
          drawCoin(ctx, x, y, 9);
        },
      });
    }
  }

  /** Players doing a little dance (after a promotion): when it started and how long it lasts. */
  private dances = new Map<number, { start: number; ms: number }>();

  /** A little dance on the spot: spins through its facings, hopping, for `ms`. */
  dance(pid: number, ms = 1800) {
    this.dances.set(pid, { start: performance.now(), ms: ms * this.speed });
  }

  confetti(pid: number) {
    const p = this.tokenPos(pid);
    const parts = Array.from({ length: 40 }, () => ({
      vx: (Math.random() - 0.5) * 260,
      vy: -200 - Math.random() * 220,
      c: ['#ff5d73', '#ffd166', '#4cc9f0', '#80ed99', '#c77dff'][Math.floor(Math.random() * 5)],
      spin: (Math.random() - 0.5) * 14,
      w: 5 + Math.random() * 5,
    }));
    this.fx.push({
      t0: performance.now(),
      dur: 1500,
      draw: (ctx, k) => {
        const t = k * 1.5;
        ctx.save();
        ctx.globalAlpha = 1 - k;
        for (const q of parts) {
          ctx.save();
          ctx.translate(p.x + q.vx * t, p.y - 30 + q.vy * t + 300 * t * t);
          ctx.rotate(q.spin * t);
          ctx.fillStyle = q.c;
          roundRect(ctx, -q.w / 2, -2, q.w, 4, 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      },
    });
  }

  async rollDie(value: number) {
    const roll = reducedMotion() ? 250 : T.dieRoll;
    const die = {
      value,
      t0: performance.now(),
      phase: 'rolling' as const,
      count: value,
      prev: value,
      changed: 0,
    };
    this.die = die;
    await this.wait(roll);
    this.die = { ...die, phase: 'shown', t0: performance.now() };
    await this.wait(T.dieHold);
    // Then it shrinks to sit beside the player and counts the steps down.
    if (this.die?.value === value) this.die = { ...this.die, phase: 'small', t0: performance.now() };
  }

  // ------------------------------------------------------------ choices

  setChoices(
    ids: number[],
    color: string,
    onPick: (id: number) => void,
    routes?: Map<number, number[]>,
    opts: { labels?: Map<number, string>; pins?: boolean } = {},
  ) {
    this.glow = ids;
    this.glowColor = color;
    this.onPick = onPick;
    this.routes = routes ?? new Map();
    this.hoverRoute = null;
    this.fitIds = ids;
    this.choiceLabels = opts.labels ?? new Map();
    this.choicePins = opts.pins ?? true;
  }

  clearChoices() {
    this.glow = [];
    this.onPick = null;
    this.routes = new Map();
    this.hoverRoute = null;
    this.fitIds = [];
    this.choiceLabels = new Map();
    this.highlight = [];
  }

  previewRoute(id: number | null) {
    this.hoverRoute = id != null ? (this.routes.get(id) ?? null) : null;
  }

  /**
   * While a choice is open, the zoom that keeps the player centered and still frames every
   * glowing square around them inside the area the HUD leaves free (clear of the action bar,
   * cards and toolbar). When the choices are too spread out for that, the view frames all of
   * them in that area instead, zooming out as far as the whole board if it must.
   */
  choiceView(at: { x: number; y: number }) {
    const G = this.G!;
    const pad = 70;
    // Extra room above for the pins and labels over the choices.
    const up = this.glow.length ? 90 : 0;
    const { top, right, bottom, left } = this.insets;
    const cx = this.w / 2;
    const cy = this.h / 2;
    let z = Infinity;
    for (const id of this.fitIds) {
      const c = this.center(G.nodes[id]);
      const ox = c.x - at.x;
      const oy = c.y - at.y;
      z = Math.min(z, ox >= 0 ? (this.w - right - cx) / (ox + pad) : (cx - left) / (pad - ox));
      z = Math.min(z, oy >= 0 ? (this.h - bottom - cy) / (oy + pad) : (cy - top) / (pad + up - oy));
    }
    if (z >= this.zoomFor(1)) return { ...at, z };
    const pts = [at, ...this.fitIds.map((id) => this.center(G.nodes[id]))];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
    const h = Math.max(...ys) - Math.min(...ys) + pad * 2 + up;
    const fw = Math.max(100, this.w - left - right);
    const fh = Math.max(100, this.h - top - bottom);
    const fz = Math.max(this.freeFit().z, Math.min(fw / w, fh / h));
    return {
      // Centered in the free area, not under the cards or the action bar.
      x: (Math.min(...xs) + Math.max(...xs)) / 2 - (left - right) / 2 / fz,
      y: (Math.min(...ys) + Math.max(...ys)) / 2 - up / 2 - (top - bottom) / 2 / fz,
      z: fz,
    };
  }

  /**
   * A camera view framing these squares in the area the HUD leaves free, no closer than the
   * usual follow zoom.
   */
  frameSquares(ids: number[]) {
    const G = this.G!;
    const pts = ids.map((id) => this.center(G.nodes[id]));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = 110;
    const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
    const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
    const { top, right, bottom, left } = this.insets;
    const fw = Math.max(100, this.w - left - right);
    const fh = Math.max(100, this.h - top - bottom);
    const z = Math.min(this.followZoom(), fw / w, fh / h);
    return {
      // Centered in the free area, not under the cards or the action bar.
      x: (Math.min(...xs) + Math.max(...xs)) / 2 - (left - right) / 2 / z,
      y: (Math.min(...ys) + Math.max(...ys)) / 2 - (top - bottom) / 2 / z,
      z,
    };
  }

  /**
   * A district's stock moved: going up, green arrows and gold sparkles rise from each of its
   * squares; going down, red arrows and grey sparks sink over them.
   */
  stockFx(ids: number[], ms: number, up = true) {
    const G = this.G!;
    const glow = up ? '#7cf29a' : '#ff6b6b';
    const dir = up ? 1 : -1;
    const parts = ids.flatMap((id) => {
      const c = this.center(G.nodes[id]);
      return Array.from({ length: 9 }, (_, i) => ({
        x: c.x + (Math.random() - 0.5) * TILE * 0.9,
        y: up ? c.y + TILE * 0.3 - Math.random() * 20 : c.y - TILE * 0.45 + Math.random() * 20,
        delay: (i / 9) * 0.55 + Math.random() * 0.1,
        rise: 70 + Math.random() * 60,
        arrow: i % 3 === 0,
      }));
    });
    this.fx.push({
      t0: performance.now(),
      dur: ms * this.speed,
      draw: (ctx, k) => {
        ctx.save();
        // The district's squares glow while the particles rise.
        ctx.globalAlpha = Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.55;
        ctx.strokeStyle = glow;
        ctx.lineWidth = 7;
        for (const id of ids) {
          const c = this.center(G.nodes[id]);
          tileShape(ctx, G.layout, c.x, c.y, TILE / 2 + 6, 16);
          ctx.stroke();
        }
        for (const q of parts) {
          const t = (k - q.delay) / 0.45;
          if (t <= 0 || t >= 1) continue;
          const y = q.y - q.rise * t * dir;
          ctx.globalAlpha = Math.sin(t * Math.PI);
          if (q.arrow) {
            // An arrow pointing the way the price went (the shape is flipped for a fall).
            ctx.save();
            ctx.translate(q.x, y);
            ctx.scale(1, dir);
            ctx.fillStyle = glow;
            ctx.strokeStyle = up ? '#1b5e34' : '#7a1d1d';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, -14);
            ctx.lineTo(11, 0);
            ctx.lineTo(4, 0);
            ctx.lineTo(4, 12);
            ctx.lineTo(-4, 12);
            ctx.lineTo(-4, 0);
            ctx.lineTo(-11, 0);
            ctx.closePath();
            ctx.stroke();
            ctx.fill();
            ctx.restore();
          } else drawSparkle(ctx, q.x, y, 7 + 3 * Math.sin(t * Math.PI), up ? '#ffe066' : '#c3c9d6');
        }
        ctx.restore();
      },
    });
  }

  // ------------------------------------------------------------ camera

  /** Zoom out (positive) or in (negative) by `d`, where 1 is the whole range. */
  zoomBy(d: number) {
    this.zoomOut = Math.min(ZOOM_MAX_OUT, Math.max(0, this.zoomOut + d));
  }

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    // Trackpads send many small deltas, mouse wheels a few big ones.
    const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    this.zoomBy(Math.max(-ZOOM_STEP, Math.min(ZOOM_STEP, (px / 100) * ZOOM_STEP)));
  };

  private pinchDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.pinchDist = this.pinchSpan();
  };

  private pinchUp = (e: PointerEvent) => {
    this.pinch.delete(e.pointerId);
    this.pinchDist = this.pinchSpan();
  };

  private pinchSpan() {
    if (this.pinch.size < 2) return 0;
    const [a, b] = [...this.pinch.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** Zoom level for a zoomOut value: eased from the follow zoom to the whole board. */
  zoomFor(out: number) {
    const near = this.followZoom();
    const far = Math.min(near, this.freeFit().z);
    return near * Math.pow(far / near, out / ZOOM_MAX_OUT);
  }

  /**
   * The whole board fitted into the screen area the HUD leaves free (between the toolbar, the
   * player cards, the status line and the action bar), so no square hides under them.
   */
  freeFit() {
    const { top, right, bottom, left } = this.insets;
    const fw = Math.max(100, this.w - left - right);
    const fh = Math.max(100, this.h - top - bottom);
    return { z: Math.min(fw / this.ww, fh / this.wh) * 0.97 };
  }

  /**
   * The area the camera centers on: the whole screen. The HUD (cards, options, toolbar) floats
   * over the board instead of pushing it aside, so the board stays centered on the screen.
   */
  focusArea() {
    return { fx: this.w / 2, fy: this.h / 2, aw: this.w, ah: this.h };
  }

  followZoom() {
    const small = Math.min(this.w, this.h) < 520;
    return Math.min(this.w / this.ww, this.h / this.wh) * (small ? 2.2 : 1.65);
  }

  updateCamera() {
    const whole = this.followPid < 0 || this.G?.over || this.overviewHold || this.focusOwner >= 0;
    const out = whole ? ZOOM_MAX_OUT : this.zoomOut;
    const z = this.zoomFor(out);
    // The active player sits in the middle of the screen (the grass carries on past the board).
    let follow = this.followPid >= 0 ? this.tokenPos(this.followPid) : { x: this.ww / 2, y: this.wh / 2 };
    let fz = z;
    if (this.fitIds.length && out < ZOOM_MAX_OUT) {
      // A choice is open: zoom out just enough to frame it (never closer than the player chose).
      const v = this.choiceView(follow);
      follow = v;
      fz = Math.min(z, v.z);
    }
    // Zoomed out, the camera gradually lets go of the player and eases to the board's center,
    // shifted so the board sits in the middle of the free area (straight there for overviews).
    const overview = this.followPid < 0 || !!this.G?.over || this.overviewHold || this.focusOwner >= 0;
    const t = overview ? 1 : Math.min(1, Math.max(0, (out - ZOOM_BLEND) / (ZOOM_BLEND_END - ZOOM_BLEND)));
    const b = t * t * (3 - 2 * t);
    const { top, right, bottom, left } = this.insets;
    const mid = { x: this.ww / 2 - (left - right) / 2 / fz, y: this.wh / 2 - (top - bottom) / 2 / fz };
    const c = { x: follow.x + (mid.x - follow.x) * b, y: follow.y + (mid.y - follow.y) * b };
    this.camTarget = { x: c.x, y: c.y, z: fz };
    if (this.frameIds?.length) this.camTarget = this.frameSquares(this.frameIds);
    if (this.lookAt) this.camTarget = { ...this.lookAt };
    const k = reducedMotion() ? 1 : 0.12;
    this.cam.x += (this.camTarget.x - this.cam.x) * k;
    this.cam.y += (this.camTarget.y - this.cam.y) * k;
    this.cam.z += (this.camTarget.z - this.cam.z) * k;
  }

  worldToScreen(x: number, y: number) {
    const { fx, fy } = this.focusArea();
    return { x: (x - this.cam.x) * this.cam.z + fx, y: (y - this.cam.y) * this.cam.z + fy };
  }

  screenToWorld(x: number, y: number) {
    const { fx, fy } = this.focusArea();
    return { x: (x - fx) / this.cam.z + this.cam.x, y: (y - fy) / this.cam.z + this.cam.y };
  }

  squareAt(clientX: number, clientY: number): number | null {
    if (!this.G) return null;
    const r = this.canvas.getBoundingClientRect();
    const w = this.screenToWorld(clientX - r.left, clientY - r.top);
    for (const sq of this.G.nodes) {
      const c = this.center(sq);
      if (this.G.layout === 'hex') {
        if (Math.hypot(w.x - c.x, w.y - c.y) <= TILE / 2 + 6) return sq.id;
      } else if (Math.abs(w.x - c.x) <= TILE / 2 + 4 && Math.abs(w.y - c.y) <= TILE / 2 + 4) return sq.id;
    }
    return null;
  }

  private pointerMove = (e: PointerEvent) => {
    if (this.pinch.has(e.pointerId)) {
      this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const d = this.pinchSpan();
      if (d && this.pinchDist) this.zoomBy(Math.log(this.pinchDist / d) * 0.8);
      this.pinchDist = d;
    }
    const id = this.squareAt(e.clientX, e.clientY);
    this.canvas.style.cursor = id != null && this.glow.includes(id) ? 'pointer' : 'default';
    if (this.routes.size) this.previewRoute(id != null && this.glow.includes(id) ? id : null);
    this.onHover?.(id, e.clientX, e.clientY);
  };

  private click = (e: MouseEvent) => {
    const id = this.squareAt(e.clientX, e.clientY);
    if (id != null && this.glow.includes(id) && this.onPick) {
      const f = this.onPick;
      f(id);
      return;
    }
    if (id != null) this.onHover?.(id, e.clientX, e.clientY);
  };

  private resize = () => {
    const r = this.host.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  };

  // ------------------------------------------------------------ frame

  private frame = (now: number) => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.frame);
    if (!this.G) return;
    if (this.host.clientWidth !== Math.round(this.w) || this.host.clientHeight !== Math.round(this.h))
      this.resize();
    this.updateCamera();
    // The chip reads 250% fully zoomed in and 100% fully zoomed out (the whole board, clear of the HUD).
    const near = this.followZoom();
    const far = this.zoomFor(ZOOM_MAX_OUT);
    const out = far < near ? Math.log(this.cam.z / near) / Math.log(far / near) : 0;
    const pct = Math.round(250 - 150 * Math.min(1, Math.max(0, out)));
    if (pct !== this.zoomPct) {
      this.zoomPct = pct;
      this.onZoom?.(pct);
    }
    const ctx = this.ctx;
    const want = Math.min(3, Math.max(1, Math.ceil(this.camTarget.z * this.dpr * 2) / 2));
    if (this.dirty || want !== this.cacheScale) this.renderStatic(want);

    const { fx, fy } = this.focusArea();
    const z = this.cam.z * this.dpr;
    ctx.setTransform(
      z,
      0,
      0,
      z,
      (fx - this.cam.x * this.cam.z) * this.dpr,
      (fy - this.cam.y * this.cam.z) * this.dpr,
    );
    ctx.imageSmoothingEnabled = true;
    // Grass all around the board, in world space so it lines up with the board's own grass.
    this.grass ??= ctx.createPattern(grassTile(), 'repeat');
    ctx.fillStyle = this.grass ?? GRASS;
    const pad = 4000;
    ctx.fillRect(-pad, -pad, this.ww + pad * 2, this.wh + pad * 2);
    ctx.drawImage(this.cache, 0, 0, this.ww, this.wh);

    const motion = !reducedMotion();
    if (motion) this.drawAmbient(ctx, now);
    this.drawClosed(ctx, now, motion);
    this.drawGreyed(ctx);
    this.drawGlow(ctx, now);
    this.drawRoute(ctx);
    this.drawTokens(ctx, now, motion);
    this.drawDirections(ctx, now, motion);
    this.drawPins(ctx, now, motion);

    this.fx = this.fx.filter((f) => {
      const k = (now - f.t0) / f.dur;
      if (k > 1) return false;
      f.draw(ctx, Math.max(0, k), now);
      return true;
    });
    // Screen-space overlays
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawDie(ctx, now);
  };

  private drawAmbient(ctx: CanvasRenderingContext2D, now: number) {
    const t = now / 1000;
    // Drifting cloud shadows
    ctx.save();
    ctx.fillStyle = 'rgba(20,40,30,0.07)';
    for (let i = 0; i < 3; i++) {
      const x = ((t * 12 + i * 520) % (this.ww + 600)) - 300;
      const y = 140 + i * 230;
      ctx.beginPath();
      ctx.ellipse(x, y, 170, 60, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 110, y + 20, 120, 50, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (isTown(this.G)) this.drawTownAmbient(ctx, t);
    // Bank coin glint every few seconds
    this.drawBankGlint(ctx, t);
  }

  private drawTownAmbient(ctx: CanvasRenderingContext2D, t: number) {
    // Pond shimmer
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.6 + i * 0.25) % 1;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.8;
      const x = 330 + i * 34 - 50;
      const y = 238 + (i % 2) * 22;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 18, y);
      ctx.stroke();
    }
    ctx.restore();
    // Fountain spray
    ctx.save();
    const fxp = { x: 650, y: 552 };
    for (let i = 0; i < 10; i++) {
      const ph = (t * 1.2 + i / 10) % 1;
      const a = (i / 10) * Math.PI * 2;
      ctx.globalAlpha = 1 - ph;
      ctx.fillStyle = '#e6f8ff';
      ctx.fillRect(
        fxp.x + Math.cos(a) * ph * 30 - 2,
        fxp.y - 18 - Math.sin(ph * Math.PI) * 26 + ph * 10,
        4,
        4,
      );
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    const rp = (t * 0.5) % 1;
    ctx.globalAlpha = 1 - rp;
    ctx.beginPath();
    ctx.ellipse(fxp.x, fxp.y + 6, 18 + rp * 26, 7 + rp * 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawBankGlint(ctx: CanvasRenderingContext2D, t: number) {
    const g = (t % 4) / 4;
    if (g < 0.2) {
      const b = this.bankPos();
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y - 8, 24, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      const gx = b.x - 40 + (g / 0.2) * 80;
      ctx.beginPath();
      ctx.moveTo(gx, b.y - 40);
      ctx.lineTo(gx + 10, b.y - 40);
      ctx.lineTo(gx - 10, b.y + 30);
      ctx.lineTo(gx - 20, b.y + 30);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawClosed(ctx: CanvasRenderingContext2D, now: number, motion: boolean) {
    const G = this.G!;
    for (const sq of G.nodes) {
      const closed = sq.owner >= 0 && isClosed(G.players[sq.owner]);
      const g = this.gates.get(sq.id);
      if (g?.opening && !closed) this.gates.delete(sq.id);
      if (!closed) continue;
      // How far down the gate is: moving while animated, otherwise all the way down.
      let down = 1;
      if (g) {
        const k = motion ? Math.min(1, Math.max(0, (now - g.start) / (T.closeShutter * this.speed))) : 1;
        down = g.opening ? 1 - k : k;
      }
      if (down > 0) this.drawGate(ctx, sq, down);
    }
  }

  /**
   * A rolling gate over a closed property, `down` from 0 (up) to 1 (shut). It stays inside the
   * tile's border so the border still shows on top, and carries a small CLOSED sign once shut.
   */
  private drawGate(ctx: CanvasRenderingContext2D, sq: Square, down: number) {
    const G = this.G!;
    const c = this.center(sq);
    const inner = TILE / 2 - 6;
    const top = c.y - tileTop(G.layout, inner);
    const full = 2 * tileTop(G.layout, inner);
    const e = 1 - Math.pow(1 - down, 3);
    const hgt = full * e;
    ctx.save();
    tileShape(ctx, G.layout, c.x, c.y, inner, 8);
    ctx.clip();
    ctx.fillStyle = 'rgba(28, 34, 56, 0.72)';
    ctx.fillRect(c.x - TILE / 2, top, TILE, hgt);
    ctx.strokeStyle = 'rgba(230, 236, 255, 0.3)';
    ctx.lineWidth = 2;
    for (let y = top + 8; y < top + hgt - 3; y += 8) {
      ctx.beginPath();
      ctx.moveTo(c.x - TILE / 2, y);
      ctx.lineTo(c.x + TILE / 2, y);
      ctx.stroke();
    }
    // The gate's bottom bar.
    ctx.fillStyle = '#c9d2ea';
    ctx.fillRect(c.x - TILE / 2, top + hgt - 4, TILE, 4);
    ctx.restore();
    if (down >= 1) {
      ctx.save();
      ctx.font = '13px "Lilita One", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText('CLOSED').width + 12;
      ctx.fillStyle = '#e5484d';
      roundRect(ctx, c.x - w / 2, c.y - 10, w, 20, 5);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText('CLOSED', c.x, c.y + 1);
      ctx.restore();
    }
  }

  /** Player overview: grey out every property the shown player does not own. */
  private drawGreyed(ctx: CanvasRenderingContext2D) {
    if (this.focusOwner < 0 || !this.G) return;
    ctx.save();
    ctx.fillStyle = 'rgba(70, 74, 84, 0.72)';
    for (const sq of this.G.nodes) {
      if ((sq.t !== 'shop' && sq.t !== 'plot') || sq.owner === this.focusOwner) continue;
      const c = this.center(sq);
      tileShape(ctx, this.G.layout, c.x, c.y, TILE / 2 + 1, 14);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawGlow(ctx: CanvasRenderingContext2D, now: number) {
    if (!this.glow.length && !this.highlight.length) return;
    const G = this.G!;
    const pulse = 0.55 + 0.45 * Math.sin(now / 220);
    // Dim everything that is not a choice so the choices stand out.
    const lit = new Set([...this.glow, ...this.highlight]);
    ctx.save();
    ctx.fillStyle = 'rgba(12, 18, 36, 0.45)';
    for (const sq of G.nodes) {
      if (lit.has(sq.id)) continue;
      const c = this.center(sq);
      tileShape(ctx, G.layout, c.x, c.y, TILE / 2 + 1, 14);
      ctx.fill();
    }
    ctx.restore();
    for (const id of lit) {
      const c = this.center(G.nodes[id]);
      const strong = this.glow.includes(id) && (!this.highlight.length || this.highlight.includes(id));
      ctx.save();
      // A tint over the tile, then a pulsing outline.
      ctx.globalAlpha = 0.18 + 0.12 * pulse;
      ctx.fillStyle = this.glowColor;
      tileShape(ctx, G.layout, c.x, c.y, TILE / 2, 14);
      ctx.fill();
      // A white outline that pulses, glowing in the player's color.
      ctx.globalAlpha = strong ? 0.75 + 0.25 * pulse : 0.5;
      ctx.shadowColor = this.glowColor;
      ctx.shadowBlur = 10 + 20 * pulse;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = strong ? 6 + 2 * pulse : 4;
      tileShape(ctx, G.layout, c.x, c.y, TILE / 2 + 4, 14);
      ctx.stroke();
      // White rings that keep spreading out from the choices and fading, to catch the eye.
      if (strong && !reducedMotion()) {
        ctx.shadowBlur = 0;
        for (let i = 0; i < 2; i++) {
          const k = (now / RING_MS + i / 2 + id * 0.07) % 1;
          ctx.globalAlpha = 0.95 * (1 - k) * (1 - k);
          ctx.lineWidth = 5 * (1 - k) + 1.5;
          tileShape(ctx, G.layout, c.x, c.y, TILE / 2 + 6 + k * 26, 14 + k * 8);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  /** Bouncing pins and labels over choice squares, drawn above the tokens. */
  private drawPins(ctx: CanvasRenderingContext2D, now: number, motion: boolean) {
    if (!this.glow.length) return;
    const G = this.G!;
    for (const id of this.glow) {
      const c = this.center(G.nodes[id]);
      const bob = motion ? Math.abs(Math.sin(now / 260 + id)) * 10 : 4;
      const label = this.choiceLabels.get(id);
      let top = c.y - TILE / 2 - 8 - bob;
      ctx.save();
      if (this.choicePins) {
        // Pin: a round head with a point down onto the square.
        const r = 15;
        const hy = top - r - 6;
        ctx.beginPath();
        ctx.moveTo(c.x - 9, hy + 9);
        ctx.lineTo(c.x, top + 4);
        ctx.lineTo(c.x + 9, hy + 9);
        ctx.arc(c.x, hy, r, 0.2 * Math.PI, 0.8 * Math.PI, true);
        ctx.closePath();
        ctx.fillStyle = this.glowColor;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(c.x, hy, 6, 0, Math.PI * 2);
        ctx.fill();
        top = hy - r - 6;
      }
      if (label) {
        ctx.font = '18px "Lilita One", sans-serif';
        const w = moneyWidth(ctx, label, 18) + 20;
        const y = top - 14;
        ctx.fillStyle = 'rgba(16, 26, 51, 0.92)';
        ctx.strokeStyle = this.glowColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(c.x - w / 2, y - 14, w, 28, 14);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        fillMoney(ctx, label, c.x, y + 1, 18);
      }
      ctx.restore();
    }
  }

  private drawRoute(ctx: CanvasRenderingContext2D) {
    const G = this.G!;
    const path = this.hoverRoute;
    if (path && this.followPid >= 0) {
      const start = this.center(G.nodes[G.players[this.followPid].node]);
      ctx.save();
      ctx.setLineDash([6, 10]);
      ctx.strokeStyle = this.glowColor;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      for (const id of path) {
        const c = this.center(G.nodes[id]);
        ctx.lineTo(c.x, c.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      path.forEach((id, i) => {
        const c = this.center(G.nodes[id]);
        ctx.fillStyle = this.glowColor;
        ctx.beginPath();
        ctx.arc(c.x, c.y + 26, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '16px "Lilita One", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), c.x, c.y + 27);
      });
      ctx.restore();
    }
    if (this.walkTarget >= 0) {
      const c = this.center(G.nodes[this.walkTarget]);
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = this.glowColor;
      ctx.lineWidth = 4;
      tileShape(ctx, G.layout, c.x, c.y, TILE / 2 + 5, 16);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Arrows sliding out from the player's square toward each square their first step can reach
   * (any way but back), so they can see which way the roll will take them.
   */
  private drawDirections(ctx: CanvasRenderingContext2D, now: number, motion: boolean) {
    const G = this.G!;
    const p = G.players[this.directionsPid];
    if (!p || p.bankrupt) return;
    const here = G.nodes[p.node];
    let next = here.nb.filter((id) => id !== p.prev);
    if (!next.length) next = here.nb;
    const c0 = this.center(here);
    const color = PLAYER_COLORS[p.color];
    // Each arrow runs from just past the token toward the next square, three chevrons deep.
    const phase = motion ? (now / 900) % 1 : 0.5;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const id of next) {
      const c1 = this.center(G.nodes[id]);
      const dx = c1.x - c0.x;
      const dy = c1.y - c0.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      for (let i = 0; i < 3; i++) {
        const k = (i / 3 + phase) % 1;
        const d = 52 + k * 46;
        // Fade in near the token and out at the far end.
        const alpha = Math.sin(k * Math.PI);
        const x = c0.x + ux * d;
        const y = c0.y - 6 + uy * d;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(uy, ux));
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(-9, -13);
        ctx.lineTo(5, 0);
        ctx.lineTo(-9, 13);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 13;
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 10;
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  private drawTokens(ctx: CanvasRenderingContext2D, now: number, motion: boolean) {
    const G = this.G!;
    const dt = Math.min(100, now - (this.lastFrame || now));
    this.lastFrame = now;
    // Pixel sprites are drawn in device space with smoothing off.
    const base = this.cam.z * this.dpr * 1.35;
    // The active player is drawn last (on top) and bigger; the others a little smaller.
    const order = G.players
      .slice()
      .sort((a, b) => this.tokens.get(a.id)!.y - this.tokens.get(b.id)!.y)
      .sort((a, b) => Number(a.id === this.activePid) - Number(b.id === this.activePid));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    for (const p of order) {
      const t = this.tokens.get(p.id)!;
      if (!t.visible) continue;
      // The winner keeps the active size through the victory and results.
      const active = p.id === this.activePid;
      // Grow into the active size, or shrink out of it, over a fraction of a second.
      const want = active ? 1.416 : this.activePid >= 0 ? 0.6885 : 1;
      t.size = motion ? t.size + (want - t.size) * (1 - Math.exp(-dt / 140)) : want;
      const px = base * t.size;
      const ground = this.worldToScreen(t.x, t.y);
      const sx = Math.round(ground.x * this.dpr);
      const color = PLAYER_COLORS[p.color];
      // Walk cycle while moving; the idle cycle (offset per player) at rest.
      const frame = motion ? Math.floor(now / (t.walking ? 120 : 260)) + (t.walking ? 0 : p.id) : 0;
      const w = FRAME_W * px;
      const h = FRAME_H * px;
      // The base disc sits where the old, smaller tokens stood their feet.
      const footY = Math.round((ground.y + 21 * this.cam.z) * this.dpr);
      // Dancing: spin through the four facings with little hops, walking on the spot.
      let facing = t.facing;
      let walking = t.walking;
      let hop = t.hop;
      const dance = this.dances.get(p.id);
      if (dance) {
        const k = (now - dance.start) / dance.ms;
        if (k >= 1 || !motion) this.dances.delete(p.id);
        else {
          const beat = Math.floor((now - dance.start) / 220);
          facing = [Facing.Down, Facing.Right, Facing.Up, Facing.Left][beat % 4];
          walking = true;
          hop = Math.abs(Math.sin(((now - dance.start) / 220) * Math.PI)) * 12;
        }
      }
      const sy = footY - hop * this.cam.z * this.dpr;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(sx, footY + px * 1.2, w * 0.4, px * 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sx, footY, w * 0.36, px * 3.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = Math.max(2, px * 1.2);
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      if (active && motion) {
        const k = (now % 1400) / 1400;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.ellipse(sx, footY, w * (0.38 + k * 0.4), px * (3.8 + k * 3.5), 0, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3 * this.dpr;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      // A soft dark outline in the sprite's own shape, all round it, to lift it off the board.
      drawCharacterGlow(ctx, p.ch, walking, facing, frame, sx, sy + px * 3, px);
      drawCharacter(ctx, p.ch, walking, facing, frame, sx, sy + px * 3, px);
      // Name plate just above the character's head.
      {
        const fs = (active ? 14 : 11) * this.dpr;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.font = `${fs}px "Lilita One", sans-serif`;
        const tw = ctx.measureText(p.name).width + fs * 0.9;
        const ty = sy - h + px * 3 - (active ? 12 : 4) * this.dpr;
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5 * this.dpr;
        ctx.beginPath();
        ctx.roundRect(sx - tw / 2, ty - fs * 0.75, tw, fs * 1.4, fs * 0.7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.name, sx, ty);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  private drawDie(ctx: CanvasRenderingContext2D, now: number) {
    const d = this.die;
    if (!d || this.activePid < 0) return;
    const at = this.tokenPos(this.activePid);
    const pos = this.worldToScreen(at.x, at.y);
    const big = {
      x: Math.min(this.w - 50, Math.max(50, pos.x + 70)),
      y: Math.min(this.h - 50, Math.max(50, pos.y - 70)),
    };
    if (d.phase !== 'small') {
      const face = d.phase === 'rolling' ? 1 + (Math.floor(now / 70) % K.dieSides) : d.value;
      let sx = 1;
      let sy = 1;
      let dy = 0;
      if (d.phase === 'rolling') dy = -Math.abs(Math.sin(now / 90)) * 16;
      else {
        const k = Math.min(1, (now - d.t0) / 350);
        sx = 1 + Math.sin(k * Math.PI) * 0.25;
        sy = 1 - Math.sin(k * Math.PI) * 0.2;
      }
      ctx.save();
      ctx.translate(big.x, big.y + dy);
      ctx.scale(sx, sy);
      ctx.rotate(d.phase === 'rolling' ? Math.sin(now / 60) * 0.3 : 0);
      this.paintDie(ctx, face, 52);
      ctx.restore();
      return;
    }
    // Small: beside the player's head, easing in from where the roll was shown.
    const near = this.worldToScreen(at.x + 30, at.y - 52);
    const kIn = ease(Math.min(1, (now - d.t0) / 380));
    let size = 52 + (34 - 52) * kIn;
    const x = big.x + (near.x - big.x) * kIn;
    let y = big.y + (near.y - big.y) * kIn;
    // Each step flips the die over to the new number, with a little pop.
    const kc = d.changed ? Math.min(1, (now - d.changed) / 280) : 1;
    const face = kc < 0.5 ? d.prev : d.count;
    const flip = Math.abs(Math.cos(kc * Math.PI));
    size *= 1 + Math.sin(kc * Math.PI) * 0.25;
    // At 0 steps left the die pops away.
    if (d.count === 0 && kc >= 1) {
      this.die = null;
      return;
    }
    if (d.count === 0) {
      size *= 1 - kc;
      y -= kc * 14;
    }
    ctx.save();
    ctx.translate(x, y);
    if (kc < 1) {
      // Squash along the flip's axis (rotated for the diagonals) so the face turns over.
      const turn = [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4][d.flip ?? 0];
      ctx.rotate(turn);
      ctx.scale(flip, 1);
      ctx.rotate(-turn);
    }
    this.paintDie(ctx, face, size);
    ctx.restore();
  }

  /** A die face of `size` CSS pixels centered on the origin (numbers past 7 are written out). */
  private paintDie(ctx: CanvasRenderingContext2D, face: number, size: number) {
    const s = size;
    const u = s / 52;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(ctx, -s / 2 + 3 * u, -s / 2 + 5 * u, s, s, 10 * u);
    ctx.fill();
    ctx.fillStyle = '#fff';
    roundRect(ctx, -s / 2, -s / 2, s, s, 10 * u);
    ctx.fill();
    ctx.strokeStyle = '#101a33';
    ctx.lineWidth = Math.max(1.5, 3 * u);
    ctx.stroke();
    ctx.fillStyle = face === 1 ? '#e5484d' : '#101a33';
    const pips: Record<number, number[][]> = {
      1: [[0, 0]],
      2: [
        [-1, -1],
        [1, 1],
      ],
      3: [
        [-1, -1],
        [0, 0],
        [1, 1],
      ],
      4: [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ],
      5: [
        [-1, -1],
        [1, -1],
        [0, 0],
        [-1, 1],
        [1, 1],
      ],
      6: [
        [-1, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [1, 1],
      ],
      // Six with an extra pip in the middle.
      7: [
        [-1, -1],
        [1, -1],
        [-1, 0],
        [0, 0],
        [1, 0],
        [-1, 1],
        [1, 1],
      ],
    };
    if (!pips[face]) {
      ctx.font = `${Math.round(26 * u)}px "Lilita One", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(face), 0, 1.5 * u);
      return;
    }
    for (const [px, py] of pips[face]) {
      ctx.beginPath();
      ctx.arc(px * 13 * u, py * 13 * u, (face === 1 ? 8 : 5.5) * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ------------------------------------------------------------ static board

  private renderStatic(scale: number) {
    const G = this.G!;
    this.dirty = false;
    this.cacheScale = scale;
    const cv = this.cache;
    cv.width = Math.round(this.ww * scale);
    cv.height = Math.round(this.wh * scale);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    paintBoard(ctx, G);
  }
}

/** Draw the static board (scenery, roads and every square) in world units. Used by the editor too. */
export function paintBoard(ctx: CanvasRenderingContext2D, G: GameState) {
  drawScenery(ctx, G);
  for (const sq of G.nodes) drawSquare(ctx, G, sq);
}

// ------------------------------------------------------------------ drawing helpers

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, s = 1) {
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 22 * s, 22 * s, 8 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a4f2a';
  ctx.fillRect(x - 4 * s, y, 8 * s, 22 * s);
  ctx.fillStyle = '#3f9a45';
  ctx.beginPath();
  ctx.arc(x, y - 6 * s, 24 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#58b85a';
  ctx.beginPath();
  ctx.arc(x - 7 * s, y - 13 * s, 13 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawBed(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#7a5a3a';
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  const fr = seeded(Math.round(x * 7 + y));
  for (let i = 0; i < (w * h) / 180; i++) {
    ctx.fillStyle = ['#ff6b8b', '#ffd166', '#ffffff', '#c77dff'][Math.floor(fr() * 4)];
    ctx.fillRect(x + 6 + fr() * (w - 14), y + 5 + fr() * (h - 12), 5, 5);
  }
}

/** Custom boards: trees, flower beds and small ponds in the empty cells, the same every time. */
function drawCustomDecor(ctx: CanvasRenderingContext2D, G: GameState) {
  const used = new Set(G.nodes.map((n) => `${n.x},${n.y}`));
  const r = seeded(97 + (G.cols ?? 12) * 31 + (G.rows ?? 7) * 17 + G.nodes.length);
  for (let y = 0; y < (G.rows ?? 7); y++) {
    for (let x = 0; x < (G.cols ?? 12); x++) {
      if (used.has(`${x},${y}`)) continue;
      const { x: cx, y: cy } = cellCenter(G.layout, x, y);
      const roll = r();
      if (roll < 0.05) {
        ctx.fillStyle = '#5aa0d8';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 38, 24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7dc0ee';
        ctx.beginPath();
        ctx.ellipse(cx - 3, cy - 3, 30, 17, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (roll < 0.13) drawBed(ctx, cx - 40, cy - 14, 80, 28);
      else if (roll < 0.5) drawTree(ctx, cx - 14 + r() * 28, cy - 8 + r() * 16, 0.75 + r() * 0.35);
    }
  }
}

export const GRASS = '#92d268';
let grassCanvas: HTMLCanvasElement | null = null;

/** A 200 x 200 grass tile with tufts, repeated over the board and beyond it. */
export function grassTile(): HTMLCanvasElement {
  if (grassCanvas) return grassCanvas;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 200;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, 0, 200, 200);
  const r = seeded(42);
  ctx.fillStyle = 'rgba(60,120,40,0.18)';
  for (let i = 0; i < 14; i++) {
    const x = r() * 190;
    const y = r() * 190;
    ctx.fillRect(x, y, 3, 7);
    ctx.fillRect(x + 4, y + 2, 3, 5);
  }
  grassCanvas = cv;
  return cv;
}

function drawScenery(ctx: CanvasRenderingContext2D, G: GameState) {
  const { w: WORLD_W, h: WORLD_H } = worldSize(G);
  // Grass: the same tiling texture as around the board, so there is no edge.
  ctx.fillStyle = ctx.createPattern(grassTile(), 'repeat')!;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // Roads along every edge
  ctx.lineCap = 'round';
  for (const [w, c] of [
    [44, '#c9b07a'],
    [36, '#efe0b6'],
  ] as [number, string][]) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    for (const sq of G.nodes) {
      const a = squareCenter(sq, G.layout);
      for (const n of sq.nb) {
        if (n < sq.id) continue;
        const b = squareCenter(G.nodes[n], G.layout);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  if (!isTown(G)) {
    drawCustomDecor(ctx, G);
    return;
  }

  // Pond (upper park)
  ctx.fillStyle = '#5aa0d8';
  ctx.beginPath();
  ctx.ellipse(350, 250, 150, 62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7dc0ee';
  ctx.beginPath();
  ctx.ellipse(340, 243, 128, 48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4caf50';
  for (const [x, y] of [
    [260, 262],
    [420, 230],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x, y, 12, 7, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fountain (lower park)
  ctx.fillStyle = '#d9d4c7';
  ctx.beginPath();
  ctx.arc(650, 555, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7dc0ee';
  ctx.beginPath();
  ctx.arc(650, 555, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#bdb6a4';
  ctx.fillRect(644, 528, 12, 30);
  ctx.beginPath();
  ctx.arc(650, 528, 10, 0, Math.PI * 2);
  ctx.fill();

  // Flower beds
  const bed = (x: number, y: number, w: number, h: number) => drawBed(ctx, x, y, w, h);
  bed(560, 180, 150, 34);
  bed(560, 280, 150, 34);
  bed(800, 600, 140, 30);
  bed(380, 600, 140, 30);

  // Trees
  const tree = (x: number, y: number, s = 1) => drawTree(ctx, x, y, s);
  for (const [x, y, s] of [
    [800, 200, 1],
    [900, 260, 1.1],
    [1010, 205, 0.9],
    [1060, 290, 1],
    [190, 200, 0.9],
    [210, 560, 1],
    [300, 520, 0.8],
    [1000, 520, 1.1],
    [1080, 600, 0.9],
    [500, 520, 0.8],
    [760, 300, 0.8],
  ])
    tree(x, y, s);
}

const SPECIAL_LABEL: Record<string, string> = {
  bank: 'BANK',
  venture: 'VENTURE',
  change: 'CHANGE',
  roll: 'ROLL ON',
  break: 'BREAK',
  broker: 'STOCKS',
  back: 'BACKSTREET',
  arcade: 'ARCADE',
  cannon: 'CANNON',
  warp: 'WARP',
};

const MONEY = /^(.*\d)G$/;

/** Width of `text` with a trailing "G" drawn as a coin (font must be set). */
function moneyWidth(ctx: CanvasRenderingContext2D, text: string, size: number) {
  const m = MONEY.exec(text);
  return m ? ctx.measureText(m[1]).width + size * 0.95 : ctx.measureText(text).width;
}

/**
 * Centered text where an amount like "240G" ends in a gold coin instead of the letter G.
 * `stroke` draws an outline behind the text first.
 */
export function fillMoney(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  stroke?: string,
) {
  const m = MONEY.exec(text);
  if (!m) {
    ctx.textAlign = 'center';
    if (stroke) ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    return;
  }
  const w = moneyWidth(ctx, text, size);
  const left = x - w / 2;
  ctx.textAlign = 'left';
  if (stroke) ctx.strokeText(m[1], left, y);
  ctx.fillText(m[1], left, y);
  const r = size * 0.38;
  const cx = left + ctx.measureText(m[1]).width + size * 0.1 + r;
  const cy = ctx.textBaseline === 'middle' ? y : y - size * 0.33;
  if (stroke) {
    ctx.save();
    ctx.fillStyle = stroke;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  drawCoin(ctx, cx, cy, r);
  ctx.textAlign = 'center';
}

function label(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color = '#26314f',
  size = 12,
) {
  ctx.font = `700 ${size}px "Atkinson Hyperlegible", sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fillMoney(ctx, text, x, y, size);
}

/** A house icon. Owned houses are drawn in the owner's color, outlined, with their initial. */
function house(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, initial?: string) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - 18, y - 2);
  ctx.lineTo(x, y - 18);
  ctx.lineTo(x + 18, y - 2);
  ctx.lineTo(x + 13, y - 2);
  ctx.lineTo(x + 13, y + 15);
  ctx.lineTo(x - 13, y + 15);
  ctx.lineTo(x - 13, y - 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (initial) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = darken(color, 0.6);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '15px "Lilita One", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, x, y + 6);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x - 4, y + 4, 8, 11);
  }
  ctx.restore();
}

/** Building icons use the owner's color as their main color so ownership reads at a glance. */
function buildingIcon(
  ctx: CanvasRenderingContext2D,
  b: string,
  x: number,
  y: number,
  main: string,
  initial: string,
  level = 0,
) {
  // The painted building images (the circus by its level), once loaded; vector art until then.
  const key = (b === 'circus' ? `circus${Math.min(3, level)}` : b) as PropKey;
  if (drawProp(ctx, key, main, x, y - 9, 72, 46)) {
    if (initial) badge(ctx, x + 26, y + 8, main, initial);
    return;
  }
  ctx.save();
  ctx.lineWidth = 3;
  switch (b) {
    case 'checkpoint':
      ctx.fillStyle = main;
      ctx.fillRect(x - 22, y - 6, 44, 8);
      ctx.fillStyle = '#fff';
      for (let i = -18; i < 22; i += 12) ctx.fillRect(x + i, y - 6, 6, 8);
      ctx.fillStyle = '#5b6478';
      ctx.fillRect(x - 24, y - 14, 6, 26);
      break;
    case 'circus':
      ctx.fillStyle = main;
      ctx.beginPath();
      ctx.moveTo(x - 22, y + 12);
      ctx.lineTo(x, y - 18);
      ctx.lineTo(x + 22, y + 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 12);
      ctx.lineTo(x, y - 18);
      ctx.lineTo(x + 8, y + 12);
      ctx.fill();
      break;
    case 'balloon':
      ctx.fillStyle = main;
      ctx.beginPath();
      ctx.arc(x, y - 6, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7a4f2a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 6);
      ctx.lineTo(x - 5, y + 13);
      ctx.moveTo(x + 8, y + 6);
      ctx.lineTo(x + 5, y + 13);
      ctx.stroke();
      ctx.fillStyle = '#a0703a';
      ctx.fillRect(x - 6, y + 12, 12, 7);
      break;
    case 'tax':
      ctx.fillStyle = main;
      ctx.fillRect(x - 20, y - 4, 40, 20);
      ctx.beginPath();
      ctx.moveTo(x - 24, y - 4);
      ctx.lineTo(x, y - 18);
      ctx.lineTo(x + 24, y - 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      for (let i = -14; i <= 14; i += 9) ctx.fillRect(x + i - 2, y, 4, 14);
      break;
    case 'home':
      house(ctx, x, y, main, initial);
      break;
    case 'agency':
      ctx.fillStyle = main;
      ctx.fillRect(x - 16, y - 16, 32, 32);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) ctx.fillRect(x - 12 + i * 9, y - 12 + j * 9, 6, 6);
      break;
  }
  ctx.restore();
}

function specialIcon(ctx: CanvasRenderingContext2D, G: GameState, sq: Square, x: number, y: number) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  switch (sq.t) {
    case 'bank':
      // The painted bank (it has no player color); the gold coin until the images load.
      if (drawProp(ctx, 'bank', '#9aa3b8', x, y - 4, 78, 54)) break;
      ctx.fillStyle = '#c98a12';
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath();
      ctx.arc(x, y, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9a6a0a';
      ctx.font = '28px "Lilita One", sans-serif';
      ctx.fillText('G', x, y + 2);
      break;
    case 'venture':
    case 'broker':
      if (sq.t === 'broker' && G.rules === 'standard') {
        ctx.strokeStyle = '#30a46c';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x - 22, y + 12);
        ctx.lineTo(x - 8, y - 2);
        ctx.lineTo(x + 4, y + 6);
        ctx.lineTo(x + 22, y - 14);
        ctx.stroke();
        ctx.fillStyle = '#30a46c';
        ctx.beginPath();
        ctx.moveTo(x + 24, y - 18);
        ctx.lineTo(x + 12, y - 16);
        ctx.lineTo(x + 22, y - 6);
        ctx.fill();
        break;
      }
      ctx.fillStyle = '#7b4bd6';
      roundRect(ctx, x - 16, y - 21, 32, 42, 6);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '28px "Lilita One", sans-serif';
      ctx.fillText('?', x, y + 2);
      break;
    case 'spade':
    case 'heart':
    case 'diamond':
    case 'club': {
      const i = (SUITS as string[]).indexOf(sq.t);
      ctx.fillStyle = i === 1 || i === 2 ? '#e5484d' : '#3a3f5c';
      ctx.font = '46px "Atkinson Hyperlegible", serif';
      ctx.fillText(SUIT_CHARS[i], x, y + 2);
      break;
    }
    case 'change': {
      const i = G.changeSuit;
      ctx.strokeStyle = '#8a94a8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 24, 0.3, Math.PI * 1.7);
      ctx.stroke();
      ctx.fillStyle = i === 1 || i === 2 ? '#e5484d' : '#3a3f5c';
      ctx.font = '32px "Atkinson Hyperlegible", serif';
      ctx.fillText(SUIT_CHARS[i], x, y + 2);
      break;
    }
    case 'roll':
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#26314f';
      ctx.lineWidth = 3;
      roundRect(ctx, x - 17, y - 17, 34, 34, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#26314f';
      for (const [a, b] of [
        [-8, -8],
        [0, 0],
        [8, 8],
      ]) {
        ctx.beginPath();
        ctx.arc(x + a, y + b, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'break':
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#7a4f2a';
      ctx.lineWidth = 3;
      roundRect(ctx, x - 16, y - 10, 26, 26, 5);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 13, y + 3, 7, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.strokeStyle = '#b0b8c8';
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 14);
      ctx.quadraticCurveTo(x - 1, y - 20, x - 6, y - 26);
      ctx.moveTo(x + 2, y - 14);
      ctx.quadraticCurveTo(x + 7, y - 20, x + 2, y - 26);
      ctx.stroke();
      break;
    case 'boon':
    case 'boom':
      drawBoonIcon(ctx, sq.t, x, y, sq.t === 'boom' ? 56 : 50);
      break;
    case 'back':
      ctx.strokeStyle = '#5b6478';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x - 20, y + 10);
      ctx.quadraticCurveTo(x, y - 30, x + 18, y - 2);
      ctx.stroke();
      ctx.fillStyle = '#5b6478';
      ctx.beginPath();
      ctx.moveTo(x + 26, y - 8);
      ctx.lineTo(x + 20, y + 8);
      ctx.lineTo(x + 10, y - 4);
      ctx.fill();
      break;
    case 'arcade':
      ctx.fillStyle = '#26314f';
      roundRect(ctx, x - 22, y, 44, 16, 6);
      ctx.fill();
      ctx.fillStyle = '#5b6478';
      ctx.fillRect(x - 3, y - 18, 6, 20);
      ctx.fillStyle = '#e5484d';
      ctx.beginPath();
      ctx.arc(x, y - 18, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(x + 14, y + 8, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'cannon':
      ctx.fillStyle = '#3a3f5c';
      ctx.save();
      ctx.translate(x - 2, y + 4);
      ctx.rotate(-0.6);
      roundRect(ctx, -6, -9, 34, 18, 8);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#7a4f2a';
      ctx.beginPath();
      ctx.arc(x - 6, y + 12, 9, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'warp': {
      // A swirling portal in the color its linked warps share.
      const col = warpColor(G, sq);
      const g = ctx.createRadialGradient(x, y, 2, x, y, 24);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, col);
      g.addColorStop(1, darken(col, 0.55));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, 24, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2.5;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(x, y, 7 + k * 5, k * 2.1, k * 2.1 + Math.PI * 1.1);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

const WARP_COLORS = ['#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#22c55e'];

/** Linked warps share a color: the warps reachable from each other through their links. */
function warpColor(G: GameState, sq: Square): string {
  const warps = G.nodes.filter((n) => n.t === 'warp');
  const root = new Map<number, number>();
  const find = (i: number): number =>
    root.get(i) === undefined || root.get(i) === i ? i : find(root.get(i)!);
  for (const w of warps) root.set(w.id, w.id);
  for (const w of warps) {
    const to = w.link ?? -1;
    if (root.has(to)) root.set(find(w.id), find(to));
  }
  const roots = [...new Set(warps.map((w) => find(w.id)))].sort((a, b) => a - b);
  return WARP_COLORS[Math.max(0, roots.indexOf(find(sq.id))) % WARP_COLORS.length];
}

function drawSquare(ctx: CanvasRenderingContext2D, G: GameState, sq: Square) {
  const L = G.layout;
  const c = squareCenter(sq, L);
  const x = c.x - TILE / 2;
  const y = c.y - TILE / 2;
  // Top edge of the tile (the point of a hex sits higher than a square's edge).
  const top = c.y - tileTop(L, TILE / 2);
  const owner = sq.owner >= 0 ? G.players[sq.owner] : null;
  const ownerColor = owner ? PLAYER_COLORS[owner.color] : '';
  const district = sq.d >= 0 ? G.districts[sq.d] : null;
  // A hex narrows to a point at the bottom, so its icon and text sit higher, in the full-width
  // middle of the tile (using some of the room under the top point).
  const iy = c.y + (L === 'hex' ? -10 : 0);
  const ty = c.y + (L === 'hex' ? -11 : 0);
  /** The fee (owned) or price as plain text; dark on an owner's color so it stays readable. */
  const amount = (text: string, y: number) => label(ctx, c.x, y, text, owner ? '#1b2340' : '#26314f', 16);

  // Shadow + tile
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  tileShape(ctx, L, c.x + 2, c.y + 5, TILE / 2, 12);
  ctx.fill();
  // An owned tile is filled with its owner's color, so who owns what reads at a glance.
  ctx.fillStyle = owner ? tint(ownerColor, district ? 0.62 : 0.22) : sq.t === 'bank' ? '#fff6d6' : '#fdfbf5';
  tileShape(ctx, L, c.x, c.y, TILE / 2, 12);
  ctx.fill();

  if (sq.t === 'shop') {
    // The design grows with the shop's value; owned shops use the owner's color, unowned ones
    // stay plain grey so they never look like a player's.
    const tier = tierFor(sq.value, SHOP_TIERS);
    drawShop(ctx, c.x, iy - 4, tier, owner ? ownerColor : '#8a94a8', owner?.name[0]?.toUpperCase());
    amount(owner ? `${squareFee(G, sq)}G` : `${sq.value}G`, ty + 28);
  } else if (sq.t === 'plot') {
    if (!sq.b) {
      ctx.save();
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = '#6b7590';
      ctx.lineWidth = 2.5;
      tileShape(ctx, L, c.x, c.y, TILE / 2 - 4, 10);
      ctx.stroke();
      ctx.restore();
      label(ctx, c.x, ty + 4 + (L === 'hex' ? 11 : 0), 'VACANT', '#4a5470', 14);
    } else if (sq.b === 'star3') {
      // The 3-Star Shop has its own designs that grow with its value.
      const tier = tierFor(sq.value, STAR3_TIERS);
      drawStar3(ctx, c.x, iy - 2, tier, owner ? ownerColor : '#8a94a8', owner?.name[0]?.toUpperCase());
      if (owner) amount(`${squareFee(G, sq)}G`, ty + 30);
    } else {
      buildingIcon(
        ctx,
        sq.b,
        c.x,
        iy - 4,
        owner ? ownerColor : '#8a94a8',
        owner?.name[0]?.toUpperCase() ?? '',
        sq.lv,
      );
      const fee = sq.b === 'tax' ? '10%' : sq.b === 'agency' ? 'Break' : `${squareFee(G, sq)}G`;
      if (owner) amount(fee, ty + 32);
    }
  } else {
    const t = sq.t === 'broker' && G.rules === 'easy' ? 'VENTURE' : (SPECIAL_LABEL[sq.t] ?? '');
    // Squares without a label (suits, Boon, Boom) center their symbol on the tile.
    specialIcon(ctx, G, sq, c.x, t ? iy - 6 : c.y);
    if (t) label(ctx, c.x, ty + 30, t, '#4a5470', t.length > 8 ? 9 : 11);
  }

  // Border: the district's solid color on properties, else the owner's ring or a faint outline.
  if (district) {
    ctx.strokeStyle = district.color;
    ctx.lineWidth = 6;
    tileShape(ctx, L, c.x, c.y, TILE / 2 - 3, 10);
    ctx.stroke();
  }
  if (owner) {
    if (!district) {
      ctx.strokeStyle = ownerColor;
      ctx.lineWidth = 5;
      tileShape(ctx, L, c.x, c.y, TILE / 2 - 1.5, 11);
      ctx.stroke();
    }
    ctx.fillStyle = '#5b6478';
    const py = L === 'hex' ? top + 12 : y;
    ctx.fillRect(x + TILE - 12, py - 14, 3, 24);
    ctx.fillStyle = ownerColor;
    ctx.beginPath();
    ctx.moveTo(x + TILE - 9, py - 14);
    ctx.lineTo(x + TILE + 8, py - 8);
    ctx.lineTo(x + TILE - 9, py - 2);
    ctx.fill();
  } else if (!district) {
    ctx.strokeStyle = 'rgba(38,49,79,0.18)';
    ctx.lineWidth = 2;
    tileShape(ctx, L, c.x, c.y, TILE / 2 - 1, 11);
    ctx.stroke();
  }
}
