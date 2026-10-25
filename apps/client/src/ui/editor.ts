/**
 * Board editor (#editor): paint squares on a grid, set up districts and shop values, check the
 * board for problems, save it in this browser, export/import board files and test-play it.
 *
 * Squares in neighboring cells connect automatically; the Links tool cuts or restores a single
 * connection. The preview is drawn with the same painter as the game board.
 */
import {
  BOARD_LIMITS,
  BUILT_IN_BOARDS,
  autoEdges,
  edgeKey,
  newGame,
  validateBoard,
  type BoardDef,
  type BoardLayout,
  type BoardSquareDef,
  type SquareType,
} from '@aa/engine';
import { paintBoard, worldSize } from '../board';
import { cellAt, cellCenter, tileShape } from '../geometry';
import {
  deleteBoard,
  exportBoard,
  listBoards,
  newBoardId,
  pickBoardFile,
  readBoardFile,
  saveBoard,
} from '../boardstore';
import { clear, h } from './dom';
import { boardThumb } from './thumb';

type Tool = SquareType | 'plot' | 'select' | 'erase' | 'link';

const PALETTE: { group: string; items: { tool: Tool; label: string; hint: string }[] }[] = [
  {
    group: 'Tools',
    items: [
      { tool: 'select', label: 'Select', hint: 'Pick a square to edit its details.' },
      { tool: 'erase', label: 'Erase', hint: 'Remove squares (click or drag).' },
      { tool: 'link', label: 'Links', hint: 'Click a link between two squares to cut or restore it.' },
    ],
  },
  {
    group: 'Property',
    items: [
      { tool: 'shop', label: 'Shop', hint: 'A shop in the active district.' },
      { tool: 'plot', label: 'Vacant plot', hint: 'Standard rules: players build here. Easy rules: a shop.' },
    ],
  },
  {
    group: 'Core',
    items: [
      { tool: 'bank', label: 'Bank', hint: 'Start square; promotions and wins happen here. Exactly one.' },
      { tool: 'spade', label: '♠ Spade', hint: 'Suit square.' },
      { tool: 'heart', label: '♥ Heart', hint: 'Suit square.' },
      { tool: 'diamond', label: '♦ Diamond', hint: 'Suit square.' },
      { tool: 'club', label: '♣ Club', hint: 'Suit square.' },
      { tool: 'change', label: 'Change suit', hint: 'Gives its current suit, then rotates.' },
      { tool: 'venture', label: 'Venture', hint: 'Flip a venture card.' },
    ],
  },
  {
    group: 'Special',
    items: [
      { tool: 'roll', label: 'Roll-on', hint: 'Roll again.' },
      { tool: 'break', label: 'Take-a-break', hint: 'Your shops close until your next turn.' },
      { tool: 'boon', label: 'Boon', hint: '20% commission on fees.' },
      { tool: 'boom', label: 'Boom', hint: '50% commission on fees.' },
      { tool: 'broker', label: 'Stockbroker', hint: 'Buy stock (a venture square in Easy rules).' },
      { tool: 'back', label: 'Backstreet', hint: 'Warps to the other backstreet. Use two.' },
      { tool: 'arcade', label: 'Arcade', hint: 'Plays a minigame.' },
      { tool: 'cannon', label: 'Cannon', hint: 'Fires you to another player.' },
    ],
  },
];

const DISTRICT_COLORS = [
  '#f2a7a0',
  '#9fd3f0',
  '#a8e0a0',
  '#f5d77a',
  '#cdb4f0',
  '#8fe3d6',
  '#f7bfdc',
  '#ffc59e',
];
const DISTRICT_NAMES = [
  'Brick Row',
  'Bay Market',
  'Greenway',
  'Gold Street',
  'Lilac Lane',
  'Tide Walk',
  'Plaza',
  'Maple Court',
];

function blankBoard(cols = 12, rows = 7, layout: BoardLayout = 'square'): BoardDef {
  return {
    id: newBoardId(),
    name: 'My board',
    layout,
    cols,
    rows,
    districts: [
      { name: DISTRICT_NAMES[0], color: DISTRICT_COLORS[0] },
      { name: DISTRICT_NAMES[1], color: DISTRICT_COLORS[1] },
    ],
    squares: [],
    edges: [],
    bank: -1,
  };
}

/** A ready-to-play loop around the edge of the grid, to start from. */
function starterLoop(cols = 10, rows = 6): BoardDef {
  const b = blankBoard(cols, rows);
  b.name = 'Starter loop';
  b.districts = DISTRICT_NAMES.slice(0, 4).map((name, i) => ({ name, color: DISTRICT_COLORS[i] }));
  const ring: [number, number][] = [];
  for (let x = 0; x < cols; x++) ring.push([x, 0]);
  for (let y = 1; y < rows; y++) ring.push([cols - 1, y]);
  for (let x = cols - 2; x >= 0; x--) ring.push([x, rows - 1]);
  for (let y = rows - 2; y >= 1; y--) ring.push([0, y]);
  const n = ring.length;
  const bankAt = ring.findIndex(([x, y]) => y === rows - 1 && x === Math.floor(cols / 2));
  const special = new Map<number, SquareType>([
    [bankAt, 'bank'],
    [0, 'spade'],
    [cols - 1, 'heart'],
    [cols - 1 + rows - 1, 'diamond'],
    [cols - 1 + rows - 1 + cols - 1, 'club'],
    [Math.floor(cols / 2), 'venture'],
    [cols - 1 + Math.floor(rows / 2), 'venture'],
    [(bankAt + 3) % n, 'arcade'],
    [n - Math.floor(rows / 2), 'roll'],
  ]);
  let k = 0;
  b.squares = ring.map(([x, y], i) => {
    const t = special.get(i);
    if (t) return { x, y, t };
    const d = Math.min(3, Math.floor((i / n) * 4));
    return { x, y, t: 'shop', d, base: 160 + d * 40 + (k++ % 3) * 20 };
  });
  b.edges = autoEdges(b.squares);
  b.bank = b.squares.findIndex((s) => s.t === 'bank');
  return b;
}

/**
 * A hex starter: a winding loop around a lake with a shortcut across, written in axial hex
 * steps and converted to the editor's offset grid.
 */
function hexStarter(): BoardDef {
  const loop = [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, -1],
    [5, -1],
    [6, -2],
    [7, -2],
    [8, -3],
    [9, -4],
    [9, -5],
    [10, -6],
    [10, -7],
    [10, -8],
    [9, -8],
    [9, -9],
    [8, -9],
    [7, -9],
    [6, -9],
    [5, -9],
    [4, -8],
    [3, -8],
    [2, -8],
    [1, -7],
    [0, -7],
    [-1, -6],
    [-2, -5],
    [-2, -4],
    [-3, -3],
    [-3, -2],
    [-3, -1],
    [-2, -1],
    [-2, 0],
    [-1, 0],
  ];
  const shortcut = [
    [4, -2],
    [5, -3],
    [6, -4],
    [7, -5],
    [8, -6],
    [8, -7],
  ];
  // Axial -> odd-row offset; rows shift by an even amount so the half-cell offsets stay put.
  const cell = ([q, r]: number[]) => ({ x: q + (r - (r & 1)) / 2 + 8, y: r + 10 });
  const special: Record<number, SquareType> = {
    0: 'bank',
    3: 'venture',
    7: 'spade',
    10: 'roll',
    13: 'venture',
    16: 'heart',
    19: 'boon',
    22: 'venture',
    24: 'diamond',
    26: 'break',
    30: 'club',
    32: 'cannon',
  };
  const b = blankBoard(17, 12, 'hex');
  b.name = 'Lakeside';
  b.districts = DISTRICT_NAMES.slice(0, 6).map((name, i) => ({ name, color: DISTRICT_COLORS[i] }));
  const district = (i: number) => (i < 5 || i > 30 ? 0 : i < 10 ? 1 : i < 16 ? 2 : i < 23 ? 3 : 4);
  b.squares = loop.map((c, i) => {
    const t = special[i];
    if (t) return { ...cell(c), t };
    return {
      ...cell(c),
      t: 'shop',
      d: district(i),
      base: 160 + ((i * 3) % 8) * 20,
      ...(i === 9 || i === 28 ? { plot: true } : {}),
    };
  });
  const kinds: SquareType[] = ['shop', 'shop', 'boom', 'shop', 'shop', 'broker'];
  shortcut.forEach((c, j) =>
    b.squares.push(
      kinds[j] === 'shop' ? { ...cell(c), t: 'shop', d: 5, base: 320 + j * 20 } : { ...cell(c), t: kinds[j] },
    ),
  );
  b.edges = autoEdges(b.squares, new Set(), 'hex');
  b.bank = 0;
  return b;
}

/** A ring around the edge of a hex grid, to start a hex board from. */
function hexLoop(cols = 11, rows = 7): BoardDef {
  const b = starterLoop(cols, rows);
  b.layout = 'hex';
  b.name = 'Hex loop';
  b.edges = autoEdges(b.squares, new Set(), 'hex');
  return b;
}

export interface EditorHandlers {
  onExit(): void;
  onPlay(board: BoardDef): void;
}

export function openEditor(app: HTMLElement, initial: BoardDef | null, handlers: EditorHandlers) {
  let board: BoardDef = structuredClone(initial ?? starterLoop());
  // Cut links are remembered as cell pairs so they survive edits to other squares.
  let cuts = new Set<string>();
  const deriveCuts = () => {
    // A board with no stored connections (e.g. brand new) has nothing cut.
    if (!board.edges.length) {
      cuts = new Set();
      return;
    }
    const auto = autoEdges(board.squares, new Set(), board.layout);
    const have = new Set(board.edges.map(([a, b]) => edgeKey(board.squares[a], board.squares[b])));
    cuts = new Set(
      auto
        .filter(([a, b]) => !have.has(edgeKey(board.squares[a], board.squares[b])))
        .map(([a, b]) => edgeKey(board.squares[a], board.squares[b])),
    );
  };
  deriveCuts();
  let tool: Tool = 'shop';
  let district = 0;
  let selected: number | null = null;
  let hover: { x: number; y: number } | null = null;
  let savedJSON = JSON.stringify(board);
  const undo: string[] = [];

  const root = h('div', { class: 'editor' });
  app.append(root);

  // ------------------------------------------------------------ layout

  const nameInput = h('input', {
    class: 'ed-name',
    maxlength: String(BOARD_LIMITS.nameLength),
  }) as HTMLInputElement;
  const status = h('span', { class: 'ed-status' });
  const topbar = h(
    'div',
    { class: 'ed-top glass' },
    h('button', { class: 'btn small ghost', onclick: () => leave() }, '← Back'),
    nameInput,
    status,
    h('span', { class: 'ed-spacer' }),
    h('button', { class: 'btn small', onclick: () => newBoardDialog() }, 'New'),
    h('button', { class: 'btn small', onclick: () => myBoardsDialog() }, 'My boards'),
    h('button', { class: 'btn small', onclick: () => doUndo(), title: 'Undo (Ctrl+Z)' }, 'Undo'),
    h('button', { class: 'btn small', onclick: () => doSave() }, 'Save'),
    h('button', { class: 'btn small', onclick: () => doImport() }, 'Import'),
    h('button', { class: 'btn small', onclick: () => doExport() }, 'Export'),
    h('button', { class: 'btn small main', onclick: () => doPlay() }, 'Test play'),
  );
  const palette = h('div', { class: 'ed-palette glass' });
  const stage = h('div', { class: 'ed-stage' });
  const canvas = h('canvas', { class: 'ed-canvas' }) as HTMLCanvasElement;
  stage.append(canvas);
  const inspector = h('div', { class: 'ed-inspector glass' });
  const toast = h('div', { class: 'ed-toast' });
  root.append(topbar, h('div', { class: 'ed-main' }, palette, stage, inspector), toast);

  const say = (text: string, bad = false) => {
    toast.textContent = text;
    toast.className = `ed-toast show ${bad ? 'bad' : ''}`;
    clearTimeout((say as unknown as { t: number }).t);
    (say as unknown as { t: number }).t = window.setTimeout(() => (toast.className = 'ed-toast'), 2600);
  };

  // ------------------------------------------------------------ model helpers

  const recompute = () => {
    board.edges = autoEdges(board.squares, cuts, board.layout);
    board.bank = board.squares.findIndex((s) => s.t === 'bank');
  };
  const snapshot = () => {
    undo.push(JSON.stringify({ board, cuts: [...cuts] }));
    if (undo.length > 100) undo.shift();
  };
  const changed = () => {
    recompute();
    redraw();
    drawInspector();
  };
  const doUndo = () => {
    const last = undo.pop();
    if (!last) return say('Nothing to undo.');
    const s = JSON.parse(last) as { board: BoardDef; cuts: string[] };
    board = s.board;
    cuts = new Set(s.cuts);
    selected = null;
    nameInput.value = board.name;
    changed();
  };
  const indexAt = (x: number, y: number) => board.squares.findIndex((s) => s.x === x && s.y === y);
  const center = (c: { x: number; y: number }) => cellCenter(board.layout, c.x, c.y);

  const place = (x: number, y: number) => {
    const i = indexAt(x, y);
    if (tool === 'erase') {
      if (i < 0) return false;
      board.squares.splice(i, 1);
      if (selected === i) selected = null;
      else if (selected != null && selected > i) selected--;
      return true;
    }
    if (tool === 'select' || tool === 'link') return false;
    const t: SquareType = tool === 'plot' ? 'shop' : tool;
    if (t === 'shop' && !board.districts.length) {
      board.districts.push({ name: DISTRICT_NAMES[0], color: DISTRICT_COLORS[0] });
      district = 0;
    }
    const prev = i >= 0 ? board.squares[i] : null;
    const sq: BoardSquareDef =
      t === 'shop'
        ? {
            x,
            y,
            t,
            d: district,
            base: prev?.t === 'shop' && prev.base ? prev.base : 160 + district * 30,
            ...(tool === 'plot' ? { plot: true } : {}),
          }
        : { x, y, t };
    if (prev && JSON.stringify(prev) === JSON.stringify(sq)) return false;
    if (t === 'bank') {
      // Only one bank: moving it replaces the old one.
      const old = board.squares.findIndex((s) => s.t === 'bank');
      if (old >= 0 && old !== i) board.squares.splice(old, 1);
    }
    const j = indexAt(x, y);
    if (j >= 0) board.squares[j] = sq;
    else board.squares.push(sq);
    selected = indexAt(x, y);
    return true;
  };

  // ------------------------------------------------------------ canvas

  let scale = 1;
  let ox = 0;
  let oy = 0;
  const preview = () =>
    newGame({
      rules: 'standard',
      target: 5000,
      roundCap: 0,
      seats: [{ name: 'Editor', cpu: true, ch: { head: 0, hair: 0, skin: 0, accent: 0 } }],
      board: { ...board, id: 'custom:editor', bank: Math.max(0, board.bank) },
      seed: 1,
    });

  const redraw = () => {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
    const { w, h: hh } = worldSize(board);
    scale = Math.min(r.width / w, r.height / hh);
    ox = (r.width - w * scale) / 2;
    oy = (r.height - hh * scale) / 2;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#16213f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, oy * dpr);
    const G = preview();
    paintBoard(ctx, G);
    // Empty cells
    const used = new Set(board.squares.map((s) => `${s.x},${s.y}`));
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    for (let y = 0; y < board.rows; y++)
      for (let x = 0; x < board.cols; x++) {
        if (used.has(`${x},${y}`)) continue;
        const c = center({ x, y });
        tileShape(ctx, board.layout, c.x, c.y, 40, 12);
        ctx.stroke();
      }
    ctx.setLineDash([]);
    // Links
    if (tool === 'link') {
      for (const [a, b, key] of neighborPairs()) {
        const pa = center(board.squares[a]);
        const pb = center(board.squares[b]);
        const mx = (pa.x + pb.x) / 2;
        const my = (pa.y + pb.y) / 2;
        const cut = cuts.has(key);
        ctx.beginPath();
        ctx.arc(mx, my, 13, 0, Math.PI * 2);
        ctx.fillStyle = cut ? '#e5484d' : '#30a46c';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.beginPath();
        if (cut) {
          ctx.moveTo(mx - 5, my - 5);
          ctx.lineTo(mx + 5, my + 5);
          ctx.moveTo(mx + 5, my - 5);
          ctx.lineTo(mx - 5, my + 5);
        } else {
          ctx.moveTo(mx - 6, my);
          ctx.lineTo(mx + 6, my);
        }
        ctx.stroke();
      }
    }
    // Hover and selection
    if (hover && tool !== 'link') {
      const c = center(hover);
      ctx.lineWidth = 4;
      ctx.strokeStyle = tool === 'erase' ? '#e5484d' : '#ffd166';
      tileShape(ctx, board.layout, c.x, c.y, 46, 14);
      ctx.stroke();
    }
    if (selected != null && board.squares[selected]) {
      const c = center(board.squares[selected]);
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#4cc9f0';
      ctx.setLineDash([10, 6]);
      tileShape(ctx, board.layout, c.x, c.y, 48, 15);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Cell coordinates along the edges
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '16px "Atkinson Hyperlegible", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let x = 0; x < board.cols; x++) ctx.fillText(String(x + 1), center({ x, y: 0 }).x, 22);
    for (let y = 0; y < board.rows; y++) ctx.fillText(String(y + 1), 22, center({ x: 0, y }).y);
  };

  /** Every pair of squares in neighboring cells, with its link key. */
  const neighborPairs = (): [number, number, string][] => {
    const out: [number, number, string][] = [];
    for (const [a, b] of autoEdges(board.squares, new Set(), board.layout))
      out.push([a, b, edgeKey(board.squares[a], board.squares[b])]);
    return out;
  };

  const toWorld = (e: PointerEvent | MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - ox) / scale, y: (e.clientY - r.top - oy) / scale };
  };
  const toCell = (e: PointerEvent | MouseEvent) => {
    const w = toWorld(e);
    return cellAt(board.layout, board.cols, board.rows, w.x, w.y);
  };

  let painting = false;
  let paintedThisStroke = false;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    if (tool === 'link') {
      const w = toWorld(e);
      for (const [a, b, key] of neighborPairs()) {
        const pa = center(board.squares[a]);
        const pb = center(board.squares[b]);
        if (Math.hypot((pa.x + pb.x) / 2 - w.x, (pa.y + pb.y) / 2 - w.y) < 24) {
          snapshot();
          if (cuts.has(key)) cuts.delete(key);
          else cuts.add(key);
          changed();
          return;
        }
      }
      return;
    }
    const cell = toCell(e);
    if (!cell) return;
    if (tool === 'select') {
      const i = indexAt(cell.x, cell.y);
      selected = i >= 0 ? i : null;
      redraw();
      drawInspector();
      return;
    }
    painting = true;
    paintedThisStroke = false;
    snapshot();
    if (place(cell.x, cell.y)) paintedThisStroke = true;
    changed();
  });
  canvas.addEventListener('pointermove', (e) => {
    const cell = toCell(e);
    const moved = cell?.x !== hover?.x || cell?.y !== hover?.y;
    hover = cell;
    if (painting && cell && moved && place(cell.x, cell.y)) {
      paintedThisStroke = true;
      changed();
    } else if (moved) redraw();
  });
  const endStroke = () => {
    if (painting && !paintedThisStroke) undo.pop();
    painting = false;
  };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    redraw();
  });

  // ------------------------------------------------------------ palette

  const drawPalette = () => {
    clear(palette);
    for (const g of PALETTE) {
      palette.append(h('h4', null, g.group));
      const row = h('div', { class: 'ed-tools' });
      for (const it of g.items) {
        row.append(
          h(
            'button',
            {
              class: `ed-tool ${tool === it.tool ? 'on' : ''}`,
              title: it.hint,
              onclick: () => {
                tool = it.tool;
                drawPalette();
                redraw();
                say(it.hint);
              },
            },
            it.label,
          ),
        );
      }
      palette.append(row);
    }
  };

  // ------------------------------------------------------------ inspector

  const field = (label: string, input: HTMLElement) =>
    h('label', { class: 'ed-field' }, h('span', null, label), input);

  const drawInspector = () => {
    clear(inspector);
    nameInput.value = board.name;
    const unsaved = JSON.stringify(board) !== savedJSON;
    const inList = listBoards().some((b) => b.id === board.id);
    status.textContent = !inList ? 'Not saved yet' : unsaved ? 'Unsaved changes' : 'Saved';
    status.classList.toggle('unsaved', unsaved || !inList);

    // Board settings
    const cols = h('input', {
      type: 'number',
      min: String(BOARD_LIMITS.minCols),
      max: String(BOARD_LIMITS.maxCols),
      value: String(board.cols),
      class: 'num',
    }) as HTMLInputElement;
    const rows = h('input', {
      type: 'number',
      min: String(BOARD_LIMITS.minRows),
      max: String(BOARD_LIMITS.maxRows),
      value: String(board.rows),
      class: 'num',
    }) as HTMLInputElement;
    const resize = () => {
      const c = Math.max(
        BOARD_LIMITS.minCols,
        Math.min(BOARD_LIMITS.maxCols, Math.floor(Number(cols.value)) || board.cols),
      );
      const r = Math.max(
        BOARD_LIMITS.minRows,
        Math.min(BOARD_LIMITS.maxRows, Math.floor(Number(rows.value)) || board.rows),
      );
      const lost = board.squares.filter((s) => s.x >= c || s.y >= r).length;
      if (lost && !confirm(`Shrinking the grid removes ${lost} square${lost > 1 ? 's' : ''}. Continue?`))
        return drawInspector();
      snapshot();
      board.cols = c;
      board.rows = r;
      board.squares = board.squares.filter((s) => s.x < c && s.y < r);
      selected = null;
      changed();
    };
    cols.onchange = resize;
    rows.onchange = resize;
    const author = h('input', {
      value: board.author ?? '',
      maxlength: '32',
      placeholder: 'Your name',
    }) as HTMLInputElement;
    author.onchange = () => {
      board.author = author.value.trim() || undefined;
      drawInspector();
    };
    // Grid layout: square or hex. Squares keep their cells; connections are recalculated.
    const layoutBtn = (l: BoardLayout, label: string) =>
      h(
        'button',
        {
          class: `btn small ${(board.layout ?? 'square') === l ? 'on' : 'ghost'}`,
          onclick: () => {
            if ((board.layout ?? 'square') === l) return;
            if (
              board.squares.length &&
              !confirm(
                `Switch to a ${label.toLowerCase()}? Squares stay in their cells, but which squares connect will change.`,
              )
            )
              return;
            snapshot();
            board.layout = l;
            cuts = new Set();
            changed();
            say(
              l === 'hex'
                ? 'Hex grid: each tile can connect to six neighbors.'
                : 'Square grid: each tile connects up, down, left and right.',
            );
          },
        },
        label,
      );
    inspector.append(
      h('h4', null, 'Board'),
      h(
        'div',
        { class: 'ed-field' },
        h('span', null, 'Grid'),
        h(
          'div',
          { class: 'ed-row ed-layout' },
          layoutBtn('square', 'Square grid'),
          layoutBtn('hex', 'Hex grid'),
        ),
      ),
      h('div', { class: 'ed-row' }, field('Columns', cols), field('Rows', rows)),
      field('Made by', author),
    );

    // Districts
    inspector.append(
      h('h4', null, 'Districts'),
      h('p', { class: 'hint' }, 'New shops go in the active district.'),
    );
    board.districts.forEach((d, i) => {
      const count = board.squares.filter((s) => s.t === 'shop' && s.d === i).length;
      const name = h('input', { value: d.name, maxlength: '24' }) as HTMLInputElement;
      name.onchange = () => {
        snapshot();
        d.name = name.value.trim() || d.name;
        changed();
      };
      const color = h('input', { type: 'color', value: d.color, class: 'ed-color' }) as HTMLInputElement;
      color.onchange = () => {
        snapshot();
        d.color = color.value;
        changed();
      };
      const del = h('button', { class: 'btn small ghost', title: 'Delete district' }, '✕');
      del.onclick = () => {
        if (
          count &&
          !confirm(`Delete "${d.name}"? Its ${count} shop${count > 1 ? 's' : ''} will be removed.`)
        )
          return;
        snapshot();
        board.squares = board.squares.filter((s) => !(s.t === 'shop' && s.d === i));
        for (const s of board.squares) if (s.t === 'shop' && s.d! > i) s.d!--;
        board.districts.splice(i, 1);
        district = Math.min(district, Math.max(0, board.districts.length - 1));
        selected = null;
        changed();
      };
      inspector.append(
        h(
          'div',
          { class: `ed-district ${i === district ? 'on' : ''}` },
          h('input', {
            type: 'radio',
            name: 'ed-district',
            checked: i === district,
            title: 'Active district',
            onchange: () => {
              district = i;
              if (tool !== 'plot') tool = 'shop';
              drawPalette();
              drawInspector();
            },
          }),
          color,
          name,
          h('small', null, String(count)),
          del,
        ),
      );
    });
    if (board.districts.length < BOARD_LIMITS.maxDistricts)
      inspector.append(
        h(
          'button',
          {
            class: 'btn small ghost',
            onclick: () => {
              snapshot();
              const i = board.districts.length;
              const free =
                DISTRICT_COLORS.find((c) => !board.districts.some((d) => d.color === c)) ??
                DISTRICT_COLORS[i % 8];
              board.districts.push({
                name:
                  DISTRICT_NAMES.find((n) => !board.districts.some((d) => d.name === n)) ??
                  `District ${i + 1}`,
                color: free,
              });
              district = i;
              changed();
            },
          },
          '+ Add district',
        ),
      );

    // Selected square
    const sq = selected != null ? board.squares[selected] : null;
    inspector.append(h('h4', null, 'Selected square'));
    if (!sq) inspector.append(h('p', { class: 'hint' }, 'Use Select and click a square to edit it.'));
    else {
      inspector.append(
        h(
          'p',
          { class: 'hint' },
          `Column ${sq.x + 1}, row ${sq.y + 1}: ${PALETTE.flatMap((g) => g.items).find((it) => it.tool === (sq.t === 'shop' && sq.plot ? 'plot' : sq.t))?.label ?? sq.t}`,
        ),
      );
      if (sq.t === 'shop') {
        const dSel = h(
          'select',
          null,
          ...board.districts.map((d, i) => h('option', { value: String(i), selected: i === sq.d }, d.name)),
        ) as HTMLSelectElement;
        dSel.onchange = () => {
          snapshot();
          sq.d = Number(dSel.value);
          changed();
        };
        const base = h('input', {
          type: 'number',
          min: String(BOARD_LIMITS.minBase),
          max: String(BOARD_LIMITS.maxBase),
          step: '10',
          value: String(sq.base ?? 200),
          class: 'num',
        }) as HTMLInputElement;
        base.onchange = () => {
          snapshot();
          sq.base = Math.max(
            BOARD_LIMITS.minBase,
            Math.min(BOARD_LIMITS.maxBase, Math.round(Number(base.value) / 10) * 10 || 200),
          );
          changed();
        };
        const plot = h('input', { type: 'checkbox', checked: !!sq.plot }) as HTMLInputElement;
        plot.onchange = () => {
          snapshot();
          if (plot.checked) sq.plot = true;
          else delete sq.plot;
          changed();
        };
        inspector.append(
          field('District', dSel),
          field('Shop value (G)', base),
          h('label', { class: 'check' }, plot, 'Vacant plot (Standard rules)'),
        );
      }
      inspector.append(
        h(
          'button',
          {
            class: 'btn small danger',
            onclick: () => {
              snapshot();
              board.squares.splice(selected!, 1);
              selected = null;
              changed();
            },
          },
          'Delete square',
        ),
      );
    }

    // Problems
    const check = validateBoard(board);
    const props = board.squares.filter((s) => s.t === 'shop').length;
    inspector.append(
      h('h4', null, check.errors.length ? `Problems (${check.errors.length})` : 'Ready to play'),
      h(
        'p',
        { class: 'hint' },
        `${board.squares.length} squares, ${props} shops, ${board.districts.length} districts.`,
      ),
      ...check.errors.map((e) => h('p', { class: 'ed-err' }, e)),
      ...check.warnings.map((w) => h('p', { class: 'ed-warn' }, w)),
      ...(check.errors.length ? [] : [h('p', { class: 'ed-ok' }, 'This board is playable.')]),
    );
  };

  nameInput.onchange = () => {
    snapshot();
    board.name = nameInput.value.trim().slice(0, BOARD_LIMITS.nameLength) || 'My board';
    changed();
  };

  // ------------------------------------------------------------ actions

  const doSave = () => {
    recompute();
    if (!saveBoard(structuredClone(board)))
      return say('Could not save: browser storage is full or blocked.', true);
    savedJSON = JSON.stringify(board);
    drawInspector();
    say(`Saved "${board.name}" to My boards.`);
  };

  const doExport = () => {
    recompute();
    const errs = validateBoard(board).errors;
    exportBoard(board);
    say(
      errs.length
        ? 'Exported. Note: the board still has problems to fix before it can be played.'
        : `Exported "${board.name}".`,
      !!errs.length,
    );
  };

  const doImport = async () => {
    const file = await pickBoardFile();
    if (!file) return;
    const res = await readBoardFile(file);
    if (!res.board) return say(res.error ?? 'Could not read that file.', true);
    if (!confirmLeave()) return;
    snapshot();
    board = res.board;
    deriveCuts();
    selected = null;
    savedJSON = '';
    changed();
    say(
      res.check?.errors.length
        ? `Imported "${board.name}" (it has problems to fix).`
        : `Imported "${board.name}". Save it to keep it.`,
      !!res.check?.errors.length,
    );
  };

  const doPlay = () => {
    recompute();
    const errs = validateBoard(board).errors;
    if (errs.length) return say(`Fix the problems first: ${errs[0]}`, true);
    destroy();
    handlers.onPlay(structuredClone(board));
  };

  const confirmLeave = () =>
    JSON.stringify(board) === savedJSON || confirm('Discard unsaved changes to this board?');

  const leave = () => {
    if (!confirmLeave()) return;
    destroy();
    handlers.onExit();
  };

  const load = (b: BoardDef, saved: boolean) => {
    board = structuredClone(b);
    deriveCuts();
    selected = null;
    undo.length = 0;
    savedJSON = saved ? JSON.stringify(board) : '';
    changed();
  };

  const modal = (title: string, body: HTMLElement) => {
    const wrap = h('div', { class: 'modal-wrap ed-modal' });
    const close = () => wrap.remove();
    wrap.append(
      h(
        'div',
        { class: 'modal glass' },
        h(
          'div',
          { class: 'modal-head' },
          h('h2', null, title),
          h('button', { class: 'btn small ghost', onclick: close }, 'Close'),
        ),
        body,
      ),
    );
    wrap.onclick = (e) => e.target === wrap && close();
    root.append(wrap);
    return close;
  };

  const newBoardDialog = () => {
    const opt = (title: string, text: string, make: () => BoardDef) =>
      h(
        'button',
        {
          class: 'pick',
          onclick: () => {
            if (!confirmLeave()) return;
            close();
            load(make(), false);
          },
        },
        h('b', null, title),
        h('small', null, text),
      );
    const close = modal(
      'New board',
      h(
        'div',
        { class: 'pick-list' },
        opt('Starter loop (square)', 'A playable loop around the edge to build on.', () => starterLoop()),
        opt('Lakeside (hex)', 'A winding hex road around a lake, with a shortcut.', () => hexStarter()),
        opt('Hex loop', 'A simple loop on a hex grid.', () => hexLoop()),
        opt('Blank square grid', 'An empty 12 x 7 square grid.', () => blankBoard()),
        opt('Blank hex grid', 'An empty 14 x 9 hex grid.', () => blankBoard(14, 9, 'hex')),
        ...BUILT_IN_BOARDS.map((b) =>
          opt(`Copy of ${b.name}`, `The built-in ${b.layout ?? 'square'} board, to remix.`, () => ({
            ...structuredClone(b),
            id: newBoardId(),
            name: `${b.name} remix`,
          })),
        ),
      ),
    );
  };

  const myBoardsDialog = () => {
    const list = h('div', { class: 'ed-boards' });
    const draw = () => {
      clear(list);
      const boards = listBoards();
      if (!boards.length)
        list.append(
          h('p', { class: 'hint' }, 'No saved boards yet. Use Save to keep the board you are editing.'),
        );
      for (const b of boards) {
        list.append(
          h(
            'div',
            { class: 'ed-board-item' },
            boardThumb(b.board, 120, 70),
            h(
              'div',
              { class: 'ed-board-info' },
              h('b', null, b.board.name),
              h(
                'small',
                null,
                `${b.board.squares.length} squares · saved ${new Date(b.savedAt).toLocaleDateString()}`,
              ),
            ),
            h(
              'button',
              { class: 'btn small', onclick: () => (confirmLeave() ? (close(), load(b.board, true)) : null) },
              'Open',
            ),
            h('button', { class: 'btn small ghost', onclick: () => exportBoard(b.board) }, 'Export'),
            h(
              'button',
              {
                class: 'btn small danger',
                onclick: () => {
                  if (!confirm(`Delete "${b.board.name}" from My boards?`)) return;
                  deleteBoard(b.id);
                  draw();
                },
              },
              'Delete',
            ),
          ),
        );
      }
    };
    draw();
    const close = modal('My boards', list);
  };

  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      doUndo();
    }
  };
  window.addEventListener('keydown', onKey);
  const ro = new ResizeObserver(() => redraw());
  ro.observe(stage);
  document.fonts?.ready.then(() => redraw());

  function destroy() {
    window.removeEventListener('keydown', onKey);
    ro.disconnect();
    root.remove();
  }

  recompute();
  savedJSON = JSON.stringify(board);
  drawPalette();
  drawInspector();
  requestAnimationFrame(redraw);
  return destroy;
}
