import { linkEditorTiles, unlinkEditorTile } from './editor-links';
/**
 * Board editor (#editor): paint squares on a grid, set up districts and shop values, check the
 * board for problems, save it in this browser, export/import board files and test-play it.
 *
 * Squares in neighboring cells always connect; leave a gap to keep paths apart. The preview
 * is drawn with the same painter as the game board.
 */
import {
  BOARD_LIMITS,
  connectTransports,
  transportColor,
  K,
  districtStartingValues,
  BUILT_IN_BOARDS,
  autoEdges,
  newGame,
  validateBoard,
  type BoardCheck,
  type BoardIssue,
  type BoardDef,
  type BoardLayout,
  type BoardSquareDef,
  type SquareType,
} from '@aa/engine';
import { drawRingBurst, drawTileGlow, paintBoard, paintGrass, paintSquare, worldSize } from '../board';
import {
  EDITOR_ZOOM_MIN_OUT,
  editorZoomPercent,
  ZOOM_MAX_OUT,
  ZOOM_STEP,
  fitZoom,
  nearZoom,
  zoomScale,
  wheelZoomStep,
} from '../zoom';
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
import { stepper } from './stepper';
import {
  DISTRICT_COLORS,
  DISTRICT_NAMES,
  districtChoices,
  canAssignProperty,
  type DistrictChoice,
} from './editor-districts';
import { moveSelection, selectionPositions, selectionAnchor, ensureEditorBank } from './editor-selection';

type Tool = Exclude<SquareType, 'plot'> | 'select' | 'pan' | 'place' | 'erase';

const PALETTE: { group: string; items: { tool: Tool; label: string; hint: string }[] }[] = [
  {
    group: 'Tools',
    items: [
      { tool: 'select', label: 'Select', hint: 'Click a tile or drag to select a group.' },
      { tool: 'pan', label: 'Pan', hint: 'Drag to move around the board.' },
      { tool: 'place', label: 'Place', hint: 'Choose tiles to place on the board.' },
      { tool: 'erase', label: 'Erase', hint: 'Remove squares (click or drag).' },
    ],
  },
  {
    group: 'Properties',
    items: [
      {
        tool: 'shop',
        label: 'Property',
        hint: 'A property in the active district. Game setup chooses which become vacant plots.',
      },
    ],
  },
  {
    group: 'Suits',
    items: [
      { tool: 'spade', label: 'Spade', hint: 'Suit square.' },
      { tool: 'heart', label: 'Heart', hint: 'Suit square.' },
      { tool: 'diamond', label: 'Diamond', hint: 'Suit square.' },
      { tool: 'club', label: 'Club', hint: 'Suit square.' },
      { tool: 'change', label: 'Change suit', hint: 'Gives its current suit, then rotates.' },
    ],
  },
  {
    group: 'Specials',
    items: [
      { tool: 'venture', label: 'Venture', hint: 'Flip a venture card.' },
      { tool: 'roll', label: 'Roll-on', hint: 'Roll again.' },
      { tool: 'break', label: 'Take-a-break', hint: 'Your shops close until your next turn.' },
      { tool: 'boon', label: 'Boon', hint: '20% commission on fees.' },
      { tool: 'boom', label: 'Boom', hint: '50% commission on fees.' },
      { tool: 'broker', label: 'Stockbroker', hint: 'Buy stock (a venture square in Easy rules).' },
      { tool: 'arcade', label: 'Arcade', hint: 'Plays a minigame.' },
    ],
  },
  {
    group: 'Transport',
    items: [
      { tool: 'warp', label: 'Warp', hint: 'Landing here warps you to its partner. Use them in pairs.' },
      { tool: 'cannon', label: 'Cannon', hint: 'Fires you to another player.' },
      {
        tool: 'portal',
        label: 'Portal',
        hint: 'Teleport on passing, then keep moving. Link to a matching portal or the bank.',
      },
    ],
  },
];

/** How long a placed or erased tile's effect plays. */
const TILE_FX_MS = 650;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A small line icon (24 x 24 path) for icon buttons. */
function icon(d: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}
const TRASH = 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3';

/** The head of a side panel: a title (and a line under it) with Close on the right. */
function sideHead(title: string, sub: string | null, onClose: () => void): HTMLElement {
  return h(
    'div',
    { class: 'ed-side-head' },
    h('div', { class: 'ed-side-title' }, h('h2', null, title), sub ? h('p', null, sub) : null),
    h('button', { class: 'btn small ghost', onclick: onClose }, 'Close'),
  );
}

/** A titled group in a side panel, with an optional note on the right of the title. */
function sideSection(title: string, aside: string | null, ...body: (Node | null)[]): HTMLElement {
  return h(
    'section',
    { class: 'ed-side-sec' },
    h('div', { class: 'ed-side-sec-head' }, h('h4', null, title), aside ? h('span', null, aside) : null),
    ...body,
  );
}

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
    districts: [],
    squares: [{ x: Math.floor(cols / 2), y: Math.floor(rows / 2), t: 'bank' }],
    edges: [],
    bank: 0,
  };
}

/** Keep template roads intact while assigning exactly four properties to each district. */
function templateDistricts(board: BoardDef): BoardDef {
  const properties = board.squares.filter((sq) => sq.t === 'shop');
  const count = Math.floor(properties.length / BOARD_LIMITS.districtSize);
  board.districts = Array.from(
    { length: count },
    (_, i) => board.districts[i] ?? { name: DISTRICT_NAMES[i], color: DISTRICT_COLORS[i] },
  );
  properties.forEach((sq, i) => {
    if (i >= count * BOARD_LIMITS.districtSize) {
      sq.t = 'venture';
      delete sq.d;
      delete sq.base;
    } else sq.d = Math.floor(i / BOARD_LIMITS.districtSize);
    delete sq.plot;
  });
  return board;
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
  return templateDistricts(b);
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
  return templateDistricts(b);
}

/** A ring around the edge of a hex grid, to start a hex board from. */
function hexLoop(cols = 11, rows = 7): BoardDef {
  const b = starterLoop(cols, rows);
  b.layout = 'hex';
  b.name = 'Hex loop';
  b.edges = autoEdges(b.squares, new Set(), 'hex');
  return b;
}

/**
 * The line from a selected warp or portal to where it leads: a gentle arc that bends at its
 * middle, at right angles to the line (always the upper side), in the link's color. Glowing dots
 * travel along it toward the destination, which pulses as they arrive. Widths are in screen
 * pixels at any zoom (`scale`); reduced motion draws it still.
 */
function drawLink(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  color: string,
  scale: number,
  still: boolean,
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  // The normal pointing up the screen (or right, for a vertical line).
  let nx = -dy / length;
  let ny = dx / length;
  if (ny > 0 || (Math.abs(ny) < 1e-6 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const bend = Math.min(90, Math.max(16, length * 0.14));
  // A quadratic curve's middle sits halfway to its control point.
  const c = { x: (a.x + b.x) / 2 + nx * bend * 2, y: (a.y + b.y) / 2 + ny * bend * 2 };
  const at = (t: number) => ({
    x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
    y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
  });
  const px = 1 / scale;
  const now = performance.now();
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
  ctx.strokeStyle = 'rgba(16, 26, 51, 0.8)';
  ctx.lineWidth = 9 * px;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 4 * px;
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Where it starts: a small ring.
  ctx.beginPath();
  ctx.arc(a.x, a.y, 7 * px, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 3 * px;
  ctx.strokeStyle = color;
  ctx.stroke();
  // Dots traveling to the destination, each with a short fading tail.
  const period = 1500;
  const dots = 3;
  for (let k = 0; k < dots; k++) {
    const head = still ? (k + 0.5) / dots : (now / period + k / dots) % 1;
    for (let tail = 5; tail >= 0; tail--) {
      const t = head - tail * 0.018;
      if (t < 0) continue;
      const p = at(t);
      // Fade in after leaving and out before arriving, so dots never pop.
      const edge = Math.min(1, t / 0.08, (1 - t) / 0.08);
      ctx.globalAlpha = Math.max(0, edge) * (1 - tail / 6);
      ctx.beginPath();
      ctx.arc(p.x, p.y, (tail === 0 ? 5.5 : 4.5 - tail * 0.5) * px, 0, Math.PI * 2);
      ctx.fillStyle = tail === 0 ? '#fff' : color;
      if (tail === 0) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
  ctx.globalAlpha = 1;
  // Where it leads: a filled ring that pulses outward as each dot arrives.
  if (!still) {
    const k = ((now / period) * dots) % 1;
    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.beginPath();
    ctx.arc(b.x, b.y, (10 + k * 22) * px, 0, Math.PI * 2);
    ctx.lineWidth = 3 * px;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.beginPath();
  ctx.arc(b.x, b.y, 9 * px, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3 * px;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.restore();
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
  /**
   * Where the next property goes: the first district still short of four (so gaps are filled
   * first), else a new district in the next unused color. Null when all ten are full.
   */
  const nextDistrict = (): DistrictChoice | null =>
    districtChoices(board)
      .filter((d) => d.count < BOARD_LIMITS.districtSize)
      .sort((a, b) => (a.index ?? Infinity) - (b.index ?? Infinity))[0] ?? null;
  let selected: number | null = null;
  let choosingLink = false;
  let selection = new Set<number>();
  let moving: { anchor: { x: number; y: number }; target: { x: number; y: number } } | null = null;
  let marquee: { start: { x: number; y: number }; end: { x: number; y: number } } | null = null;
  let placeTool: Tool = 'shop';
  const isPlacing = () => tool !== 'select' && tool !== 'pan' && tool !== 'erase';
  const clearSelection = () => {
    choosingLink = false;
    selected = null;
    selection.clear();
    moving = null;
    marquee = null;
  };
  let hover: { x: number; y: number } | null = null;
  /** The board's problems, and each tile's own (refreshed with the panels). */
  let check: BoardCheck = { errors: [], warnings: [], issues: [] };
  let tileIssues = new Map<number, BoardIssue[]>();
  const refreshCheck = () => {
    check = validateBoard(board);
    tileIssues = new Map();
    for (const issue of check.issues)
      for (const i of issue.squares ?? []) tileIssues.set(i, [...(tileIssues.get(i) ?? []), issue]);
  };
  /** Tiles just placed (a bounce and a gold ring) or erased (a red ring), with when it happened. */
  let tileFx: { x: number; y: number; t0: number; erased: boolean }[] = [];
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
  /** The board's problem count on the Board settings button: red errors, else yellow warnings. */
  const settingsBadge = h('span', { class: 'ed-badge', 'aria-hidden': 'true', hidden: true });
  settingsButton.append(settingsBadge);
  info.append(settingsButton);
  const zoomChip = h(
    'button',
    {
      class: 'zoom-chip',
      title: 'Zoom: scroll, pinch or - / +. Tap to reset the zoom and center the board.',
      'aria-label': 'Reset zoom and center the board',
      onclick: () => {
        zoomOut = EDITOR_ZOOM_MIN_OUT;
        centerOnBoard();
        redraw();
      },
    },
    '300%',
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
  const paletteList = h('div', { class: 'ed-palette-list' });
  palette.append(
    h(
      'div',
      { class: 'ed-side-head' },
      h(
        'div',
        { class: 'ed-side-title' },
        h('h2', null, 'Tiles'),
        h('p', null, 'Pick one, then click or drag on the board'),
      ),
    ),
    paletteList,
  );
  const stage = h('div', { class: 'ed-stage' });
  const canvas = h('canvas', { class: 'ed-canvas' }) as HTMLCanvasElement;
  stage.append(canvas);
  const tileInspector = h('div', {
    class: 'ed-side ed-tile-inspector glass',
    role: 'dialog',
    'aria-label': 'Tile options',
    hidden: true,
  });
  const settingsPanel = h('div', {
    class: 'ed-side ed-settings glass',
    role: 'dialog',
    'aria-label': 'Board settings',
    hidden: true,
  });
  const inspector = h('div', { class: 'ed-inspector' });
  const actionbar = h('div', {
    class: 'ed-actions prompt-center glass show',
    'aria-label': 'Editing actions',
  });
  const actionContent = h('div', { class: 'ed-action-content' });
  actionbar.append(actionContent);
  root.append(stage, info, topbar, palette, toolBar, tileInspector, settingsPanel, actionbar);
  let notice = '';
  let noticeBad = false;
  let noticeTimer = 0;
  let actionAnimation: Animation | null = null;
  let lastPrompt = '';
  let promptAnimation: Animation | null = null;
  let lastButtons = '';
  let lastContext = '';
  let entranceAnimations: Animation[] = [];

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

  // Release the old fixed layout before measuring the next destination, even on interruption.
  const stopActionMorph = () => {
    if (actionAnimation) {
      actionAnimation.onfinish = null;
      actionAnimation.cancel();
      actionAnimation = null;
    }
    actionbar.classList.remove('morphing');
    actionContent.style.removeProperty('--ed-content-width');
    actionContent.style.removeProperty('--ed-content-height');
  };

  // Measure at natural size once; the animated shell must never constrain its contents.
  const morphActions = (from: DOMRect) => {
    const to = actionbar.getBoundingClientRect();
    const contentSize = actionContent.getBoundingClientRect();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const prompt = actionContent.querySelector<HTMLElement>('.prompt-text');
    const buttons = actionContent.querySelector<HTMLElement>('.ed-action-tools');
    const context = actionContent.querySelector<HTMLElement>('.ed-context-controls');
    const buttonKey = buttons?.textContent ?? '';
    const contextKey = settings ? 'settings' : tool === 'shop' ? 'districts' : '';
    const enter = (el: HTMLElement | null) => {
      if (el && !reduced)
        entranceAnimations.push(
          el.animate(
            [
              { opacity: 0, transform: 'translateY(4px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: 220, easing: 'ease-out' },
          ),
        );
    };
    if (reduced || prompt?.textContent !== lastPrompt) {
      promptAnimation?.cancel();
      promptAnimation = null;
      if (prompt && !reduced)
        promptAnimation = prompt.animate(
          [
            { clipPath: 'inset(0 100% 0 0)', opacity: 0.6 },
            { clipPath: 'inset(0 0% 0 0)', opacity: 1 },
          ],
          { duration: 220, easing: 'steps(16, end)' },
        );
    }
    if (buttonKey && buttonKey !== lastButtons) enter(buttons);
    if (contextKey === 'settings' && contextKey !== lastContext) enter(context);
    lastPrompt = prompt?.textContent ?? '';
    lastButtons = buttonKey;
    lastContext = contextKey;
    if (reduced || (Math.abs(to.width - from.width) < 1 && Math.abs(to.height - from.height) < 1)) return;
    actionContent.style.setProperty('--ed-content-width', `${contentSize.width}px`);
    actionContent.style.setProperty('--ed-content-height', `${contentSize.height}px`);
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
      stopActionMorph();
      redraw();
    };
  };

  // ------------------------------------------------------------ model helpers

  const recompute = () => {
    board = ensureEditorBank(board);
    for (const sq of board.squares) if (sq.t === 'shop') delete sq.plot;
    board.edges = autoEdges(board.squares, new Set(), board.layout);
    board.bank = board.squares.findIndex((s) => s.t === 'bank');
    connectTransports(board);
    refreshCheck();
    {
      const bad = check.errors.length;
      const warn = check.warnings.length;
      settingsBadge.hidden = !bad && !warn;
      settingsBadge.textContent = String(bad || warn);
      settingsBadge.classList.toggle('warn', !bad);
      settingsButton.setAttribute(
        'aria-label',
        bad
          ? `Board settings: ${plural(bad, 'problem')} to fix`
          : warn
            ? `Board settings: ${plural(warn, 'warning')}`
            : 'Board settings',
      );
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
    // The Property tile in the Tiles pane shows the next district's color.
    if (tool === 'shop') drawPalette();
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
      tileFx.push({ x, y, t0: performance.now(), erased: true });
      board.squares.splice(i, 1);
      if (selected === i) selected = null;
      else if (selected != null && selected > i) selected--;
      return true;
    }
    if (tool === 'select' || tool === 'pan' || tool === 'place') return false;
    const t: SquareType = tool;
    let d = -1;
    if (t === 'shop') {
      // Properties fill districts automatically; painting over one keeps its district.
      if (i >= 0 && board.squares[i].t === 'shop') return false;
      const next = nextDistrict();
      if (!next) return false;
      if (next.index == null) board.districts.push({ name: next.name, color: next.color });
      d = next.index ?? board.districts.length - 1;
    }
    const prev = i >= 0 ? board.squares[i] : null;
    const sq: BoardSquareDef =
      t === 'shop'
        ? {
            x,
            y,
            t,
            d,
          }
        : // New warps and portals start unlinked (grey); linking them gives them a color.
          { x, y, t };
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
    tileFx.push({ x, y, t0: performance.now(), erased: false });
    return true;
  };

  // ------------------------------------------------------------ canvas

  let scale = 1;
  let cameraScale: number | null = null;
  let boardImage: HTMLCanvasElement | null = null;
  let boardImageKey = '';
  let zoomOut = EDITOR_ZOOM_MIN_OUT;
  let zoomFrame = 0;
  let destroyed = false;
  const zoomBy = (delta: number) => {
    zoomOut = Math.max(EDITOR_ZOOM_MIN_OUT, Math.min(ZOOM_MAX_OUT, zoomOut + delta));
    redraw();
  };
  let ox = 0;
  let oy = 0;
  // Panning: where the view's center sits, in board units from the grid's center. The camera
  // eases toward it like the zoom does; dragging moves it directly.
  const pan = { x: 0, y: 0 };
  let cameraPan: { x: number; y: number } | null = null;
  /** Go to a tile: close the settings, select it and glide the view to it. */
  const showTile = (i: number) => {
    const { w, h: hh } = worldSize(board);
    const c = center(board.squares[i]);
    clearSelection();
    settings = false;
    tool = 'select';
    selection = new Set([i]);
    selected = i;
    pan.x = c.x - w / 2;
    pan.y = c.y - hh / 2;
    drawPalette();
    drawInspector();
    redraw();
  };
  /** Center the view on the tiles (the grid's middle when there are none). */
  const centerOnBoard = () => {
    const { w, h: hh } = worldSize(board);
    const cs = board.squares.map((sq) => center(sq));
    if (!cs.length) {
      pan.x = pan.y = 0;
      return;
    }
    const xs = cs.map((c) => c.x);
    const ys = cs.map((c) => c.y);
    pan.x = (Math.min(...xs) + Math.max(...xs)) / 2 - w / 2;
    pan.y = (Math.min(...ys) + Math.max(...ys)) / 2 - hh / 2;
  };
  /** Keep part of the grid on screen: the view's center can't wander past its edges. */
  const clampPan = (viewW: number, viewH: number, s: number) => {
    const { w, h: hh } = worldSize(board);
    const limX = Math.max(0, w / 2 - viewW / 2 / s + 150);
    const limY = Math.max(0, hh / 2 - viewH / 2 / s + 150);
    pan.x = Math.max(-limX, Math.min(limX, pan.x));
    pan.y = Math.max(-limY, Math.min(limY, pan.y));
  };
  let panning: { x: number; y: number } | null = null;
  let spaceHeld = false;
  const panBy = (dx: number, dy: number) => {
    pan.x -= dx / scale;
    pan.y -= dy / scale;
    const r = stage.getBoundingClientRect();
    clampPan(r.width, r.height, scale);
    cameraPan = { ...pan };
    redraw();
  };
  let previewCache: { key: string; G: ReturnType<typeof newGame> } | null = null;
  /** The editing board as a game (for painting tiles), rebuilt only when the board changes. */
  const previewGame = () => {
    const key = JSON.stringify(board);
    if (previewCache?.key !== key) previewCache = { key, G: preview() };
    return previewCache.G;
  };
  const preview = () => {
    const game = newGame({
      rules: 'standard',
      plots: 'none',
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
      : !settingsPanel.hidden
        ? settingsPanel.getBoundingClientRect()
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
    clampPan(r.width, r.height, target);
    cameraPan =
      cameraPan == null || reduced
        ? { ...pan }
        : { x: cameraPan.x + (pan.x - cameraPan.x) * 0.15, y: cameraPan.y + (pan.y - cameraPan.y) * 0.15 };
    if (Math.hypot(pan.x - cameraPan.x, pan.y - cameraPan.y) < 0.5) cameraPan = { ...pan };
    else if (!zoomFrame) zoomFrame = requestAnimationFrame(redraw);
    ox = r.width / 2 - (w / 2 + cameraPan.x) * scale;
    oy = r.height / 2 - (hh / 2 + cameraPan.y) * scale;
    const out =
      far < near ? (Math.log(scale / near) / Math.log(far / near)) * ZOOM_MAX_OUT : EDITOR_ZOOM_MIN_OUT;
    zoomChip.textContent = `${editorZoomPercent(out)}%`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#16213f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, oy * dpr);
    paintGrass(ctx);
    // Cache the board and empty grid during camera motion, as the game caches its scenery.
    const closest = zoomScale(near, far, EDITOR_ZOOM_MIN_OUT);
    const imageScale = Math.min(2, Math.max(1, Math.ceil(closest * dpr * 2) / 2));
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
    // Only the selected transport shows its connection, over the cached board.
    const source = selected == null ? null : board.squares[selected];
    const linked = source?.link == null ? null : board.squares[source.link];
    if (
      !settings &&
      tool === 'select' &&
      selection.size === 1 &&
      !moving &&
      source &&
      linked &&
      (source.t === 'warp' || source.t === 'portal')
    ) {
      drawLink(ctx, center(source), center(linked), transportColor(source), scale, reduced);
      if (!reduced && !zoomFrame) zoomFrame = requestAnimationFrame(redraw);
    }
    // Hover and selection
    if (hover && !moving) {
      const c = center(hover);
      ctx.save();
      tileShape(ctx, board.layout, c.x, c.y, 46, 14);
      ctx.fillStyle = tool === 'erase' ? 'rgba(255,138,138,0.2)' : 'rgba(255,209,102,0.2)';
      ctx.fill();
      // Screen-sized contrast strokes stay easy to spot on grass and tiles at every zoom.
      ctx.lineWidth = 6 / scale;
      ctx.strokeStyle = '#17213a';
      ctx.stroke();
      ctx.lineWidth = 3 / scale;
      ctx.strokeStyle = tool === 'erase' ? '#ff8a8a' : '#ffd166';
      ctx.stroke();
      ctx.restore();
    }
    // Selected tiles glow like a game's choices: a gold tint, a pulsing white outline and (for
    // a few tiles) white rings spreading out. Big groups skip the rings to stay calm.
    const now = reduced ? 0 : performance.now();
    for (const i of selection)
      if (board.squares[i] && !moving)
        drawTileGlow(ctx, board.layout, center(board.squares[i]), '#ffd166', now, selection.size <= 6, i);
    // Just-placed tiles bounce up and settle inside a gold ring with sparkles; erased ones leave a
    // red ring.
    tileFx = reduced ? [] : tileFx.filter((f) => now - f.t0 < TILE_FX_MS);
    for (const f of tileFx) {
      const k = (now - f.t0) / TILE_FX_MS;
      const c = center(f);
      if (!f.erased) {
        const G = previewGame();
        const node = G.nodes[indexAt(f.x, f.y)];
        const pop = 1 + 0.14 * Math.sin(Math.PI * Math.min(1, k * 1.6));
        if (node && pop > 1.001) {
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.scale(pop, pop);
          ctx.translate(-c.x, -c.y);
          paintSquare(ctx, G, node);
          ctx.restore();
        }
      }
      drawRingBurst(ctx, board.layout, c, f.erased ? '#ff8a8a' : '#ffd166', k, !f.erased);
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
    if (!moving) drawBadges(ctx);
    if (!reduced && (selection.size || tileFx.length) && !zoomFrame)
      zoomFrame = requestAnimationFrame(redraw);
  };

  /**
   * A badge in the top-right corner of each tile with a problem: red when the board can't be
   * played until it's fixed, yellow when it's only worth fixing. It shows a number when there is
   * one to give (properties missing from the tile's district), else "!". Screen-sized.
   */
  const drawBadges = (ctx: CanvasRenderingContext2D) => {
    const r = Math.min(10 / scale, 16);
    for (const [i, list] of tileIssues) {
      const sq = board.squares[i];
      if (!sq) continue;
      const bad = list.some((x) => x.level === 'error');
      const mark = list.find((x) => x.level === (bad ? 'error' : 'warning') && x.badge)?.badge ?? '!';
      const c = center(sq);
      const x = c.x + 34;
      const y = c.y - 34;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = bad ? '#e5484d' : '#ffc21a';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 4;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.min(2 / scale, 3);
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.fillStyle = bad ? '#fff' : '#3b2a00';
      ctx.font = `${r * 1.35}px "Lilita One", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mark, x, y + r * 0.08);
      ctx.restore();
    }
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
    if (choosingLink && selected != null) {
      const target = indexAt(cell.x, cell.y);
      const copy = structuredClone(board);
      if (!linkEditorTiles(copy, selected, target)) {
        const type = board.squares[selected].t;
        say(
          board.squares[target]?.t === type
            ? `All five ${type} colors are in use. Unlink a pair first, or link this one to the bank.`
            : `Pick another ${type} or the bank.`,
          true,
        );
        return;
      }
      snapshot();
      board = copy;
      choosingLink = false;
      notice = '';
      changed();
      return;
    }
    if (tool === 'pan') {
      panning = { x: e.clientX, y: e.clientY };
      root.classList.add('ed-grabbing');
      return;
    }
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
  /** Two fingers: their midpoint drags the view while their spread zooms. */
  const midpoint = () => {
    const [a, b] = [...touches.values()];
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
  };
  let pinchMid: { x: number; y: number } | null = null;
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomBy(wheelZoomStep(e.deltaY, e.deltaMode));
    },
    { passive: false },
  );
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    // The middle or right button, or Space held, drags the view with any tool.
    if (e.pointerType !== 'touch' && (e.button === 1 || e.button === 2 || spaceHeld)) {
      e.preventDefault();
      panning = { x: e.clientX, y: e.clientY };
      root.classList.add('ed-grabbing');
      return;
    }
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 1) {
        touchStart = e;
        pinching = false;
      } else {
        pinching = true;
        touchStart = null;
        panning = null;
        endStroke();
      }
      pinchDistance = span();
      pinchMid = midpoint();
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
        const mid = midpoint();
        if (mid && pinchMid) panBy(mid.x - pinchMid.x, mid.y - pinchMid.y);
        pinchMid = mid;
        return;
      }
      if (panning) {
        panBy(e.clientX - panning.x, e.clientY - panning.y);
        panning = { x: e.clientX, y: e.clientY };
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
    if (panning) {
      panBy(e.clientX - panning.x, e.clientY - panning.y);
      panning = { x: e.clientX, y: e.clientY };
      return;
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
    if (panning) {
      panning = null;
      root.classList.remove('ed-grabbing');
    }
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
    pinchMid = midpoint();
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
    pan: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
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
    const scroll = paletteList.scrollTop;
    const focused = palette.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.tool
      : null;
    clear(paletteList);
    const next = nextDistrict();
    for (const g of PALETTE.filter((g) => g.group !== 'Tools')) {
      const section = h('section', { class: 'ed-tile-category', 'aria-label': g.group });
      section.append(h('div', { class: 'ed-side-sec-head' }, h('h4', null, g.group)));
      const row = h('div', { class: 'ed-tools' });
      for (const it of g.items) {
        const example = h('canvas', { class: 'ed-tile-example', 'aria-hidden': 'true' }) as HTMLCanvasElement;
        example.width = 136;
        example.height = 148;
        const tile = newGame({
          rules: 'standard',
          plots: 'none',
          target: 5000,
          roundCap: 0,
          seed: 1,
          seats: [{ name: 'Builder', cpu: true, ch: 'farmer' }],
          board: {
            ...board,
            districts:
              next && next.index == null
                ? [...board.districts, { name: next.name, color: next.color }]
                : board.districts,
            cols: 1,
            rows: 1,
            edges: [],
            bank: 0,
            squares: [
              {
                x: 0,
                y: 0,
                t: it.tool as SquareType,
                // The Property tile shows the color the next property will get.
                ...(it.tool === 'shop'
                  ? { d: next ? (next.index ?? board.districts.length) : -1, base: 200 }
                  : {}),
              },
            ],
          },
        });
        const ctx = example.getContext('2d')!;
        ctx.scale(1.3, 1.3);
        ctx.translate(-48, -44);
        paintSquare(ctx, tile, tile.nodes[0]);
        row.append(
          h(
            'button',
            {
              class: `ed-tool ${tool === it.tool ? 'on' : ''}`,
              'aria-label': it.label,
              'aria-description': it.hint,
              'data-tool': it.tool,
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
          ),
        );
      }
      section.append(row);
      paletteList.append(section);
    }
    paletteList.scrollTop = scroll;
    if (focused)
      paletteList
        .querySelector<HTMLButtonElement>(`[data-tool="${focused}"]`)
        ?.focus({ preventScroll: true });
  };

  // ------------------------------------------------------------ inspector

  const field = (label: string, input: HTMLElement) =>
    h('label', { class: 'ed-field' }, h('span', null, label), input);

  const problemEntry = (issue: BoardIssue, onTile = false) => {
    const at = onTile ? undefined : issue.squares?.find((i) => !!board.squares[i]);
    const tile = at == null ? null : board.squares[at];
    const level = issue.level === 'error' ? 'Needs fixing' : 'Worth checking';
    const row = h(
      tile ? 'button' : 'div',
      {
        class: `ed-problem-entry ${issue.level}${tile ? ' ed-issue-link' : ''}`,
        ...(tile ? { type: 'button' } : {}),
      },
      h('span', { class: 'ed-problem-level' }, level),
      h('span', { class: 'ed-problem-text' }, onTile ? (issue.tileText ?? issue.text) : issue.text),
      tile
        ? h('span', { class: 'ed-problem-target' }, `View tile · Column ${tile.x + 1}, row ${tile.y + 1} →`)
        : null,
    );
    if (at != null) row.onclick = () => showTile(at);
    return row;
  };

  const drawInspector = () => {
    if (destroyed) return;
    const from = actionbar.getBoundingClientRect();
    const previousPrompt = actionContent.querySelector<HTMLElement>('.prompt-text');
    const next = nextDistrict();
    stopActionMorph();
    for (const animation of entranceAnimations) animation.cancel();
    entranceAnimations = [];
    clear(inspector);
    clear(tileInspector);
    nameInput.value = board.name;
    const unsaved = JSON.stringify(board) !== savedJSON;
    const inList = listBoards().some((b) => b.id === board.id);
    status.textContent = !inList ? 'Not saved yet' : unsaved ? 'Unsaved changes' : 'Saved';
    status.classList.toggle('unsaved', unsaved || !inList);

    refreshCheck();
    const controls = h('div', { class: 'ed-context-controls' });
    clear(actionContent);
    syncTools();
    palette.hidden = !isPlacing() || settings;
    root.classList.toggle('ed-placing', !palette.hidden);
    root.classList.toggle('ed-moving', !!moving);
    root.classList.toggle('ed-linking', choosingLink);
    root.classList.toggle('ed-pan', tool === 'pan');
    settingsButton.setAttribute('aria-pressed', String(settings));
    const label = PALETTE.flatMap((g) => g.items).find((it) => it.tool === tool)?.label;
    actionContent.append(
      h(
        'div',
        { class: 'prompt-text', role: 'status', 'aria-live': 'polite' },
        notice ||
          (choosingLink ? 'Click a tile or the bank to link to · Escape to cancel' : '') ||
          (settings
            ? check.errors.length
              ? `Board settings · ${check.errors.length} problem${check.errors.length === 1 ? '' : 's'} to fix before playing`
              : 'Board settings · ready to play'
            : moving
              ? 'Move the group, then click to place · Esc to cancel'
              : tool === 'select'
                ? selection.size
                  ? `${selection.size} tile${selection.size === 1 ? '' : 's'} selected`
                  : 'Click a tile, or drag to select a group'
                : tool === 'pan'
                  ? 'Drag to move around the board · tap the zoom to recenter'
                  : tool === 'shop'
                    ? next
                      ? `Property: goes into ${next.name} (${next.count} of ${BOARD_LIMITS.districtSize}) · click or drag to place`
                      : 'All ten districts have 4 properties'
                    : `${label}: ${tool === 'erase' ? 'click or drag to remove squares' : 'click or drag to place tiles'}`),
      ),
      h(
        'div',
        { class: 'ed-action-tools btn-row' },
        ...(tool === 'select' && selection.size && !moving && !settings && !choosingLink
          ? [
              h(
                'button',
                {
                  class: 'btn small main',
                  onclick: () => {
                    const anchor = selectionAnchor(board, selection);
                    choosingLink = false;
                    moving = { anchor, target: { ...anchor } };
                    notice = '';
                    drawInspector();
                    redraw();
                  },
                },
                'Move',
              ),
              // Erase skips the bank, so it's offered unless the bank is all that's selected.
              ...([...selection].every((i) => board.squares[i].t === 'bank')
                ? []
                : [
                    h(
                      'button',
                      {
                        class: 'btn small danger',
                        onclick: () => {
                          snapshot();
                          const keptBank = [...selection].some((i) => board.squares[i].t === 'bank');
                          board.squares = board.squares.filter(
                            (sq, i) => sq.t === 'bank' || !selection.has(i),
                          );
                          clearSelection();
                          changed();
                          if (keptBank) say('Erased. The bank stays: every board needs one.');
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
    // Board settings: a side panel on the right while it is open.
    const keepScroll = settingsPanel.querySelector('.ed-side-body')?.scrollTop ?? 0;
    clear(settingsPanel);
    settingsPanel.hidden = !settings;
    if (settings) {
      const author = h('input', {
        value: board.author ?? '',
        maxlength: '32',
        placeholder: 'Your name',
      }) as HTMLInputElement;
      author.onchange = () => {
        board.author = author.value.trim() || undefined;
        drawInspector();
      };
      // Grid layout: square or hex. Tiles keep their cells; connections are recalculated.
      const layoutBtn = (l: BoardLayout, label: string) => {
        const on = (board.layout ?? 'square') === l;
        return h(
          'button',
          {
            class: `seg-btn ${on ? 'on' : ''}`,
            'aria-pressed': String(on),
            onclick: async () => {
              if (on) return;
              if (
                board.squares.length &&
                !(await ask(
                  `Switch to a ${label.toLowerCase()} grid?`,
                  'Tiles stay in their cells, but which tiles connect will change.',
                  'Switch',
                ))
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
      };
      const pricing = districtStartingValues(board);
      const cards = board.districts.map((d, i) => {
        const count = board.squares.filter((s) => s.t === 'shop' && s.d === i).length;
        const name = h('input', {
          class: 'ed-dname',
          value: d.name,
          maxlength: '24',
          'aria-label': 'District name',
        }) as HTMLInputElement;
        name.onchange = () => {
          snapshot();
          d.name = name.value.trim() || d.name;
          changed();
        };
        const color = h('input', {
          type: 'color',
          value: d.color,
          'aria-label': `${d.name} color`,
        }) as HTMLInputElement;
        color.onchange = () => {
          snapshot();
          d.color = color.value;
          changed();
        };
        const del = h(
          'button',
          { class: 'ed-icon-btn', 'aria-label': `Delete ${d.name}`, title: 'Delete district' },
          icon(TRASH),
        );
        del.onclick = async () => {
          if (
            count &&
            !(await ask(
              `Delete ${d.name}?`,
              `Its ${count} propert${count === 1 ? 'y' : 'ies'} will be removed from the board.`,
              'Delete',
              true,
            ))
          )
            return;
          snapshot();
          board.squares = board.squares.filter((s) => !(s.t === 'shop' && s.d === i));
          for (const s of board.squares) if (s.t === 'shop' && s.d! > i) s.d!--;
          board.districts.splice(i, 1);
          clearSelection();
          changed();
        };
        const note = h(
          'small',
          { title: 'Auto prices rise with the walk from the bank: nearest district cheapest.' },
          d.startingValue == null ? 'Auto, by distance' : `Custom · auto is ${fmt(pricing.defaults[i])}`,
        );
        const reset = h(
          'button',
          {
            class: 'ed-link-btn',
            hidden: d.startingValue == null,
            onclick: () => {
              snapshot();
              delete d.startingValue;
              changed();
            },
          },
          'Use auto',
        );
        const price = stepper({
          value: pricing.averages[i],
          min: K.districtProperty.minAverage,
          max: K.districtProperty.maxAverage,
          step: K.districtProperty.step,
          label: `${d.name} starting average`,
          onStart: snapshot,
          onChange(value) {
            d.startingValue = value;
            recompute();
            redraw();
            note.textContent = `Custom · auto is ${fmt(pricing.defaults[i])}`;
            reset.hidden = false;
            status.textContent = 'Unsaved changes';
            status.classList.add('unsaved');
          },
        });
        return h(
          'div',
          { class: 'ed-dcard', style: `--dc:${d.color}` },
          h(
            'div',
            { class: 'ed-dcard-top' },
            h('label', { class: 'ed-swatch', title: 'Change color' }, color),
            name,
            h(
              'span',
              {
                class: `ed-count ${count === BOARD_LIMITS.districtSize ? 'full' : ''}`,
                title: 'Properties in this district',
              },
              `${count}/${BOARD_LIMITS.districtSize}`,
            ),
            del,
          ),
          h(
            'div',
            { class: 'ed-dcard-price' },
            h('div', { class: 'ed-price-label' }, h('span', null, 'Starting average'), note, reset),
            price.el,
          ),
        );
      });
      const add =
        board.districts.length < BOARD_LIMITS.maxDistricts
          ? h(
              'button',
              {
                class: 'ed-add',
                onclick: () => {
                  snapshot();
                  const i = board.districts.length;
                  const free =
                    DISTRICT_COLORS.find((c) => !board.districts.some((d) => d.color === c)) ??
                    DISTRICT_COLORS[i % DISTRICT_COLORS.length];
                  board.districts.push({
                    name:
                      DISTRICT_NAMES.find((n) => !board.districts.some((d) => d.name === n)) ??
                      `District ${i + 1}`,
                    color: free,
                  });
                  changed();
                },
              },
              '+ Add district',
            )
          : null;
      const props = board.squares.filter((s) => s.t === 'shop').length;
      const body = h(
        'div',
        { class: 'ed-side-body' },
        sideSection(
          'Board',
          null,
          h(
            'div',
            { class: 'ed-field' },
            h('span', null, 'Grid'),
            h('div', { class: 'seg ed-seg' }, layoutBtn('square', 'Square'), layoutBtn('hex', 'Hex')),
          ),
          field('Made by', author),
        ),
        sideSection(
          'Districts',
          `${board.districts.length} of ${BOARD_LIMITS.maxDistricts}`,
          h(
            'p',
            { class: 'hint' },
            'Each needs exactly 4 properties. In a game the nearest one costs 30G less than the average and the farthest 30G more.',
          ),
          ...cards,
          add,
        ),
        sideSection(
          check.errors.length ? 'Problems' : 'Ready to play',
          check.errors.length ? String(check.errors.length) : null,
          h(
            'p',
            { class: 'hint' },
            [
              plural(board.squares.length, 'tile'),
              plural(props, 'property', 'properties'),
              plural(board.districts.length, 'district'),
            ].join(' · '),
          ),
          // Errors first; a problem on particular tiles can be clicked to go to the first one.
          ...[...check.issues]
            .sort((a, b) => Number(b.level === 'error') - Number(a.level === 'error'))
            .filter((x, k, all) => all.findIndex((y) => y.text === x.text) === k)
            .map((x) => problemEntry(x)),
          ...(check.errors.length ? [] : [h('p', { class: 'ed-ok' }, 'This board is playable.')]),
        ),
      );
      settingsPanel.append(
        sideHead('Board settings', null, () => {
          settings = false;
          drawInspector();
          redraw();
        }),
        body,
      );
      body.scrollTop = keepScroll;
    }

    // Selected square
    const squarePanel = tileInspector;
    squarePanel.hidden =
      settings || tool !== 'select' || selected == null || selection.size !== 1 || !!moving;
    const sq = selected != null ? board.squares[selected] : null;
    const tileName =
      sq?.t === 'bank'
        ? 'Bank'
        : (PALETTE.flatMap((g) => g.items).find((it) => it.tool === sq?.t)?.label ?? 'Tile');
    const squareBody = h('div', { class: 'ed-side-body' });
    squarePanel.append(
      sideHead(tileName, sq ? `Column ${sq.x + 1} · Row ${sq.y + 1}` : null, () => {
        clearSelection();
        drawInspector();
        redraw();
      }),
      squareBody,
    );
    if (!sq) squareBody.append(h('p', { class: 'hint' }, 'Use Select and click a square to edit it.'));
    else {
      // This tile's problems first, worst first, as the badge on it promised.
      const own = [...(tileIssues.get(selected!) ?? [])].sort(
        (a, b) => Number(b.level === 'error') - Number(a.level === 'error'),
      );
      if (own.length)
        squareBody.append(h('div', { class: 'ed-tile-issues' }, ...own.map((x) => problemEntry(x, true))));
      if (sq.t === 'bank')
        squareBody.append(
          h('p', { class: 'hint' }, 'Every board needs a bank. You can move it, but it cannot be erased.'),
        );
      if (sq.t === 'warp' || sq.t === 'portal') {
        const type = sq.t;
        const linked = sq.link == null ? null : board.squares[sq.link];
        const linkedName = !linked
          ? 'Not linked yet'
          : linked.t === 'bank'
            ? 'The bank'
            : `${type === 'warp' ? 'Warp' : 'Portal'} · column ${linked.x + 1}, row ${linked.y + 1}`;
        squareBody.append(
          h(
            'div',
            { class: 'ed-link-info', style: `--lc:${transportColor(sq)}` },
            h('span', { class: 'hint' }, 'Leads to'),
            h('strong', null, h('i', { class: 'ed-link-dot' }), linkedName),
            h(
              'div',
              { class: 'ed-row' },
              h(
                'button',
                {
                  class: `btn small ${choosingLink ? 'ghost' : 'main'}`,
                  onclick: () => {
                    choosingLink = !choosingLink;
                    notice = '';
                    drawInspector();
                    redraw();
                  },
                },
                choosingLink ? 'Cancel' : linked ? 'Change link' : 'Link',
              ),
              linked && !choosingLink
                ? h(
                    'button',
                    {
                      class: 'btn small ghost',
                      onclick: () => {
                        snapshot();
                        unlinkEditorTile(board, selected!);
                        changed();
                      },
                    },
                    'Unlink',
                  )
                : null,
            ),
          ),
          h(
            'p',
            { class: 'hint' },
            choosingLink
              ? `Click another ${type} or the bank. A ${type} links to one tile; if the one you pick already has a partner, that partner is unlinked.`
              : type === 'warp'
                ? 'Players who stop here jump to its link.'
                : 'Players who step on it jump to its link and keep moving.',
          ),
        );
      }
      if (sq.t === 'shop') {
        const dSel = h(
          'select',
          { 'aria-label': 'District' },
          ...board.districts.map((d, i) =>
            h(
              'option',
              {
                value: String(i),
                selected: i === sq.d,
                disabled: i !== sq.d && !canAssignProperty(board, i, selected!),
              },
              d.name,
            ),
          ),
        ) as HTMLSelectElement;
        dSel.onchange = () => {
          if (!canAssignProperty(board, Number(dSel.value), selected!)) {
            dSel.value = String(sq.d);
            return say('That district already has 4 properties.', true);
          }
          snapshot();
          sq.d = Number(dSel.value);
          changed();
        };
        squareBody.append(
          field('District', dSel),
          h(
            'div',
            { class: 'ed-tile-value' },
            h('span', null, 'Starting value'),
            h('strong', null, fmt(preview().nodes[selected!].base)),
          ),
          h('p', { class: 'hint ed-tile-note' }, 'Set the district’s average in Board settings.'),
        );
      }
    }

    controls.hidden = true;
    actionbar.classList.toggle('ed-action-error', !!notice && noticeBad);
    const hasOptions = tool === 'select' && selection.size > 0;
    actionbar.classList.toggle('status', !hasOptions);
    const nextPrompt = actionContent.querySelector<HTMLElement>('.prompt-text');
    // Keep an unchanged message on its original reveal timeline across inspector updates.
    if (previousPrompt && nextPrompt && previousPrompt.textContent === nextPrompt.textContent)
      nextPrompt.replaceWith(previousPrompt);
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
    if (!(await confirmLeave())) return;
    snapshot();
    board = { ...res.board, cols: BOARD_LIMITS.maxCols, rows: BOARD_LIMITS.maxRows };
    clearSelection();
    savedJSON = '';
    centerOnBoard();
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

  /** True when there is nothing unsaved to lose, or the player agrees to lose it. */
  const confirmLeave = async () =>
    JSON.stringify(board) === savedJSON ||
    ask('Discard your changes?', 'This board has changes that are not saved yet.', 'Discard', true);

  const leave = async () => {
    if (!(await confirmLeave())) return;
    destroy();
    handlers.onExit();
  };

  const load = (b: BoardDef, saved: boolean) => {
    board = { ...structuredClone(b), cols: BOARD_LIMITS.maxCols, rows: BOARD_LIMITS.maxRows };
    clearSelection();
    undo.length = 0;
    savedJSON = saved ? JSON.stringify(board) : '';
    zoomOut = EDITOR_ZOOM_MIN_OUT;
    centerOnBoard();
    changed();
  };

  /**
   * A pop-up in the middle of the screen over a dimmed board: a title with Close, then `body`.
   * Escape, Close or a click outside closes it. Returns the close function.
   */
  const modal = (title: string, body: HTMLElement, opts: { wide?: boolean; onClose?: () => void } = {}) => {
    const wrap = h('div', { class: 'modal-wrap ed-modal' });
    const close = () => {
      if (!wrap.isConnected) return;
      wrap.remove();
      window.removeEventListener('keydown', onEsc, true);
      opts.onClose?.();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || root.querySelector('.ed-modal:last-of-type') !== wrap) return;
      // Only this pop-up closes: the builder's own Escape (clear selection) must not run too.
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener('keydown', onEsc, true);
    wrap.append(
      h(
        'div',
        { class: `modal glass ${opts.wide ? 'wide' : ''}`, role: 'dialog', 'aria-label': title },
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

  /** Ask a yes/no question in a game-style pop-up. `danger` makes the yes button red. */
  function ask(title: string, text: string, yes: string, danger = false): Promise<boolean> {
    return new Promise((resolve) => {
      let answer = false;
      const yesBtn = h(
        'button',
        {
          class: `btn ${danger ? 'no' : 'main'}`,
          onclick: () => {
            answer = true;
            close();
          },
        },
        yes,
      );
      const close = modal(
        title,
        h(
          'div',
          { class: 'ed-ask' },
          h('p', null, text),
          h(
            'div',
            { class: 'btn-row' },
            h('button', { class: 'btn ghost', onclick: () => close() }, 'Cancel'),
            yesBtn,
          ),
        ),
        { onClose: () => resolve(answer) },
      );
      yesBtn.focus();
    });
  }

  const editorMenu = () => {
    const item = (label: string, hint: string, act: () => void, cls = '') =>
      h(
        'button',
        {
          class: `pop-menu-item ${cls}`,
          onclick: () => {
            close();
            act();
          },
        },
        h('b', null, label),
        h('small', null, hint),
      );
    const close = modal(
      'Board builder',
      h(
        'div',
        { class: 'pop-menu' },
        item('New board', 'Start from a template or a copy of a built-in board', newBoardDialog),
        item('My boards', 'Open, export or delete boards saved on this device', myBoardsDialog),
        item('Import board', 'Open a .aaboard.json file', () => void doImport()),
        item('Export board', 'Save this board as a file to share', doExport),
        item('Back to main menu', 'Leave the builder', () => void leave(), 'leave'),
      ),
    );
  };

  /** A board's picture for the lists, trimmed to its tiles and centered in a fixed frame. */
  const thumbFrame = (b: BoardDef, w: number, hh: number) =>
    h('span', { class: 'ed-thumb', style: `width:${w}px;height:${hh}px` }, boardThumb(b, w - 8, hh - 8));

  const newBoardDialog = () => {
    const opt = (title: string, text: string, make: () => BoardDef) => {
      const made = make();
      return h(
        'button',
        {
          class: 'ed-card',
          onclick: async () => {
            if (!(await confirmLeave())) return;
            close();
            load(make(), false);
          },
        },
        made.squares.length > 1
          ? thumbFrame(made, 150, 86)
          : h('span', { class: 'ed-thumb empty' }, 'Empty grid'),
        h('b', null, title),
        h('small', null, text),
      );
    };
    const close = modal(
      'New board',
      h(
        'div',
        { class: 'ed-cards' },
        opt('Starter loop', 'A playable square loop to build on.', () => starterLoop()),
        opt('Lakeside', 'A winding hex road around a lake, with a shortcut.', () => hexStarter()),
        opt('Hex loop', 'A simple loop on a hex grid.', () => hexLoop()),
        opt('Blank square grid', 'Just the bank on a square grid.', () => blankBoard()),
        opt('Blank hex grid', 'Just the bank on a hex grid.', () =>
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
      { wide: true },
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
        const open = b.id === board.id;
        list.append(
          h(
            'div',
            { class: `ed-board-item ${open ? 'open' : ''}` },
            thumbFrame(b.board, 112, 64),
            h(
              'div',
              { class: 'ed-board-info' },
              h('b', null, b.board.name),
              h(
                'small',
                null,
                `${b.board.squares.length} tiles · saved ${new Date(b.savedAt).toLocaleDateString()}${open ? ' · open now' : ''}`,
              ),
            ),
            h(
              'div',
              { class: 'ed-board-actions' },
              h(
                'button',
                {
                  class: 'btn small main',
                  onclick: async () => {
                    if (!(await confirmLeave())) return;
                    close();
                    load(b.board, true);
                  },
                },
                'Open',
              ),
              h('button', { class: 'btn small ghost', onclick: () => exportBoard(b.board) }, 'Export'),
              h(
                'button',
                {
                  class: 'ed-icon-btn',
                  'aria-label': `Delete ${b.board.name}`,
                  title: 'Delete',
                  onclick: async () => {
                    if (
                      !(await ask(
                        `Delete ${b.board.name}?`,
                        'It will be removed from My boards on this device.',
                        'Delete',
                        true,
                      ))
                    )
                      return;
                    deleteBoard(b.id);
                    draw();
                  },
                },
                icon(TRASH),
              ),
            ),
          ),
        );
      }
    };
    draw();
    const close = modal('My boards', list, { wide: true });
  };

  const onKey = (e: KeyboardEvent) => {
    if (
      (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]') ||
      root.querySelector('.ed-modal')
    )
      return;
    if (e.key === ' ' && (e.target as HTMLElement).closest('button, [role="button"], a')) return;
    if (e.key === ' ' && !e.repeat) {
      e.preventDefault();
      spaceHeld = true;
      root.classList.add('ed-grab');
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [1, 0],
      ArrowRight: [-1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    if (arrows[e.key]) {
      e.preventDefault();
      const [dx, dy] = arrows[e.key];
      // A smooth glide by a few tiles (the camera eases there).
      pan.x -= dx * 300;
      pan.y -= dy * 300;
      redraw();
      return;
    }
    if (e.key === 'Escape') {
      if (choosingLink) choosingLink = false;
      else if (moving) moving = null;
      else if (settings) settings = false;
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
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key !== ' ') return;
    spaceHeld = false;
    root.classList.remove('ed-grab');
  };
  window.addEventListener('keyup', onKeyUp);
  // Remeasure responsive/font changes without replacing inputs or disturbing their focus.
  const retargetActions = () => {
    if (destroyed) return;
    const from = actionbar.getBoundingClientRect();
    stopActionMorph();
    morphActions(from);
    redraw();
  };
  const ro = new ResizeObserver(retargetActions);
  ro.observe(stage);
  document.fonts?.ready.then(retargetActions);

  function destroy() {
    destroyed = true;
    cancelAnimationFrame(zoomFrame);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
    ro.disconnect();
    clearTimeout(noticeTimer);
    stopActionMorph();
    promptAnimation?.cancel();
    for (const animation of entranceAnimations) animation.cancel();
    root.remove();
  }

  recompute();
  savedJSON = JSON.stringify(board);
  centerOnBoard();
  drawPalette();
  drawInspector();
  requestAnimationFrame(redraw);
  return destroy;
}
