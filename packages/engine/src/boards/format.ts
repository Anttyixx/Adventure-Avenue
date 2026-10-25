/**
 * Custom boards: the file format players export and import, the rules a board must follow to
 * be playable, and helpers the board editor uses.
 */
import type { BoardDef, BoardSquareDef, District, SquareType } from '../types';

export const BOARD_FILE_FORMAT = 'adventure-avenue-board';
export const BOARD_FILE_VERSION = 1;

export const BOARD_LIMITS = {
  minCols: 4,
  maxCols: 20,
  minRows: 4,
  maxRows: 14,
  maxSquares: 140,
  minProperties: 4,
  maxDistricts: 8,
  minBase: 50,
  maxBase: 2000,
  nameLength: 32,
};

/** Every square type a board may use. `plot` is stored as a shop with `plot: true`. */
export const PLACEABLE: SquareType[] = [
  'shop',
  'bank',
  'venture',
  'spade',
  'heart',
  'diamond',
  'club',
  'change',
  'roll',
  'break',
  'boon',
  'boom',
  'broker',
  'back',
  'arcade',
  'cannon',
];

/** What players download: the board plus a format tag so imports can be checked. */
export interface BoardFile {
  format: typeof BOARD_FILE_FORMAT;
  version: number;
  name: string;
  author?: string;
  cols: number;
  rows: number;
  districts: District[];
  squares: BoardSquareDef[];
  edges: [number, number][];
}

export interface BoardCheck {
  errors: string[];
  warnings: string[];
}

const where = (s: { x: number; y: number }) => `(${s.x + 1}, ${s.y + 1})`;

/** Connect every pair of squares in orthogonally neighboring cells, except pairs in `cuts`. */
export function autoEdges(
  squares: { x: number; y: number }[],
  cuts: Set<string> = new Set(),
): [number, number][] {
  const at = new Map(squares.map((s, i) => [`${s.x},${s.y}`, i]));
  const edges: [number, number][] = [];
  squares.forEach((s, i) => {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      const j = at.get(`${s.x + dx},${s.y + dy}`);
      if (j != null && !cuts.has(edgeKey(s, squares[j]))) edges.push([i, j]);
    }
  });
  return edges;
}

/** Key for the link between two neighboring cells, independent of order. */
export function edgeKey(a: { x: number; y: number }, b: { x: number; y: number }) {
  const [p, q] = a.x < b.x || (a.x === b.x && a.y < b.y) ? [a, b] : [b, a];
  return `${p.x},${p.y}|${q.x},${q.y}`;
}

/** Check that a board can be played. Errors block play; warnings are worth a look. */
export function validateBoard(def: BoardDef): BoardCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const L = BOARD_LIMITS;
  const sq = def.squares;

  if (!def.name?.trim()) errors.push('Give the board a name.');
  if (def.cols < L.minCols || def.cols > L.maxCols || def.rows < L.minRows || def.rows > L.maxRows)
    errors.push(`The grid must be ${L.minCols}-${L.maxCols} columns by ${L.minRows}-${L.maxRows} rows.`);
  if (sq.length > L.maxSquares) errors.push(`A board can have at most ${L.maxSquares} squares.`);
  if (sq.length === 0) {
    errors.push('Place some squares to build a board.');
    return { errors, warnings };
  }

  const cells = new Set<string>();
  for (const s of sq) {
    const k = `${s.x},${s.y}`;
    if (cells.has(k)) errors.push(`Two squares share the cell ${where(s)}.`);
    cells.add(k);
    if (s.x < 0 || s.y < 0 || s.x >= def.cols || s.y >= def.rows)
      errors.push(`Square ${where(s)} is outside the grid.`);
    if (!PLACEABLE.includes(s.t)) errors.push(`Square ${where(s)} has an unknown type "${s.t}".`);
  }

  const banks = sq.filter((s) => s.t === 'bank');
  if (banks.length !== 1)
    errors.push(banks.length ? 'A board needs exactly one bank.' : 'Add a bank: players start there.');

  const hasChange = sq.some((s) => s.t === 'change');
  const missing = (['spade', 'heart', 'diamond', 'club'] as SquareType[]).filter(
    (t) => !sq.some((s) => s.t === t),
  );
  if (missing.length && !hasChange)
    errors.push(
      `Add the missing suit square${missing.length > 1 ? 's' : ''} (${missing.join(', ')}) or a change-of-suit square, so players can be promoted.`,
    );

  const props = sq.filter((s) => s.t === 'shop');
  if (props.length < L.minProperties) errors.push(`Add at least ${L.minProperties} shops.`);
  if (def.districts.length === 0 && props.length) errors.push('Add a district for the shops.');
  if (def.districts.length > L.maxDistricts)
    errors.push(`A board can have at most ${L.maxDistricts} districts.`);
  for (const s of props) {
    if (s.d == null || s.d < 0 || s.d >= def.districts.length)
      errors.push(`Shop ${where(s)} has no district.`);
    const base = s.base ?? 0;
    if (!s.plot && (base < L.minBase || base > L.maxBase))
      errors.push(`Shop ${where(s)} needs a value between ${L.minBase}G and ${L.maxBase}G.`);
  }
  def.districts.forEach((d, i) => {
    if (!d.name?.trim()) errors.push(`District ${i + 1} needs a name.`);
    if (!props.some((s) => s.d === i)) warnings.push(`District "${d.name}" has no squares.`);
    else if (props.filter((s) => s.d === i).every((s) => s.plot))
      warnings.push(
        `District "${d.name}" only has vacant plots, so it has no stock price until one is built.`,
      );
  });

  const backs = sq.filter((s) => s.t === 'back').length;
  if (backs !== 0 && backs !== 2) errors.push('Backstreets come in pairs: use exactly two (or none).');

  // Connections
  const nb: number[][] = sq.map(() => []);
  for (const [a, b] of def.edges) {
    if (!sq[a] || !sq[b] || a === b) {
      errors.push('The board has a broken connection.');
      continue;
    }
    if (Math.abs(sq[a].x - sq[b].x) + Math.abs(sq[a].y - sq[b].y) !== 1)
      errors.push(`Squares ${where(sq[a])} and ${where(sq[b])} are connected but not next to each other.`);
    nb[a].push(b);
    nb[b].push(a);
  }
  sq.forEach((s, i) => {
    if (nb[i].length === 0 && sq.length > 1) errors.push(`Square ${where(s)} is not connected to anything.`);
    else if (nb[i].length === 1)
      warnings.push(`Square ${where(s)} is a dead end: players turn around there.`);
  });
  if (banks.length === 1) {
    const start = sq.indexOf(banks[0]);
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      for (const n of nb[queue.shift()!]) {
        if (seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    const cut = sq.filter((_, i) => !seen.has(i));
    if (cut.length && cut.length < sq.length)
      errors.push(
        `${cut.length} square${cut.length > 1 ? 's are' : ' is'} not reachable from the bank, e.g. ${where(cut[0])}.`,
      );
  }

  if (!sq.some((s) => s.t === 'venture'))
    warnings.push('No venture squares: venture cards only come from stopping on suit squares.');
  if (sq.length < 16) warnings.push('Small boards make for short, crowded games.');
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

/** Turn a board into the file players export. */
export function boardToFile(def: BoardDef): BoardFile {
  return {
    format: BOARD_FILE_FORMAT,
    version: BOARD_FILE_VERSION,
    name: def.name,
    author: def.author,
    cols: def.cols,
    rows: def.rows,
    districts: def.districts.map((d) => ({ name: d.name, color: d.color })),
    squares: def.squares.map((s) => {
      const out: BoardSquareDef = { x: s.x, y: s.y, t: s.t };
      if (s.t === 'shop') {
        out.d = s.d;
        out.base = s.base;
        if (s.plot) out.plot = true;
      }
      return out;
    }),
    edges: def.edges.map(([a, b]) => [a, b]),
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Read a board file (already JSON-parsed). Returns the board when its shape is right; the
 * caller should still run `validateBoard` before playing on it.
 */
export function boardFromFile(data: unknown, id: string): { board?: BoardDef; error?: string } {
  const f = data as Partial<BoardFile> | null;
  if (!f || typeof f !== 'object' || f.format !== BOARD_FILE_FORMAT)
    return { error: 'This is not an Adventure Avenue board file.' };
  if (!isNum(f.version) || f.version > BOARD_FILE_VERSION)
    return { error: 'This board was made with a newer version of the game.' };
  if (
    !isNum(f.cols) ||
    !isNum(f.rows) ||
    !Array.isArray(f.squares) ||
    !Array.isArray(f.edges) ||
    !Array.isArray(f.districts)
  )
    return { error: 'The board file is damaged or incomplete.' };
  const squares: BoardSquareDef[] = [];
  for (const s of f.squares as unknown[]) {
    const q = s as Partial<BoardSquareDef>;
    if (!q || !isNum(q.x) || !isNum(q.y) || typeof q.t !== 'string')
      return { error: 'The board file has a damaged square.' };
    const out: BoardSquareDef = { x: Math.floor(q.x), y: Math.floor(q.y), t: q.t as SquareType };
    if (q.t === 'shop') {
      out.d = isNum(q.d) ? Math.floor(q.d) : -1;
      out.base = isNum(q.base) ? Math.round(q.base) : 0;
      if (q.plot) out.plot = true;
    }
    squares.push(out);
  }
  const edges: [number, number][] = [];
  for (const e of f.edges as unknown[]) {
    if (!Array.isArray(e) || !isNum(e[0]) || !isNum(e[1]))
      return { error: 'The board file has a damaged connection.' };
    edges.push([Math.floor(e[0]), Math.floor(e[1])]);
  }
  const districts: District[] = (f.districts as unknown[]).map((d, i) => {
    const q = d as Partial<District>;
    const color = typeof q?.color === 'string' && /^#[0-9a-f]{6}$/i.test(q.color) ? q.color : '#cccccc';
    const name = typeof q?.name === 'string' ? q.name.slice(0, 24) : `District ${i + 1}`;
    return { name, color };
  });
  const name = typeof f.name === 'string' ? f.name.slice(0, BOARD_LIMITS.nameLength) : 'Imported board';
  const bank = squares.findIndex((s) => s.t === 'bank');
  return {
    board: {
      id,
      name,
      author: typeof f.author === 'string' ? f.author.slice(0, 32) : undefined,
      cols: Math.floor(f.cols),
      rows: Math.floor(f.rows),
      districts,
      squares,
      edges,
      bank,
    },
  };
}
