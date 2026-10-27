import type { BoardDef } from '../types';

import { CORAL_ISLE, CROSSROADS, HARBOR, LAGOON, SKY_ISLANDS, TOWN, TWIN_LAKES } from './maps';

/** Boards that ship with the game, in picker order. */
export const BUILT_IN_BOARDS: BoardDef[] = [
  TOWN,
  HARBOR,
  CROSSROADS,
  TWIN_LAKES,
  CORAL_ISLE,
  SKY_ISLANDS,
  LAGOON,
];

export const BOARDS: Record<string, BoardDef> = Object.fromEntries(BUILT_IN_BOARDS.map((b) => [b.id, b]));
