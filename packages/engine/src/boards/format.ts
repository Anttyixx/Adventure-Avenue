import { connectTransports } from '../transport';
import { convertPortalTiles } from './portal-tiles';
/**
 * Custom boards: the file format players export and import, the rules a board must follow to
 * be playable, and helpers the board editor uses.
 */
import { K } from '../constants';
import type { BoardDef, BoardLayout, BoardSquareDef, District, PortalLink, SquareType } from '../types';

export const BOARD_FILE_FORMAT = 'adventure-avenue-board';
export const BOARD_FILE_VERSION = 1;

export const BOARD_LIMITS = {
  minCols: 4,
  maxCols: 32,
  minRows: 4,
  maxRows: 20,
  maxSquares: 320,
  minProperties: 4,
  maxDistricts: 12,
  /** Every declared district must contain exactly this many property tiles. */
  districtSize: 4,
  minBase: 50,
  maxBase: 2000,
  nameLength: 32,
};

/** Every board tile type. Property tiles use `shop`; vacant plots are chosen at game start. */
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
  'portal',
  'arcade',
  'cannon',
  'hike',
  'taxi',
  'swap',
  'warp',
];

/** What players download: the board plus a format tag so imports can be checked. */
export interface BoardFile {
  format: typeof BOARD_FILE_FORMAT;
  version: number;
  name: string;
  author?: string;
  /** Missing in files from before hex boards: those are square. */
  layout?: BoardLayout;
  cols: number;
  rows: number;
  districts: District[];
  squares: BoardSquareDef[];
  edges: [number, number][];
  /** One-way links, [from, to] (missing in older files: every road goes both ways). */
  oneWay?: [number, number][];
  /** Portal links between tile sides (missing in older files). */
  portalLinks?: PortalLink[];
}

export interface BoardCheck {
  errors: string[];
  warnings: string[];
  /** Every problem with the tiles it concerns, for showing problems on the tiles themselves. */
  issues: BoardIssue[];
}

/**
 * One problem with a board. Errors stop it from being played; warnings are worth fixing but the
 * game still runs.
 */
export interface BoardIssue {
  level: 'error' | 'warning';
  /** The problem as listed for the whole board. */
  text: string;
  /** Indices of the squares it concerns (none: about the board as a whole). */
  squares?: number[];
  /** How it reads when listed for one of those squares (defaults to `text`). */
  tileText?: string;
  /** A short mark for the square's badge, e.g. how many properties are missing (default "!"). */
  badge?: string;
}

const where = (s: { x: number; y: number }) => `(${s.x + 1}, ${s.y + 1})`;

/** The cells next to (x, y): 4 on a square grid, 6 on a hex grid (odd rows shifted right). */
export function neighborCells(layout: BoardLayout | undefined, x: number, y: number): [number, number][] {
  if (layout !== 'hex')
    return [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
  const s = y & 1; // odd rows sit half a cell to the right
  return [
    [x + 1, y],
    [x - 1, y],
    [x - 1 + s, y - 1],
    [x + s, y - 1],
    [x - 1 + s, y + 1],
    [x + s, y + 1],
  ];
}

export function areNeighbors(
  layout: BoardLayout | undefined,
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  return neighborCells(layout, a.x, a.y).some(([x, y]) => x === b.x && y === b.y);
}

/** Connect every pair of squares in neighboring cells, except pairs in `cuts`. */
export function autoEdges(
  squares: { x: number; y: number }[],
  cuts: Set<string> = new Set(),
  layout: BoardLayout = 'square',
): [number, number][] {
  const at = new Map(squares.map((s, i) => [`${s.x},${s.y}`, i]));
  const edges: [number, number][] = [];
  squares.forEach((s, i) => {
    for (const [x, y] of neighborCells(layout, s.x, s.y)) {
      const j = at.get(`${x},${y}`);
      if (j != null && j > i && !cuts.has(edgeKey(s, squares[j]))) edges.push([i, j]);
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
  const issues: BoardIssue[] = [];
  const L = BOARD_LIMITS;
  const sq = def.squares;
  const ix = (s: BoardSquareDef) => sq.indexOf(s);
  type Extra = Omit<BoardIssue, 'level' | 'text'>;
  const error = (text: string, extra: Extra = {}) => issues.push({ level: 'error', text, ...extra });
  const warn = (text: string, extra: Extra = {}) => issues.push({ level: 'warning', text, ...extra });
  const result = (): BoardCheck => ({
    errors: [...new Set(issues.filter((i) => i.level === 'error').map((i) => i.text))],
    warnings: [...new Set(issues.filter((i) => i.level === 'warning').map((i) => i.text))],
    issues,
  });

  if (!def.name?.trim()) error('Give the board a name.');
  if (def.cols < L.minCols || def.cols > L.maxCols || def.rows < L.minRows || def.rows > L.maxRows)
    error(`The grid must be ${L.minCols}-${L.maxCols} columns by ${L.minRows}-${L.maxRows} rows.`);
  if (sq.length > L.maxSquares) error(`A board can have at most ${L.maxSquares} squares.`);
  if (sq.length === 0) {
    error('Place some squares to build a board.');
    return result();
  }

  const cells = new Set<string>();
  sq.forEach((s, i) => {
    const k = `${s.x},${s.y}`;
    if (cells.has(k)) error(`Two squares share the cell ${where(s)}.`, { squares: [i] });
    cells.add(k);
    if (s.x < 0 || s.y < 0 || s.x >= def.cols || s.y >= def.rows)
      error(`Square ${where(s)} is outside the grid.`, { squares: [i], tileText: 'Outside the grid.' });
    if (!PLACEABLE.includes(s.t)) error(`Square ${where(s)} has an unknown type "${s.t}".`, { squares: [i] });
  });

  const banks = sq.filter((s) => s.t === 'bank');
  if (banks.length !== 1)
    error(banks.length ? 'A board needs exactly one bank.' : 'Add a bank: players start there.', {
      squares: banks.length > 1 ? banks.map(ix) : undefined,
    });

  const hasChange = sq.some((s) => s.t === 'change');
  const missing = (['spade', 'heart', 'diamond', 'club'] as SquareType[]).filter(
    (t) => !sq.some((s) => s.t === t),
  );
  if (missing.length && !hasChange)
    error(
      `Add the missing suit square${missing.length > 1 ? 's' : ''} (${missing.join(', ')}) or a change-of-suit square, so players can be promoted.`,
    );

  const props = sq.filter((s) => s.t === 'shop');
  if (props.length < L.minProperties) error(`Add at least ${L.minProperties} properties.`);
  if (def.districts.length === 0 && props.length) error('Add a district for the properties.');
  if (def.districts.length > L.maxDistricts) error(`A board can have at most ${L.maxDistricts} districts.`);
  for (const s of props) {
    if (s.d == null || s.d < 0 || s.d >= def.districts.length)
      error(`Property ${where(s)} has no district.`, {
        squares: [ix(s)],
        tileText: 'This property has no district.',
      });
  }
  def.districts.forEach((d, i) => {
    const own = props.filter((s) => s.d === i).map(ix);
    if (!d.name?.trim()) error(`District ${i + 1} needs a name.`, { squares: own });
    if (
      d.startingValue != null &&
      (!Number.isInteger(d.startingValue) ||
        d.startingValue < K.districtProperty.minAverage ||
        d.startingValue > K.districtProperty.maxAverage)
    )
      error(
        `District "${d.name}" needs a starting average between ${K.districtProperty.minAverage}G and ${K.districtProperty.maxAverage}G.`,
        { squares: own },
      );
    const n = own.length;
    if (n !== L.districtSize) {
      const short = L.districtSize - n;
      error(`District "${d.name}" has ${n} properties; it needs exactly ${L.districtSize}.`, {
        squares: own,
        tileText:
          short > 0
            ? `${d.name} has ${n} of ${L.districtSize} properties: add ${short} more.`
            : `${d.name} has ${n} properties: remove ${-short}.`,
        badge: short > 0 ? String(short) : '!',
      });
    }
  });
  if (def.districts.length === 1 && props.length)
    warn('Only one district: stocks and district bonuses work best with several.');

  // Warps and portals: each links to its pair (same kind, same color, both ways) or the bank.
  for (const type of ['warp', 'portal'] as const) {
    const Name = type === 'warp' ? 'Warp' : 'Portal';
    const tiles = sq.filter((s) => s.t === type);
    const colors = new Set(tiles.filter((s) => !s.toBank && s.channel != null).map((s) => s.channel));
    if (colors.size > 5) error(`Use at most five ${type} pairs.`);
    for (let c = 0; c < 5; c++) {
      const same = tiles.filter((s) => !s.toBank && s.channel === c);
      if (same.length > 2) error(`Only two ${type} tiles can share a color.`, { squares: same.map(ix) });
    }
    for (const s of tiles) {
      const i = ix(s),
        target = s.link == null ? null : sq[s.link];
      if (s.channel != null && (!Number.isInteger(s.channel) || s.channel < 0 || s.channel > 4))
        error(`Invalid ${type} color at ${where(s)}.`, { squares: [i] });
      if (!target || target === s)
        error(`${Name} ${where(s)} is not linked yet: link it to another ${type} or the bank.`, {
          squares: [i],
          tileText: `Not linked yet: link it to another ${type} or the bank.`,
        });
      else if (s.toBank) {
        if (target.t !== 'bank')
          error(`${Name} ${where(s)} must lead to the bank.`, {
            squares: [i],
            tileText: 'Must lead to the bank.',
          });
      } else if (target.t !== type || target.link !== i || target.channel !== s.channel)
        error(`${Name} ${where(s)} must be linked with its paired ${type}.`, {
          squares: [i],
          tileText: `Must be linked with its paired ${type}.`,
        });
    }
  }

  // Connections
  const nb: number[][] = sq.map(() => []);
  for (const [a, b] of def.edges) {
    if (!sq[a] || !sq[b] || a === b) {
      error('The board has a broken connection.');
      continue;
    }
    if (!areNeighbors(def.layout, sq[a], sq[b]))
      error(`Squares ${where(sq[a])} and ${where(sq[b])} are connected but not next to each other.`, {
        squares: [a, b],
      });
    nb[a].push(b);
    nb[b].push(a);
  }
  // Portal links: two different tiles, each through a side that faces an empty cell. A side
  // holds one two-way portal, or one entrance, or an exit with any number of entrances.
  const cellAt = new Map(sq.map((s, i) => [`${s.x},${s.y}`, i]));
  const sideCount = def.layout === 'hex' ? 6 : 4;
  const roles = new Map<string, { i: number; both: number; in: number; out: number }>();
  const role = (i: number, side: number) => {
    const key = `${i}:${side}`;
    if (!roles.has(key)) roles.set(key, { i, both: 0, in: 0, out: 0 });
    return roles.get(key)!;
  };
  for (const { a, b, sa, sb, oneWay } of def.portalLinks ?? []) {
    if (
      !sq[a] ||
      !sq[b] ||
      a === b ||
      ![sa, sb].every((s) => Number.isInteger(s) && s >= 0 && s < sideCount)
    ) {
      error('The board has a broken portal link.');
      continue;
    }
    if (oneWay) {
      role(a, sa).in++;
      role(b, sb).out++;
    } else {
      role(a, sa).both++;
      role(b, sb).both++;
    }
    if (nb[a].includes(b)) continue;
    nb[a].push(b);
    nb[b].push(a);
  }
  for (const [key, r] of roles) {
    const s = sq[r.i];
    const side = Number(key.split(':')[1]);
    const [x, y] = neighborCells(def.layout, s.x, s.y)[side];
    if (cellAt.has(`${x},${y}`))
      error(`The portal on square ${where(s)} opens onto another tile.`, {
        squares: [r.i],
        tileText: 'Its portal opens onto another tile: move one of them.',
      });
    if (r.both > 1 || (r.both && (r.in || r.out)))
      error(`Square ${where(s)} has more than one portal link on one side.`, { squares: [r.i] });
    else if (r.in > 1)
      error(`An entrance portal on square ${where(s)} leads to more than one exit.`, { squares: [r.i] });
    else if (r.in && r.out)
      error(`A portal on square ${where(s)} is both an entrance and an exit: make it two-way.`, {
        squares: [r.i],
      });
  }
  // One-way portal links: no way back from the exit.
  const portalNoGo = (def.portalLinks ?? [])
    .filter((l) => l.oneWay)
    .map((l) => [l.a, l.b] as [number, number]);
  // One-way links: each must be a road or portal link, and every tile needs a way in and out.
  const noGo = sq.map(() => new Set<number>());
  for (const [a, b] of [...(def.oneWay ?? []), ...portalNoGo]) {
    if (!nb[a]?.includes(b)) {
      error('The board has a broken one-way road.');
      continue;
    }
    noGo[b].add(a);
  }
  sq.forEach((s, i) => {
    if (!nb[i].length) return;
    if (nb[i].every((j) => noGo[i].has(j)))
      error(`Square ${where(s)} has no way out: its one-way roads all lead in.`, {
        squares: [i],
        tileText: 'No way out: its one-way roads all lead in.',
      });
    else if (nb[i].every((j) => noGo[j].has(i)))
      error(`Square ${where(s)} has no way in: its one-way roads all lead out.`, {
        squares: [i],
        tileText: 'No way in: its one-way roads all lead out.',
      });
  });
  // Warps reach their destination too (detached areas are only reachable this way).
  const reach = nb.map((n) => n.slice());
  sq.forEach((s, i) => {
    if ((s.t === 'warp' || s.t === 'portal') && s.link != null && sq[s.link]) reach[i].push(s.link);
  });
  sq.forEach((s, i) => {
    if (nb[i].length === 0 && sq.length > 1)
      error(`Square ${where(s)} is not connected to anything.`, {
        squares: [i],
        tileText: 'Not connected to anything: put it next to another tile.',
      });
    else if (nb[i].length === 1 && !(s.t === 'portal' && s.link != null && sq[s.link]))
      warn(`Square ${where(s)} is a dead end: players turn around there.`, {
        squares: [i],
        tileText: 'A dead end: players turn around here.',
      });
  });
  if (banks.length === 1) {
    const start = ix(banks[0]);
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      for (const n of reach[queue.shift()!]) {
        if (seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    const cut = sq.flatMap((_, i) => (seen.has(i) ? [] : [i]));
    // Lone tiles already say they aren't connected; mark the rest of a cut-off area.
    if (cut.length && cut.length < sq.length)
      error(
        `${cut.length} square${cut.length > 1 ? 's are' : ' is'} not reachable from the bank, e.g. ${where(sq[cut[0]])}.`,
        { squares: cut.filter((i) => nb[i].length > 0), tileText: 'Players can’t reach this from the bank.' },
      );
  }

  if (!sq.some((s) => s.t === 'venture'))
    warn('No venture squares: venture cards only come from stopping on suit squares.');
  if (sq.length < 16) warn('Small boards make for short, crowded games.');
  return result();
}

/** Turn a board into the file players export. */
export function boardToFile(def: BoardDef): BoardFile {
  return {
    format: BOARD_FILE_FORMAT,
    version: BOARD_FILE_VERSION,
    name: def.name,
    author: def.author,
    layout: def.layout ?? 'square',
    cols: def.cols,
    rows: def.rows,
    districts: def.districts.map((d) => ({
      name: d.name,
      color: d.color,
      ...(d.startingValue != null ? { startingValue: d.startingValue } : {}),
    })),
    squares: def.squares.map((s) => {
      const out: BoardSquareDef = { x: s.x, y: s.y, t: s.t };
      if (s.t === 'shop') {
        out.d = s.d;
        out.base = s.base;
        if (s.autoBase) out.autoBase = true;
        if (s.plot) out.plot = true;
      }
      if ((s.t === 'warp' || s.t === 'portal') && s.link != null) out.link = s.link;
      if (s.t === 'warp' || s.t === 'portal') {
        if (s.channel != null) out.channel = s.channel;
        if (s.toBank) out.toBank = true;
      }
      return out;
    }),
    edges: def.edges.map(([a, b]) => [a, b]),
    ...(def.oneWay?.length ? { oneWay: def.oneWay.map(([a, b]) => [a, b] as [number, number]) } : {}),
    ...(def.portalLinks?.length ? { portalLinks: def.portalLinks.map((l) => ({ ...l })) } : {}),
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
    const out: BoardSquareDef = {
      x: Math.floor(q.x),
      y: Math.floor(q.y),
      t: (q.t === ('back' as string) ? 'portal' : q.t) as SquareType,
    };
    if (q.t === 'shop') {
      out.d = isNum(q.d) ? Math.floor(q.d) : -1;
      out.base = isNum(q.base) ? Math.round(q.base) : 0;
      if (q.autoBase === true) out.autoBase = true;
      if (q.plot) out.plot = true;
    }
    if ((out.t === 'warp' || out.t === 'portal') && isNum(q.link)) out.link = Math.floor(q.link);
    if (isNum(q.channel)) out.channel = q.channel;
    if (q.toBank === true) out.toBank = true;
    squares.push(out);
  }
  if ((f.squares as { t: string }[]).some((s) => s.t === 'back')) connectTransports({ squares } as BoardDef);
  const edges: [number, number][] = [];
  for (const e of f.edges as unknown[]) {
    if (!Array.isArray(e) || !isNum(e[0]) || !isNum(e[1]))
      return { error: 'The board file has a damaged connection.' };
    edges.push([Math.floor(e[0]), Math.floor(e[1])]);
  }
  const oneWay: [number, number][] = [];
  for (const e of Array.isArray(f.oneWay) ? (f.oneWay as unknown[]) : [])
    if (Array.isArray(e) && isNum(e[0]) && isNum(e[1])) oneWay.push([Math.floor(e[0]), Math.floor(e[1])]);
  const portalLinks: PortalLink[] = [];
  for (const l of Array.isArray(f.portalLinks) ? (f.portalLinks as Partial<PortalLink>[]) : [])
    if (l && isNum(l.a) && isNum(l.b) && isNum(l.sa) && isNum(l.sb))
      portalLinks.push({
        a: Math.floor(l.a),
        b: Math.floor(l.b),
        sa: Math.floor(l.sa),
        sb: Math.floor(l.sb),
      });
  const districts: District[] = (f.districts as unknown[]).map((d, i) => {
    const q = d as Partial<District>;
    const color = typeof q?.color === 'string' && /^#[0-9a-f]{6}$/i.test(q.color) ? q.color : '#cccccc';
    const name = typeof q?.name === 'string' ? q.name.slice(0, 24) : `District ${i + 1}`;
    return { name, color, ...(isNum(q.startingValue) ? { startingValue: Math.round(q.startingValue) } : {}) };
  });
  const name = typeof f.name === 'string' ? f.name.slice(0, BOARD_LIMITS.nameLength) : 'Imported board';
  const bank = squares.findIndex((s) => s.t === 'bank');
  return {
    // Portal tiles are retired: they become portal links.
    board: convertPortalTiles({
      id,
      name,
      author: typeof f.author === 'string' ? f.author.slice(0, 32) : undefined,
      layout: f.layout === 'hex' ? 'hex' : 'square',
      cols: Math.floor(f.cols),
      rows: Math.floor(f.rows),
      districts,
      squares,
      edges,
      ...(oneWay.length ? { oneWay } : {}),
      ...(portalLinks.length ? { portalLinks } : {}),
      bank,
    }),
  };
}
