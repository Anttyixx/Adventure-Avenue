import { describe, expect, it } from 'vitest';
import { BOARD_LIMITS, validateBoard, type BoardDef } from '@aa/engine';
import {
  districtChoices,
  canAssignProperty,
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
  it('blocks adding or reassigning a fifth property, but allows replacing one already in the district', () => {
    const board = blank();
    board.districts = [
      { name: 'A', color: '#f00000' },
      { name: 'B', color: '#00f000' },
    ];
    for (let i = 0; i < 4; i++) board.squares.push({ x: i, y: 0, t: 'shop', d: 0 });
    board.squares.push({ x: 5, y: 0, t: 'shop', d: 1 });
    expect(canAssignProperty(board, 0)).toBe(false);
    expect(canAssignProperty(board, 0, 5)).toBe(false);
    expect(canAssignProperty(board, 0, 1)).toBe(true);
    expect(canAssignProperty(board, 1, 1)).toBe(true);
    expect(canAssignProperty(board, -1)).toBe(false);
    expect(districtChoices(board).filter((d) => d.count < 4)).toHaveLength(11);
    board.squares.splice(1, 1);
    expect(canAssignProperty(board, 0)).toBe(true);
    expect(districtChoices(board).find((d) => d.index === 0)?.count).toBe(3);
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
