/**
 * Board editor (#editor): paint squares on a grid, set up districts and shop values, check the
 * board for problems, save it in this browser, export/import board files and test-play it.
 *
 * Squares in neighboring cells always connect; leave a gap to keep paths apart. The preview
 * is drawn with the same painter as the game board.
 */
import {
  BOARD_LIMITS,
  K,
  districtStartingValues,
  BUILT_IN_BOARDS,
  autoEdges,
  newGame,
  validateBoard,
  type BoardDef,
  type BoardLayout,
  type BoardSquareDef,
  type SquareType,
} from '@aa/engine';
import { paintBoard, paintGrass, paintSquare, worldSize } from '../board';
import { ZOOM_MAX_OUT, ZOOM_STEP, fitZoom, nearZoom, zoomScale, wheelZoomStep } from '../zoom';
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
import { clear, h, fmt } from './dom';
import { boardThumb } from './thumb';
import { digitPicker } from './digits';
import { moveSelection, selectionPositions, selectionAnchor, ensureEditorBank } from './editor-selection';

type Tool = SquareType | 'plot' | 'select' | 'place' | 'erase';

const PALETTE: { group: string; items: { tool: Tool; label: string; hint: string }[] }[] = [
  {
    group: 'Tools',
    items: [
      { tool: 'select', label: 'Select', hint: 'Click a tile or drag to select a group.' },
      { tool: 'place', label: 'Place', hint: 'Choose tiles to place on the board.' },
      { tool: 'erase', label: 'Erase', hint: 'Remove squares (click or drag).' },
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
      {
        tool: 'warp',
        label: 'Warp',
        hint: 'Landing here warps you to its partner (warps pair up in reading order). Use them in pairs to reach a separate area.',
      },
      { tool: 'arcade', label: 'Arcade', hint: 'Plays a minigame.' },
      { tool: 'cannon', label: 'Cannon', hint: 'Fires you to another player.' },
    ],
  },
];

const DISTRICT_COLORS = [
  '#ff4d4d',
  '#2f9bff',
  '#2ecc71',
  '#ffc21a',
  '#9b5cff',
  '#13c4b4',
  '#ff4fa8',
  '#ff8a1f',
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

function blankBoard(
  cols = BOARD_LIMITS.maxCols,
  rows = BOARD_LIMITS.maxRows,
  layout: BoardLayout = 'square',
): BoardDef {
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
    squares: [{ x: Math.floor(cols / 2), y: Math.floor(rows / 2), t: 'bank' }],
    edges: [],
    bank: 0,
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
  let board: BoardDef = {
    ...structuredClone(initial ?? blankBoard()),
    cols: BOARD_LIMITS.maxCols,
    rows: BOARD_LIMITS.maxRows,
  };
  let tool: Tool = 'select';
  let settings = false;
  let district = 0;
  let selected: number | null = null;
  let selection = new Set<number>();
  let moving: { anchor: { x: number; y: number }; target: { x: number; y: number } } | null = null;
  let marquee: { start: { x: number; y: number }; end: { x: number; y: number } } | null = null;
  let placeTool: Tool = 'shop';
  const isPlacing = () => tool !== 'select' && tool !== 'erase';
  const clearSelection = () => {
    selected = null;
    selection.clear();
    moving = null;
    marquee = null;
  };
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
  const info = h(
    'div',
    { class: 'ed-info info-chip glass' },
    h('span', { class: 'gc-title' }, 'Board builder'),
    nameInput,
    status,
  );
  const settingsButton = h(
    'button',
    {
      class: 'btn small ghost',
      'aria-pressed': 'false',
      onclick: () => {
        settings = !settings;
        notice = '';
        clearSelection();
        tool = 'select';
        drawPalette();
        drawInspector();
        redraw();
      },
    },
    'Board settings',
  );
  info.append(settingsButton);
  const zoomChip = h(
    'button',
    {
      class: 'zoom-chip',
      title: 'Zoom: scroll, pinch or - / +. Tap to reset.',
      'aria-label': 'Reset board zoom',
      onclick: () => {
        zoomOut = 0;
        redraw();
      },
    },
    '250%',
  );
  const topbar = h(
    'div',
    { class: 'ed-top toolbar' },
    zoomChip,
    h('button', { class: 'btn small', onclick: () => doUndo(), title: 'Undo (Ctrl+Z)' }, 'Undo'),
    h('button', { class: 'btn small', onclick: () => doSave() }, 'Save'),
    h('button', { class: 'btn small main', onclick: () => doPlay() }, 'Test play'),
    h('button', { class: 'btn small', onclick: () => editorMenu() }, 'Menu'),
  );
  const toolBar = h('div', {
    class: 'ed-tool-bar glass',
    role: 'toolbar',
    'aria-label': 'Board tools',
    'aria-orientation': 'vertical',
  });
  const palette = h('div', { class: 'ed-palette glass', 'aria-label': 'Tile palette' });
  const stage = h('div', { class: 'ed-stage' });
  const canvas = h('canvas', { class: 'ed-canvas' }) as HTMLCanvasElement;
  stage.append(canvas);
  const tileInspector = h('div', {
    class: 'ed-tile-inspector glass',
    role: 'dialog',
    'aria-label': 'Tile options',
    hidden: true,
  });
  const inspector = h('div', { class: 'ed-inspector' });
  const actionbar = h('div', {
    class: 'ed-actions prompt-center glass show',
    'aria-label': 'Editing actions',
  });
  const actionContent = h('div', { class: 'ed-action-content' });
  actionbar.append(actionContent);
  root.append(stage, info, topbar, palette, toolBar, tileInspector, actionbar);
  let notice = '';
  let noticeBad = false;
  let noticeTimer = 0;
  let actionAnimation: Animation | null = null;
  let lastPrompt = '';

  const say = (text: string, bad = false) => {
    notice = text;
    noticeBad = bad;
    clearTimeout(noticeTimer);
    drawInspector();
    noticeTimer = window.setTimeout(() => {
      notice = '';
      drawInspector();
    }, 3200);
  };

  // Match the game's 740 ms shell morph while keeping the new content at its final size.
  const morphActions = (from: DOMRect) => {
    const to = actionbar.getBoundingClientRect();
    const prompt = actionContent.querySelector<HTMLElement>('.prompt-text');
    if (prompt && prompt.textContent !== lastPrompt) {
      lastPrompt = prompt.textContent ?? '';
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
        prompt.animate(
          [
            { clipPath: 'inset(0 100% 0 0)', opacity: 0.6 },
            { clipPath: 'inset(0)', opacity: 1 },
          ],
          { duration: 220, easing: 'steps(16, end)' },
        );
    }
    if (
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      (Math.abs(to.width - from.width) < 1 && Math.abs(to.height - from.height) < 1)
    )
      return;
    actionContent.style.width = `${actionContent.getBoundingClientRect().width}px`;
    actionbar.classList.add('morphing');
    const anim = actionbar.animate(
      [
        { width: `${from.width}px`, height: `${from.height}px`, minHeight: '0' },
        { width: `${to.width}px`, height: `${to.height}px`, minHeight: '0' },
      ],
      { duration: 740, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
    actionAnimation = anim;
    anim.onfinish = () => {
      if (actionAnimation !== anim) return;
      actionAnimation = null;
      actionContent.style.width = '';
      actionbar.classList.remove('morphing');
      redraw();
    };
  };

  // ------------------------------------------------------------ model helpers

  const recompute = () => {
    board = ensureEditorBank(board);
    board.edges = autoEdges(board.squares, new Set(), board.layout);
    board.bank = board.squares.findIndex((s) => s.t === 'bank');
    // Warps pair up in reading order: the 1st with the 2nd, the 3rd with the 4th, and so on.
    const warps = board.squares
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.t === 'warp')
      .sort((a, b) => a.s.y - b.s.y || a.s.x - b.s.x);
    warps.forEach(({ s }) => delete s.link);
    for (let k = 0; k + 1 < warps.length; k += 2) {
      warps[k].s.link = warps[k + 1].i;
      warps[k + 1].s.link = warps[k].i;
    }
  };
  const snapshot = () => {
    undo.push(JSON.stringify(board));
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
    board = JSON.parse(last) as BoardDef;
    clearSelection();
    nameInput.value = board.name;
    changed();
  };
  const indexAt = (x: number, y: number) => board.squares.findIndex((s) => s.x === x && s.y === y);
  const center = (c: { x: number; y: number }) => cellCenter(board.layout, c.x, c.y);

  const place = (x: number, y: number) => {
    const i = indexAt(x, y);
    if (i >= 0 && board.squares[i].t === 'bank') return false;
    if (tool === 'erase') {
      if (i < 0) return false;
      board.squares.splice(i, 1);
      if (selected === i) selected = null;
      else if (selected != null && selected > i) selected--;
      return true;
    }
    if (tool === 'select' || tool === 'place') return false;
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
  let cameraScale: number | null = null;
  let boardImage: HTMLCanvasElement | null = null;
  let boardImageKey = '';
  let zoomOut = 0;
  let zoomFrame = 0;
  let destroyed = false;
  const zoomBy = (delta: number) => {
    zoomOut = Math.max(0, Math.min(ZOOM_MAX_OUT, zoomOut + delta));
    redraw();
  };
  let ox = 0;
  let oy = 0;
  const preview = () => {
    const game = newGame({
      rules: 'standard',
      target: 5000,
      roundCap: 0,
      seats: [{ name: 'Editor', cpu: true, ch: 'farmer' }],
      board: {
        ...board,
        id: 'custom:editor',
        bank: Math.max(0, board.bank),
        squares: board.squares.length ? board.squares : [{ x: 0, y: 0, t: 'bank' }],
      },
      seed: 1,
    });
    if (!board.squares.length) game.nodes = [];
    return game;
  };

  const redraw = () => {
    if (destroyed) return;
    cancelAnimationFrame(zoomFrame);
    zoomFrame = 0;
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
    const { w, h: hh } = worldSize(board);
    // The HUD overlaps the board. Only the far zoom's sizing uses its occupied area;
    // every zoom level keeps the board's center at the center of the entire screen.
    const paletteRect = palette.getBoundingClientRect();
    const top =
      Math.max(info.getBoundingClientRect().bottom, topbar.getBoundingClientRect().bottom) - r.top + 6;
    const side = !palette.hidden
      ? paletteRect
      : !tileInspector.hidden
        ? tileInspector.getBoundingClientRect()
        : null;
    const right = side ? Math.min(r.width * 0.4, r.right - side.left + 8) : 0;
    const bottom = r.height - actionbar.offsetTop + 4;
    const near = nearZoom(r.width, r.height, w, hh);
    const far = Math.min(near, fitZoom(r.width - right, r.height - top - bottom, w, hh));
    const target = zoomScale(near, far, zoomOut);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    cameraScale = cameraScale == null || reduced ? target : cameraScale + (target - cameraScale) * 0.12;
    if (Math.abs(target - cameraScale) < 0.0001) cameraScale = target;
    else zoomFrame = requestAnimationFrame(redraw);
    scale = cameraScale;
    ox = (r.width - w * scale) / 2;
    oy = (r.height - hh * scale) / 2;
    const out = far < near ? Math.log(scale / near) / Math.log(far / near) : 0;
    zoomChip.textContent = `${Math.round(250 - 150 * Math.max(0, Math.min(1, out)))}%`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#16213f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, oy * dpr);
    paintGrass(ctx);
    // Cache the board and empty grid during camera motion, as the game caches its scenery.
    const imageScale = Math.min(2, Math.max(1, Math.ceil(near * dpr * 2) / 2));
    const imageKey = `${imageScale}:${moving ? [...selection].join(',') : ''}:${JSON.stringify(board)}`;
    if (!boardImage || imageKey !== boardImageKey) {
      boardImage = h('canvas') as HTMLCanvasElement;
      boardImage.width = Math.ceil(w * imageScale);
      boardImage.height = Math.ceil(hh * imageScale);
      const ctx = boardImage.getContext('2d')!;
      ctx.scale(imageScale, imageScale);
      const G = preview();
      if (moving) {
        // Remove lifted tiles and their roads, then remap the painter's neighbor indices.
        const visible = G.nodes.filter((sq) => !selection.has(sq.id));
        const ids = new Map(visible.map((sq, i) => [sq.id, i]));
        G.nodes = visible.map((sq, id) => ({
          ...sq,
          id,
          nb: sq.nb.filter((i) => ids.has(i)).map((i) => ids.get(i)!),
        }));
      }
      paintBoard(ctx, G, false, false);
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
      boardImageKey = imageKey;
    }
    ctx.drawImage(boardImage, 0, 0, w, hh);
    // Hover and selection
    if (hover && !moving) {
      const c = center(hover);
      ctx.lineWidth = 4;
      ctx.strokeStyle = tool === 'erase' ? '#e5484d' : '#ffd166';
      tileShape(ctx, board.layout, c.x, c.y, 46, 14);
      ctx.stroke();
    }
    for (const i of selection) {
      const c = center(board.squares[i]);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffd166';
      ctx.setLineDash([10, 6]);
      tileShape(ctx, board.layout, c.x, c.y, 48, 15);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (marquee) {
      const { start, end } = marquee;
      ctx.fillStyle = 'rgba(255,209,102,0.14)';
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2 / scale;
      ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    }
    if (moving) {
      const G = preview();
      const positions = selectionPositions(board, selection, moving.anchor, moving.target);
      const valid = [...positions.values()].every(
        (c) => c.x >= 0 && c.y >= 0 && c.x < board.cols && c.y < board.rows,
      );
      const touchesBank = board.squares.some(
        (sq, i) =>
          sq.t === 'bank' &&
          !selection.has(i) &&
          [...positions.values()].some((c) => c.x === sq.x && c.y === sq.y),
      );
      for (const [i, cell] of positions) {
        paintSquare(ctx, G, { ...G.nodes[i], ...cell });
        const c = center(cell);
        ctx.strokeStyle = valid && !touchesBank ? '#ffd166' : '#e5484d';
        ctx.lineWidth = 4;
        tileShape(ctx, board.layout, c.x, c.y, 48, 15);
        ctx.stroke();
      }
    }
    // Cell coordinates along the edges
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '16px "Atkinson Hyperlegible", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let x = 0; x < board.cols; x++) ctx.fillText(String(x + 1), center({ x, y: 0 }).x, 22);
    for (let y = 0; y < board.rows; y++) ctx.fillText(String(y + 1), 22, center({ x: 0, y }).y);
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
  const beginStroke = (e: PointerEvent) => {
    if (moving) {
      const target = toCell(e);
      if (!target) return;
      const result = moveSelection(board, selection, moving.anchor, target);
      if (!result) return say('Keep the group inside the board and clear of the bank.', true);
      snapshot();
      board = result.board;
      selection = result.selection;
      moving = null;
      selected = selection.size === 1 ? [...selection][0] : null;
      changed();
      return;
    }
    const cell = toCell(e);
    if (!cell) return;
    if (tool === 'select') {
      settings = false;
      notice = '';
      const w = toWorld(e);
      marquee = { start: w, end: w };
      const i = indexAt(cell.x, cell.y);
      selection = new Set(i >= 0 ? [i] : []);
      selected = i >= 0 ? i : null;
      redraw();
      return;
    }
    painting = true;
    paintedThisStroke = false;
    snapshot();
    if (place(cell.x, cell.y)) paintedThisStroke = true;
    changed();
  };
  const touches = new Map<number, { x: number; y: number }>();
  let touchStart: PointerEvent | null = null;
  let pinching = false;
  let pinchDistance = 0;
  const span = () => {
    const [a, b] = [...touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomBy(wheelZoomStep(e.deltaY, e.deltaMode));
    },
    { passive: false },
  );
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 1) {
        touchStart = e;
        pinching = false;
      } else {
        pinching = true;
        touchStart = null;
        endStroke();
      }
      pinchDistance = span();
      return;
    }
    beginStroke(e);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinching) {
        const distance = span();
        if (distance && pinchDistance) zoomBy(Math.log(pinchDistance / distance) * 0.8);
        pinchDistance = distance;
        return;
      }
      if (moving) {
        const cell = toCell(e);
        if (cell) moving.target = cell;
        redraw();
        return;
      }
      if (touchStart && Math.hypot(e.clientX - touchStart.clientX, e.clientY - touchStart.clientY) > 8) {
        beginStroke(touchStart);
        touchStart = null;
      }
    }
    const cell = toCell(e);
    if (moving) {
      if (cell) moving.target = cell;
      redraw();
      return;
    }
    if (marquee) {
      marquee.end = toWorld(e);
      const { start, end } = marquee;
      if (Math.hypot(end.x - start.x, end.y - start.y) * scale > 6) {
        selection = new Set(
          board.squares.flatMap((sq, i) => {
            const c = center(sq);
            return c.x >= Math.min(start.x, end.x) &&
              c.x <= Math.max(start.x, end.x) &&
              c.y >= Math.min(start.y, end.y) &&
              c.y <= Math.max(start.y, end.y)
              ? [i]
              : [];
          }),
        );
        selected = selection.size === 1 ? [...selection][0] : null;
      }
      redraw();
      return;
    }
    const moved = cell?.x !== hover?.x || cell?.y !== hover?.y;
    hover = cell;
    if (painting && cell && moved && place(cell.x, cell.y)) {
      paintedThisStroke = true;
      changed();
    } else if (moved) redraw();
  });
  const endStroke = () => {
    if (marquee) {
      marquee = null;
      drawInspector();
      redraw();
    }
    if (painting && !paintedThisStroke) undo.pop();
    painting = false;
  };
  const releasePointer = (e: PointerEvent) => {
    if (e.type === 'pointerup' && touches.has(e.pointerId) && !pinching && touchStart) beginStroke(e);
    touches.delete(e.pointerId);
    touchStart = null;
    pinchDistance = span();
    endStroke();
  };
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    redraw();
  });

  // ------------------------------------------------------------ palette

  const toolButtons = new Map<Tool, HTMLButtonElement>();
  const syncTools = () => {
    for (const [t, button] of toolButtons) {
      const active = (t === 'place' ? isPlacing() : tool === t) && !settings;
      button.classList.toggle('on', active);
      button.setAttribute('aria-pressed', String(active));
    }
  };
  const paths: Record<string, string> = {
    select: 'M5 3l14 10-7 1-3 7z',
    place: 'M15 4l5 5M4 15L15 4a3.5 3.5 0 015 5L9 20l-6 1zM4 15l5 5',
    erase: 'M4 13l9-10 8 8-9 10H9l-5-5zM8 9l8 8M12 21h9',
  };
  for (const { tool: t, label } of PALETTE[0].items) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(icon.namespaceURI, 'path');
    path.setAttribute('d', paths[t]);
    icon.append(path);
    const button = h(
      'button',
      {
        class: 'btn ghost ed-tool-button',
        'aria-label': label,
        'aria-pressed': 'false',
        onclick: () => {
          tool = t === 'place' ? placeTool : t;
          clearSelection();
          settings = false;
          notice = '';
          drawPalette();
          redraw();
          drawInspector();
        },
      },
      icon,
      h('span', { class: 'ed-tool-tip', 'aria-hidden': 'true' }, label),
    );
    toolButtons.set(t, button);
    toolBar.append(button);
  }

  const drawPalette = () => {
    clear(palette);
    palette.append(
      h(
        'div',
        { class: 'ed-palette-title' },
        h('span', { class: 'gc-title' }, 'Tiles'),
        h('span', { class: 'hint' }, 'Choose one to place'),
      ),
    );
    for (const g of PALETTE.filter((g) => g.group !== 'Tools')) {
      palette.append(h('h4', null, g.group));
      const row = h('div', { class: 'ed-tools' });
      for (const it of g.items) {
        const example = h('canvas', { class: 'ed-tile-example', 'aria-hidden': 'true' }) as HTMLCanvasElement;
        example.width = 200;
        example.height = 180;
        const tile = newGame({
          rules: 'standard',
          target: 5000,
          roundCap: 0,
          seed: 1,
          seats: [{ name: 'Builder', cpu: true, ch: 'farmer' }],
          board: {
            ...board,
            cols: 1,
            rows: 1,
            edges: [],
            bank: 0,
            squares: [
              {
                x: 0,
                y: 0,
                t: it.tool === 'plot' ? 'shop' : (it.tool as SquareType),
                ...(it.tool === 'shop' || it.tool === 'plot' ? { d: district, base: 200 } : {}),
              },
            ],
          },
        });
        if (it.tool === 'plot') tile.nodes[0].t = 'plot';
        const ctx = example.getContext('2d')!;
        ctx.scale(1.4, 1.4);
        ctx.translate(-29, -38);
        paintSquare(ctx, tile, tile.nodes[0]);
        row.append(
          h(
            'button',
            {
              class: `ed-tool ${tool === it.tool ? 'on' : ''}`,
              title: it.hint,
              'aria-pressed': String(tool === it.tool),
              onclick: () => {
                tool = it.tool;
                placeTool = it.tool;
                clearSelection();
                settings = false;
                notice = '';
                drawPalette();
                drawInspector();
                redraw();
              },
            },
            example,
            h('span', null, it.label),
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
    const from = actionbar.getBoundingClientRect();
    if (actionAnimation) {
      actionAnimation.onfinish = null;
      actionAnimation.cancel();
      actionAnimation = null;
    }
    actionContent.style.width = '';
    actionbar.classList.remove('morphing');
    clear(inspector);
    clear(tileInspector);
    nameInput.value = board.name;
    const unsaved = JSON.stringify(board) !== savedJSON;
    const inList = listBoards().some((b) => b.id === board.id);
    status.textContent = !inList ? 'Not saved yet' : unsaved ? 'Unsaved changes' : 'Saved';
    status.classList.toggle('unsaved', unsaved || !inList);

    const controls = h('div', { class: 'ed-context-controls' });
    clear(actionContent);
    syncTools();
    palette.hidden = !isPlacing() || settings;
    root.classList.toggle('ed-placing', !palette.hidden);
    root.classList.toggle('ed-moving', !!moving);
    settingsButton.setAttribute('aria-pressed', String(settings));
    const label = PALETTE.flatMap((g) => g.items).find((it) => it.tool === tool)?.label;
    actionContent.append(
      h(
        'div',
        { class: 'prompt-text', role: 'status', 'aria-live': 'polite' },
        notice ||
          (settings
            ? 'Board settings'
            : moving
              ? 'Move the group, then click to place · Esc to cancel'
              : tool === 'select'
                ? selection.size
                  ? `${selection.size} tile${selection.size === 1 ? '' : 's'} selected`
                  : 'Click a tile, or drag to select a group'
                : `${label}: ${tool === 'erase' ? 'click or drag to remove squares' : 'click or drag to place tiles'}`),
      ),
      h(
        'div',
        { class: 'ed-action-tools btn-row' },
        ...(tool === 'select' && selection.size && !moving && !settings
          ? [
              h(
                'button',
                {
                  class: 'btn small main',
                  onclick: () => {
                    const anchor = selectionAnchor(board, selection);
                    moving = { anchor, target: { ...anchor } };
                    notice = '';
                    drawInspector();
                    redraw();
                  },
                },
                'Move',
              ),
              ...([...selection].some((i) => board.squares[i].t === 'bank')
                ? []
                : [
                    h(
                      'button',
                      {
                        class: 'btn small danger',
                        onclick: () => {
                          snapshot();
                          board.squares = board.squares.filter(
                            (sq, i) => sq.t === 'bank' || !selection.has(i),
                          );
                          clearSelection();
                          changed();
                        },
                      },
                      'Erase',
                    ),
                  ]),
            ]
          : []),
        ...(moving
          ? [
              h(
                'button',
                {
                  class: 'btn small ghost',
                  onclick: () => {
                    moving = null;
                    drawInspector();
                    redraw();
                  },
                },
                'Cancel',
              ),
            ]
          : []),
      ),
    );
    actionContent.append(controls);
    controls.append(inspector);
    // Board settings
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
            drawPalette();
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
    const boardSettings = h('div', { class: 'ed-board-settings' });
    inspector.append(boardSettings);
    boardSettings.hidden = !settings;
    boardSettings.append(
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
      h(
        'p',
        { class: 'hint' },
        `${board.cols} × ${board.rows} grid. Unused outer space is trimmed for games.`,
      ),
      field('Made by', author),
    );

    // Districts
    const districtPanel = h('div', { class: 'ed-district-panel' });
    districtPanel.hidden = !settings;
    if (!settings && (tool === 'shop' || tool === 'plot')) {
      const active = h(
        'select',
        { 'aria-label': 'Active district' },
        ...board.districts.map((d, i) => h('option', { value: String(i), selected: i === district }, d.name)),
      ) as HTMLSelectElement;
      active.onchange = () => {
        district = Number(active.value);
        drawPalette();
      };
      inspector.append(field('District for new shops', active));
    }
    inspector.append(districtPanel);
    districtPanel.append(
      h('h4', null, 'Districts'),
      h('p', { class: 'hint' }, 'New shops go in the active district.'),
    );
    const pricing = districtStartingValues(board);
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
        clearSelection();
        changed();
      };
      const row = h(
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
      );
      const valueLabel = h(
        'span',
        { class: 'hint' },
        d.startingValue == null ? `Default · ${fmt(pricing.defaults[i])}` : 'Custom average',
      );
      const reset = h(
        'button',
        {
          class: 'btn small ghost',
          disabled: d.startingValue == null,
          onclick: () => {
            snapshot();
            delete d.startingValue;
            changed();
          },
        },
        'Reset',
      );
      const picker = digitPicker({
        min: K.districtProperty.minAverage,
        max: K.districtProperty.maxAverage,
        value: pricing.averages[i],
        unit: K.districtProperty.step,
        suffix: 'G',
        onChange(value) {
          snapshot();
          d.startingValue = value;
          recompute();
          redraw();
          reset.disabled = false;
          valueLabel.textContent = 'Custom average';
          status.textContent = 'Unsaved changes';
          status.classList.add('unsaved');
        },
      });
      districtPanel.append(
        h(
          'div',
          { class: 'ed-district-card' },
          row,
          h(
            'div',
            { class: 'ed-district-pricing', role: 'group', 'aria-label': `${d.name} starting average` },
            h('span', { class: 'ed-price-title' }, 'Starting average'),
            valueLabel,
            picker.el,
            reset,
          ),
        ),
      );
    });
    if (board.districts.length < BOARD_LIMITS.maxDistricts)
      districtPanel.append(
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
    const squarePanel = tileInspector;
    squarePanel.hidden =
      settings || tool !== 'select' || selected == null || selection.size !== 1 || !!moving;
    squarePanel.append(
      h(
        'div',
        { class: 'ed-tile-head' },
        h('h2', null, 'Tile options'),
        h(
          'button',
          {
            class: 'btn small ghost',
            onclick: () => {
              clearSelection();
              drawInspector();
              redraw();
            },
          },
          'Close',
        ),
      ),
    );
    const sq = selected != null ? board.squares[selected] : null;
    if (!sq) squarePanel.append(h('p', { class: 'hint' }, 'Use Select and click a square to edit it.'));
    else {
      if (sq.t === 'bank')
        squarePanel.append(
          h('p', { class: 'hint' }, 'Every board needs a bank. You can move it, but it cannot be erased.'),
        );
      squarePanel.append(
        h(
          'p',
          { class: 'hint' },
          `Column ${sq.x + 1}, row ${sq.y + 1}: ${PALETTE.flatMap((g) => g.items).find((it) => it.tool === (sq.t === 'shop' && sq.plot ? 'plot' : sq.t))?.label ?? sq.t}`,
        ),
      );
      if (sq.t === 'shop') {
        const dSel = h(
          'select',
          { 'aria-label': 'District' },
          ...board.districts.map((d, i) => h('option', { value: String(i), selected: i === sq.d }, d.name)),
        ) as HTMLSelectElement;
        dSel.onchange = () => {
          snapshot();
          sq.d = Number(dSel.value);
          changed();
        };
        squarePanel.append(
          h(
            'p',
            { class: 'hint' },
            `Starting value: ${fmt(preview().nodes[selected!].base)}. Set its district's average in Board settings.`,
          ),
        );
        const plot = h('input', { type: 'checkbox', checked: !!sq.plot }) as HTMLInputElement;
        plot.onchange = () => {
          snapshot();
          if (plot.checked) sq.plot = true;
          else delete sq.plot;
          changed();
        };
        squarePanel.append(
          field('District', dSel),
          h('label', { class: 'check' }, plot, 'Vacant plot (Standard rules)'),
        );
      }
    }

    // Problems
    const problems = h('div');
    problems.hidden = !settings;
    inspector.append(problems);
    const check = validateBoard(board);
    const props = board.squares.filter((s) => s.t === 'shop').length;
    problems.append(
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
    controls.hidden = !settings && tool !== 'shop' && tool !== 'plot';
    actionbar.classList.toggle('ed-action-error', !!notice && noticeBad);
    actionbar.classList.toggle('ed-action-expanded', settings);
    const hasOptions =
      settings || tool === 'shop' || tool === 'plot' || (tool === 'select' && selection.size > 0);
    actionbar.classList.toggle('status', !hasOptions);
    morphActions(from);
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
    board = { ...res.board, cols: BOARD_LIMITS.maxCols, rows: BOARD_LIMITS.maxRows };
    clearSelection();
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
    board = { ...structuredClone(b), cols: BOARD_LIMITS.maxCols, rows: BOARD_LIMITS.maxRows };
    clearSelection();
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
    wrap.onclick = (e) => {
      if (e.target === wrap) close();
    };
    root.append(wrap);
    return close;
  };

  const editorMenu = () => {
    const item = (label: string, act: () => void) =>
      h(
        'button',
        {
          class: 'btn',
          onclick: () => {
            close();
            act();
          },
        },
        label,
      );
    const close = modal(
      'Board builder',
      h(
        'div',
        { class: 'ed-menu-actions' },
        item('New board', newBoardDialog),
        item('My boards', myBoardsDialog),
        item('Import board', () => {
          void doImport();
        }),
        item('Export board', doExport),
        item('Back to main menu', leave),
      ),
    );
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
        opt('Blank square grid', 'A 32 × 20 square grid with a bank.', () => blankBoard()),
        opt('Blank hex grid', 'A 32 × 20 hex grid with a bank.', () =>
          blankBoard(BOARD_LIMITS.maxCols, BOARD_LIMITS.maxRows, 'hex'),
        ),
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
    if (
      (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]') ||
      root.querySelector('.ed-modal')
    )
      return;
    if (e.key === 'Escape') {
      if (moving) moving = null;
      else clearSelection();
      drawInspector();
      redraw();
      return;
    }
    if (['-', '_', '=', '+'].includes(e.key)) {
      e.preventDefault();
      zoomBy(e.key === '-' || e.key === '_' ? ZOOM_STEP : -ZOOM_STEP);
      return;
    }
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
    destroyed = true;
    cancelAnimationFrame(zoomFrame);
    window.removeEventListener('keydown', onKey);
    ro.disconnect();
    clearTimeout(noticeTimer);
    actionAnimation?.cancel();
    root.remove();
  }

  recompute();
  savedJSON = JSON.stringify(board);
  drawPalette();
  drawInspector();
  requestAnimationFrame(redraw);
  return destroy;
}
