/**
 * The PixiJS (WebGL) layer under the board canvas, used when the renderer is `pixi`
 * (`renderer.ts`). It draws the background (grass, terrain, scenery) and the cached board picture
 * on the graphics card; the board's moving parts (tokens, effects, the die) still draw on the 2D
 * canvas laid over it, which is cleared to transparent each frame.
 *
 * The same drawing code feeds both renderers: `begin()` returns a stand-in 2D context that
 * records each `drawImage` and solid `fillRect` (with the transform and alpha at that moment),
 * and `end()` turns the records into a reused pool of PixiJS sprites, then renders. Calls the
 * stand-in doesn't support (paths, text, patterns) are ignored: only the background and the board
 * picture go through it.
 *
 * Graphics memory is limited, above all on phones, and running out makes the browser drop the
 * whole WebGL layer. So: each source canvas becomes GPU textures in pieces of at most `PIECE`
 * pixels; textures are freed when unused for a while or when the total passes `budget`; at most
 * `UPLOADS` new background textures are sent per frame (a missing piece shows the meadow color for
 * a moment instead of stalling a zoom); and if the WebGL layer is lost anyway, `failed` is set and
 * the board goes back to the classic renderer.
 */
import { Application, CanvasSource, Color, Container, Matrix, Sprite, Texture } from 'pixi.js';

/** Frames a texture may go unused before it is freed (about 10 s at 60 fps). */
const KEEP_FRAMES = 600;
/** The largest texture side made: safe on every WebGL device, and quick to send. */
const PIECE = 2048;
/** New background textures sent to the graphics card per frame. */
const UPLOADS = 2;

type Source = CanvasImageSource & { width: number; height: number };
interface Piece {
  tex: Texture;
  /** Where the piece sits in its source, in the source's pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Entry {
  pieces: Piece[];
  bytes: number;
  last: number;
}
interface Item {
  src: Source;
  /** A source rectangle (drawImage with 9 arguments), else the whole source. */
  part?: [number, number, number, number];
  /** Maps the unit square to device pixels. */
  m: DOMMatrix;
  alpha: number;
  tint?: number;
  /** The board picture: always drawn, never held back by the upload limit. */
  must?: boolean;
}

export class PixiBoard {
  private app = new Application();
  /** False until PixiJS has started (it starts asynchronously). */
  ready = false;
  /** Set if PixiJS could not start or its WebGL layer was lost: the board goes back to classic. */
  failed = false;
  private world = new Container();
  private pool: Sprite[] = [];
  private items: Item[] = [];
  private textures = new Map<Source, Entry>();
  /** Parts of sources drawn with a source rectangle, copied into their own canvases. */
  private parts = new Map<Source, Map<string, HTMLCanvasElement>>();
  /** Sources that must never be held back (the board picture). */
  private musts = new WeakSet<Source>();
  private bytes = 0;
  /** The most graphics memory to use on textures (smaller on phones and tablets). */
  private budget = (matchMedia('(pointer: coarse)').matches ? 160 : 384) * 1024 * 1024;
  private frameNo = 0;
  private dpr = 1;

  constructor(host: HTMLElement, before: HTMLElement, w: number, h: number, dpr: number) {
    this.dpr = layerDpr(dpr);
    this.app
      .init({
        width: w,
        height: h,
        resolution: this.dpr,
        autoDensity: true,
        background: '#97b96f',
        antialias: false,
        autoStart: false,
        sharedTicker: false,
        preference: 'webgl',
      })
      .then(() => {
        const cv = this.app.canvas;
        cv.classList.add('board-gl');
        // A lost graphics context (too little memory, a GPU reset): use the classic renderer.
        cv.addEventListener('webglcontextlost', () => {
          console.warn('The WebGL layer was lost; using the classic renderer.');
          this.failed = true;
        });
        host.insertBefore(cv, before);
        this.app.stage.addChild(this.world);
        this.ready = true;
      })
      .catch((err) => {
        console.warn('PixiJS could not start; using the classic renderer.', err);
        this.failed = true;
      });
  }

  resize(w: number, h: number, dpr: number) {
    if (!this.ready) return;
    this.dpr = layerDpr(dpr);
    this.app.renderer.resize(w, h, this.dpr);
  }

  /** Always draw this source, even past the per-frame upload limit (the board picture). */
  keep(source: Source) {
    this.musts.add(source);
  }

  /** A canvas was redrawn in place (the board picture): send it again next time it is drawn. */
  refresh(source: Source) {
    this.musts.add(source);
    const e = this.textures.get(source);
    if (e) this.free(source, e);
  }

  /**
   * Start a frame: returns a stand-in 2D context with the given transform (in the 2D canvas's
   * device pixels), the size of that canvas. Draw the background through it, then call `end()`.
   */
  begin(transform: DOMMatrix, width: number, height: number): CanvasRenderingContext2D {
    this.items.length = 0;
    this.frameNo++;
    return recorder(this.items, transform, width, height);
  }

  /** Turn the frame's records into sprites and draw them. */
  end(canvasDpr: number) {
    if (!this.ready || this.failed) return;
    // Records are in the 2D canvas's device pixels; the stage works in CSS pixels.
    this.world.scale.set(1 / canvasDpr);
    let uploads = UPLOADS;
    let used = 0;
    const m = new Matrix();
    for (const it of this.items) {
      const src = it.part ? this.partCanvas(it.src, it.part) : it.src;
      if (!src) continue;
      let e = this.textures.get(src);
      if (!e) {
        if (uploads <= 0 && !it.must && !this.musts.has(it.src)) continue;
        uploads--;
        e = this.make(src) ?? undefined;
        if (!e) continue;
      }
      e.last = this.frameNo;
      for (const p of e.pieces) {
        const s = this.sprite(used++);
        s.texture = p.tex;
        s.alpha = it.alpha;
        s.tint = it.tint ?? 0xffffff;
        // Unit square -> the piece's place in its source -> texture pixels.
        const k = it.m.scale(1 / src.width, 1 / src.height).translate(p.x, p.y);
        m.set(k.a, k.b, k.c, k.d, k.e, k.f);
        s.setFromMatrix(m);
      }
    }
    for (let i = used; i < this.pool.length; i++) {
      this.pool[i].visible = false;
      this.pool[i].texture = Texture.EMPTY;
    }
    this.trim();
    this.app.renderer.render(this.app.stage);
  }

  destroy() {
    const started = this.ready;
    this.ready = false;
    for (const [src, e] of [...this.textures]) this.free(src, e);
    if (started) this.app.destroy(true, { children: true });
  }

  private sprite(i: number) {
    let s = this.pool[i];
    if (!s) {
      s = new Sprite(Texture.EMPTY);
      this.pool.push(s);
      this.world.addChild(s);
    }
    s.visible = true;
    return s;
  }

  /** Send a source to the graphics card, in pieces of at most PIECE pixels. */
  private make(src: Source): Entry | null {
    const W = src.width;
    const H = src.height;
    if (!W || !H) return null;
    const pieces: Piece[] = [];
    for (let y = 0; y < H; y += PIECE)
      for (let x = 0; x < W; x += PIECE) {
        const w = Math.min(PIECE, W - x);
        const h = Math.min(PIECE, H - y);
        let res: Source = src;
        if (w !== W || h !== H) {
          const cv = document.createElement('canvas');
          cv.width = w;
          cv.height = h;
          cv.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, w, h);
          res = cv;
        }
        const source = new CanvasSource({
          resource: res as HTMLCanvasElement,
          // Mipmaps keep pictures from shimmering when the whole board is in view.
          autoGenerateMipmaps: true,
          scaleMode: 'linear',
        });
        pieces.push({ tex: new Texture({ source }), x, y, w, h });
      }
    const e: Entry = { pieces, bytes: Math.round(W * H * 4 * 1.34), last: this.frameNo };
    this.textures.set(src, e);
    this.bytes += e.bytes;
    return e;
  }

  /** A part of a source as its own canvas (made once). */
  private partCanvas(src: Source, part: [number, number, number, number]): Source | null {
    const [x, y, w, h] = part.map(Math.round);
    if (w <= 0 || h <= 0) return null;
    let byKey = this.parts.get(src);
    if (!byKey) this.parts.set(src, (byKey = new Map()));
    const key = `${x},${y},${w},${h}`;
    let cv = byKey.get(key);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      cv.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, w, h);
      byKey.set(key, cv);
    }
    return cv;
  }

  /**
   * Free textures nothing has drawn for a while, then the least recently drawn ones while over
   * the memory budget (never ones drawn this frame).
   */
  private trim() {
    if (this.frameNo % 60 === 0)
      for (const [src, e] of [...this.textures]) if (this.frameNo - e.last > KEEP_FRAMES) this.free(src, e);
    if (this.bytes <= this.budget) return;
    const old = [...this.textures]
      .filter(([, e]) => e.last < this.frameNo)
      .sort((a, b) => a[1].last - b[1].last);
    for (const [src, e] of old) {
      if (this.bytes <= this.budget) break;
      this.free(src, e);
    }
  }

  private free(src: Source, e: Entry) {
    // No sprite may keep showing a freed texture.
    const gone = new Set(e.pieces.map((p) => p.tex.source));
    for (const s of this.pool) if (gone.has(s.texture.source)) s.texture = Texture.EMPTY;
    for (const p of e.pieces) p.tex.destroy(true);
    this.bytes -= e.bytes;
    this.textures.delete(src);
    this.parts.delete(src);
  }
}

/** The WebGL layer's pixel density: at most 2x (sharper is invisible on the background, and costly). */
function layerDpr(dpr: number) {
  return Math.min(2, dpr);
}

/**
 * A stand-in 2D context that records drawImage and solid fillRect calls. Other calls do nothing,
 * and other properties simply hold what is set on them.
 */
function recorder(items: Item[], start: DOMMatrix, width: number, height: number): CanvasRenderingContext2D {
  let m = DOMMatrix.fromMatrix(start);
  let alpha = 1;
  let fill: unknown = '#000';
  const stack: { m: DOMMatrix; alpha: number; fill: unknown }[] = [];
  /** A 1 x 1 white canvas, tinted for solid rectangles. */
  const white = whitePixel();
  const own: Record<string, unknown> = {
    canvas: { width, height },
    save() {
      stack.push({ m: DOMMatrix.fromMatrix(m), alpha, fill });
    },
    restore() {
      const s = stack.pop();
      if (s) ({ m, alpha, fill } = s);
    },
    getTransform: () => DOMMatrix.fromMatrix(m),
    setTransform(a: number | DOMMatrix2DInit, b?: number, c?: number, d?: number, e?: number, f?: number) {
      m = typeof a === 'number' ? new DOMMatrix([a, b!, c!, d!, e!, f!]) : DOMMatrix.fromMatrix(a);
    },
    resetTransform() {
      m = new DOMMatrix();
    },
    transform(a: number, b: number, c: number, d: number, e: number, f: number) {
      m = m.multiply(new DOMMatrix([a, b, c, d, e, f]));
    },
    translate(x: number, y: number) {
      m = m.translate(x, y);
    },
    scale(x: number, y: number) {
      m = m.scale(x, y);
    },
    rotate(rad: number) {
      m = m.rotate((rad * 180) / Math.PI);
    },
    fillRect(x: number, y: number, w: number, h: number) {
      if (typeof fill !== 'string') return;
      const c = new Color(fill);
      items.push({
        src: white,
        m: m.translate(x, y).scale(w, h),
        alpha: alpha * c.alpha,
        tint: c.toNumber(),
        must: true,
      });
    },
    drawImage(src: Source, ...n: number[]) {
      if (!src.width || !src.height) return;
      if (n.length === 8) {
        const [sx, sy, sw, sh, dx, dy, dw, dh] = n;
        items.push({ src, part: [sx, sy, sw, sh], m: m.translate(dx, dy).scale(dw, dh), alpha });
        return;
      }
      const [dx, dy] = n;
      const dw = n.length === 4 ? n[2] : src.width;
      const dh = n.length === 4 ? n[3] : src.height;
      items.push({ src, m: m.translate(dx, dy).scale(dw, dh), alpha });
    },
  };
  Object.defineProperties(own, {
    globalAlpha: { get: () => alpha, set: (v: number) => (alpha = v) },
    fillStyle: { get: () => fill, set: (v: unknown) => (fill = v) },
  });
  const noop = () => {};
  return new Proxy(own, {
    get: (t, k: string) => (k in t ? t[k] : noop),
    set: (t, k: string, v) => {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

let white: HTMLCanvasElement | null = null;
function whitePixel() {
  if (white) return white;
  white = document.createElement('canvas');
  white.width = white.height = 1;
  const ctx = white.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 1, 1);
  return white;
}
