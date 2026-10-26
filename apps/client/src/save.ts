/**
 * Save and resume: a snapshot of the match is stored at the start of every turn so a match
 * can always be resumed from the last turn boundary.
 */
import { cloneState, type GameState } from '@aa/engine';
import { CHARACTERS, freeCharacter } from './sprites';

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
    // Games saved before characters were picked from the townsfolk get different ones each.
    const players = s.state.players;
    for (const p of players)
      if (!CHARACTERS.some((c) => c.id === p.ch))
        p.ch = freeCharacter(
          players.filter((q) => q !== p).map((q) => q.ch),
          () => p.id / players.length,
        );
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

/** The online game this device last joined as a guest, so a reload or a later visit can rejoin it. */
export interface GuestSave {
  code: string;
  name: string;
  at: number;
}

const GUEST_KEY = 'adventure-avenue-guest';
/** Set (per tab) while a guest is in a game, so reloading the page goes straight back in. */
const IN_GAME_KEY = 'adventure-avenue-guest-in-game';
/** How long the main menu offers to rejoin. */
const GUEST_DAYS = 3;

export function saveGuest(code: string, name: string) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify({ code, name, at: Date.now() } satisfies GuestSave));
  } catch {
    /* storage unavailable */
  }
}

export function loadGuest(): GuestSave | null {
  try {
    const g = JSON.parse(localStorage.getItem(GUEST_KEY) ?? 'null') as GuestSave | null;
    if (!g?.code || !g.name || Date.now() - g.at > GUEST_DAYS * 864e5) return null;
    return g;
  } catch {
    return null;
  }
}

export function clearGuest() {
  try {
    localStorage.removeItem(GUEST_KEY);
  } catch {
    /* ignore */
  }
}

export function setGuestInGame(on: boolean) {
  try {
    if (on) sessionStorage.setItem(IN_GAME_KEY, '1');
    else sessionStorage.removeItem(IN_GAME_KEY);
  } catch {
    /* ignore */
  }
}

export function guestInGame(): boolean {
  try {
    return sessionStorage.getItem(IN_GAME_KEY) === '1';
  } catch {
    return false;
  }
}
