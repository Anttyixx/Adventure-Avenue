/**
 * The player card: the name and character this device plays as, set on the main menu. Game
 * setup seats the host with it, and joining a game asks for its character (a random free one
 * is given when someone else in that game already has it). Stored in localStorage only.
 */
import type { CharId } from '@aa/engine';
import { CHARACTERS } from './sprites';

const KEY = 'adventure-avenue-profile';
/** The name this device used to join with, before player cards (read once as the default). */
const OLD_NAME_KEY = 'adventure-avenue-online-name';

export interface Profile {
  /** Empty until the player sets one. */
  name: string;
  /** Empty until the player picks one. */
  look: CharId | '';
}

export function loadProfile(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Profile> | null;
    const name = typeof raw?.name === 'string' ? raw.name : (localStorage.getItem(OLD_NAME_KEY) ?? '');
    const look = CHARACTERS.some((c) => c.id === raw?.look) ? (raw!.look as CharId) : '';
    return { name: name.slice(0, 12), look };
  } catch {
    return { name: '', look: '' };
  }
}

/** Change part of the player card. */
export function saveProfile(patch: Partial<Profile>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadProfile(), ...patch }));
  } catch {
    /* storage unavailable */
  }
}
