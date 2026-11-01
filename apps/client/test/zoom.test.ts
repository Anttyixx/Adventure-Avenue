import { describe, expect, it } from 'vitest';
import { fitZoom, nearZoom, wheelZoomStep, zoomScale, ZOOM_MAX_OUT, ZOOM_STEP } from '../src/zoom';

describe('shared game and editor zoom rules', () => {
  it('uses the same board-size-dependent close view on desktop and small screens', () => {
    expect(nearZoom(1440, 900, 3300, 2100)).toBeCloseTo((900 / 2100) * 1.65);
    expect(nearZoom(844, 390, 3300, 2100)).toBeCloseTo((390 / 2100) * 2.2);
    expect(nearZoom(1440, 900, 1750, 1100)).toBeCloseTo((900 / 1100) * 1.65);
  });
  it('fits the free area with a 3% margin and handles narrow available space', () => {
    expect(fitZoom(1100, 700, 3300, 2100)).toBeCloseTo((700 / 2100) * 0.97);
    expect(fitZoom(0, -50, 3300, 2100)).toBeCloseTo((100 / 3300) * 0.97);
  });
  it('uses geometric zoom with exact endpoints and never zooms out past the close view', () => {
    expect(zoomScale(2, 0.5, 0)).toBe(2);
    expect(zoomScale(2, 0.5, ZOOM_MAX_OUT)).toBe(0.5);
    expect(zoomScale(2, 0.5, ZOOM_MAX_OUT / 2)).toBe(1);
    expect(zoomScale(2, 3, ZOOM_MAX_OUT)).toBe(2);
  });
  it('caps mouse-wheel notches, preserves small trackpad deltas and converts line units', () => {
    expect(wheelZoomStep(1000, 0)).toBe(ZOOM_STEP);
    expect(wheelZoomStep(-1000, 0)).toBe(-ZOOM_STEP);
    expect(wheelZoomStep(10, 0)).toBeCloseTo(ZOOM_STEP / 10);
    expect(wheelZoomStep(1, 1)).toBeCloseTo(ZOOM_STEP * 0.33);
  });
});
