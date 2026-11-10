/**
 * Which renderer draws the board: `classic` (the browser's 2D canvas, the default) or `pixi`
 * (PixiJS on the graphics card, being phased in; see `pixi-board.ts`). Chosen with `?renderer=pixi`
 * or `?renderer=classic` in the address (remembered on this device) or the UI Lab's toggle.
 */
export type RendererKind = 'classic' | 'pixi';

const KEY = 'aa-renderer';

export function rendererKind(): RendererKind {
  try {
    const asked = new URLSearchParams(location.search).get('renderer');
    if (asked === 'pixi' || asked === 'classic') {
      localStorage.setItem(KEY, asked);
      return asked;
    }
    return localStorage.getItem(KEY) === 'pixi' ? 'pixi' : 'classic';
  } catch {
    return 'classic';
  }
}

/** Remember a renderer for the next time the board is built (the caller reloads). */
export function setRendererKind(kind: RendererKind) {
  try {
    localStorage.setItem(KEY, kind);
  } catch {
    // Storage blocked: the address's ?renderer= still works.
  }
}
