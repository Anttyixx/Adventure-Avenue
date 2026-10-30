/**
 * Online play: messages between the host's browser and the players who join it.
 *
 * The game runs in lockstep. Every device runs its own copy of the rules engine from the same
 * starting state. The engine only waits on decisions, so the host numbers every decision in
 * order (`seq`) and broadcasts each answer with the RNG state after it; every copy then plays
 * out the same game. Players answer their own decisions; the host checks the answer came from
 * the right seat and broadcasts it. Once per turn the host sends a hash of its state so a copy
 * that drifted can ask for the turn's starting state and replay from there.
 */
import type { BoardDef, CharId, GameState, PlotSetting, RuleSet, StockSystem } from '@aa/engine';

/** Protocol version: a joiner on a different version is turned away. */
export const NET_VERSION = 12;

export type SeatKind = 'host' | 'local' | 'remote' | 'open' | 'cpu';

export interface LobbySeat {
  kind: SeatKind;
  name: string;
  look: CharId | null;
  /** False while a joined player's connection is lost. */
  online: boolean;
}

/** The game's settings as the host has them, shown (read-only) to players who join. */
export interface LobbyInfo {
  boardName: string;
  /** The board itself, so joined players see it (missing when a saved game is reopened). */
  board?: BoardDef;
  rules: RuleSet;
  target: number;
  roundCap: number;
  plots?: PlotSetting;
  stocks?: StockSystem;
  /** One per player in the game; open seats are played by a CPU unless a friend joins. */
  seats: LobbySeat[];
}

/** One broadcast decision answer. */
export interface Answer {
  seq: number;
  ans: unknown;
  rng: number;
}

/** A copy of the game to start from: the state at a turn start plus the answers since. */
export interface StartInfo {
  state: GameState;
  /** Decisions made before `state`. */
  seq: number;
  answers: Answer[];
  /** The player ids this device answers for. */
  you: number[];
}

export type ToHost =
  | { t: 'hello'; v: number; token: string; name: string }
  /** Pick a different character in the lobby (refused if someone else has it). */
  | { t: 'look'; look: CharId }
  /** Change name in the lobby. */
  | { t: 'name'; name: string }
  | { t: 'answer'; seq: number; ans: unknown }
  | { t: 'resync' }
  | { t: 'bye' };

export type ToGuest =
  | { t: 'welcome'; seat: number }
  | { t: 'reject'; reason: string }
  | { t: 'lobby'; lobby: LobbyInfo }
  | { t: 'start'; start: StartInfo }
  | { t: 'ans'; a: Answer }
  | { t: 'hash'; key: string; h: string }
  | { t: 'seat'; pid: number; online: boolean }
  | { t: 'bye'; reason: string };

/** Room codes avoid letters that are easy to mix up (I/L/O). */
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';

export function newRoomCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  return s;
}

export function cleanCode(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4);
}

export const roomPeerId = (code: string) => `adventure-avenue-room-${code}`;

/** Key that identifies a turn start: decision count, round and turn. */
export const turnKey = (seq: number, G: GameState) => `${seq}:${G.round}:${G.turn}`;

/** Short FNV-1a hash of the game state, to spot copies that drifted apart. */
export function stateHash(G: GameState): string {
  const s = JSON.stringify(G);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Per-device token so a player who drops can take their seat back. */
export function deviceToken(): string {
  const KEY = 'adventure-avenue-net-token';
  try {
    let t = localStorage.getItem(KEY);
    if (!t) {
      t = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(KEY, t);
    }
    return t;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

/** A link that opens the game with the join form filled in for `code`. */
export function inviteURL(code: string): string {
  const q = new URLSearchParams({ join: code });
  const peer = new URLSearchParams(location.search).get('peer');
  if (peer) q.set('peer', peer);
  return `${location.origin}${location.pathname}?${q}`;
}
