import { neighborCells, nextSteps, transportColor, type PortalWay } from '@aa/engine';
import { motelFee } from './names';
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
import { cellCenter, sideVector, tileShape, tileTop, worldSize } from './geometry';
import { SHOP_TIERS, STAR3_TIERS, badge, darken, drawShop, drawStar3, tierFor, tint } from './art';
import {
  drawProp,
  drawStamp,
  propCanvas,
  PAINTED_LANDSCAPE,
  PARK_LANDSCAPE,
  TOWN_LANDSCAPE,
  PUZZLE_LANDSCAPE,
  GROUND_SET,
  type PropKey,
} from './props';
import { paintMeadow } from './meadow';
import { CHUNK_LEVELS, chunkBudget, chunkLevel } from './chunk-budget';
import { parkSceneryBeyondBoard, sceneryBeyondBoard, sceneryForBoard } from './scenery';
import { paintParkScenery, paintParkStream } from './park';
import { paintParkScenes } from './park-scenes-art';
import { paintTownFeatures, paintTownTerrain } from './town-terrain-art';
import { paintGround, warmGround, type GroundPainter } from './ground';
import { drawBoonIcon, drawCoin, drawSparkle, SUIT_CHARS } from './icons';
import { Facing, FRAME_H, FRAME_W, drawCharacter, drawCharacterGlow, facingFor } from './sprites';
import { TIMING as T } from './timing';
import { portalFlows, portalPartner } from './portal-links';
import { drawLink } from './portal-link-art';
import { portalTravelPose } from './portal-travel';

import { ZOOM_MAX_OUT, fitZoom, gameNearZoom, zoomScale, wheelZoomStep } from './zoom';
export { ZOOM_STEP } from './zoom';

export { worldSize };

/** Center of a square's cell for the board's layout. */
export const squareCenter = (sq: { x: number; y: number }, layout?: BoardLayout) =>
  cellCenter(layout, sq.x, sq.y);

const isTown = (G: GameState | null) => !G || G.boardId === 'town';
const TILE = 86;
/** Ways the steps-left die can flip over: sideways, up and over, and the two diagonals. */
const DIE_FLIPS = 4;

// Asked several times a frame: keep the media query instead of parsing it each time.
let motionQuery: MediaQueryList | null = null;
const reducedMotion = () => (motionQuery ??= window.matchMedia('(prefers-reduced-motion: reduce)')).matches;

/** How long one ring takes to spread out from a highlighted square. */
const RING_MS = 1400;

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

interface Token {
  x: number;
  y: number;
  hop: number;
  walking: boolean;
  visible: boolean;
  portal?: ReturnType<typeof portalTravelPose>;
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
  /** The board's portals, worked out with the cache (portals are drawn live, turning). */
  private portalSpots: ReturnType<typeof portalGates> = [];

  // Camera: world point at the focus, and zoom in CSS px per world unit.
  cam = { x: 650, y: 400, z: 1 };
  camTarget = { x: 650, y: 400, z: 1 };
  private handoff: { from: { x: number; y: number; z: number }; start: number; duration: number } | null =
    null;
  /** Slow only the turn handoff; ordinary movement and zoom keep their usual easing. */
  handoffTo(pid: number, duration: number) {
    this.followPid = pid;
    this.handoff = { from: { ...this.cam }, start: performance.now(), duration };
  }
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
  /**
   * Smaller screens (set by the HUD with its bottom-left action bar): the board centers between
   * the left edge and the player cards instead of on the whole screen.
   */
  centerLeft = false;
  followPid = -1;
  activePid = -1;
  /**
   * While set, the camera shows the whole board for a choice that waits on the player (a trade).
   * The player can still zoom; their zoom is put back when it ends.
   */
  overviewHold = false;
  /**
   * While set, the camera shows the whole board for a few seconds (shops closing or opening) and
   * the zoom is locked until it goes back by itself.
   */
  showHold = false;
  /**
   * The player's zoom during an automatic view that waits on them (the squares a roll can reach,
   * a choice, a trade): the view keeps its center at this zoom. Null = the view's own zoom.
   */
  private autoZ: number | null = null;
  /** Which automatic view `autoZ` belongs to; a new view starts at its own zoom again. */
  private autoKey = '';
  /** The player overview is open: every property not owned by `focusOwner` is greyed out. */
  focusOwner = -1;
  /** While set, the camera shows the whole board (finding a property from the player overview). */
  peekWhole = false;
  /** A property shown from the info pop-up: zooming centers on it (with `overviewHold`). */
  focusSquare = -1;
  /** A square found from the player overview: every other tile is greyed out and it glows. */
  spot = -1;
  spotColor = '#fff';
  /**
   * While set, the camera frames these squares in the space the HUD leaves free (e.g. after a
   * roll: the player and everywhere they could land), refitting as the HUD changes.
   */
  frameIds: number[] | null = null;
  /** While set, the camera frames this spot instead of following anyone (e.g. a district). */
  lookAt: { x: number; y: number; z: number } | null = null;
  /** Called as each shop's gate starts moving (the host plays its shutter sound). */
  onGate: ((opening: boolean) => void) | null = null;
  /** Timers for the gates' sounds, so a closed view can stop them. */
  private gateTimers: number[] = [];

  /** Hear each gate as it starts to move (`start` is a performance.now() time). */
  private gateSound(start: number, opening: boolean) {
    const ms = Math.max(0, start - performance.now());
    const id = window.setTimeout(() => {
      this.gateTimers = this.gateTimers.filter((x) => x !== id);
      if (this.alive) this.onGate?.(opening);
    }, ms);
    this.gateTimers.push(id);
  }

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
  /**
   * Every square is a choice (fly or ride anywhere): nothing is dimmed, lit or pinned, which
   * would only cover the whole board (and slow it down); only the square under the pointer glows.
   */
  choicePlain = false;
  /** The square under the pointer. */
  private hoverId: number | null = null;
  /** Squares lit up without being choices (e.g. the district a button would pick). */
  highlight: number[] = [];
  routes = new Map<number, number[]>();
  hoverRoute: number[] | null = null;
  walkTarget = -1;
  /** Before a roll: the player whose possible first steps are shown as sliding arrows, or -1. */
  directionsPid = -1;
  onPick: ((id: number) => void) | null = null;
  /**
   * A pop-up is on the screen (set by the HUD): tiles and portals give no info on hover or tap,
   * and the wheel and pinches don't zoom. Squares glowing for a choice can still be picked.
   */
  locked = false;
  onHover: ((id: number | null, cx: number, cy: number) => void) | null = null;
  /** The pointer is over a portal (beside a tile, so never also over a square). */
  onPortalHover: ((gate: PortalGate, cx: number, cy: number) => void) | null = null;
  /** Called when the shown zoom changes: 250% fully zoomed in on the player, 100% fully out. */
  onZoom: ((pct: number, mode: 'free' | 'locked' | 'auto') => void) | null = null;
  private zoomPct = 0;
  private zoomModeShown = '';

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
    document.fonts?.ready.then(() => this.redrawAll());
    document.fonts?.addEventListener('loadingdone', this.fontsLoaded);
    for (const f of ['20px "Lilita One"', '700 12px "Atkinson Hyperlegible"']) void document.fonts?.load(f);
  }

  private fontsLoaded = () => this.redrawAll();

  /** Re-draw the whole board picture next frame (not just the squares that changed). */
  redrawAll() {
    this.looks = [];
    this.dirty = true;
  }

  destroy() {
    this.alive = false;
    this.gateTimers.forEach(clearTimeout);
    clearTimeout(this.portalTimer);
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    document.fonts?.removeEventListener('loadingdone', this.fontsLoaded);
    this.canvas.remove();
  }

  // ------------------------------------------------------------ state

  setState(G: GameState) {
    this.G = G;
    this.dirty = true;
    this.looks = [];
    this.tints = tintJobs(G);
    this.scheduleWarm();
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
    this.countStep(pid, left);
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
    this.finishStep(t, left);
  }

  private countStep(pid: number, left: number) {
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
  }

  private finishStep(t: Token, left: number) {
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

  /** Squeeze into the entrance, vanish briefly, then launch from the exact paired exit. */
  async portalStep(pid: number, from: number, to: number, left: number) {
    const G = this.G!;
    const t = this.tokens.get(pid)!;
    const gate = G.nodes[from].portals?.find((q) => q.to === to && q.way !== 'out');
    const back = gate && portalPartner(G, from, gate);
    if (!gate || !back) return this.step(pid, to, left);
    this.countStep(pid, left);
    clearTimeout(t.pause);
    t.walking = false;
    const start = { x: t.x, y: t.y };
    const entrance = portalPoint(G, G.nodes[from], gate.side);
    const exit = portalPoint(G, G.nodes[to], back.side);
    entrance.y -= 12;
    exit.y -= 12;
    const target = this.center(G.nodes[to]);
    target.y -= 12;
    if (reducedMotion()) {
      t.x = target.x;
      t.y = target.y;
      this.finishStep(t, left);
      return;
    }
    const color = this.portalSpots.find((p) => p.node === from && p.side === gate.side)?.color ?? '#a78bfa';
    const t0 = performance.now();
    let entered = false,
      emerged = false;
    await new Promise<void>((resolve) => {
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / (T.portalStep * this.speed));
        const pose = portalTravelPose(k, start, entrance, exit, target);
        t.portal = pose;
        t.x = pose.x;
        t.y = pose.y;
        t.hop = pose.hop;
        t.facing = pose.exiting
          ? facingFor(target.x - exit.x, target.y - exit.y)
          : facingFor(entrance.x - start.x, entrance.y - start.y);
        if (!entered && k >= 0.4) {
          entered = true;
          this.portalBurst({ x: entrance.x, y: entrance.y + 12 }, color);
        }
        if (!emerged && k >= 0.55) {
          emerged = true;
          this.portalBurst({ x: exit.x, y: exit.y + 12 }, color);
        }
        if (k < 1 && this.alive) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
    delete t.portal;
    t.x = target.x;
    t.y = target.y;
    t.walking = left > 0;
    this.finishStep(t, left);
  }

  private portalBurst(at: { x: number; y: number }, color: string) {
    this.fx.push({
      t0: performance.now(),
      dur: 260 * this.speed,
      draw: (ctx, k) => {
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.7;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(at.x, at.y, 13 + k * 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      },
    });
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
   * Shops reopening at the start of their owner's turn: the gates roll back up one after another
   * in the background. The camera stays put and the game carries on meanwhile.
   */
  openShops(sqs: number[]) {
    const t0 = performance.now();
    sqs.forEach((id, i) => {
      const start = t0 + i * T.closeStagger * this.speed;
      this.gates.set(id, { start, opening: true });
      this.gateSound(start, true);
    });
  }

  private async moveGates(sqs: number[], opening: boolean) {
    if (!sqs.length) return;
    this.showHold = true;
    // Gates start moving once the camera has pulled back, one after another; until then they
    // stay as they were (up for closing, down for opening).
    const t0 = performance.now() + T.closeZoom * this.speed;
    sqs.forEach((id, i) => {
      const start = t0 + i * T.closeStagger * this.speed;
      this.gates.set(id, { start, opening });
      this.gateSound(start, opening);
    });
    await this.wait(T.closeZoom + T.closeStagger * (sqs.length - 1) + T.closeShutter + T.closeHold);
    // Closed gates stay drawn from the state; opened ones stay up until the state says open.
    if (!opening) for (const id of sqs) this.gates.delete(id);
    this.showHold = false;
    await this.wait(T.closeZoom);
  }

  /** A ring that grows and fades on a square. Gold rings also burst 8 sparkles. */
  ring(sqId: number, color: string, sparkles = false) {
    if (!this.G) return;
    const c = this.center(this.G.nodes[sqId]);
    this.fx.push({
      t0: performance.now(),
      dur: 700,
      draw: (ctx, k) => drawRingBurst(ctx, this.G?.layout, c, color, k, sparkles),
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

  /**
   * Roll the die on screen. With `shrinkFirst` it also waits for the die to shrink beside the
   * player before returning, so walking starts after it (not while it is still shrinking).
   */
  async rollDie(value: number, onResult?: () => void, resultHold: number = T.dieHold, shrinkFirst = false) {
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
    onResult?.();
    if (resultHold > 0) await this.wait(resultHold);
    // Then it shrinks to sit beside the player and counts the steps down.
    if (this.die?.value === value) this.die = { ...this.die, phase: 'small', t0: performance.now() };
    if (shrinkFirst) await this.wait(T.dieShrink);
  }

  // ------------------------------------------------------------ choices

  setChoices(
    ids: number[],
    color: string,
    onPick: (id: number) => void,
    routes?: Map<number, number[]>,
    opts: { labels?: Map<number, string>; pins?: boolean; fit?: boolean; plain?: boolean } = {},
  ) {
    this.glow = ids;
    this.glowColor = color;
    this.onPick = onPick;
    this.routes = routes ?? new Map();
    this.hoverRoute = null;
    // The camera zooms out to frame the choices unless told not to.
    this.fitIds = opts.fit === false ? [] : ids;
    this.choiceLabels = opts.labels ?? new Map();
    this.choicePins = opts.pins ?? true;
    this.choicePlain = opts.plain ?? false;
  }

  clearChoices() {
    this.glow = [];
    this.onPick = null;
    this.routes = new Map();
    this.hoverRoute = null;
    this.fitIds = [];
    this.choiceLabels = new Map();
    this.choicePlain = false;
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
    const { fx: cx } = this.focusArea();
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
      x: (Math.min(...xs) + Math.max(...xs)) / 2 + this.freeShiftX() / fz,
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
      x: (Math.min(...xs) + Math.max(...xs)) / 2 + this.freeShiftX() / z,
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

  /**
   * The camera is showing something for a few seconds and goes back by itself (shops closing,
   * a stock move, finding a property, the winner): the player's zoom is locked meanwhile.
   */
  get zoomLocked() {
    return this.showHold || this.peekWhole || !!this.lookAt || !!this.G?.over;
  }

  /**
   * Which zoom mode the camera is in (the zoom chip's border shows it):
   * - `locked`: the game is showing something and only it moves the zoom;
   * - `auto`: the game framed part of the board, and the player may still zoom in and out;
   * - `free`: the player's own zoom, which the game never changes.
   * Locked and auto views go back to free zoom by themselves when the game is done with them.
   */
  get zoomMode(): 'free' | 'locked' | 'auto' {
    if (this.zoomLocked) return 'locked';
    return this.autoView() ? 'auto' : 'free';
  }

  /** An automatic view is up that waits on the player (they may zoom it). */
  private autoView() {
    return !!this.frameIds?.length || this.fitIds.length > 0 || this.overviewHold;
  }

  /** Zoom out (positive) or in (negative) by `d`, where 1 is the whole range. */
  zoomBy(d: number) {
    if (this.zoomLocked) return;
    if (this.autoView()) {
      // Zoom the automatic view around its own center; the player's zoom is kept for after.
      const near = this.followZoom();
      const far = Math.min(near, this.freeFit().z);
      const z = (this.autoZ ?? this.camTarget.z) * Math.pow(far / near, d / ZOOM_MAX_OUT);
      this.autoZ = Math.min(near, Math.max(far, z));
      return;
    }
    this.zoomOut = Math.min(ZOOM_MAX_OUT, Math.max(0, this.zoomOut + d));
  }

  /** The zoom chip: back to fully zoomed in (or, in an automatic view, to the view's own zoom). */
  resetZoom() {
    if (this.zoomLocked) return;
    if (this.autoView()) this.autoZ = null;
    else this.zoomOut = 0;
  }

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.locked) return;
    // Trackpads send many small deltas, mouse wheels a few big ones.
    this.zoomBy(wheelZoomStep(e.deltaY, e.deltaMode));
  };

  private pinchDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || this.locked) return;
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
    return zoomScale(near, far, out);
  }

  /**
   * The whole board fitted around the middle of the window, clear of the HUD: the same margin on
   * both sides (the bigger of left/right, and of top/bottom), so a board centered on the window
   * never runs under the toolbar, the player cards or the action bar.
   */
  freeFit() {
    const { top, right, bottom, left } = this.insets;
    const sy = Math.max(top, bottom);
    // Smaller screens center between the left edge and the cards, so only that room counts.
    const fw = this.centerLeft ? this.w - left - right : this.w - 2 * Math.max(left, right);
    return { z: fitZoom(fw, this.h - 2 * sy, this.ww, this.wh) };
  }

  /**
   * The area the camera centers on: the whole screen. The HUD (cards, options, toolbar) floats
   * over the board instead of pushing it aside, so the board stays centered on the screen. On
   * smaller screens (`centerLeft`) the cards take too much of the width for that: the camera
   * centers between the left edge and the cards.
   */
  focusArea() {
    if (this.centerLeft) {
      const { left, right } = this.insets;
      const aw = Math.max(100, this.w - left - right);
      return { fx: left + aw / 2, fy: this.h / 2, aw, ah: this.h };
    }
    return { fx: this.w / 2, fy: this.h / 2, aw: this.w, ah: this.h };
  }

  /** Screen pixels from the camera's center to the middle of the area the HUD leaves free. */
  private freeShiftX() {
    const { left, right } = this.insets;
    return this.focusArea().fx - (left + this.w - right) / 2;
  }

  followZoom() {
    return gameNearZoom(this.w, this.h);
  }

  updateCamera() {
    const whole = this.followPid < 0 || this.G?.over || this.overviewHold || this.showHold || this.peekWhole;
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
    // which sits in the middle of the window (straight there for overviews).
    const overview =
      this.followPid < 0 || !!this.G?.over || this.overviewHold || this.showHold || this.peekWhole;
    const t = overview ? 1 : Math.min(1, Math.max(0, (out - ZOOM_BLEND) / (ZOOM_BLEND_END - ZOOM_BLEND)));
    const b = t * t * (3 - 2 * t);
    const mid = { x: this.ww / 2, y: this.wh / 2 };
    const c = { x: follow.x + (mid.x - follow.x) * b, y: follow.y + (mid.y - follow.y) * b };
    this.camTarget = { x: c.x, y: c.y, z: fz };
    if (this.frameIds?.length) this.camTarget = this.frameSquares(this.frameIds);
    // The player zoomed an automatic view that waits on them: same center, their zoom. A new
    // view (or none) drops it, so the camera goes back to the zoom they had before.
    const key = this.autoView()
      ? `${this.frameIds?.join() ?? ''}|${this.fitIds.join()}|${this.overviewHold}`
      : '';
    if (key !== this.autoKey) {
      this.autoKey = key;
      this.autoZ = null;
    }
    if (this.autoZ != null && !this.showHold && !this.peekWhole) this.camTarget.z = this.autoZ;
    // A property found from the info pop-up: the whole board, and once the player zooms, the
    // view centers on that property.
    if (this.focusSquare >= 0 && this.overviewHold && this.autoZ != null && this.G) {
      const c = this.center(this.G.nodes[this.focusSquare]);
      this.camTarget.x = c.x;
      this.camTarget.y = c.y;
    }
    if (this.lookAt) this.camTarget = { ...this.lookAt };
    if (this.handoff) {
      const t = reducedMotion()
        ? 1
        : Math.min(1, (performance.now() - this.handoff.start) / this.handoff.duration);
      const k = t * t * (3 - 2 * t);
      for (const axis of ['x', 'y', 'z'] as const)
        this.cam[axis] = this.handoff.from[axis] + (this.camTarget[axis] - this.handoff.from[axis]) * k;
      if (t === 1) this.handoff = null;
      return;
    }
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
    if (this.locked && !(id != null && this.glow.includes(id) && this.onPick)) {
      this.hoverId = null;
      this.canvas.style.cursor = 'default';
      return;
    }
    this.hoverId = id;
    const gate = id == null ? this.portalAt(e.clientX, e.clientY) : null;
    this.canvas.style.cursor = (id != null && this.glow.includes(id)) || gate ? 'pointer' : 'default';
    if (this.routes.size) this.previewRoute(id != null && this.glow.includes(id) ? id : null);
    if (gate && this.onPortalHover) this.onPortalHover(gate, e.clientX, e.clientY);
    else this.onHover?.(id, e.clientX, e.clientY);
  };

  /** The portal under a screen point, if any. */
  portalAt(cx: number, cy: number): PortalGate | null {
    if (!this.G) return null;
    const r = this.canvas.getBoundingClientRect();
    const w = this.screenToWorld(cx - r.left, cy - r.top);
    return (
      this.portalSpots.find((g) => {
        const at = portalPoint(this.G!, this.G!.nodes[g.node], g.side);
        return Math.hypot(at.x - w.x, at.y - w.y) <= 26;
      }) ?? null
    );
  }

  /**
   * Show where a portal leads: the camera frames it and every portal it links to (with a ring on
   * each tile) for `T.portalShow`, then goes back to where it was.
   */
  showPortal(gate: PortalGate) {
    const ids = [gate.node, ...gate.to];
    const view = this.frameSquares(ids);
    this.lookAt = view;
    this.flashPortals(gate);
    clearTimeout(this.portalTimer);
    this.portalTimer = window.setTimeout(() => {
      // Something else may have taken the camera meanwhile: leave that alone.
      if (this.lookAt === view) this.lookAt = null;
      // The portal's pop-up was for where the portal was on screen: put it away.
      this.onHover?.(null, 0, 0);
    }, T.portalShow * this.speed);
  }
  private portalTimer = 0;

  /**
   * A portal and the portals it links to flash together, three times over `T.portalShow`: the
   * ring lights up white and a glow in the portal's color spreads out from it.
   */
  private flashPortals(gate: PortalGate) {
    const G = this.G!;
    const flows = portalFlows(G, gate);
    const spots = [
      portalPoint(G, G.nodes[gate.node], gate.side),
      ...flows.map((f) => {
        const other = f.from.node === gate.node && f.from.side === gate.side ? f.to : f.from;
        return portalPoint(G, G.nodes[other.node], other.side);
      }),
    ];
    const pulses = 3;
    this.fx.push({
      t0: performance.now(),
      dur: T.portalShow * this.speed,
      draw: (ctx, k) => {
        for (const flow of flows)
          drawLink(
            ctx,
            portalPoint(G, G.nodes[flow.from.node], flow.from.side),
            portalPoint(G, G.nodes[flow.to.node], flow.to.side),
            gate.color,
            this.cam.z * this.dpr,
            reducedMotion(),
            flow.both,
          );
        // Each pulse: a quick light-up, then a slower fade.
        const t = (k * pulses) % 1;
        const light = t < 0.2 ? t / 0.2 : Math.max(0, 1 - (t - 0.2) / 0.6);
        ctx.save();
        for (const at of spots) {
          ctx.globalAlpha = light * 0.55;
          ctx.fillStyle = gate.color;
          ctx.beginPath();
          ctx.arc(at.x, at.y, 17 + 14 * t, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = light * 0.85;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(at.x, at.y, 17, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = (1 - t) * 0.9;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(at.x, at.y, 19 + 16 * t, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  }

  private click = (e: MouseEvent) => {
    const id = this.squareAt(e.clientX, e.clientY);
    if (id != null && this.glow.includes(id) && this.onPick) {
      const f = this.onPick;
      f(id);
      return;
    }
    if (this.locked) return;
    if (id != null) return this.onHover?.(id, e.clientX, e.clientY);
    // A portal: show where it leads (and its info, for touch screens with no hover).
    const gate = this.portalAt(e.clientX, e.clientY);
    if (gate) {
      this.onPortalHover?.(gate, e.clientX, e.clientY);
      this.showPortal(gate);
    }
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

  // ------------------------------------------------------------ ground warm-up

  private warming = false;
  private wasZooming = false;

  /** Build ground chunks while the browser is idle, so a zoom finds them ready (see ground.ts). */
  private scheduleWarm() {
    if (this.warming || !this.alive) return;
    this.warming = true;
    if ('requestIdleCallback' in window) requestIdleCallback(this.warm, { timeout: 2000 });
    else setTimeout(() => this.warm(), 200);
  }

  /** Recolored images still to make ahead of time (see `tintJobs`). */
  private tints: [PropKey, string][] = [];

  private warm = (deadline?: IdleDeadline) => {
    this.warming = false;
    const G = this.G;
    if (!this.alive || !G) return;
    // Recoloring an image takes a moment the first time each color is used: do the ones a
    // player's first purchase needs now, rather than in the middle of the purchase.
    while (this.tints.length) {
      const [key, color] = this.tints.pop()!;
      propCanvas(key, color);
      if (!deadline || deadline.timeRemaining() < 8) return this.scheduleWarm();
    }
    if (GROUND_SET === 'solid') return;
    const paint = groundPainter(G);
    const far = this.zoomFor(ZOOM_MAX_OUT);
    const farLevel = chunkLevel(far * this.dpr);
    const nearLevel = chunkLevel(this.followZoom() * this.dpr);
    // Zoomed all the way out: everything that view can show. One level sharper (the zoom passes
    // through it on the way in): the board and a margin. The sharpest chunks are built on demand.
    const fw = this.w / far / 2,
      fh = this.h / far / 2;
    const jobs: [number, number, number, number, number][] = [
      [farLevel, this.ww / 2 - fw, this.wh / 2 - fh, this.ww / 2 + fw, this.wh / 2 + fh],
    ];
    const next = CHUNK_LEVELS.find((l) => l > farLevel);
    if (next && nearLevel > farLevel) jobs.push([next, -400, -400, this.ww + 400, this.wh + 400]);
    for (const job of jobs) {
      while (warmGround(G, paint, ...job)) {
        // Keep idle callbacks short; the rest waits for the next idle moment.
        if (!deadline || deadline.timeRemaining() < 8) return this.scheduleWarm();
      }
    }
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
    const mode = this.zoomMode;
    if (pct !== this.zoomPct || mode !== this.zoomModeShown) {
      this.zoomPct = pct;
      this.zoomModeShown = mode;
      this.onZoom?.(pct, mode);
    }
    const ctx = this.ctx;
    // While the zoom is still moving, nothing slow is re-drawn just to be sharper: the pictures
    // at hand stand in and the sharper ones follow once the camera settles.
    const zooming = Math.abs(this.cam.z / this.camTarget.z - 1) > 0.02;
    // The board picture only gets sharper, never re-drawn smaller: a sharper one shrinks fine,
    // and re-drawing the whole board as the camera zooms out made the zoom stutter.
    const want = Math.min(this.maxCacheScale(), Math.max(1, Math.ceil(this.camTarget.z * this.dpr * 2) / 2));
    if (want > this.cacheScale && !zooming)
      this.renderStatic(Math.max(want, Math.min(this.cacheScale, this.maxCacheScale())));
    else if (this.dirty) this.updateStatic();

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
    // Paint the visible world, rather than a fixed rectangle around the board. Build at most one
    // new ground chunk per frame, none while zooming (see ground.ts).
    // Settled after a zoom: chunks may have been dropped for memory, so top the warm-up up again.
    if (this.wasZooming && !zooming) this.scheduleWarm();
    this.wasZooming = zooming;
    chunkBudget.left = zooming ? 0 : 1;
    paintLiveGrass(ctx, this.G);
    chunkBudget.left = Infinity;
    ctx.drawImage(this.cache, 0, 0, this.ww, this.wh);

    const motion = !reducedMotion();
    drawPortals(ctx, this.G!, motion ? now : 0, this.portalSpots);
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
    ctx.fillStyle = PAINTED_LANDSCAPE ? 'rgba(20,40,30,0.018)' : 'rgba(20,40,30,0.07)';
    for (let i = 0; i < 3; i++) {
      const x = ((t * 12 + i * 520) % (this.ww + 600)) - 300;
      const y = 140 + i * 230;
      ctx.beginPath();
      ctx.ellipse(x, y, 170, 60, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 110, y + 20, 120, 50, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (isTown(this.G) && !TOWN_LANDSCAPE) this.drawTownAmbient(ctx, t);
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
      // A reopening gate rolls up by itself (the shop is already open in the game).
      if (g?.opening) {
        const k = motion ? (now - g.start) / (T.closeShutter * this.speed) : 1;
        if (k >= 1) this.gates.delete(sq.id);
        else this.drawGate(ctx, sq, Math.min(1, 1 - k));
        continue;
      }
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
    if (propCanvas('closed', '#808080')) {
      ctx.save();
      tileShape(ctx, G.layout, c.x, c.y, inner, 8);
      ctx.clip();
      ctx.beginPath();
      ctx.rect(c.x - TILE / 2, top, TILE, hgt);
      ctx.clip();
      drawStamp(ctx, 'closed', '#808080', c.x, c.y, TILE - 12, full);
      ctx.restore();
      return;
    }
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

  /**
   * Player overview: grey out every property the shown player does not own, or, while a property
   * found from it is shown, every tile but that one.
   */
  private drawGreyed(ctx: CanvasRenderingContext2D) {
    if ((this.focusOwner < 0 && this.spot < 0) || !this.G) return;
    ctx.save();
    ctx.fillStyle = 'rgba(70, 74, 84, 0.72)';
    for (const sq of this.G.nodes) {
      if (
        this.spot >= 0
          ? sq.id === this.spot
          : (sq.t !== 'shop' && sq.t !== 'plot') || sq.owner === this.focusOwner
      )
        continue;
      const c = this.center(sq);
      tileShape(ctx, this.G.layout, c.x, c.y, TILE / 2 + 1, 14);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawGlow(ctx: CanvasRenderingContext2D, now: number) {
    if (this.spot >= 0) return this.glowTile(ctx, now, this.spot, this.spotColor, true);
    if (!this.glow.length && !this.highlight.length) return;
    if (this.choicePlain && !this.highlight.length) {
      const id = this.hoverId;
      if (id != null && this.glow.includes(id)) this.glowTile(ctx, now, id, this.glowColor, true);
      return;
    }
    const G = this.G!;
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
      const strong = this.glow.includes(id) && (!this.highlight.length || this.highlight.includes(id));
      this.glowTile(ctx, now, id, this.glowColor, strong);
    }
  }

  /** One lit square: a tint, a pulsing outline and, when `strong`, white rings spreading out. */
  private glowTile(ctx: CanvasRenderingContext2D, now: number, id: number, color: string, strong: boolean) {
    drawTileGlow(ctx, this.G!.layout, this.center(this.G!.nodes[id]), color, now, strong, id);
  }

  /** Bouncing pins and labels over choice squares, drawn above the tokens. */
  private drawPins(ctx: CanvasRenderingContext2D, now: number, motion: boolean) {
    if (!this.glow.length || this.spot >= 0 || this.choicePlain) return;
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
      // Through a portal link the line goes into one ring and comes out of the other.
      let last = G.players[this.followPid].node;
      for (const id of path) {
        const gate = G.nodes[last].portals?.find((q) => q.to === id);
        const back = G.nodes[id].portals?.find((q) => q.to === last);
        if (gate && back) {
          const out = portalPoint(G, G.nodes[last], gate.side);
          const into = portalPoint(G, G.nodes[id], back.side);
          ctx.lineTo(out.x, out.y);
          ctx.moveTo(into.x, into.y);
        }
        const c = this.center(G.nodes[id]);
        ctx.lineTo(c.x, c.y);
        last = id;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      let step = 0;
      let portalArrival = false;
      path.forEach((id, i) => {
        if (portalArrival) portalArrival = false;
        else {
          step++;
          portalArrival = G.nodes[id].t === 'portal' && G.nodes[id].link === path[i + 1];
        }
        const c = this.center(G.nodes[id]);
        ctx.fillStyle = this.glowColor;
        ctx.beginPath();
        ctx.arc(c.x, c.y + 26, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '16px "Lilita One", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(step), c.x, c.y + 27);
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
    const next = nextSteps(here, p.prev);
    // A portal link's arrow points out through its side, toward the ring.
    const toward = (id: number) => {
      const gate = here.portals?.find((q) => q.to === id);
      return gate ? portalPoint(G, here, gate.side, 1) : this.center(G.nodes[id]);
    };
    const c0 = this.center(here);
    const color = PLAYER_COLORS[p.color];
    // Each arrow runs from just past the token toward the next square, three chevrons deep.
    const phase = motion ? (now / 900) % 1 : 0.5;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const id of next) {
      const c1 = toward(id);
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
      if (t.portal) {
        ctx.save();
        ctx.globalAlpha = t.portal.alpha;
        ctx.translate(sx, sy + px * 3);
        ctx.rotate(t.portal.turn);
        ctx.scale(t.portal.sx, t.portal.sy);
        drawCharacterGlow(ctx, p.ch, false, facing, frame, 0, 0, px);
        drawCharacter(ctx, p.ch, false, facing, frame, 0, 0, px);
        ctx.restore();
        continue;
      }
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

  /**
   * The sharpest the board picture may get: 3x, or less for big boards so it stays under 16
   * million pixels (Safari leaves bigger canvases blank, and they use a lot of memory).
   */
  private maxCacheScale() {
    const fit = Math.sqrt(16_000_000 / (this.ww * this.wh));
    return Math.max(0.5, Math.min(3, Math.floor(fit * 4) / 4));
  }

  /**
   * What each square looked like when the board picture was drawn (`squareLook`), so a change
   * re-draws only the squares that look different. Empty: the whole picture must be drawn.
   */
  private looks: string[] = [];

  /**
   * The state changed: re-draw just the squares whose look changed (buying a shop re-draws one
   * tile and its neighbors' edges, not the whole board), or everything when many changed.
   */
  private updateStatic() {
    const G = this.G!;
    this.dirty = false;
    if (!this.looks.length || this.cacheScale <= 0) return this.renderStatic(this.cacheScale || 1);
    const changed: number[] = [];
    for (const sq of G.nodes) if (squareLook(G, sq) !== this.looks[sq.id]) changed.push(sq.id);
    if (!changed.length) return;
    if (changed.length > Math.max(8, G.nodes.length / 3)) return this.renderStatic(this.cacheScale);
    for (const id of changed) this.looks[id] = squareLook(G, G.nodes[id]);
    repaintSquares(this.cache, this.cacheScale, G, changed);
  }

  private renderStatic(scale: number) {
    const G = this.G!;
    this.dirty = false;
    this.cacheScale = scale;
    this.looks = G.nodes.map((sq) => squareLook(G, sq));
    const cv = this.cache;
    cv.width = Math.round(this.ww * scale);
    cv.height = Math.round(this.wh * scale);
    const ctx = cv.getContext('2d')!;
    // Saved and restored so the context is back at its defaults for `repaintSquares`.
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // Portals spin, so they're drawn every frame instead (drawPortals).
    paintBoard(ctx, G, false, true, false);
    ctx.restore();
    this.portalSpots = portalGates(G);
  }
}

/**
 * The recolored images a player's purchases first need (`drawSquare`): owned tiles at both tint
 * strengths, the flag and every shop design, for each player's color. Colors are written the way
 * a canvas writes them back (`String(ctx.fillStyle)`), as `drawSquare` asks for them.
 */
function tintJobs(G: GameState): [PropKey, string][] {
  const L = G.layout === 'hex' ? 'hex' : 'square';
  const ctx = document.createElement('canvas').getContext('2d')!;
  const css = (c: string) => {
    ctx.fillStyle = c;
    return String(ctx.fillStyle);
  };
  const jobs: [PropKey, string][] = [];
  for (const p of G.players) {
    const color = PLAYER_COLORS[p.color];
    jobs.push([`${L}-tile`, css(tint(color, 0.62))], [`${L}-tile`, css(tint(color, 0.22))], ['flag', color]);
    for (const tier of [0, 1, 2, 3, 4] as const) jobs.push([`shop${tier}`, color]);
  }
  return jobs.reverse();
}

/**
 * How far a square's drawing reaches from its center, in world units: the tile, its shadow, the
 * owner's flag and the art all stay inside this box.
 */
const SQUARE_REACH = 90;

/**
 * Everything that decides how a square is drawn on the static board, as one string: if it is the
 * same as last time, the square looks the same (fees depend on the whole district, so they are
 * included as worked out, as are the owner's color and initial).
 */
function squareLook(G: GameState, sq: Square): string {
  const owner = sq.owner >= 0 ? G.players[sq.owner] : null;
  const fee = !owner || sq.t === 'bank' ? '' : sq.b === 'motel' ? motelFee(G, sq) : squareFee(G, sq);
  const district = sq.d >= 0 ? G.districts[sq.d]?.color : '';
  const extra = sq.t === 'change' ? G.changeSuit : sq.t === 'broker' ? G.rules : '';
  return JSON.stringify([sq, owner?.color, owner?.name[0], fee, district, extra]);
}

/**
 * Re-draw some squares on a board picture drawn by `paintBoard(ctx, G, false, true, false)` at
 * `scale`: each one's box is cleared (on whole device pixels, so no seam shows) and everything
 * reaching into it is painted again, in the same order as the full picture.
 */
function repaintSquares(cv: HTMLCanvasElement, scale: number, G: GameState, ids: number[]) {
  const ctx = cv.getContext('2d')!;
  const boxes = ids.map((id) => {
    const c = squareCenter(G.nodes[id], G.layout);
    const x0 = Math.max(0, Math.floor((c.x - SQUARE_REACH) * scale));
    const y0 = Math.max(0, Math.floor((c.y - SQUARE_REACH) * scale));
    const x1 = Math.min(cv.width, Math.ceil((c.x + SQUARE_REACH) * scale));
    const y1 = Math.min(cv.height, Math.ceil((c.y + SQUARE_REACH) * scale));
    return { x0, y0, x1, y1 };
  });
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const clip = new Path2D();
  for (const b of boxes) {
    ctx.clearRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    clip.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  }
  ctx.clip(clip);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawScenery(ctx, G, true);
  for (const sq of G.nodes) {
    const c = squareCenter(sq, G.layout);
    const near = boxes.some(
      (b) =>
        (c.x + SQUARE_REACH) * scale > b.x0 &&
        (c.x - SQUARE_REACH) * scale < b.x1 &&
        (c.y + SQUARE_REACH) * scale > b.y0 &&
        (c.y - SQUARE_REACH) * scale < b.y1,
    );
    if (near) drawSquareClean(ctx, G, sq);
  }
  ctx.restore();
}

/**
 * Draw a square with the context's settings put back afterwards, so no square depends on what the
 * one before it left behind (a partial re-draw starts from a different square than a full one).
 */
function drawSquareClean(ctx: CanvasRenderingContext2D, G: GameState, sq: Square) {
  ctx.save();
  drawSquare(ctx, G, sq);
  ctx.restore();
}

/** Draw scenery, roads and tiles. Live views paint grass separately beneath this transparent layer. */
export function paintBoard(
  ctx: CanvasRenderingContext2D,
  G: GameState,
  background = true,
  decorations = true,
  portals = true,
) {
  if (background) paintGrass(ctx, decorations ? G : undefined);
  drawScenery(ctx, G, decorations);
  for (const sq of G.nodes) drawSquareClean(ctx, G, sq);
  // Still pictures draw portals here; live views spin them each frame with drawPortals.
  if (portals) drawPortals(ctx, G, 0);
}

/** How long a portal's lines take to turn once, in ms. */
const PORTAL_SPIN_MS = 4200;

/**
 * Every portal: a ring beside each tile side with a portal link, colored by the portals it joins.
 * `now` turns the lines (0 draws them still); `gates` can pass `portalGates(G)` worked out once.
 */
export function drawPortals(
  ctx: CanvasRenderingContext2D,
  G: GameState,
  now: number,
  gates: ReturnType<typeof portalGates> = portalGates(G),
) {
  const turn = (now / PORTAL_SPIN_MS) * Math.PI * 2;
  for (const gate of gates)
    drawPortalRing(ctx, portalPoint(G, G.nodes[gate.node], gate.side), gate.color, turn);
}

/** Ring colors for portal links, one per pair in board order. */
export const PORTAL_LINK_COLORS = ['#8b5cf6', '#06b6d4', '#ec4899', '#f59e0b', '#22c55e', '#3b82f6'];

/** How far out from its tile's center a portal ring sits, as a share of a cell step. */
const PORTAL_OUT = 0.72;

/** Where a portal link's ring sits beside a tile: out from its `side`. */
export function portalPoint(
  G: { layout?: BoardLayout },
  sq: { x: number; y: number },
  side: number,
  k = PORTAL_OUT,
) {
  const c = squareCenter(sq, G.layout);
  const v = sideVector(G.layout, sq.x, sq.y, side);
  return { x: c.x + v.x * k, y: c.y + v.y * k };
}

/**
 * Every portal once (a tile side with portal links): what it lets players do, the tiles it
 * leads to, and its color, shared by every portal it joins (an exit and all its entrances).
 */
/** A portal on the board (see portalGates). */
export type PortalGate = ReturnType<typeof portalGates>[number];

export function portalGates(G: GameState) {
  type Gate = { node: number; side: number; way: PortalWay; to: number[]; group: string };
  const gates = new Map<string, Gate>();
  const keyOf = (node: number, side: number) => `${node}:${side}`;
  for (const sq of G.nodes)
    for (const p of sq.portals ?? []) {
      const key = keyOf(sq.id, p.side);
      const gate = gates.get(key) ?? { node: sq.id, side: p.side, way: p.way ?? 'both', to: [], group: key };
      gate.to.push(p.to);
      gates.set(key, gate);
    }
  // Join each portal with the ones it links to, so a whole group shares one color.
  const root = (key: string): string => {
    const g = gates.get(key)!;
    return g.group === key ? key : (g.group = root(g.group));
  };
  for (const gate of gates.values())
    for (const to of gate.to) {
      const link = G.nodes[gate.node].portals?.find((p) => p.side === gate.side && p.to === to);
      const back = link && portalPartner(G, gate.node, link);
      if (!back || !gates.has(keyOf(to, back.side))) continue;
      const [x, y] = [root(keyOf(gate.node, gate.side)), root(keyOf(to, back.side))];
      if (x !== y) gates.get(y)!.group = x;
    }
  const colors = new Map<string, string>();
  return [...gates.values()].map((g) => {
    const group = root(keyOf(g.node, g.side));
    if (!colors.has(group)) colors.set(group, PORTAL_LINK_COLORS[colors.size % PORTAL_LINK_COLORS.length]);
    return { node: g.node, side: g.side, way: g.way, to: g.to, color: colors.get(group)! };
  });
}

/** True when `a` and `b` are joined by a portal link rather than a road. */
export const isPortalLink = (G: GameState, a: number, b: number) =>
  !!G.nodes[a]?.portals?.some((p) => p.to === b);

/** A fixed jeweled frame with a breathing, counter-rotating vortex; turn=0 is motionless. */
export function drawPortalRing(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  color: string,
  turn = 0,
) {
  if (propCanvas('portal-vortex', color)) {
    ctx.save();
    ctx.translate(at.x, at.y);
    const pulse = 1 + Math.sin(turn * 2) * 0.055;
    const core = ctx.createRadialGradient(-2, -3, 1, 0, 0, 16);
    core.addColorStop(0, tint(color, 0.18));
    core.addColorStop(0.55, darken(color, 0.28));
    core.addColorStop(1, darken(color, 0.72));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.rotate(turn);
    drawStamp(ctx, 'portal-vortex', color, 0, 0, 33 * pulse, 33 * pulse);
    ctx.rotate(-turn * 2.3);
    drawStamp(ctx, 'portal-vortex-inner', color, 0, 0, 19 / pulse, 19 / pulse);
    ctx.restore();
    drawStamp(ctx, 'portal-side', color, 0, 0, 48, 48);
    // Lights orbit over the fixed frame; its outline stays aligned with the approach road.
    for (let i = 0; i < 3; i++) {
      const angle = turn * 1.5 + (i * Math.PI * 2) / 3;
      ctx.fillStyle = '#fff9df';
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * 19.5, Math.sin(angle) * 19.5, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  if (propCanvas('portal-side', color)) {
    ctx.save();
    ctx.translate(at.x, at.y);
    drawStamp(ctx, 'portal-side', color, 0, 0, 48, 48);
    ctx.rotate(turn);
    drawStamp(ctx, 'portal-swirl', '#ffffff', 0, 0, 48, 48);
    ctx.rotate(-turn * 2.3);
    drawStamp(ctx, 'portal-swirl-inner', '#ffffff', 0, 0, 48, 48);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.beginPath();
  ctx.arc(0, 0, 21, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fillStyle = '#16213f';
  ctx.fill();
  ctx.lineCap = 'round';
  for (const [r, width, spin] of [
    [8.4, 2.8, turn],
    [4.2, 2, -turn * 1.3],
  ] as const) {
    ctx.lineWidth = width;
    for (const start of [0, Math.PI]) {
      ctx.beginPath();
      ctx.arc(0, 0, r, start + spin, start + spin + Math.PI * 0.75);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * A round navy badge halfway between two tile centers with a gold chevron pointing from `a` to
 * `b`: the sign for a one-way road (also used by the board builder's Links tool).
 */
export function drawRoadArrow(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  fill = '#16213f',
  ink = '#ffd166',
) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.save();
  ctx.translate(mx, my);
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-5, -8);
  ctx.lineTo(4, 0);
  ctx.lineTo(-5, 8);
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.restore();
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
  if (drawStamp(ctx, 'tree', '#808080', x, y, 60 * s, 68 * s)) return;
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
  if (drawStamp(ctx, 'flowers', '#808080', x + w / 2, y + h / 2, w, h * 1.6)) return;
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
  // Cells a portal opens onto stay clear, so nothing grows over the portal.
  const portalCells = new Set(
    G.nodes.flatMap((n) =>
      (n.portals ?? []).map((p) => {
        const [x, y] = neighborCells(G.layout, n.x, n.y)[p.side] ?? [n.x, n.y];
        return `${x},${y}`;
      }),
    ),
  );
  const pondRate = PAINTED_LANDSCAPE ? 0.012 : 0.05;
  const bedRate = PAINTED_LANDSCAPE ? 0.035 : 0.13;
  const treeRate = PAINTED_LANDSCAPE ? 0.16 : 0.5;
  const r = seeded(97 + (G.cols ?? 12) * 31 + (G.rows ?? 7) * 17 + G.nodes.length);
  for (let y = 0; y < (G.rows ?? 7); y++) {
    for (let x = 0; x < (G.cols ?? 12); x++) {
      if (used.has(`${x},${y}`)) continue;
      const { x: cx, y: cy } = cellCenter(G.layout, x, y);
      const roll = r();
      if (portalCells.has(`${x},${y}`)) {
        // Draw nothing, but use the same random numbers so the rest of the scenery stays put.
        if (roll >= bedRate && roll < treeRate) for (let k = 0; k < 3; k++) r();
        continue;
      }
      if (roll < pondRate) {
        if (
          drawStamp(ctx, 'pond', '#808080', cx, cy, PAINTED_LANDSCAPE ? 68 : 80, PAINTED_LANDSCAPE ? 46 : 54)
        )
          continue;
        ctx.fillStyle = '#5aa0d8';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 38, 24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7dc0ee';
        ctx.beginPath();
        ctx.ellipse(cx - 3, cy - 3, 30, 17, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (roll < bedRate)
        drawBed(
          ctx,
          cx - (PAINTED_LANDSCAPE ? 28 : 40),
          cy - 14,
          PAINTED_LANDSCAPE ? 56 : 80,
          PAINTED_LANDSCAPE ? 22 : 28,
        );
      else if (roll < treeRate) drawTree(ctx, cx - 14 + r() * 28, cy - 8 + r() * 16, 0.75 + r() * 0.35);
    }
  }
}

export const GRASS = '#92d268';
/** The solid ground's color. */
const SOLID_GRASS = '#97c26a';
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

const grassPatterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

/** The world rectangle a context's transform shows, with a small overscan for edge pixels. */
function visibleWorld(ctx: CanvasRenderingContext2D) {
  // The inverse camera transform gives the visible world, even when it lies beyond the board.
  // A small overscan covers edge pixels at fractional zoom and on high-density screens.
  const inverse = ctx.getTransform().inverse();
  const corners = [
    inverse.transformPoint({ x: 0, y: 0 }),
    inverse.transformPoint({ x: ctx.canvas.width, y: 0 }),
    inverse.transformPoint({ x: 0, y: ctx.canvas.height }),
    inverse.transformPoint({ x: ctx.canvas.width, y: ctx.canvas.height }),
  ];
  return {
    left: Math.floor(Math.min(...corners.map((p) => p.x))) - 1,
    top: Math.floor(Math.min(...corners.map((p) => p.y))) - 1,
    right: Math.ceil(Math.max(...corners.map((p) => p.x))) + 1,
    bottom: Math.ceil(Math.max(...corners.map((p) => p.y))) + 1,
  };
}

/** World-aligned grass; games may also add scenery beyond the board, builders omit `G`. */
export function paintGrass(ctx: CanvasRenderingContext2D, G?: GameState) {
  const { left, top, right, bottom } = visibleWorld(ctx);
  ctx.save();
  paintGrassArea(ctx, G, left, top, right, bottom, true);
  ctx.restore();
}

/**
 * The solid ground (`GROUND_SET = 'solid'`): one fill of plain grass. The textured meadow and
 * terrain looked richer but made every frame and every zoom far slower.
 */
function paintSolidGrass(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  right: number,
  bottom: number,
) {
  ctx.fillStyle = SOLID_GRASS;
  ctx.fillRect(left, top, right - left, bottom - top);
}

/** Builder views have no game state: their ground (plain meadow) is cached under this key. */
const NO_BOARD = {};

/**
 * Live views (the game, the builder): the same picture as `paintGrass`, drawn from ground chunks
 * cached by `ground.ts`, so each frame paints one layer. Only the terrain set's decorations are
 * drawn live on top, at full sharpness.
 */
export function paintLiveGrass(ctx: CanvasRenderingContext2D, G?: GameState) {
  const { left, top, right, bottom } = visibleWorld(ctx);
  if (GROUND_SET === 'solid') return paintSolidGrass(ctx, left, top, right, bottom);
  ctx.save();
  paintGround(ctx, G ?? NO_BOARD, groundPainter(G), left, top, right, bottom);
  if (TOWN_LANDSCAPE && G) paintTownFeatures(ctx, G, left, top, right, bottom);
  ctx.restore();
}

/** Ground chunks are built for idle time too (see `BoardView.warm`). */
function groundPainter(G?: GameState): GroundPainter {
  // Scenery other than the terrain set draws stamps that may cross a chunk's edge: look a little
  // beyond the chunk for them (the canvas clips what falls outside).
  const m = G && PAINTED_LANDSCAPE && !TOWN_LANDSCAPE ? 160 : 0;
  return (ctx, left, top, right, bottom) =>
    paintGrassArea(ctx, G, left - m, top - m, right + m, bottom + m, false);
}

function paintGrassArea(
  ctx: CanvasRenderingContext2D,
  G: GameState | undefined,
  left: number,
  top: number,
  right: number,
  bottom: number,
  features: boolean,
) {
  if (GROUND_SET === 'solid') return paintSolidGrass(ctx, left, top, right, bottom);
  const meadow = propCanvas('meadow', '#808080');
  if (PAINTED_LANDSCAPE && meadow) paintMeadow(ctx, meadow, left, top, right, bottom, PARK_LANDSCAPE);
  else {
    let pattern = grassPatterns.get(ctx);
    if (!pattern) {
      pattern = ctx.createPattern(propCanvas('grass', '#808080') ?? grassTile(), 'repeat') ?? undefined;
      if (pattern) grassPatterns.set(ctx, pattern);
    }
    ctx.fillStyle = pattern ?? GRASS;
    ctx.fillRect(left, top, right - left, bottom - top);
  }
  if (PAINTED_LANDSCAPE && G) {
    if (PUZZLE_LANDSCAPE) {
      paintParkScenes(ctx, G, left, top, right, bottom);
    } else if (TOWN_LANDSCAPE) {
      // Live ground chunks keep the finished picture, so the terrain's own cache would be a copy.
      paintTownTerrain(ctx, G, left, top, right, bottom, { cache: features, features });
    } else {
      if (PARK_LANDSCAPE) paintParkStream(ctx, G, top, right);
      const scenery = PARK_LANDSCAPE ? parkSceneryBeyondBoard : sceneryBeyondBoard;
      for (const p of scenery(G, left, top, right, bottom)) {
        if (PARK_LANDSCAPE) paintParkScenery(ctx, p);
        else drawStamp(ctx, p.key, '#808080', p.x, p.y, p.size, p.size);
      }
    }
  }
}

/** Road colors: the border, the paving and the arrow painted on one-way roads. */
const ROAD = { edge: '#c9b07a', fill: '#efe0b6', arrow: '#a07b3f' };

/**
 * Every road piece: between neighboring tiles, and from a tile out to each of its portals.
 * `dir` is 1 when players may only go from -> to, -1 for only to -> from, 0 for both ways;
 * `at` is where along the piece a one-way arrow goes (the middle of the part that shows).
 */
function roadPieces(G: GameState) {
  type Piece = {
    from: { x: number; y: number };
    to: { x: number; y: number };
    dir: number;
    at: number;
    portal?: boolean;
  };
  const pieces: Piece[] = [];
  const blocked = (a: number, b: number) => !!G.nodes[a]?.noGo?.includes(b);
  for (const sq of G.nodes) {
    const a = squareCenter(sq, G.layout);
    for (const n of sq.nb) {
      if (n < sq.id || isPortalLink(G, sq.id, n)) continue;
      const dir = blocked(n, sq.id) ? 1 : blocked(sq.id, n) ? -1 : 0;
      pieces.push({ from: a, to: squareCenter(G.nodes[n], G.layout), dir, at: 0.5 });
    }
    // A portal's short road: from the tile's edge to the ring's edge it shows, about 2/3 out.
    const seen = new Set<number>();
    for (const p of sq.portals ?? []) {
      if (seen.has(p.side)) continue;
      seen.add(p.side);
      const dir = p.way === 'in' ? 1 : p.way === 'out' ? -1 : 0;
      pieces.push({ from: a, to: portalPoint(G, sq, p.side), dir, at: 0.68, portal: true });
    }
  }
  return pieces;
}

/**
 * Roads: sandy, with an edge. A one-way road is the same road with a darker arrow painted on it
 * (in the gap between the tiles, where the road shows), pointing the way players may go.
 */
function drawRoads(ctx: CanvasRenderingContext2D, G: GameState) {
  const pieces = roadPieces(G);
  ctx.save();
  ctx.lineCap = 'round';
  const image = propCanvas('road', '#808080');
  if (image)
    for (const p of pieces) {
      ctx.save();
      ctx.translate(p.from.x, p.from.y);
      ctx.rotate(Math.atan2(p.to.y - p.from.y, p.to.x - p.from.x));
      ctx.drawImage(image, 0, -22, Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y), 44);
      ctx.restore();
    }
  else {
    for (const [w, color] of [
      [44, ROAD.edge],
      [36, ROAD.fill],
    ] as const)
      for (const p of pieces) {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(p.from.x, p.from.y);
        ctx.lineTo(p.to.x, p.to.y);
        ctx.stroke();
      }
  }
  ctx.fillStyle = ROAD.arrow;
  for (const p of pieces) {
    if (!p.dir) continue;
    const x = p.from.x + (p.to.x - p.from.x) * p.at;
    const y = p.from.y + (p.to.y - p.from.y) * p.at;
    const angle = Math.atan2(p.to.y - p.from.y, p.to.x - p.from.x) + (p.dir < 0 ? Math.PI : 0);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-6, -12);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawScenery(ctx: CanvasRenderingContext2D, G: GameState, decorations: boolean) {
  if ((PARK_LANDSCAPE || TOWN_LANDSCAPE) && decorations) drawParkGround(ctx, G);
  drawRoads(ctx, G);

  // Keep roads visible while the builder hides purely decorative scenery.
  if (!decorations) return;
  if (TOWN_LANDSCAPE) return;

  if (!isTown(G)) {
    if (PAINTED_LANDSCAPE) drawPaintedDecor(ctx, G);
    else drawCustomDecor(ctx, G);
    return;
  }

  if (propCanvas('pond', '#808080') && propCanvas('fountain', '#808080')) {
    drawStamp(ctx, 'pond', '#808080', 350, 250, 300, 150);
    drawStamp(ctx, 'fountain', '#808080', 650, 550, 120, 110);
  } else {
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
  }
  if (PAINTED_LANDSCAPE) {
    drawPaintedDecor(ctx, G);
    return;
  }
  // Flower beds
  const bed = (x: number, y: number, w: number, h: number) => drawBed(ctx, x, y, w, h);
  bed(560, 180, 150, 34);
  if (!PAINTED_LANDSCAPE) {
    bed(560, 280, 150, 34);
    bed(800, 600, 140, 30);
  }
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
  ].filter((_, i) => !PAINTED_LANDSCAPE || i % 3 !== 0))
    tree(x, y, s);
}

function drawPaintedDecor(ctx: CanvasRenderingContext2D, G: GameState) {
  for (const p of sceneryForBoard(G, PARK_LANDSCAPE)) {
    if (PARK_LANDSCAPE) paintParkScenery(ctx, p);
    else drawStamp(ctx, p.key, '#808080', p.x, p.y, p.size, p.size);
  }
}

/** Warm ground verges follow actual roads, connecting the tile board to its surroundings. */
function drawParkGround(ctx: CanvasRenderingContext2D, G: GameState) {
  const pieces = roadPieces(G);
  ctx.save();
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const [width, color] of [
    [126, 'rgba(123,107,68,.07)'],
    [118, 'rgba(150,131,88,.16)'],
    [110, '#bdb58f'],
    [102, '#cfc5a3'],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const p of pieces) {
      if (p.portal) continue;
      ctx.moveTo(p.from.x, p.from.y);
      ctx.lineTo(p.to.x, p.to.y);
    }
    ctx.stroke();
    // A round road cap leaves square corners (and hex points) without a ground margin.
    // Extend the actual tile footprint instead, keeping the same verge around every edge.
    ctx.fillStyle = color;
    for (const sq of G.nodes) {
      const p = squareCenter(sq, G.layout);
      tileShape(ctx, G.layout, p.x, p.y, width / 2, 12 + (width - 86) / 2);
      ctx.fill();
    }
  }
  const bank = G.nodes.find((n) => n.t === 'bank');
  if (bank) {
    const p = squareCenter(bank, G.layout);
    const plaza = ctx.createRadialGradient(p.x, p.y, 42, p.x, p.y, 88);
    plaza.addColorStop(0, 'rgba(218,207,168,.8)');
    plaza.addColorStop(1, 'rgba(218,207,168,0)');
    ctx.fillStyle = plaza;
    ctx.fillRect(p.x - 88, p.y - 88, 176, 176);
  }
  ctx.restore();
}

const SPECIAL_LABEL: Record<string, string> = {
  bank: 'BANK',
  venture: 'VENTURE',
  change: 'CHANGE',
  roll: 'ROLL ON',
  break: 'BREAK',
  broker: 'STOCKS',
  portal: 'PORTAL',
  arcade: 'ARCADE',
  cannon: 'CANNON',
  hike: 'PRICE UP',
  taxi: 'TAXI',
  swap: 'SWAP',
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
  // Bottom-aligned on the same line as shops (y + 23), with the owner's badge in the same spot.
  if (drawProp(ctx, key, main, x, y + 0, 64, 46)) {
    if (initial) badge(ctx, x + 22, y + 14, main, initial);
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
    case 'motel':
      ctx.fillStyle = '#e9ecf1';
      ctx.fillRect(x - 22, y - 10, 44, 26);
      ctx.fillStyle = main;
      for (let i = -16; i <= 12; i += 10) {
        ctx.fillRect(x + i, y - 6, 5, 8);
        ctx.fillRect(x + i, y + 5, 5, 9);
      }
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
  const key = sq.t === 'broker' && G.rules === 'easy' ? 'venture' : sq.t;
  const col =
    sq.t === 'portal' || sq.t === 'warp'
      ? sq.channel == null && !sq.toBank && (sq.link ?? -1) >= 0
        ? warpColor(G, sq)
        : transportColor(sq)
      : '#9aa3b8';
  if (sq.t === 'change' && drawStamp(ctx, 'change-ring', col, x, y, 56, 56)) {
    drawStamp(ctx, SUITS[G.changeSuit] as PropKey, col, x, y, 30, 30);
    return;
  }
  if (sq.t !== 'bank' && drawProp(ctx, key as PropKey, col, x, y, 58, 56)) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  switch (sq.t) {
    case 'bank':
      // The painted bank (it has no player color); the gold coin until the images load.
      if (drawProp(ctx, 'bank', '#9aa3b8', x, y - 3, 72, 50)) break;
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
    case 'hike':
      // A price tag with an up arrow.
      ctx.fillStyle = '#ffd166';
      ctx.strokeStyle = '#7a4f00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 18, y - 12);
      ctx.lineTo(x + 8, y - 12);
      ctx.lineTo(x + 20, y);
      ctx.lineTo(x + 8, y + 12);
      ctx.lineTo(x - 18, y + 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#7a4f00';
      ctx.beginPath();
      ctx.arc(x + 8, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2f9e44';
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 9);
      ctx.lineTo(x - 1, y);
      ctx.lineTo(x - 5, y);
      ctx.lineTo(x - 5, y + 8);
      ctx.lineTo(x - 11, y + 8);
      ctx.lineTo(x - 11, y);
      ctx.lineTo(x - 15, y);
      ctx.closePath();
      ctx.fill();
      break;
    case 'taxi':
      // A yellow cab with a roof sign.
      ctx.fillStyle = '#ffc531';
      ctx.strokeStyle = '#26314f';
      ctx.lineWidth = 3;
      roundRect(ctx, x - 22, y - 2, 44, 14, 5);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 13, y - 2);
      ctx.lineTo(x - 8, y - 12);
      ctx.lineTo(x + 8, y - 12);
      ctx.lineTo(x + 13, y - 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#9fd3ff';
      ctx.fillRect(x - 7, y - 9, 6, 6);
      ctx.fillRect(x + 1, y - 9, 6, 6);
      ctx.fillStyle = '#26314f';
      roundRect(ctx, x - 5, y - 19, 10, 6, 2);
      ctx.fill();
      for (const wx of [-12, 12]) {
        ctx.beginPath();
        ctx.arc(x + wx, y + 13, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'swap': {
      // Two arrows chasing each other.
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      for (const [col, a0] of [
        ['#4dabf7', Math.PI * 1.1],
        ['#ff6b6b', Math.PI * 0.1],
      ] as [string, number][]) {
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, 15, a0, a0 + Math.PI * 0.75);
        ctx.stroke();
        const a1 = a0 + Math.PI * 0.75;
        const tx = x + Math.cos(a1) * 15;
        const ty = y + Math.sin(a1) * 15;
        const dir = a1 + Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(tx + Math.cos(dir) * 9, ty + Math.sin(dir) * 9);
        ctx.lineTo(tx + Math.cos(dir + 2.3) * 8, ty + Math.sin(dir + 2.3) * 8);
        ctx.lineTo(tx + Math.cos(dir - 2.3) * 8, ty + Math.sin(dir - 2.3) * 8);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'portal':
    case 'warp': {
      // A pair shares its color, bank links are gold, unlinked tiles grey (games saved before
      // pairs had colors work theirs out from the links).
      const col =
        sq.channel == null && !sq.toBank && (sq.link ?? -1) >= 0 ? warpColor(G, sq) : transportColor(sq);
      const g = ctx.createRadialGradient(x, y, 2, x, y, 24);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, col);
      g.addColorStop(1, darken(col, 0.55));
      ctx.fillStyle = g;
      ctx.beginPath();
      if (sq.t === 'warp') {
        for (let k = 0; k < 8; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 4;
          const r = k % 2 === 0 ? 26 : 8;
          if (k === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath();
      } else ctx.arc(x, y, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2.5;
      for (let k = 0; k < (sq.t === 'portal' ? 3 : 0); k++) {
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

/** Draw one tile using the same art as the game board (also used by the builder palette). */
/**
 * A lit square, as choices are shown in a game: a tint of `color`, a pulsing white outline
 * glowing in `color`, and (when `strong`) white rings that keep spreading out and fading.
 * `seed` staggers the rings between neighboring squares. The board editor uses it too.
 */
export function drawTileGlow(
  ctx: CanvasRenderingContext2D,
  layout: BoardLayout | undefined,
  c: { x: number; y: number },
  color: string,
  now: number,
  strong: boolean,
  seed = 0,
) {
  const pulse = 0.55 + 0.45 * Math.sin(now / 220);
  ctx.save();
  // A tint over the tile, then a pulsing outline.
  ctx.globalAlpha = 0.18 + 0.12 * pulse;
  ctx.fillStyle = color;
  tileShape(ctx, layout, c.x, c.y, TILE / 2, 14);
  ctx.fill();
  // A white outline that pulses, glowing in the color.
  ctx.globalAlpha = strong ? 0.75 + 0.25 * pulse : 0.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10 + 20 * pulse;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = strong ? 6 + 2 * pulse : 4;
  if (!drawStamp(ctx, `${layout === 'hex' ? 'hex' : 'square'}-selection`, '#ffffff', c.x, c.y, 110, 128)) {
    tileShape(ctx, layout, c.x, c.y, TILE / 2 + 4, 14);
    ctx.stroke();
  }
  // White rings that keep spreading out and fading, to catch the eye.
  if (strong && !reducedMotion()) {
    ctx.shadowBlur = 0;
    for (let i = 0; i < 2; i++) {
      const k = (now / RING_MS + i / 2 + seed * 0.07) % 1;
      ctx.globalAlpha = 0.95 * (1 - k) * (1 - k);
      ctx.lineWidth = 5 * (1 - k) + 1.5;
      tileShape(ctx, layout, c.x, c.y, TILE / 2 + 6 + k * 26, 14 + k * 8);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** One ring growing and fading from a square (`k` 0 → 1), with gold sparkles if asked. */
export function drawRingBurst(
  ctx: CanvasRenderingContext2D,
  layout: BoardLayout | undefined,
  c: { x: number; y: number },
  color: string,
  k: number,
  sparkles = false,
) {
  ctx.save();
  ctx.globalAlpha = 1 - k;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6 * (1 - k) + 1;
  tileShape(ctx, layout, c.x, c.y, TILE / 2 + 4 + k * 26, 14);
  ctx.stroke();
  if (sparkles) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = 30 + k * 50;
      drawSparkle(ctx, c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 8 * (1 - k * 0.5), '#ffe066');
    }
  }
  ctx.restore();
}

export function paintSquare(ctx: CanvasRenderingContext2D, G: GameState, sq: Square) {
  drawSquare(ctx, G, sq);
}

/** How big a hex tile's picture is drawn next to a square tile's (see `art` in drawSquare). */
const HEX_ART = 0.9;

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
  // Every tile uses the same two spots, so the board reads evenly: pictures stand on one base
  // line (property art is bottom-aligned there; symbols are centered just above it), and the
  // price, fee or name sits on one text line under it.
  // Both keep at least 5px clear of the border's inner edge (37.5 from the center).
  const artY = iy - 8;
  const iconY = iy - 7;
  const textY = ty + 27;
  /** The fee (owned) or price as plain text; dark on an owner's color so it stays readable. */
  const amount = (text: string) => label(ctx, c.x, textY, text, owner ? '#1b2340' : '#26314f', 15);
  /**
   * Draw a tile's picture. A hex narrows toward its top point, so its pictures are drawn a little
   * smaller (around the shared base line) to keep them clear of the slanted border.
   */
  const art = (draw: () => unknown) => {
    if (L !== 'hex') return void draw();
    const base = artY + 23;
    ctx.save();
    ctx.translate(c.x, base);
    ctx.scale(HEX_ART, HEX_ART);
    ctx.translate(-c.x, -base);
    draw();
    ctx.restore();
  };

  // Shadow + tile
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  if (!drawStamp(ctx, `${L === 'hex' ? 'hex' : 'square'}-shadow`, '#808080', c.x + 2, c.y + 5, 100, 116)) {
    tileShape(ctx, L, c.x + 2, c.y + 5, TILE / 2, 12);
    ctx.fill();
  }
  // An owned tile is filled with its owner's color, so who owns what reads at a glance.
  ctx.fillStyle = owner ? tint(ownerColor, district ? 0.62 : 0.22) : sq.t === 'bank' ? '#fff6d6' : '#fdfbf5';
  if (!drawStamp(ctx, `${L === 'hex' ? 'hex' : 'square'}-tile`, String(ctx.fillStyle), c.x, c.y, 100, 116)) {
    tileShape(ctx, L, c.x, c.y, TILE / 2, 12);
    ctx.fill();
  }

  if (sq.t === 'shop') {
    // The design grows with the shop's value; owned shops use the owner's color, unowned ones
    // stay plain grey so they never look like a player's.
    const tier = tierFor(sq.value, SHOP_TIERS);
    art(() => drawShop(ctx, c.x, artY, tier, owner ? ownerColor : '#8a94a8', owner?.name[0]?.toUpperCase()));
    amount(owner ? `${squareFee(G, sq)}G` : `${sq.value}G`);
  } else if (sq.t === 'plot') {
    if (!sq.b) {
      let drawn = false;
      art(() => (drawn = drawProp(ctx, 'vacant', '#808080', c.x, artY, 60, 48)));
      if (drawn) {
        label(ctx, c.x, textY, 'VACANT', '#4a5470', 10);
      } else {
        ctx.save();
        ctx.setLineDash([7, 5]);
        ctx.strokeStyle = '#6b7590';
        ctx.lineWidth = 2.5;
        // Well inside the district border (whose inner edge is 5.5 in from the tile's edge), so no
        // dash ever shows along or under it.
        tileShape(ctx, L, c.x, c.y, TILE / 2 - 10, 7);
        ctx.stroke();
        ctx.restore();
        label(ctx, c.x, ty + 4 + (L === 'hex' ? 11 : 0), 'VACANT', '#4a5470', 14);
      }
    } else if (sq.b === 'star3') {
      // The 3-Star Shop has its own designs that grow with its value.
      const tier = tierFor(sq.value, STAR3_TIERS);
      art(() =>
        drawStar3(ctx, c.x, artY, tier, owner ? ownerColor : '#8a94a8', owner?.name[0]?.toUpperCase()),
      );
      if (owner) amount(`${squareFee(G, sq)}G`);
    } else {
      const b = sq.b;
      art(() =>
        buildingIcon(
          ctx,
          b,
          c.x,
          artY,
          owner ? ownerColor : '#8a94a8',
          owner?.name[0]?.toUpperCase() ?? '',
          sq.lv,
        ),
      );
      const fee =
        sq.b === 'tax'
          ? '10%'
          : sq.b === 'agency'
            ? 'Break'
            : sq.b === 'motel'
              ? motelFee(G, sq)
              : `${squareFee(G, sq)}G`;
      if (owner) amount(fee);
    }
  } else {
    const t = sq.t === 'broker' && G.rules === 'easy' ? 'VENTURE' : (SPECIAL_LABEL[sq.t] ?? '');
    // Squares without a label (suits, Boon, Boom) center their symbol on the tile.
    art(() => specialIcon(ctx, G, sq, c.x, t ? iconY : c.y));
    if (t) label(ctx, c.x, textY, t, '#4a5470', t.length > 8 ? 9 : 11);
  }

  // Border: the district's solid color on properties, else the owner's ring or a faint outline.
  if (district) {
    // The border's outer edge must cover the tile's fill completely: it reaches half a unit past
    // the fill with the same corner roundness (fill radius 12 = path 9.5 + half the width + 0.5),
    // so neither the fill's corners nor its soft edge show around it.
    ctx.strokeStyle = district.color;
    ctx.lineWidth = 6;
    if (!drawStamp(ctx, `${L === 'hex' ? 'hex' : 'square'}-border`, district.color, c.x, c.y, 100, 116)) {
      tileShape(ctx, L, c.x, c.y, TILE / 2 - 2.5, 9.5);
      ctx.stroke();
    }
  }
  if (owner) {
    if (!district) {
      ctx.strokeStyle = ownerColor;
      ctx.lineWidth = 5;
      tileShape(ctx, L, c.x, c.y, TILE / 2 - 1.5, 11);
      ctx.stroke();
    }
    if (!drawStamp(ctx, 'flag', ownerColor, x + TILE - 3, (L === 'hex' ? top + 12 : y) - 1, 25, 32)) {
      ctx.fillStyle = '#5b6478';
      const py = L === 'hex' ? top + 12 : y;
      ctx.fillRect(x + TILE - 12, py - 14, 3, 24);
      ctx.fillStyle = ownerColor;
      ctx.beginPath();
      ctx.moveTo(x + TILE - 9, py - 14);
      ctx.lineTo(x + TILE + 8, py - 8);
      ctx.lineTo(x + TILE - 9, py - 2);
      ctx.fill();
    }
  } else if (!district) {
    ctx.strokeStyle = 'rgba(38,49,79,0.18)';
    ctx.lineWidth = 2;
    tileShape(ctx, L, c.x, c.y, TILE / 2 - 1, 11);
    ctx.stroke();
  }
}
