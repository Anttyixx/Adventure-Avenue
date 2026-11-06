/** Shared game and board-builder zoom sizing and input rules. */
export const ZOOM_MAX_OUT = 1.3;
/** One wheel notch or key press changes the zoom chip by 5%. */
export const ZOOM_STEP = ZOOM_MAX_OUT / 30;
/** Builder-only close extension: ten more 5% steps above the existing 250% view. */
export const EDITOR_ZOOM_MIN_OUT = -ZOOM_MAX_OUT / 3;

/** The builder keeps its original percent mapping, extending it to 300% at the close limit. */
export function editorZoomPercent(out: number) {
  return Math.round(250 - (150 * Math.max(EDITOR_ZOOM_MIN_OUT, Math.min(ZOOM_MAX_OUT, out))) / ZOOM_MAX_OUT);
}

/** Close view: 1.65 times screen fit, or 2.2 on small screens. */
export function nearZoom(width: number, height: number, worldWidth: number, worldHeight: number) {
  return Math.min(width / worldWidth, height / worldHeight) * (Math.min(width, height) < 520 ? 2.2 : 1.65);
}

/**
 * The game's close view (250% on the zoom chip): the same size of square on every board, as
 * close as the original 12 x 7 board's. Bigger boards used to get a farther close view, because
 * it was worked out from the whole board's size.
 */
export function gameNearZoom(width: number, height: number) {
  return nearZoom(width, height, 12 * 100 + 100, 7 * 100 + 100);
}

/** Whole-board fit, with the game's minimum free area and 3% margin. */
export function fitZoom(width: number, height: number, worldWidth: number, worldHeight: number) {
  return Math.min(Math.max(100, width) / worldWidth, Math.max(100, height) / worldHeight) * 0.97;
}

/** Geometric interpolation from the close view to whole-board fit. */
export function zoomScale(near: number, far: number, out: number) {
  return near * Math.pow(Math.min(near, far) / near, out / ZOOM_MAX_OUT);
}

/** Normalize wheel and trackpad deltas, capped at one game zoom step per event. */
export function wheelZoomStep(deltaY: number, deltaMode: number) {
  const px = deltaMode === 1 ? deltaY * 33 : deltaY;
  return Math.max(-ZOOM_STEP, Math.min(ZOOM_STEP, (px / 100) * ZOOM_STEP));
}
