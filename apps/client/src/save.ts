/**
 * Save and resume: a snapshot of the match is stored at the start of every turn so a match
 * can always be resumed from the last turn boundary.
 */
import { cloneState, type GameState } from '@aa/engine';

const SAVE_KEY = 'adventure-avenue-save-v1';

export interface SaveInfo {
  state: GameState;
  savedAt: number;
}

export function saveGame(G: GameState) {
  try {
    const state = cloneState(G);
    // Temporary effects reset at the start of the saved turn anyway; keep the last 30 log lines.
    state.log = state.log.slice(0, 30);
    localStorage.setItem(SAVE_KEY, JSON.stringify({ state, savedAt: Date.now() } satisfies SaveInfo));
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
