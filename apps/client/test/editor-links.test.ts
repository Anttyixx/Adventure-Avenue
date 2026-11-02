import { describe, it, expect } from 'vitest';
import { connectTransports, type BoardDef } from '@aa/engine';
import { linkEditorTiles } from '../src/ui/editor-links';

function fixture(type: 'warp' | 'portal'): BoardDef {
  const b: BoardDef = {
    id: 'links',
    name: 'Links',
    cols: 8,
    rows: 4,
    bank: 0,
    districts: [],
    edges: [],
    squares: [
      { x: 0, y: 0, t: 'bank' },
      ...Array.from({ length: 4 }, (_, i) => ({ x: i + 1, y: 0, t: type, channel: Math.floor(i / 2) })),
    ],
  };
  connectTransports(b);
  return b;
}
describe('board link picking', () => {
  it.each(['warp', 'portal'] as const)('swaps partners and keeps two %s tiles per color', (type) => {
    const b = fixture(type);
    expect(linkEditorTiles(b, 1, 3)).toBe(true);
    expect(b.squares[1].link).toBe(3);
    expect(b.squares[3].link).toBe(1);
    expect(b.squares[2].link).toBe(4);
    expect(b.squares[4].link).toBe(2);
    for (const c of [0, 1]) expect(b.squares.filter((s) => s.t === type && s.channel === c)).toHaveLength(2);
  });
  it('links a portal to the bank and can restore its portal partner', () => {
    const b = fixture('portal');
    expect(linkEditorTiles(b, 1, 0)).toBe(true);
    expect(b.squares[1]).toMatchObject({ link: 0, toBank: true });
    expect(linkEditorTiles(b, 1, 2)).toBe(true);
    expect(b.squares[1]).toMatchObject({ link: 2, toBank: false });
    expect(b.squares[2].link).toBe(1);
  });
  it('rejects self, empty cells and incompatible tiles without changing the board', () => {
    const b = fixture('warp'),
      before = structuredClone(b);
    for (const target of [1, 0, -1, 99]) expect(linkEditorTiles(b, 1, target)).toBe(false);
    expect(b).toEqual(before);
  });
  it('completes a pair between unmatched colors', () => {
    const b = fixture('warp');
    b.squares.splice(4, 1);
    b.squares.splice(2, 1);
    connectTransports(b);
    expect(linkEditorTiles(b, 1, 2)).toBe(true);
    expect(b.squares[1].link).toBe(2);
    expect(b.squares[2].link).toBe(1);
  });
});
