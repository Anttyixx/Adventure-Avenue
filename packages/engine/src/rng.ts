import { K } from './constants';
import type { GameState } from './types';

/** mulberry32 step on the state stored in the game, so snapshots replay identically. */
export function rand(G: { rng: number }): number {
  let t = (G.rng = (G.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(G: { rng: number }, n: number): number {
  return Math.floor(rand(G) * n);
}

export function rollDie(G: GameState): number {
  return 1 + randInt(G, K.dieSides);
}

export function pick<T>(G: { rng: number }, arr: readonly T[]): T {
  return arr[randInt(G, arr.length)];
}

export function shuffle<T>(G: { rng: number }, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(G, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function weighted<T extends string>(G: { rng: number }, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  let r = rand(G) * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) {
    if ((r -= w) < 0) return k;
  }
  return entries[entries.length - 1][0];
}
