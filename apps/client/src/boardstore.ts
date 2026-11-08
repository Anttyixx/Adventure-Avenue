/**
 * Player-made boards: saved in this browser, exported as `.aaboard.json` files and imported
 * back. The built-in boards are always available and cannot be changed.
 */
import {
  BUILT_IN_BOARDS,
  connectTransports,
  convertPortalTiles,
  boardFromFile,
  boardToFile,
  validateBoard,
  type BoardCheck,
  type BoardDef,
} from '@aa/engine';

const KEY = 'adventure-avenue-boards';

export interface SavedBoard {
  id: string;
  savedAt: number;
  board: BoardDef;
}

export const BUILT_IN: BoardDef[] = BUILT_IN_BOARDS;

export function newBoardId() {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function listBoards(): SavedBoard[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedBoard[]) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter((b) => b?.board?.squares)
      .map((b) => {
        for (const sq of b.board.squares) if ((sq.t as string) === 'back') sq.t = 'portal';
        connectTransports(b.board);
        // Portal tiles are retired: they become portal links.
        return { ...b, board: convertPortalTiles(b.board) };
      });
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
  setBoardHidden(id, false);
  try {
    writeAll(listBoards().filter((b) => b.id !== id));
  } catch {
    /* ignore */
  }
}

/** Boards the player hid: kept in their collection, but not offered in game setup. */
const HIDDEN_KEY = 'adventure-avenue-hidden-boards';

export function hiddenBoards(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Hide a board from game setup, or show it again. */
export function setBoardHidden(id: string, hidden: boolean) {
  try {
    const list = hiddenBoards().filter((x) => x !== id);
    if (hidden) list.push(id);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

/** True for the boards that come with the game (they can't be removed or saved over). */
export const isBuiltIn = (id: string) => BUILT_IN.some((b) => b.id === id);

/** A board in the player's collection: built-in (`mine` false) or one they saved. */
export interface CollectionBoard {
  board: BoardDef;
  mine: boolean;
  /** Hidden from game setup (still in the collection). */
  hidden: boolean;
  savedAt?: number;
}

/** The player's board collection: the built-in boards, then their own boards. */
export function collection(): CollectionBoard[] {
  const hidden = new Set(hiddenBoards());
  return [
    ...BUILT_IN.map((board) => ({ board, mine: false, hidden: hidden.has(board.id) })),
    ...listBoards().map((b) => ({
      board: b.board,
      mine: true,
      hidden: hidden.has(b.id),
      savedAt: b.savedAt,
    })),
  ];
}

/**
 * The boards game setup offers: the collection without the hidden ones. Never empty: with every
 * board hidden, the whole collection is offered.
 */
export function shownBoards(): CollectionBoard[] {
  const all = collection();
  const shown = all.filter((b) => !b.hidden);
  return shown.length ? shown : all;
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

/** Remove unused outer cells for play, keeping the editor's saved grid intact. */
export function boardForPlay(board: BoardDef): BoardDef {
  const out = structuredClone(board);
  if (!out.squares.length) return out;
  const minY = Math.min(...out.squares.map((s) => s.y));
  // An odd-row hex origin changes the stagger. Convert through axial coordinates so roads
  // keep exactly the same shape and connections after shifting the origin.
  const xs = out.squares.map((s) =>
    out.layout === 'hex' ? s.x - (s.y - (s.y & 1)) / 2 + (s.y - minY - ((s.y - minY) & 1)) / 2 : s.x,
  );
  const minX = Math.min(...xs);
  out.squares.forEach((s, i) => {
    s.x = xs[i] - minX;
    s.y -= minY;
  });
  out.cols = Math.max(...out.squares.map((s) => s.x)) + 1;
  out.rows = Math.max(...out.squares.map((s) => s.y)) + 1;
  return out;
}
