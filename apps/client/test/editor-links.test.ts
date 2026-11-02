import { describe, it, expect } from 'vitest';
import { connectTransports, type BoardDef } from '@aa/engine';
import { linkEditorTiles, unlinkEditorTile } from '../src/ui/editor-links';

/** A bank and `n` unlinked tiles of one kind in a row. */
function fixture(type: 'warp' | 'portal', n = 4): BoardDef {
  const b: BoardDef = {
    id: 'links',
    name: 'Links',
    cols: 16,
    rows: 4,
    bank: 0,
    districts: [],
    edges: [],
    squares: [
      { x: 0, y: 0, t: 'bank' },
      ...Array.from({ length: n }, (_, i) => ({ x: i + 1, y: 0, t: type })),
    ],
  };
  connectTransports(b);
  return b;
}

describe('board link picking', () => {
  it.each(['warp', 'portal'] as const)('places %s tiles unlinked and gives each new pair a color', (type) => {
    const b = fixture(type);
    expect(b.squares.slice(1).every((s) => s.channel == null && s.link == null)).toBe(true);
    expect(linkEditorTiles(b, 1, 2)).toBe(true);
    expect(linkEditorTiles(b, 3, 4)).toBe(true);
    expect(b.squares[1]).toMatchObject({ link: 2, channel: 0 });
    expect(b.squares[2]).toMatchObject({ link: 1, channel: 0 });
    expect(b.squares[3]).toMatchObject({ link: 4, channel: 1 });
  });
  it('links one tile at most: relinking leaves the old partners unlinked', () => {
    const b = fixture('warp');
    linkEditorTiles(b, 1, 2);
    linkEditorTiles(b, 3, 4);
    expect(linkEditorTiles(b, 1, 3)).toBe(true);
    expect(b.squares[1].link).toBe(3);
    expect(b.squares[3].link).toBe(1);
    expect(b.squares[2].link).toBeUndefined();
    expect(b.squares[4].link).toBeUndefined();
    expect(b.squares[2].channel).toBeUndefined();
  });
  it.each(['warp', 'portal'] as const)('links %s tiles to the bank, any number of them', (type) => {
    const b = fixture(type);
    linkEditorTiles(b, 1, 2);
    expect(linkEditorTiles(b, 1, 0)).toBe(true);
    expect(linkEditorTiles(b, 3, 0)).toBe(true);
    expect(b.squares[1]).toMatchObject({ link: 0, toBank: true });
    expect(b.squares[3]).toMatchObject({ link: 0, toBank: true });
    // The bank link broke the pair.
    expect(b.squares[2].link).toBeUndefined();
    expect(linkEditorTiles(b, 1, 2)).toBe(true);
    expect(b.squares[1]).toMatchObject({ link: 2 });
    expect(b.squares[1].toBank).toBeUndefined();
  });
  it('rejects self, empty cells and the other kind without changing the board', () => {
    const b = fixture('warp');
    b.squares.push({ x: 9, y: 0, t: 'portal' });
    const before = structuredClone(b);
    for (const target of [1, -1, 99, b.squares.length - 1]) expect(linkEditorTiles(b, 1, target)).toBe(false);
    expect(b).toEqual(before);
  });
  it('refuses a sixth pair of one kind, but still allows the bank', () => {
    const b = fixture('portal', 12);
    for (let i = 1; i <= 10; i += 2) expect(linkEditorTiles(b, i, i + 1)).toBe(true);
    const before = structuredClone(b);
    expect(linkEditorTiles(b, 11, 12)).toBe(false);
    expect(b).toEqual(before);
    expect(linkEditorTiles(b, 11, 0)).toBe(true);
  });
  it('unlinks a pair', () => {
    const b = fixture('warp');
    linkEditorTiles(b, 1, 2);
    expect(unlinkEditorTile(b, 1)).toBe(true);
    expect(b.squares[1].link).toBeUndefined();
    expect(b.squares[2].link).toBeUndefined();
  });
});
