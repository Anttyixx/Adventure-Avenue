/** Cosmetic stream geometry, always outside the board's playable rectangle. */
import type { GameState } from '@aa/engine';
import { worldSize } from './geometry';

type Point = { x: number; y: number };
const BEND = 380;
const WEST = -280;
const SOUTH_X = WEST + BEND;
const westX = (y: number, turn: number) => WEST + (Math.cos((y - turn) / 340) - 1) * 45;
const southY = (x: number, turn: number) => turn + BEND + (1 - Math.cos((x - SOUTH_X) / 450)) * 40;

/** Continue upstream/downstream past the visible camera, with fixed world-space samples. */
export function parkStream(G: GameState, top: number, right: number): Point[] {
  const turn = worldSize(G).h - 100;
  const points: Point[] = [];
  for (let y = Math.floor((Math.min(top, turn) - 160) / 80) * 80; y < turn; y += 80)
    points.push({ x: westX(y, turn), y });
  points.push({ x: WEST, y: turn });
  for (let i = 1; i <= 16; i++) {
    const a = ((i / 16) * Math.PI) / 2;
    points.push({ x: SOUTH_X - BEND * Math.cos(a), y: turn + BEND * Math.sin(a) });
  }
  for (let x = SOUTH_X + 80; x < Math.max(right + 160, SOUTH_X + 240); x += 80)
    points.push({ x, y: southY(x, turn) });
  return points;
}

/** Conservative bank clearance for planting; plants never sit in the water. */
export function streamDistance(G: GameState, x: number, y: number): number {
  const turn = worldSize(G).h - 100;
  const vy = Math.min(y, turn);
  const hx = Math.max(x, SOUTH_X);
  const vertical = Math.hypot(x - westX(vy, turn), y - vy);
  const horizontal = Math.hypot(x - hx, y - southY(hx, turn));
  const bend = x <= SOUTH_X && y >= turn ? Math.abs(Math.hypot(x - SOUTH_X, y - turn) - BEND) : Infinity;
  return Math.min(vertical, horizontal, bend);
}
