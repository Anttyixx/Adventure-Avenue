/** Pure poses for the short portal pull-in / launch-out animation. */
type Point = { x: number; y: number };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function portalTravelPose(k: number, start: Point, entrance: Point, exit: Point, target: Point) {
  if (k < 0.45) {
    const t = clamp(k / 0.45),
      pull = t * t;
    const shrink = clamp((t - 0.25) / 0.75);
    return {
      x: mix(start.x, entrance.x, pull),
      y: mix(start.y, entrance.y, pull),
      sx: mix(1, 0.06, shrink),
      sy: mix(1, 0.12, shrink) + Math.sin(t * Math.PI) * 0.16,
      alpha: 1 - shrink * shrink,
      turn: -shrink * 0.45,
      hop: 0,
      exiting: false,
    };
  }
  if (k < 0.55) return { x: exit.x, y: exit.y, sx: 0.06, sy: 0.12, alpha: 0, turn: 0, hop: 0, exiting: true };
  const t = clamp((k - 0.55) / 0.45),
    launch = 1 - (1 - t) ** 3;
  return {
    x: mix(exit.x, target.x, launch),
    y: mix(exit.y, target.y, launch),
    sx: mix(0.08, 1, clamp(t / 0.5)) + Math.sin(t * Math.PI) * 0.12,
    sy: mix(0.12, 1, clamp(t / 0.4)) + Math.sin(t * Math.PI) * 0.22,
    alpha: clamp(t / 0.16),
    turn: (1 - t) * 0.3,
    hop: Math.sin(t * Math.PI) * 22,
    exiting: true,
  };
}
