import { drawLink } from '../portal-link-art';
import { linkEditorTiles, unlinkEditorTile } from './editor-links';
/**
 * Board editor (#editor): paint squares on a grid, set up districts and shop values, check the
 * board for problems, save it in this browser, export/import board files and test-play it.
 *
 * Squares in neighboring cells connect on their own; the Links tool removes a link, adds it back
 * or makes it one way. The preview is drawn with the same painter as the game board.
 */
import {
  BOARD_LIMITS,
  connectTransports,
  transportColor,
  K,
  districtStartingValues,
  BUILT_IN_BOARDS,
  autoEdges,
  edgeKey,
  neighborCells,
  type PortalWay,
  newGame,
  validateBoard,
  type BoardCheck,
  type BoardIssue,
  type BoardDef,
  type BoardLayout,
  type BoardSquareDef,
  type SquareType,
} from '@aa/engine';
import {
  drawPortals,
  drawRingBurst,
  drawRoadArrow,
  drawTileGlow,
  paintBoard,
  paintTileTypes,
  TILE_TYPE_COLORS,
  paintGrass,
  paintSquare,
  worldSize,
} from '../board';
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
import { cellAt, cellCenter, sideVector, tileShape } from '../geometry';
import {
  deleteBoard,
  exportBoard,
  isBuiltIn,
  listBoards,
  newBoardId,
  pickBoardFile,
  readBoardFile,
  saveBoard,
  uniqueName,
} from '../boardstore';
import { clear, h, fmt } from './dom';
import { boardThumb } from './thumb';
import { stepper } from './stepper';
import { DISTRICT_COLORS, DISTRICT_NAMES, districtChoices, assignPropertyDistrict } from './editor-districts';
import { moveSelection, selectionPositions, selectionAnchor, ensureEditorBank } from './editor-selection';

type Tool =
  Exclude<SquareType, 'plot'> | 'select' | 'pan' | 'draw' | 'erase' | 'links' | 'move' | 'districts';

const PALETTE: { group: string; items: { tool: Tool; label: string; hint: string }[] }[] = [
  {
    group: 'Tools',
    items: [
      { tool: 'select', label: 'Select', hint: 'Click a tile or drag to select a group.' },
      { tool: 'move', label: 'Move', hint: 'Click and drag a tile to a new spot.' },
      { tool: 'pan', label: 'Pan', hint: 'Drag to move around the board.' },
      { tool: 'draw', label: 'Draw', hint: 'Choose tiles to place on the board.' },
      { tool: 'erase', label: 'Erase', hint: 'Remove squares (click or drag).' },
      { tool: 'links', label: 'Links', hint: 'Show the links between tiles and change them.' },
    ],
  },
  {
    group: 'Layout',
    items: [
      {
        tool: 'blank',
        label: 'Blank',
        hint: 'A placeholder: lay the board out first, then place the real tile over it.',
      },
    ],
  },
  {
    group: 'Properties',
    items: [
      {
        tool: 'shop',
        label: 'Property',
        hint: 'An unassigned property. Use Districts to paint its district later.',
      },
      {
        tool: 'districts',
        label: 'Districts',
        hint: 'Paint a district onto properties. A fifth property unassigns the oldest member.',
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
      {
        tool: 'randomSuit',
        label: 'Random suit',
        hint: 'Gives one random missing suit when stepped on. Landing also draws a venture card.',
      },
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
      { tool: 'hike', label: 'Price Up', hint: 'Your fees are 10% higher until your next turn.' },
      { tool: 'swap', label: 'Swap', hint: 'Trade places with any other player.' },
    ],
  },
  {
    group: 'Transport',
    items: [
      { tool: 'warp', label: 'Warp', hint: 'Landing here warps you to its partner. Use them in pairs.' },
      { tool: 'cannon', label: 'Cannon', hint: 'Fires you to another player.' },
      { tool: 'taxi', label: 'Taxi', hint: 'Ride to any special square and use it.' },
    ],
  },
];

/** Remembers the builder's view (normal or tile types) on this device. */
const VIEW_KEY = 'adventure-avenue-editor-view';

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
 * The Links tool's badge between two linked tiles: green with a two-headed arrow (both ways), or
 * red with a cross (removed: tap to link again).
 */
function drawLinkBadge(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  off: boolean,
) {
  ctx.save();
  ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fillStyle = off ? '#e5484d' : '#2f9e5b';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fff';
  if (off) ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
  ctx.beginPath();
  if (off) {
    ctx.moveTo(-5, -5);
    ctx.lineTo(5, 5);
    ctx.moveTo(5, -5);
    ctx.lineTo(-5, 5);
  } else {
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.moveTo(-4, -4);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-4, 4);
    ctx.moveTo(4, -4);
    ctx.lineTo(8, 0);
    ctx.lineTo(4, 4);
  }
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.restore();
}

/**
 * Move a board's tiles to the middle of the builder's grid (boards are saved trimmed to the top
 * left). Hex boards move by whole row pairs so the rows keep their stagger.
 */
function centerInGrid(b: BoardDef) {
  if (!b.squares.length) return b;
  const xs = b.squares.map((s) => s.x);
  const ys = b.squares.map((s) => s.y);
  const dx = Math.floor((b.cols - (Math.max(...xs) - Math.min(...xs) + 1)) / 2) - Math.min(...xs);
  let dy = Math.floor((b.rows - (Math.max(...ys) - Math.min(...ys) + 1)) / 2) - Math.min(...ys);
  if (b.layout === 'hex') dy -= ((dy % 2) + 2) % 2;
  for (const s of b.squares) {
    s.x += dx;
    s.y += dy;
  }
  return b;
}

/**
 * A free tile side in the Links tool, where a portal can go: a faint portal (a see-through purple
 * disc with a dashed white ring and white swirls), or a gold one when it's the picked start.
 */
function drawSideMarker(ctx: CanvasRenderingContext2D, at: { x: number; y: number }, picked = false) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fillStyle = picked ? '#ffd166' : 'rgba(139, 92, 246, 0.75)';
  ctx.fill();
  if (!picked) ctx.setLineDash([5, 4]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = picked ? '#16213f' : 'rgba(255, 255, 255, 0.9)';
  for (const start of [0, Math.PI]) {
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, start, start + Math.PI * 0.75);
    ctx.stroke();
  }
  ctx.restore();
}

export interface EditorHandlers {
  onExit(): void;
  /** Test play `board`; `savedJSON` is the last saved version, to hand back on return. */
  onPlay(board: BoardDef, savedJSON: string): void;
}

export interface EditorOptions {
  /** Open as a viewer: look around only, until the player presses Edit. */
  view?: boolean;
  /** The board as last saved (from a test play), so unsaved changes still count as unsaved. */
  savedJSON?: string;
}

export function openEditor(
  app: HTMLElement,
  initial: BoardDef | null,
  handlers: EditorHandlers,
  opts: EditorOptions = {},
) {
  let board: BoardDef = centerInGrid({
    ...structuredClone(initial ?? blankBoard()),
    cols: BOARD_LIMITS.maxCols,
    rows: BOARD_LIMITS.maxRows,
  });
  /** Viewing only: the tools, panels and editing keys are off until Edit is pressed. */
  let viewing = !!opts.view;
  let tool: Tool = viewing ? 'pan' : 'select';
  let settings = false;
  let districtKey: string | null = null;
  const activeDistrict = () => {
    const choices = districtChoices(board);
    const choice = choices.find((d) => d.key === districtKey) ?? choices[0];
    districtKey = choice?.key ?? null;
    return choice;
  };
  let selected: number | null = null;
  let choosingLink = false;
  let selection = new Set<number>();
  let moving: { anchor: { x: number; y: number }; target: { x: number; y: number } } | null = null;
  let dragPointer: number | null = null;
  let marquee: { start: { x: number; y: number }; end: { x: number; y: number } } | null = null;
  let drawTool: Tool = 'shop';
  const isPlacing = () =>
    tool !== 'select' && tool !== 'pan' && tool !== 'erase' && tool !== 'links' && tool !== 'move';
  const clearSelection = () => {
    portalPick = null;
    selectedGate = null;
    choosingLink = false;
    selected = null;
    selection.clear();
    moving = null;
    dragPointer = null;
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
  /**
   * The Links tool's changes, by grid position so they survive tiles being added, erased or
   * moved: removed links (`edgeKey`) and one-way links ("x,y>x,y", from > to).
   */
  let cuts = new Set<string>();
  let oneWays = new Set<string>();
  /**
   * Portal links by grid position: tile `a`'s side `sa` opens onto tile `b`'s side `sb`; one way
   * means `a` is an entrance and `b` an exit.
   */
  let gates: { a: string; sa: number; b: string; sb: number; oneWay?: boolean }[] = [];
  /** A portal (a tile side): where a new portal link starts, and the one shown in the side panel. */
  type GateSpot = { cell: string; side: number };
  let portalPick: GateSpot | null = null;
  let selectedGate: GateSpot | null = null;
  const cellKey = (c: { x: number; y: number }) => `${c.x},${c.y}`;
  /** Read the removed and one-way links from the board (on opening it, undo or revert). */
  const readLinks = () => {
    const pair = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    const linked = new Set(board.edges.map(([a, b]) => pair(a, b)));
    cuts = new Set(
      autoEdges(board.squares, new Set(), board.layout)
        .filter(([a, b]) => !linked.has(pair(a, b)))
        .map(([a, b]) => edgeKey(board.squares[a], board.squares[b])),
    );
    oneWays = new Set(
      (board.oneWay ?? [])
        .filter(([a, b]) => board.squares[a] && board.squares[b])
        .map(([a, b]) => `${cellKey(board.squares[a])}>${cellKey(board.squares[b])}`),
    );
    gates = (board.portalLinks ?? [])
      .filter((l) => board.squares[l.a] && board.squares[l.b])
      .map((l) => {
        const a = cellKey(board.squares[l.a]);
        const b = cellKey(board.squares[l.b]);
        // Boards from before portal kinds kept one-way portals in `oneWay`.
        if (oneWays.delete(`${b}>${a}`)) return { a: b, sa: l.sb, b: a, sb: l.sa, oneWay: true };
        if (oneWays.delete(`${a}>${b}`)) return { a, sa: l.sa, b, sb: l.sb, oneWay: true };
        return { a, sa: l.sa, b, sb: l.sb, ...(l.oneWay ? { oneWay: true } : {}) };
      });
    if (selectedGate && !gateLinks(selectedGate).length) selectedGate = null;
  };
  readLinks();

  const root = h('div', { class: 'editor' });
  app.append(root);

  // ------------------------------------------------------------ layout

  const nameInput = h('input', {
    class: 'ed-name',
    maxlength: String(BOARD_LIMITS.nameLength),
  }) as HTMLInputElement;
  const status = h('span', { class: 'ed-status' });
  const title = h('span', { class: 'gc-title' }, 'Board builder');
  const info = h('div', { class: 'ed-info info-chip glass' }, title, nameInput, status);
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
  /**
   * The view chip: Normal (the board as it will look) or Tile types (each tile a solid color
   * for its kind, districts as colored borders), remembered on this device. A key of the colors
   * shows under the toolbar in the tile-type view.
   */
  let typeView = false;
  try {
    typeView = localStorage.getItem(VIEW_KEY) === 'types';
  } catch {
    /* private browsing */
  }
  const viewChip = h('button', {
    class: 'btn small ed-view-chip',
    title: 'Switch between the normal look and a view colored by tile type.',
    onclick: () => {
      typeView = !typeView;
      try {
        localStorage.setItem(VIEW_KEY, typeView ? 'types' : 'normal');
      } catch {
        /* private browsing */
      }
      syncView();
      redraw();
    },
  });
  const legend = h(
    'div',
    { class: 'ed-legend glass', 'aria-label': 'Tile type colors' },
    ...Object.values(TILE_TYPE_COLORS).map(({ fill, label }) =>
      h('span', { class: 'ed-legend-item' }, h('i', { style: `background:${fill}` }), label),
    ),
    h('span', { class: 'ed-legend-item' }, h('i', { class: 'district' }), 'District border'),
  );
  const syncView = () => {
    viewChip.textContent = typeView ? 'View: Tile types' : 'View: Normal';
    viewChip.setAttribute('aria-pressed', String(typeView));
    viewChip.classList.toggle('on', typeView);
    legend.hidden = !typeView;
  };
  syncView();
  // Viewing: Edit and Back. Editing: Undo, Test play, Menu and Done (save or not, then view).
  const viewButtons = [
    h('button', { class: 'btn small main ed-edit', onclick: () => startEditing() }, 'Edit'),
    h('button', { class: 'btn small', onclick: () => void leave() }, 'Back'),
  ];
  const editButtons = [
    h('button', { class: 'btn small', onclick: () => doUndo(), title: 'Undo (Ctrl+Z)' }, 'Undo'),
    h('button', { class: 'btn small', onclick: () => doPlay() }, 'Test play'),
    h('button', { class: 'btn small', onclick: () => editorMenu() }, 'Menu'),
    h('button', { class: 'btn small main ed-done', onclick: () => void finishEditing() }, 'Done'),
  ];
  const topbar = h('div', { class: 'ed-top toolbar' }, viewChip, zoomChip, ...viewButtons, ...editButtons);
  /** Show the controls for viewing or editing. */
  const syncMode = () => {
    root.classList.toggle('ed-viewing', viewing);
    title.textContent = viewing ? 'Board viewer' : 'Board builder';
    nameInput.readOnly = viewing;
    for (const b of viewButtons) b.hidden = !viewing;
    for (const b of editButtons) b.hidden = viewing;
  };
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
  root.append(stage, info, topbar, legend, palette, toolBar, tileInspector, settingsPanel, actionbar);
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
    const contextKey = settings ? 'settings' : tool === 'districts' ? 'districts' : '';
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
    if (contextKey === 'districts' && contextKey !== lastContext)
      enter(actionContent.querySelector('.ed-district-colors'));
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
    // Links: neighbors connect unless removed; forget changes to links whose tiles are gone.
    const at = new Map(board.squares.map((sq, i) => [cellKey(sq), i]));
    for (const key of cuts) if (!key.split('|').every((c) => at.has(c))) cuts.delete(key);
    board.edges = autoEdges(board.squares, cuts, board.layout);
    // Portal links go when a tile is gone, or a tile is placed where a portal opens.
    const opensOnTile = (cell: string, side: number) => {
      const c = cellOf(cell);
      const [x, y] = neighborCells(board.layout, c.x, c.y)[side] ?? [c.x, c.y];
      return at.has(`${x},${y}`);
    };
    gates = gates.filter(
      (g) => at.has(g.a) && at.has(g.b) && !opensOnTile(g.a, g.sa) && !opensOnTile(g.b, g.sb),
    );
    if (selectedGate && !gateLinks(selectedGate).length) selectedGate = null;
    const portalLinks = gates.map((g) => ({
      a: at.get(g.a)!,
      b: at.get(g.b)!,
      sa: g.sa,
      sb: g.sb,
      ...(g.oneWay ? { oneWay: true } : {}),
    }));
    if (portalLinks.length) board.portalLinks = portalLinks;
    else delete board.portalLinks;
    const linked = new Set(board.edges.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
    const oneWay: [number, number][] = [];
    for (const key of oneWays) {
      const [a, b] = key.split('>').map((c) => at.get(c));
      if (a == null || b == null || !linked.has(`${Math.min(a, b)}-${Math.max(a, b)}`)) oneWays.delete(key);
      else oneWay.push([a, b]);
    }
    if (oneWay.length) board.oneWay = oneWay.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    else delete board.oneWay;
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
  };
  const doUndo = () => {
    const last = undo.pop();
    if (!last) return say('Nothing to undo.');
    board = JSON.parse(last) as BoardDef;
    readLinks();
    clearSelection();
    nameInput.value = board.name;
    changed();
  };
  /** After a group moves: links within it move along; links to tiles left behind are dropped. */
  const remapLinks = (from: ReadonlySet<number>, next: BoardDef, to: ReadonlySet<number>) => {
    const newIds = [...to];
    const moved = new Map(
      [...from].map((i, k) => [cellKey(board.squares[i]), cellKey(next.squares[newIds[k]])]),
    );
    const landed = new Set(moved.values());
    /** Portal ends move with their own tile, whatever the other end does. */
    const moveEach = (cells: string[]) =>
      cells.some((c) => !moved.has(c) && landed.has(c)) ? null : cells.map((c) => moved.get(c) ?? c);
    const move = (cells: string[]) => {
      const n = cells.filter((c) => moved.has(c)).length;
      if (n === 1 || (n === 0 && cells.some((c) => landed.has(c)))) return null;
      return cells.map((c) => moved.get(c) ?? c);
    };
    const toCell = (c: string) => {
      const [x, y] = c.split(',').map(Number);
      return { x, y };
    };
    cuts = new Set(
      [...cuts].flatMap((key) => {
        const cells = move(key.split('|'));
        return cells ? [edgeKey(toCell(cells[0]), toCell(cells[1]))] : [];
      }),
    );
    oneWays = new Set(
      [...oneWays].flatMap((key) => {
        const cells = move(key.split('>'));
        return cells ? [cells.join('>')] : [];
      }),
    );
    // Portal links: each end follows its tile; an end left under a moved tile is lost.
    gates = gates.flatMap((g) => {
      const ends = moveEach([g.a, g.b]);
      return ends ? [{ ...g, a: ends[0], b: ends[1] }] : [];
    });
    portalPick = null;
    selectedGate = null;
  };
  /** Neighboring tiles' pairs (linked or not), for the Links tool. */
  const neighborPairs = () => autoEdges(board.squares, new Set(), board.layout);
  type LinkState = 'both' | 'ab' | 'ba' | 'off';
  const linkState = (a: number, b: number): LinkState => {
    const p = board.squares[a];
    const q = board.squares[b];
    if (cuts.has(edgeKey(p, q))) return 'off';
    if (oneWays.has(`${cellKey(p)}>${cellKey(q)}`)) return 'ab';
    if (oneWays.has(`${cellKey(q)}>${cellKey(p)}`)) return 'ba';
    return 'both';
  };
  /** The link badge under a world point, if any. */
  const linkAt = (w: { x: number; y: number }) =>
    neighborPairs().find(([a, b]) => {
      const p = center(board.squares[a]);
      const q = center(board.squares[b]);
      return Math.hypot((p.x + q.x) / 2 - w.x, (p.y + q.y) / 2 - w.y) < 26;
    }) ?? null;
  const LINK_TEXT: Record<LinkState, string> = {
    both: 'Linked both ways',
    ab: 'One way',
    ba: 'One way (the other way)',
    off: 'Link removed',
  };
  // ---- portals and portal links
  const cellOf = (key: string) => {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  };
  /** Where a portal (or a free side's faint portal) sits beside a tile. */
  const sidePoint = (cell: string, side: number) => {
    const c = cellOf(cell);
    const at = center(c);
    const v = sideVector(board.layout, c.x, c.y, side);
    return { x: at.x + v.x * 0.72, y: at.y + v.y * 0.72 };
  };
  const isNear = (w: { x: number; y: number }, p: { x: number; y: number }, r = 26) =>
    Math.hypot(p.x - w.x, p.y - w.y) < r;
  const sameSpot = (a: GateSpot | null, b: GateSpot | null) =>
    !!a && !!b && a.cell === b.cell && a.side === b.side;
  /** The portal links at a portal. */
  function gateLinks(spot: GateSpot) {
    return gates.filter(
      (g) => (g.a === spot.cell && g.sa === spot.side) || (g.b === spot.cell && g.sb === spot.side),
    );
  }
  /** The portal at a link's other end. */
  const otherEnd = (g: (typeof gates)[number], spot: GateSpot): GateSpot =>
    g.a === spot.cell && g.sa === spot.side ? { cell: g.b, side: g.sb } : { cell: g.a, side: g.sa };
  /** What a portal lets players do: enter and exit, enter only, or exit only. */
  const wayOf = (spot: GateSpot): PortalWay => {
    const links = gateLinks(spot);
    if (links.some((g) => !g.oneWay)) return 'both';
    return links.some((g) => g.a === spot.cell && g.sa === spot.side) ? 'in' : 'out';
  };
  /** Every portal on the board, once each. */
  const allGates = () => {
    const out: GateSpot[] = [];
    for (const g of gates)
      for (const spot of [
        { cell: g.a, side: g.sa },
        { cell: g.b, side: g.sb },
      ])
        if (!out.some((o) => sameSpot(o, spot))) out.push(spot);
    return out;
  };
  /** Sides of a tile that could take a portal: facing an empty cell, without a portal yet. */
  const freeSides = (cell: string) => {
    const c = cellOf(cell);
    if (indexAt(c.x, c.y) < 0) return [];
    const taken = new Set(board.squares.map(cellKey));
    return neighborCells(board.layout, c.x, c.y)
      .map(([x, y], side) => ({ x, y, side }))
      .filter(({ x, y, side }) => !taken.has(`${x},${y}`) && !gateLinks({ cell, side }).length)
      .map(({ side }) => side);
  };
  /** Every free side's faint portal, for the Links tool. */
  const freeMarkers = () =>
    board.squares.flatMap((sq) => {
      const cell = cellKey(sq);
      return freeSides(cell).map((side) => ({ cell, side, at: sidePoint(cell, side) }));
    });
  /** The portal under a world point, if any. */
  const gateAt = (w: { x: number; y: number }) =>
    allGates().find((g) => isNear(w, sidePoint(g.cell, g.side))) ?? null;
  /** A tile's name and place, for the portal panel. */
  const placeName = (cell: string) => {
    const c = cellOf(cell);
    const sq = board.squares[indexAt(c.x, c.y)];
    const name =
      sq?.t === 'bank'
        ? 'Bank'
        : (PALETTE.flatMap((g) => g.items).find((it) => it.tool === sq?.t)?.label ?? 'Tile');
    return `${name} · column ${c.x + 1}, row ${c.y + 1}`;
  };
  const SIDE_NAMES: Record<'square' | 'hex', string[]> = {
    square: ['right', 'left', 'bottom', 'top'],
    hex: ['right', 'left', 'top left', 'top right', 'bottom left', 'bottom right'],
  };
  const sideName = (side: number) => SIDE_NAMES[board.layout === 'hex' ? 'hex' : 'square'][side] ?? 'side';

  /**
   * Links tool taps: a road link's badge changes it; a portal opens it in the side panel; a faint
   * portal starts a portal link, and a second tap (another tile's faint portal, or an exit) ends
   * it. Returns false when the tap hit nothing, so a drag can look around.
   */
  const linksTap = (w: { x: number; y: number }) => {
    const gate = gateAt(w);
    const free = freeMarkers().find((m) => isNear(w, m.at));
    if (portalPick) {
      const from = portalPick;
      portalPick = null;
      if (free && free.cell === from.cell) {
        if (free.side !== from.side) portalPick = { cell: free.cell, side: free.side };
        else say('Pick a side of another tile.', true);
      } else if (free) {
        snapshot();
        gates.push({ a: from.cell, sa: from.side, b: free.cell, sb: free.side });
        selectedGate = { cell: free.cell, side: free.side };
        changed();
        say('Portal link added');
        return true;
      } else if (gate && wayOf(gate) === 'out' && gate.cell !== from.cell) {
        // Another entrance into an existing exit.
        snapshot();
        gates.push({ a: from.cell, sa: from.side, b: gate.cell, sb: gate.side, oneWay: true });
        selectedGate = { cell: from.cell, side: from.side };
        changed();
        say('Entrance added');
        return true;
      } else if (gate) {
        portalPick = from;
        say('That portal is already linked. Pick a faint portal, or an exit portal.', true);
      }
      drawInspector();
      redraw();
      return true;
    }
    if (gate) {
      selectedGate = gate;
    } else if (free) {
      portalPick = { cell: free.cell, side: free.side };
      selectedGate = null;
    } else {
      const pair = linkAt(w);
      if (pair) {
        cycleLink(pair[0], pair[1]);
        return true;
      }
      if (!selectedGate) return false;
      selectedGate = null;
    }
    drawInspector();
    redraw();
    return true;
  };
  /** Select tool taps on a portal open it in the side panel. */
  const selectTap = (w: { x: number; y: number }) => {
    const gate = gateAt(w);
    if (!gate) {
      if (selectedGate) {
        selectedGate = null;
        drawInspector();
      }
      return false;
    }
    clearSelection();
    selectedGate = gate;
    drawInspector();
    redraw();
    return true;
  };

  /** Why a portal can't become `way` (null when it can). */
  const wayBlocked = (spot: GateSpot, way: PortalWay): string | null => {
    const links = gateLinks(spot);
    const others = links.map((g) => gateLinks(otherEnd(g, spot)).length);
    if (way === 'both' && (links.length !== 1 || others[0] !== 1))
      return 'An exit with more than one entrance can’t be two-way.';
    if (way === 'in' && links.length !== 1)
      return 'An entrance leads to one exit; this portal has more links.';
    if (way === 'out' && others.some((n) => n !== 1))
      return 'The portal at the other end is an exit for other entrances too.';
    return null;
  };
  /** Make a portal two-way, an entrance or an exit (its other ends change to match). */
  const setWay = (spot: GateSpot, way: PortalWay) => {
    if (wayOf(spot) === way || wayBlocked(spot, way)) return;
    snapshot();
    gates = gates.map((g) => {
      if (!gateLinks(spot).includes(g)) return g;
      const other = otherEnd(g, spot);
      if (way === 'both') return { a: spot.cell, sa: spot.side, b: other.cell, sb: other.side };
      if (way === 'in') return { a: spot.cell, sa: spot.side, b: other.cell, sb: other.side, oneWay: true };
      return { a: other.cell, sa: other.side, b: spot.cell, sb: spot.side, oneWay: true };
    });
    changed();
  };
  /** Remove a portal and every portal link at it. */
  const removeGate = (spot: GateSpot) => {
    snapshot();
    const links = gateLinks(spot);
    gates = gates.filter((g) => !links.includes(g));
    selectedGate = null;
    changed();
    say('Portal removed');
  };

  /** The side panel for a portal: its kind, where it leads (or comes from), and Remove. */
  const gatePanel = (spot: GateSpot): Node[] => {
    const way = wayOf(spot);
    const c = cellOf(spot.cell);
    const kindButton = (w: PortalWay, label: string) => {
      const blocked = way === w ? null : wayBlocked(spot, w);
      return h(
        'button',
        {
          class: `seg-btn ${way === w ? 'on' : ''}`,
          'aria-pressed': String(way === w),
          disabled: !!blocked,
          title: blocked ?? undefined,
          onclick: () => setWay(spot, w),
        },
        label,
      );
    };
    const others = gateLinks(spot).map((g) => otherEnd(g, spot));
    const body = h(
      'div',
      { class: 'ed-side-body' },
      sideSection(
        'Kind',
        null,
        h(
          'div',
          { class: 'seg' },
          kindButton('both', 'Two-way'),
          kindButton('in', 'Entrance'),
          kindButton('out', 'Exit'),
        ),
        h(
          'p',
          { class: 'hint' },
          way === 'both'
            ? 'Players can go in here and come out here.'
            : way === 'in'
              ? 'Players can only go in here. They come out at its exit.'
              : 'Players only come out here, from its entrances. They can’t go in.',
        ),
      ),
      sideSection(
        way === 'out' ? 'Comes from' : 'Leads to',
        others.length > 1 ? `${others.length} entrances` : null,
        h(
          'div',
          { class: 'ed-gate-list' },
          ...others.map((o) =>
            h(
              'button',
              {
                class: 'ed-gate-row',
                onclick: () => {
                  selectedGate = o;
                  drawInspector();
                  redraw();
                },
              },
              h('i', { class: 'ed-link-dot' }),
              h('span', null, placeName(o.cell)),
              h('small', null, `${sideName(o.side)} side →`),
            ),
          ),
        ),
        way === 'out'
          ? h('p', { class: 'hint' }, 'To add an entrance, use Links: tap a faint portal, then this exit.')
          : null,
      ),
      h(
        'div',
        { class: 'ed-row' },
        h('button', { class: 'btn small danger', onclick: () => removeGate(spot) }, 'Remove portal'),
      ),
    );
    return [
      sideHead('Portal', `Column ${c.x + 1} · Row ${c.y + 1} · ${sideName(spot.side)} side`, () => {
        selectedGate = null;
        drawInspector();
        redraw();
      }),
      body,
    ];
  };
  /** Tap a link: both ways > one way > the other way > removed > both ways. */
  const cycleLink = (a: number, b: number) => {
    const p = board.squares[a];
    const q = board.squares[b];
    const ab = `${cellKey(p)}>${cellKey(q)}`;
    const ba = `${cellKey(q)}>${cellKey(p)}`;
    const next: LinkState = ({ both: 'ab', ab: 'ba', ba: 'off', off: 'both' } as const)[linkState(a, b)];
    snapshot();
    oneWays.delete(ab);
    oneWays.delete(ba);
    cuts.delete(edgeKey(p, q));
    if (next === 'ab') oneWays.add(ab);
    if (next === 'ba') oneWays.add(ba);
    if (next === 'off') cuts.add(edgeKey(p, q));
    changed();
    say(LINK_TEXT[next]);
  };
  const indexAt = (x: number, y: number) => board.squares.findIndex((s) => s.x === x && s.y === y);
  const center = (c: { x: number; y: number }) => cellCenter(board.layout, c.x, c.y);

  const place = (x: number, y: number) => {
    const i = indexAt(x, y);
    if (i >= 0 && board.squares[i].t === 'bank') return false;
    if (tool === 'districts') {
      if (i < 0 || board.squares[i].t !== 'shop') return false;
      const choice = activeDistrict();
      if (!choice || board.squares[i].d === choice.index) return false;
      if (choice.index == null) board.districts.push({ name: choice.name, color: choice.color });
      return assignPropertyDistrict(board, i, choice.index ?? board.districts.length - 1);
    }
    if (tool === 'erase') {
      if (i < 0) return false;
      tileFx.push({ x, y, t0: performance.now(), erased: true });
      board.squares.splice(i, 1);
      if (selected === i) selected = null;
      else if (selected != null && selected > i) selected--;
      return true;
    }
    if (tool === 'select' || tool === 'pan' || tool === 'draw' || tool === 'links' || tool === 'move')
      return false;
    const t: SquareType = tool;
    if (t === 'shop' && i >= 0 && board.squares[i].t === 'shop') return false;
    const prev = i >= 0 ? board.squares[i] : null;
    // New properties have no district. New warps and portals start unlinked.
    const sq: BoardSquareDef = { x, y, t };
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
    const imageKey = `${imageScale}:${typeView}:${moving ? [...selection].join(',') : ''}:${JSON.stringify(board)}`;
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
        const keep = (list: number[] | undefined) => list?.filter((i) => ids.has(i)).map((i) => ids.get(i)!);
        G.nodes = visible.map((sq, id) => ({
          ...sq,
          id,
          nb: keep(sq.nb)!,
          noGo: keep(sq.noGo),
          portals: sq.portals?.filter((q) => ids.has(q.to)).map((q) => ({ ...q, to: ids.get(q.to)! })),
        }));
      }
      // Portals turn, so they're drawn over the cache; while a group moves they stay still in it.
      if (typeView) paintTileTypes(ctx, G);
      else paintBoard(ctx, G, false, false, !!moving);
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
    if (!moving) {
      const G = previewGame();
      drawPortals(ctx, G, reduced ? 0 : performance.now());
      // Keep turning them while the board has any.
      if (!reduced && !zoomFrame && G.nodes.some((n) => n.portals?.length))
        zoomFrame = requestAnimationFrame(redraw);
    }
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
    // Links tool: a badge on every pair of neighboring tiles.
    if (tool === 'links' && !viewing && !settings) {
      for (const [a, b] of neighborPairs()) {
        const p = center(board.squares[a]);
        const q = center(board.squares[b]);
        const state = linkState(a, b);
        if (state === 'ab') drawRoadArrow(ctx, p, q);
        else if (state === 'ba') drawRoadArrow(ctx, q, p);
        else drawLinkBadge(ctx, p, q, state === 'off');
      }
      // Every free side shows a faint portal to start a portal link from (gold once picked).
      for (const m of freeMarkers())
        drawSideMarker(ctx, m.at, !!portalPick && m.cell === portalPick.cell && m.side === portalPick.side);
    }
    // The portal in the side panel: a gold ring around it and a line to each portal it links to.
    if (selectedGate && !viewing) {
      const from = sidePoint(selectedGate.cell, selectedGate.side);
      for (const link of gateLinks(selectedGate))
        drawLink(
          ctx,
          sidePoint(link.a, link.sa),
          sidePoint(link.b, link.sb),
          '#ffd166',
          scale,
          reduced,
          !link.oneWay,
        );
      ctx.save();
      ctx.beginPath();
      ctx.arc(from.x, from.y, 28, 0, Math.PI * 2);
      ctx.lineWidth = 4 / scale + 2;
      ctx.strokeStyle = '#ffd166';
      ctx.stroke();
      ctx.restore();
      if (!reduced && !zoomFrame) zoomFrame = requestAnimationFrame(redraw);
    }
    // Hover and selection
    // No cell highlight in the Links tool or over a selected portal (it sits in an empty cell).
    if (hover && !moving && tool !== 'links' && !selectedGate) {
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
  const dropMove = (target: { x: number; y: number }) => {
    if (!moving) return;
    if (target.x === moving.anchor.x && target.y === moving.anchor.y) {
      moving = null;
      drawInspector();
      redraw();
      return;
    }
    const result = moveSelection(board, selection, moving.anchor, target);
    if (!result) return say('Keep the group inside the board and clear of the bank.', true);
    snapshot();
    remapLinks(selection, result.board, result.selection);
    board = result.board;
    selection = result.selection;
    moving = null;
    selected = selection.size === 1 ? [...selection][0] : null;
    changed();
  };
  const beginStroke = (e: PointerEvent) => {
    if (moving) {
      const target = toCell(e);
      if (target) dropMove(target);
      return;
    }
    // Portals sit beside tiles (maybe off the grid), so they're checked before the cell.
    if (!viewing && !settings && (tool === 'links' || tool === 'select')) {
      const w = toWorld(e);
      if (tool === 'links' ? linksTap(w) : selectTap(w)) return;
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
    if (tool === 'pan' || tool === 'links') {
      panning = { x: e.clientX, y: e.clientY };
      root.classList.add('ed-grabbing');
      return;
    }
    if (tool === 'move') {
      if (viewing || settings) return;
      const i = indexAt(cell.x, cell.y);
      if (i < 0) return;
      clearSelection();
      selection.add(i);
      selected = i;
      moving = { anchor: { ...cell }, target: { ...cell } };
      dragPointer = e.pointerId;
      notice = '';
      drawInspector();
      redraw();
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
        if (dragPointer != null) {
          moving = null;
          dragPointer = null;
          drawInspector();
          redraw();
        }
        endStroke();
      }
      pinchDistance = span();
      pinchMid = midpoint();
      if (tool === 'move' && touches.size === 1) {
        beginStroke(e);
        touchStart = null;
      }
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
        // A drag with the Links tool looks around (a tap changes a link).
        if (tool === 'links') panning = { x: touchStart.clientX, y: touchStart.clientY };
        else beginStroke(touchStart);
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
    if (dragPointer === e.pointerId) {
      const target = e.type === 'pointerup' ? toCell(e) : null;
      if (target) dropMove(target);
      // Cancelled or invalid drops leave the original tile in place.
      moving = null;
      dragPointer = null;
      drawInspector();
      redraw();
    }
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
      const active = (t === 'draw' ? isPlacing() : tool === t) && !settings;
      button.classList.toggle('on', active);
      button.setAttribute('aria-pressed', String(active));
    }
  };
  const paths: Record<string, string> = {
    select: 'M5 3l14 10-7 1-3 7z',
    move: 'M8 8h8v8H8zM12 2v4M12 2l-2 2M12 2l2 2M12 22v-4M12 22l-2-2M12 22l2-2M2 12h4M2 12l2-2M2 12l2 2M22 12h-4M22 12l-2-2M22 12l-2 2',
    pan: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
    draw: 'M15 4l5 5M4 15L15 4a3.5 3.5 0 015 5L9 20l-6 1zM4 15l5 5',
    erase: 'M4 13l9-10 8 8-9 10H9l-5-5zM8 9l8 8M12 21h9',
    links: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
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
          tool = t === 'draw' ? drawTool : t;
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

  let paletteFrame = 0;
  let paletteFeedback: ((now: number) => boolean)[] = [];
  const paletteMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const paintPaletteFeedback = () => {
    paletteFrame = 0;
    if (destroyed || palette.hidden) return;
    const now = paletteMotion.matches ? 0 : performance.now();
    const active = paletteFeedback.map((paint) => paint(now)).some(Boolean);
    if (active && !paletteMotion.matches) paletteFrame = requestAnimationFrame(paintPaletteFeedback);
  };
  const requestPaletteFeedback = () => {
    if (!destroyed && !paletteFrame) paletteFrame = requestAnimationFrame(paintPaletteFeedback);
  };
  paletteMotion.addEventListener('change', requestPaletteFeedback);

  const drawPalette = () => {
    cancelAnimationFrame(paletteFrame);
    paletteFrame = 0;
    paletteFeedback = [];
    const scroll = paletteList.scrollTop;
    const focused = palette.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.tool
      : null;
    clear(paletteList);
    for (const g of PALETTE.filter((g) => g.group !== 'Tools')) {
      const section = h('section', { class: 'ed-tile-category', 'aria-label': g.group });
      section.append(h('div', { class: 'ed-side-sec-head' }, h('h4', null, g.group)));
      const row = h('div', { class: 'ed-tools' });
      for (const it of g.items) {
        const example = h('canvas', { class: 'ed-tile-example', 'aria-hidden': 'true' }) as HTMLCanvasElement;
        example.width = 136;
        example.height = 148;
        if (it.tool === 'districts') {
          const ctx = example.getContext('2d')!;
          DISTRICT_COLORS.slice(0, 4).forEach((color, i) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(20 + (i % 2) * 51, 25 + Math.floor(i / 2) * 51, 45, 45, 10);
            ctx.fill();
          });
        } else {
          const tile = newGame({
            rules: 'standard',
            plots: 'none',
            target: 5000,
            roundCap: 0,
            seed: 1,
            seats: [{ name: 'Builder', cpu: true, ch: 'farmer' }],
            board: {
              ...board,
              districts: board.districts,
              cols: 1,
              rows: 1,
              edges: [],
              bank: 0,
              squares: [
                {
                  x: 0,
                  y: 0,
                  t: it.tool as SquareType,
                  ...(it.tool === 'shop' ? { base: 100 } : {}),
                },
              ],
            },
          });
          const ctx = example.getContext('2d')!;
          ctx.scale(1.3, 1.3);
          ctx.translate(-48, -44);
          paintSquare(ctx, tile, tile.nodes[0]);
        }
        const feedback = h('canvas', {
          class: 'ed-tile-feedback',
          'aria-hidden': 'true',
        }) as HTMLCanvasElement;
        const dpr = Math.min(3, devicePixelRatio || 1);
        feedback.width = 244 * dpr;
        feedback.height = 256 * dpr;
        let hovered = false;
        let focused = false;
        let painted = false;
        const button = h(
          'button',
          {
            class: `ed-tool ${tool === it.tool ? 'on' : ''}`,
            'aria-label': it.label,
            'aria-description': it.hint,
            'data-tool': it.tool,
            'aria-pressed': String(tool === it.tool),
            onclick: () => {
              tool = it.tool;
              drawTool = it.tool;
              clearSelection();
              settings = false;
              notice = '';
              drawPalette();
              drawInspector();
              redraw();
            },
          },
          example,
          feedback,
        );
        const updateHover = (on: boolean) => {
          hovered = on;
          requestPaletteFeedback();
        };
        button.addEventListener('pointerenter', (event) => {
          if (event.pointerType !== 'touch') updateHover(true);
        });
        button.addEventListener('pointerleave', () => updateHover(false));
        button.addEventListener('focus', () => {
          focused = button.matches(':focus-visible');
          requestPaletteFeedback();
        });
        button.addEventListener('blur', () => {
          focused = false;
          requestPaletteFeedback();
        });
        paletteFeedback.push((now) => {
          const selected = tool === it.tool;
          const active = selected || hovered || focused;
          if (!active && !painted) return false;
          const ctx = feedback.getContext('2d')!;
          if (painted || active) ctx.clearRect(0, 0, feedback.width, feedback.height);
          painted = active;
          if (!active) return false;
          ctx.save();
          // Same transform as the tile artwork, with overscan for both expanding rings.
          ctx.setTransform(1.3 * dpr, 0, 0, 1.3 * dpr, (54 - 48 * 1.3) * dpr, (54 - 44 * 1.3) * dpr);
          const c = cellCenter(board.layout, 0, 0);
          if (selected) drawTileGlow(ctx, board.layout, c, '#ffd166', now, true);
          else {
            tileShape(ctx, board.layout, c.x, c.y, 46, 14);
            ctx.fillStyle = 'rgba(255,209,102,0.16)';
            ctx.fill();
            ctx.strokeStyle = '#17213a';
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.strokeStyle = '#ffd166';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          ctx.restore();
          return selected;
        });
        row.append(button);
      }
      section.append(row);
      paletteList.append(section);
    }
    paletteList.scrollTop = scroll;
    if (focused)
      paletteList
        .querySelector<HTMLButtonElement>(`[data-tool="${focused}"]`)
        ?.focus({ preventScroll: true });
    requestPaletteFeedback();
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
    const district = tool === 'districts' ? activeDistrict() : null;
    stopActionMorph();
    for (const animation of entranceAnimations) animation.cancel();
    entranceAnimations = [];
    clear(inspector);
    clear(tileInspector);
    nameInput.value = board.name;
    const unsaved = JSON.stringify(board) !== savedJSON;
    const inList = listBoards().some((b) => b.id === board.id);
    status.textContent = isBuiltIn(board.id)
      ? 'Built-in'
      : !inList
        ? 'Not saved yet'
        : unsaved
          ? 'Unsaved changes'
          : 'Saved';
    syncMode();
    status.classList.toggle('unsaved', unsaved || !inList);

    refreshCheck();
    const controls = h('div', { class: 'ed-context-controls' });
    clear(actionContent);
    syncTools();
    palette.hidden = !isPlacing() || settings;
    if (!palette.hidden) requestPaletteFeedback();
    root.classList.toggle('ed-placing', !palette.hidden);
    root.classList.toggle('ed-moving', !!moving);
    root.classList.toggle('ed-linking', choosingLink);
    root.classList.toggle('ed-pan', tool === 'pan');
    root.classList.toggle('ed-move', tool === 'move');
    settingsButton.setAttribute('aria-pressed', String(settings));
    const label = PALETTE.flatMap((g) => g.items).find((it) => it.tool === tool)?.label;
    actionContent.append(
      h(
        'div',
        { class: 'prompt-text', role: 'status', 'aria-live': 'polite' },
        notice ||
          (viewing ? 'Drag to look around · scroll or pinch to zoom · Edit to change the board' : '') ||
          (choosingLink ? 'Click a tile or the bank to link to · Escape to cancel' : '') ||
          (settings
            ? check.errors.length
              ? `Board settings · ${check.errors.length} problem${check.errors.length === 1 ? '' : 's'} to fix before playing`
              : 'Board settings · ready to play'
            : moving
              ? dragPointer != null
                ? 'Drag to move · release to place · Esc to cancel'
                : 'Move the group, then click to place · Esc to cancel'
              : tool === 'select' && selectedGate
                ? 'Portal selected: change it in the side panel'
                : tool === 'select'
                  ? selection.size
                    ? `${selection.size} tile${selection.size === 1 ? '' : 's'} selected`
                    : 'Click a tile, or drag to select a group'
                  : tool === 'links'
                    ? portalPick
                      ? 'Now tap a free side of another tile, or an exit portal · Esc to cancel'
                      : 'Tap a link to change it · tap a faint portal to start a portal link'
                    : tool === 'move'
                      ? 'Click and drag a tile to move it · release to place'
                      : tool === 'pan'
                        ? 'Drag to move around the board · tap the zoom to recenter'
                        : tool === 'districts'
                          ? `${district?.name ?? 'Districts'} · ${district?.count ?? 0}/4 properties · draw on properties`
                          : tool === 'shop'
                            ? 'Property: click or drag to draw unassigned properties'
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
    if (district && !settings) {
      const colors = h('div', {
        class: 'ed-district-colors',
        role: 'group',
        'aria-label': 'District colors',
      });
      for (const choice of districtChoices(board)) {
        colors.append(
          h('button', {
            class: `ed-district-color${choice.key === district.key ? ' on' : ''}`,
            style: `--district-color:${choice.color}`,
            'aria-label': `${choice.name}: ${choice.count} of 4 properties`,
            title: `${choice.name} · ${choice.count}/4${choice.count >= 4 ? ' · next property replaces oldest' : ''}`,
            'aria-pressed': String(choice.key === district.key),
            'data-district-key': choice.key,
            onclick: () => {
              districtKey = choice.key;
              notice = '';
              drawInspector();
              [...actionContent.querySelectorAll<HTMLButtonElement>('.ed-district-color')]
                .find((button) => button.dataset.districtKey === choice.key)
                ?.focus({ preventScroll: true });
              redraw();
            },
          }),
        );
      }
      actionContent.append(colors);
    }

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
          h('option', { value: '-1', selected: sq.d == null || sq.d < 0 }, 'No district'),
          ...board.districts.map((d, i) =>
            h(
              'option',
              {
                value: String(i),
                selected: i === sq.d,
              },
              d.name,
            ),
          ),
        ) as HTMLSelectElement;
        dSel.onchange = () => {
          const district = Number(dSel.value);
          if (district === (sq.d ?? -1)) return;
          snapshot();
          if (district < 0) {
            delete sq.d;
            delete sq.districtOrder;
          } else assignPropertyDistrict(board, selected!, district);
          changed();
        };
        squareBody.append(
          field('District', dSel),
          h(
            'div',
            { class: 'ed-tile-value' },
            h('span', null, 'Starting value'),
            h(
              'strong',
              null,
              sq.d != null && board.districts[sq.d] ? fmt(preview().nodes[selected!].base) : 'No district',
            ),
          ),
          h(
            'p',
            { class: 'hint ed-tile-note' },
            sq.d != null && board.districts[sq.d]
              ? 'Set the district’s average in Board settings.'
              : 'Use Draw → Districts to assign a district before playing.',
          ),
        );
      }
    }

    if (selectedGate && !settings && !viewing && (tool === 'select' || tool === 'links')) {
      clear(tileInspector);
      tileInspector.hidden = false;
      tileInspector.append(...gatePanel(selectedGate));
    }

    controls.hidden = true;
    actionbar.classList.toggle('ed-action-error', !!notice && noticeBad);
    const hasOptions = (tool === 'select' && selection.size > 0) || (tool === 'districts' && !settings);
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

  /** Save over the player's own board (built-in boards can only be saved as a new one). */
  const doSave = () => {
    if (isBuiltIn(board.id)) return false;
    recompute();
    if (!saveBoard(structuredClone(board))) {
      say('Could not save: browser storage is full or blocked.', true);
      return false;
    }
    savedJSON = JSON.stringify(board);
    drawInspector();
    say(`Saved "${board.name}" to your collection.`);
    return true;
  };

  /** Save as a new board in the collection, under a name the player picks. */
  const doSaveAs = () =>
    new Promise<boolean>((resolve) => {
      let saved = false;
      const input = h('input', {
        class: 'ed-saveas-name',
        maxlength: String(BOARD_LIMITS.nameLength),
        'aria-label': 'Board name',
      }) as HTMLInputElement;
      input.value = uniqueName(board.name).slice(0, BOARD_LIMITS.nameLength);
      const save = () => {
        const name = input.value.trim().slice(0, BOARD_LIMITS.nameLength) || 'My board';
        recompute();
        const copy: BoardDef = { ...structuredClone(board), id: newBoardId(), name };
        if (!saveBoard(copy)) return say('Could not save: browser storage is full or blocked.', true);
        board.id = copy.id;
        board.name = name;
        savedJSON = JSON.stringify(board);
        saved = true;
        close();
        drawInspector();
        say(`Saved "${name}" to your collection.`);
      };
      input.onkeydown = (e) => {
        if (e.key === 'Enter') save();
      };
      const close = modal(
        'Save as a new board',
        h(
          'div',
          { class: 'ed-ask' },
          h('p', null, 'It is added to your board collection.'),
          input,
          h(
            'div',
            { class: 'btn-row' },
            h('button', { class: 'btn ghost', onclick: () => close() }, 'Cancel'),
            h('button', { class: 'btn main', onclick: save }, 'Save'),
          ),
        ),
        { onClose: () => resolve(saved) },
      );
      input.focus();
      input.select();
    });

  /**
   * Unsaved changes: ask Save (not for built-in boards), Save as or Don't save. Resolves 'saved',
   * 'discard', or null when the player cancels.
   */
  const askSave = () =>
    new Promise<'saved' | 'discard' | null>((resolve) => {
      const builtIn = isBuiltIn(board.id);
      /** Set when a button handles the answer itself, so closing doesn't count as Cancel. */
      let handled = false;
      const discard = () => {
        handled = true;
        close();
        resolve('discard');
      };
      const saveWith = (act: () => Promise<boolean> | boolean) => async () => {
        handled = true;
        close();
        resolve((await act()) ? 'saved' : null);
      };
      const buttons = [
        h('button', { class: 'btn ghost', onclick: discard }, "Don't save"),
        h('button', { class: `btn ${builtIn ? 'main' : ''}`, onclick: saveWith(doSaveAs) }, 'Save as'),
        ...(builtIn ? [] : [h('button', { class: 'btn main', onclick: saveWith(doSave) }, 'Save')]),
      ];
      const close = modal(
        'Save your changes?',
        h(
          'div',
          { class: 'ed-ask' },
          h(
            'p',
            null,
            builtIn
              ? "Built-in boards can't be changed: save your changes as a new board, or leave them."
              : 'Save over this board, save it as a new board, or leave your changes.',
          ),
          h('div', { class: 'btn-row' }, ...buttons),
        ),
        { onClose: () => !handled && resolve(null) },
      );
      buttons[buttons.length - 1].focus();
    });

  /** Unlock the tools (from the viewer). */
  const startEditing = () => {
    viewing = false;
    tool = 'select';
    clearSelection();
    drawPalette();
    drawInspector();
    redraw();
  };

  /** Back to the viewer, after saving or dropping the changes. */
  const finishEditing = async () => {
    if (JSON.stringify(board) !== savedJSON) {
      const answer = await askSave();
      if (!answer) return;
      if (answer === 'discard') {
        // Nothing saved to go back to (an imported board): leave the builder.
        if (!savedJSON) {
          destroy();
          return handlers.onExit();
        }
        board = JSON.parse(savedJSON) as BoardDef;
        readLinks();
        undo.length = 0;
      }
    }
    viewing = true;
    tool = 'pan';
    settings = false;
    clearSelection();
    notice = '';
    recompute();
    drawPalette();
    drawInspector();
    redraw();
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
    board = centerInGrid({ ...res.board, cols: BOARD_LIMITS.maxCols, rows: BOARD_LIMITS.maxRows });
    readLinks();
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
    handlers.onPlay(structuredClone(board), savedJSON);
  };

  /** True when there is nothing unsaved to lose, or the player agrees to lose it. */
  const confirmLeave = async () =>
    JSON.stringify(board) === savedJSON ||
    ask('Discard your changes?', 'This board has changes that are not saved yet.', 'Discard', true);

  const leave = async () => {
    if (JSON.stringify(board) !== savedJSON && !(await askSave())) return;
    destroy();
    handlers.onExit();
  };

  const load = (b: BoardDef, saved: boolean) => {
    board = centerInGrid({ ...structuredClone(b), cols: BOARD_LIMITS.maxCols, rows: BOARD_LIMITS.maxRows });
    readLinks();
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
        ...(isBuiltIn(board.id) ? [] : [item('Save', 'Save over this board', () => void doSave())]),
        item('Save as', 'Save as a new board in your collection', () => void doSaveAs()),
        item('Back', 'Leave the board builder', () => void leave(), 'leave'),
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
      dragPointer = null;
      if (portalPick) portalPick = null;
      else if (selectedGate) selectedGate = null;
      else if (choosingLink) choosingLink = false;
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
    if (!viewing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
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
    cancelAnimationFrame(paletteFrame);
    paletteMotion.removeEventListener('change', requestPaletteFeedback);
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
  savedJSON = opts.savedJSON ?? JSON.stringify(board);
  centerOnBoard();
  drawPalette();
  drawInspector();
  requestAnimationFrame(redraw);
  return destroy;
}
