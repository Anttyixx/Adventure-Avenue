import { describe, expect, it } from 'vitest';
import type { GameState } from '@aa/engine';
import { activity } from '../src/ui/activity';

const G = { players: [{ name: 'Rosa' }] } as GameState;
const path = { kind: 'path', pid: 0, steps: 5, dests: [] } as const;

describe('observer movement messages', () => {
  it('keeps the roll result alongside the pending movement choice', () => {
    expect(activity(G, { ...path, dests: [] }, 5).text).toBe(
      'Rosa rolled a 5 and is deciding where to move...',
    );
  });

  it('does not describe card movement as a die roll', () => {
    expect(activity(G, { ...path, steps: 2, dests: [] }, 5).text).toBe(
      'Rosa is deciding where to move 2 spaces...',
    );
    expect(activity(G, { ...path, dests: [] }).text).not.toContain('rolled');
  });

  it('keeps the correct pending choice after landing', () => {
    expect(activity(G, { kind: 'buyShop', pid: 0, sq: 0, price: 200 }).text).toBe(
      'Rosa is deciding whether to buy the shop...',
    );
  });
});
