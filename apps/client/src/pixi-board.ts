/**
 * The PixiJS (WebGL) layer under the board canvas, used when the renderer is `pixi`
 * (`renderer.ts`). It draws the background (grass, terrain, scenery) and the cached board picture
 * on the graphics card; the board's moving parts (tokens, effects, the die) still draw on the 2D
 * canvas laid over it, which is cleared to transparent each frame.
 *
 * The same drawing code feeds both renderers: `begin()` returns a stand-in 2D context that
 * records each `drawImage` and solid `fillRect` (with the transform and alpha at that moment),
 * and `end()` turns the records into a reused pool of PixiJS sprites, then renders. Each source
 * canvas becomes one GPU texture, kept while it is used and dropped a few seconds after it isn't,
 * so the cached chunks (`chunk-budget.ts`) and sprites need no extra bookkeeping. Calls the
 * stand-in doesn't support (paths, text, patterns) are ignored: only the background and the board
 * picture go through it.
 */
import { Application, CanvasSource, Color, Container, Matrix, Rectangle, Sprite, Texture } from 'pixi.js';

/** Frames a texture may go unused before it is freed (about 5 s at 60 fps). */
const KEEP_FRAMES = 300;

type Source = CanvasImageSource & { width: number; height: number };
interface Entry {
  tex: Texture;
  last: number;
  /** Parts of the image drawn with a source rectangle, by "x,y,w,h". */
  parts?: Map<string, Texture>;
}
interface Item {
  tex: Texture;
  m: DOMMatrix;
  alpha: number;
  tint?: number;
}

export class PixiBoard {
  private app = new Application();
  /** False until PixiJS has started (it starts asynchronously), or if WebGL is unavailable. */
  ready = false;
  /** Set if PixiJS could not start: the board falls back to the classic renderer. */
  failed = false;
  private world = new Container();
  private pool: Sprite[] = [];
  private items: Item[] = [];
  private textures = new Map<Source, Entry>();
  private frameNo = 0;
  private dpr = 1;

  constructor(host: HTMLElement, before: HTMLElement, w: number, h: number, dpr: number) {
    this.dpr = dpr;
    this.app
      .init({
        width: w,
        height: h,
        resolution: dpr,
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
        host.insertBefore(cv, before);
        // Records are in device pixels (like the 2D canvas); the stage works in CSS pixels.
        this.world.scale.set(1 / this.dpr);
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
    this.dpr = dpr;
    this.world.scale.set(1 / dpr);
    this.app.renderer.resize(w, h, dpr);
  }

  /** A canvas was redrawn in place (the board picture): upload it again next time it is used. */
  refresh(source: Source) {
    const e = this.textures.get(source);
    if (!e) return;
    this.free(e);
    this.textures.delete(source);
  }

  /**
   * Start a frame: returns a stand-in 2D context with the given transform (device pixels), the
   * size of the 2D canvas it stands in for. Draw the background through it, then call `end()`.
   */
  begin(transform: DOMMatrix, width: number, height: number): CanvasRenderingContext2D {
    this.items.length = 0;
    this.frameNo++;
    return recorder(this.items, (src) => this.texture(src), transform, width, height);
  }

  /** Turn the frame's records into sprites and draw them. */
  end() {
    if (!this.ready) return;
    const items = this.items;
    while (this.pool.length < items.length) {
      const s = new Sprite(Texture.EMPTY);
      this.pool.push(s);
      this.world.addChild(s);
    }
    const m = new Matrix();
    for (let i = 0; i < this.pool.length; i++) {
      const s = this.pool[i];
      const it = items[i];
      if (!it) {
        s.visible = false;
        s.texture = Texture.EMPTY;
        continue;
      }
      s.visible = true;
      s.texture = it.tex;
      s.alpha = it.alpha;
      s.tint = it.tint ?? 0xffffff;
      // The record's matrix maps the texture's own pixels to device pixels.
      const f = it.tex.frame;
      m.set(it.m.a / f.width, it.m.b / f.width, it.m.c / f.height, it.m.d / f.height, it.m.e, it.m.f);
      s.setFromMatrix(m);
    }
    this.app.renderer.render(this.app.stage);
    if (this.frameNo % 120 === 0) this.sweep();
  }

  destroy() {
    for (const e of this.textures.values()) this.free(e);
    this.textures.clear();
    if (this.ready) this.app.destroy(true, { children: true });
    this.ready = false;
  }

  /** The texture for an image, or a part of it (made once, then reused). */
  private texture(src: Source, part?: [number, number, number, number]): Texture | null {
    if (!src.width || !src.height) return null;
    let e = this.textures.get(src);
    if (!e) {
      const source = new CanvasSource({
        resource: src as HTMLCanvasElement,
        // Mipmaps keep big chunks from shimmering when the whole board is in view.
        autoGenerateMipmaps: true,
        scaleMode: 'linear',
      });
      e = { tex: new Texture({ source }), last: 0 };
      this.textures.set(src, e);
    }
    e.last = this.frameNo;
    if (!part) return e.tex;
    const key = part.join(',');
    e.parts ??= new Map();
    let t = e.parts.get(key);
    if (!t) {
      t = new Texture({ source: e.tex.source, frame: new Rectangle(...part) });
      e.parts.set(key, t);
    }
    return t;
  }

  /** Free textures nothing has drawn for a while (dropped chunks, sprites no longer in view). */
  private sweep() {
    for (const [src, e] of this.textures)
      if (this.frameNo - e.last > KEEP_FRAMES) {
        this.free(e);
        this.textures.delete(src);
      }
  }

  private free(e: Entry) {
    // No sprite may keep showing a freed texture.
    for (const s of this.pool) if (s.texture.source === e.tex.source) s.texture = Texture.EMPTY;
    e.parts?.forEach((t) => t.destroy(false));
    e.tex.destroy(true);
  }
}

/**
 * A stand-in 2D context that records drawImage and solid fillRect calls. Other calls do nothing,
 * and other properties simply hold what is set on them.
 */
function recorder(
  items: Item[],
  texture: (src: Source, part?: [number, number, number, number]) => Texture | null,
  start: DOMMatrix,
  width: number,
  height: number,
): CanvasRenderingContext2D {
  let m = DOMMatrix.fromMatrix(start);
  let alpha = 1;
  let fill: unknown = '#000';
  const stack: { m: DOMMatrix; alpha: number; fill: unknown }[] = [];
  const own: Record<string, unknown> = {
    canvas: { width, height },
    get globalAlpha() {
      return alpha;
    },
    set globalAlpha(v: number) {
      alpha = v;
    },
    get fillStyle() {
      return fill;
    },
    set fillStyle(v: unknown) {
      fill = v;
    },
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
        tex: Texture.WHITE,
        m: m.translate(x, y).scale(w, h),
        alpha: alpha * c.alpha,
        tint: c.toNumber(),
      });
    },
    drawImage(src: Source, ...n: number[]) {
      let tex: Texture | null;
      let dx: number, dy: number, dw: number, dh: number;
      if (n.length === 8) {
        tex = texture(src, [n[0], n[1], n[2], n[3]]);
        [dx, dy, dw, dh] = n.slice(4);
      } else {
        tex = texture(src);
        [dx, dy] = n;
        dw = n.length === 4 ? n[2] : src.width;
        dh = n.length === 4 ? n[3] : src.height;
      }
      if (!tex) return;
      items.push({ tex, m: m.translate(dx, dy).scale(dw, dh), alpha });
    },
  };
  const noop = () => {};
  return new Proxy(own, {
    get: (t, k: string) => (k in t ? t[k] : noop),
    set: (t, k: string, v) => {
      if (k === 'globalAlpha' || k === 'fillStyle') (t as Record<string, unknown>)[k] = v;
      else t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}
