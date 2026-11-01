/** District color choices and property capacity in the board builder. */
import { BOARD_LIMITS, type BoardDef } from '@aa/engine';

export const DISTRICT_COLORS = [
  '#ff4d4d',
  '#2f9bff',
  '#2ecc71',
  '#ffc21a',
  '#9b5cff',
  '#13c4b4',
  '#ff4fa8',
  '#ff8a1f',
  '#a16b3b',
  '#5c6bc0',
];
export const DISTRICT_NAMES = [
  'Brick Row',
  'Bay Market',
  'Greenway',
  'Gold Street',
  'Lilac Lane',
  'Tide Walk',
  'Plaza',
  'Maple Court',
  'Cedar Lane',
  'Orchard Walk',
];

export interface DistrictChoice {
  key: string;
  index: number | null;
  color: string;
  name: string;
  count: number;
}

/** Include unused colors as lazy district choices, without saving empty districts. */
export function districtChoices(board: BoardDef): DistrictChoice[] {
  const choices = board.districts.map((d, index) => ({
    ...d,
    index,
    count: board.squares.filter((sq) => sq.t === 'shop' && sq.d === index).length,
  }));
  const usedColors = new Set(choices.map((d) => d.color));
  const usedNames = new Set(choices.map((d) => d.name));
  const all: Omit<DistrictChoice, 'key'>[] = [...choices];
  for (let i = 0; all.length < BOARD_LIMITS.maxDistricts && i < DISTRICT_COLORS.length; i++) {
    const color = DISTRICT_COLORS[i];
    if (usedColors.has(color)) continue;
    const name = !usedNames.has(DISTRICT_NAMES[i])
      ? DISTRICT_NAMES[i]
      : (DISTRICT_NAMES.find((n) => !usedNames.has(n)) ?? `District ${all.length + 1}`);
    usedNames.add(name);
    all.push({ index: null, name, color, count: 0 });
  }
  const order = (d: Omit<DistrictChoice, 'key'>) => {
    const i = DISTRICT_COLORS.indexOf(d.color);
    return i < 0 ? DISTRICT_COLORS.length + (d.index ?? 0) : i;
  };
  all.sort((a, b) => order(a) - order(b));
  const seen = new Map<string, number>();
  return all.map((d) => {
    const n = seen.get(d.color) ?? 0;
    seen.set(d.color, n + 1);
    return { ...d, key: `${d.color}:${n}` };
  });
}

/** Replacing a tile already in this district does not consume another property slot. */
export function canAssignProperty(board: BoardDef, district: number, replacing = -1) {
  if (!board.districts[district]) return false;
  const count = board.squares.filter(
    (sq, i) => sq.t === 'shop' && sq.d === district && i !== replacing,
  ).length;
  return count < BOARD_LIMITS.districtSize;
}
