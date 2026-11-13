import { describe, expect, it } from 'vitest';
import {
  BOARD_LIMITS,
  BUILT_IN_BOARDS,
  boardFromFile,
  boardToFile,
  validateBoard,
  type BoardDef,
} from '@aa/engine';
import {
  districtChoices,
  assignPropertyDistrict,
  DISTRICT_COLORS,
  DISTRICT_NAMES,
} from '../src/ui/editor-districts';

const blank = (): BoardDef => ({
  id: 'districts',
  name: 'Districts',
  cols: 32,
  rows: 20,
  layout: 'square',
  squares: [{ x: 16, y: 10, t: 'bank' }],
  bank: 0,
  edges: [],
  districts: [],
});

describe('editor district capacity and color choices', () => {
  it('offers twelve distinct colors without creating empty districts', () => {
    const board = blank(),
      before = structuredClone(board);
    const choices = districtChoices(board);
    expect(choices).toHaveLength(12);
    expect(new Set(choices.map((d) => d.color)).size).toBe(12);
    expect(choices.every((d) => d.index === null && d.count === 0)).toBe(true);
    expect(board).toEqual(before);
  });
  it('keeps a color choice stable when the first property creates its district out of color order', () => {
    const board = blank();
    const option = districtChoices(board)[7];
    board.districts.push({ name: option.name, color: option.color });
    board.squares.push({ x: 15, y: 10, t: 'shop', d: 0 });
    const choices = districtChoices(board);
    expect(choices[7]).toMatchObject({ key: option.key, index: 0, color: option.color, count: 1 });
    expect(choices).toHaveLength(12);
  });
  it('unassigns the oldest member when a fifth property is painted, without deleting any tiles', () => {
    const board = blank();
    board.districts = [{ name: 'A', color: '#f00000' }];
    for (let i = 0; i < 6; i++) board.squares.push({ x: i, y: 0, t: 'shop' });
    // Assignment age differs from position in the board's tile list.
    for (const i of [3, 1, 4, 2, 5]) expect(assignPropertyDistrict(board, i, 0)).toBe(true);
    expect(board.squares[3].d).toBeUndefined();
    expect(board.squares.filter((s) => s.d === 0)).toHaveLength(4);
    expect(board.squares).toHaveLength(7);
    expect(assignPropertyDistrict(board, 6, 0)).toBe(true);
    expect(board.squares[1].d).toBeUndefined();
    expect(board.squares.filter((s) => s.d === 0)).toHaveLength(4);
  });
  it('leaves a repainted member in its original place in the assignment order', () => {
    const board = blank();
    board.districts = [{ name: 'A', color: '#f00000' }];
    for (let i = 0; i < 5; i++) board.squares.push({ x: i, y: 0, t: 'shop' });
    for (let i = 1; i <= 4; i++) assignPropertyDistrict(board, i, 0);
    const before = structuredClone(board);
    expect(assignPropertyDistrict(board, 1, 0)).toBe(false);
    expect(board).toEqual(before);
    assignPropertyDistrict(board, 5, 0);
    expect(board.squares[1].d).toBeUndefined();
  });
  it('supports older maps, reassignment between districts, and safe rejection of non-properties', () => {
    const board = blank();
    board.districts = [
      { name: 'A', color: '#f00000' },
      { name: 'B', color: '#00f000' },
    ];
    for (let i = 0; i < 4; i++) board.squares.push({ x: i, y: 0, t: 'shop', d: 0 });
    board.squares.push({ x: 5, y: 0, t: 'shop', d: 1 });
    expect(assignPropertyDistrict(board, 0, 0)).toBe(false);
    expect(assignPropertyDistrict(board, 1, 12)).toBe(false);
    expect(assignPropertyDistrict(board, 99, 0)).toBe(false);
    expect(assignPropertyDistrict(board, 5, 0)).toBe(true);
    expect(board.squares[1].d).toBeUndefined();
    expect(board.squares[5].d).toBe(0);
    expect(districtChoices(board).find((d) => d.index === 1)?.count).toBe(0);
    expect(districtChoices(board)).toHaveLength(12);
  });
  it('preserves assignment age through a save copy and movement in the tile list', () => {
    const board = blank();
    board.districts = [{ name: 'A', color: '#f00000' }];
    for (let i = 0; i < 5; i++) board.squares.push({ x: i, y: 0, t: 'shop' });
    for (const i of [3, 1, 4, 2]) assignPropertyDistrict(board, i, 0);
    const copy: BoardDef = JSON.parse(JSON.stringify(board));
    copy.squares[3].x = 12;
    const oldest = copy.squares[3];
    copy.squares.reverse();
    assignPropertyDistrict(
      copy,
      copy.squares.findIndex((s) => s.t === 'shop' && s.d == null),
      0,
    );
    expect(oldest.d).toBeUndefined();
    expect(copy.squares.filter((s) => s.d === 0)).toHaveLength(4);
  });
  it('preserves assignment order when exporting and importing a playable board', () => {
    const board = structuredClone(BUILT_IN_BOARDS[0]);
    const i = board.squares.findIndex((s) => s.t === 'shop');
    const district = board.squares[i].d!;
    delete board.squares[i].d;
    assignPropertyDistrict(board, i, district);
    const file = boardToFile(board);
    const loaded = boardFromFile(JSON.parse(JSON.stringify(file)), 'district-order');
    expect(loaded.error).toBeUndefined();
    expect(loaded.board?.squares[i].districtOrder).toBe(board.squares[i].districtOrder);
    expect(validateBoard(loaded.board!).errors).toEqual([]);
    delete board.squares[i].d;
    expect(validateBoard(board).errors.some((e) => e.includes('has no district'))).toBe(true);
  });
  it('supports twelve declared districts and rejects an thirteenth', () => {
    const board = blank();
    board.districts = DISTRICT_NAMES.map((name, i) => ({ name, color: DISTRICT_COLORS[i] }));
    expect(BOARD_LIMITS.maxDistricts).toBe(12);
    expect(validateBoard(board).errors.some((e) => e.includes('at most'))).toBe(false);
    expect(districtChoices(board).filter((d) => d.index === null)).toEqual([]);
    board.districts.push({ name: 'Extra', color: '#abcdef' });
    expect(validateBoard(board).errors).toContain('A board can have at most 12 districts.');
  });
});
