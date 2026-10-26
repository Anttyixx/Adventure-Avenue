/**
 * Save and resume: a snapshot of the match is stored at the start of every turn so a match
 * can always be resumed from the last turn boundary.
 */
import { cloneState, type GameState } from '@aa/engine';

const SAVE_KEY = 'adventure-avenue-save-v1';

/** An online game's room and who played from which device, so the host can reopen it. */
export interface OnlineSave {
  code: string;
  seats: { pid: number; kind: 'host' | 'local' | 'remote'; name: string; token?: string }[];
}

export interface SaveInfo {
  state: GameState;
  savedAt: number;
  /** Set when the host saved an online game. */
  online?: OnlineSave;
}

export function saveGame(G: GameState, online?: OnlineSave) {
  try {
    const state = cloneState(G);
    // Temporary effects reset at the start of the saved turn anyway; keep the last 120 log lines.
    state.log = state.log.slice(0, 120);
    localStorage.setItem(SAVE_KEY, JSON.stringify({ state, savedAt: Date.now(), online } satisfies SaveInfo));
  } catch {
    /* storage full or unavailable */
  }
}

export function loadSave(): SaveInfo | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SaveInfo;
    if (s?.state?.version !== 1 || s.state.over) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
