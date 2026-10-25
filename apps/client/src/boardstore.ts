/**
 * Player-made boards: saved in this browser, exported as `.aaboard.json` files and imported
 * back. The built-in Town board is always available and cannot be changed.
 */
import { TOWN, boardFromFile, boardToFile, validateBoard, type BoardCheck, type BoardDef } from '@aa/engine';

const KEY = 'adventure-avenue-boards';

export interface SavedBoard {
  id: string;
  savedAt: number;
  board: BoardDef;
}

export const BUILT_IN: BoardDef[] = [TOWN];

export function newBoardId() {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function listBoards(): SavedBoard[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedBoard[]) : [];
    return Array.isArray(list) ? list.filter((b) => b?.board?.squares) : [];
  } catch {
    return [];
  }
}

function writeAll(list: SavedBoard[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** Save (or overwrite) a board. Returns false if browser storage is unavailable or full. */
export function saveBoard(board: BoardDef): boolean {
  try {
    const list = listBoards().filter((b) => b.id !== board.id);
    list.unshift({ id: board.id, savedAt: Date.now(), board });
    writeAll(list);
    return true;
  } catch {
    return false;
  }
}

export function deleteBoard(id: string) {
  try {
    writeAll(listBoards().filter((b) => b.id !== id));
  } catch {
    /* ignore */
  }
}

/** Find a board by id among the built-in and saved boards. */
export function getBoard(id: string | null | undefined): BoardDef | null {
  if (!id) return null;
  return BUILT_IN.find((b) => b.id === id) ?? listBoards().find((b) => b.id === id)?.board ?? null;
}

/** "Name", or "Name (2)", "Name (3)"... if that name is already taken. */
export function uniqueName(name: string): string {
  const taken = new Set([...BUILT_IN, ...listBoards().map((b) => b.board)].map((b) => b.name));
  if (!taken.has(name)) return name;
  for (let i = 2; ; i++) if (!taken.has(`${name} (${i})`)) return `${name} (${i})`;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'board';

/** Download a board as a file. */
export function exportBoard(board: BoardDef) {
  const blob = new Blob([JSON.stringify(boardToFile(board), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug(board.name)}.aaboard.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ImportResult {
  board?: BoardDef;
  check?: BoardCheck;
  error?: string;
}

/** Read a board file the player picked. The board gets a new id so it never overwrites one. */
export async function readBoardFile(file: File): Promise<ImportResult> {
  if (file.size > 512 * 1024) return { error: 'That file is too big to be a board.' };
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return { error: 'That file is not a board file (it could not be read as JSON).' };
  }
  const { board, error } = boardFromFile(data, newBoardId());
  if (!board) return { error };
  board.name = uniqueName(board.name);
  return { board, check: validateBoard(board) };
}

/** Ask the player for a board file. Resolves with null if they cancel. */
export function pickBoardFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.aaboard.json,application/json';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
