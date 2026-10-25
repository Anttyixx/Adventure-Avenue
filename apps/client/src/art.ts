/**
 * Property art. Shops change design as their value grows (cottage -> house -> storefront ->
 * townhouse -> tower), and the 3-Star Shop has its own three designs (boutique -> department
 * store -> grand mall). Owned properties use the owner's color with an initial badge; unowned
 * shops use their district color. Shared by the board and the stock screen.
 */

/** Value at which each shop design starts. */
export const SHOP_TIERS = [0, 300, 550, 900, 1400];
export const SHOP_TIER_NAMES = ['Cottage', 'House', 'Storefront', 'Townhouse', 'Tower'];
/** Value at which each 3-Star Shop design starts. */
export const STAR3_TIERS = [0, 1500, 2500];
export const STAR3_TIER_NAMES = ['Boutique', 'Department store', 'Grand mall'];

export const tierFor = (value: number, tiers: number[]) => {
  let t = 0;
  tiers.forEach((min, i) => {
    if (value >= min) t = i;
  });
  return t;
};

export function darken(hex: string, f = 0.7) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Mix a color with white: k = 0 is white, 1 is the color. */
export function tint(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(255 + (v - 255) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

type Ctx = CanvasRenderingContext2D;

const WALL = '#fff8ec';
const GLASS = '#9fd3f0';

function box(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, line: string) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = line;
  ctx.strokeRect(x, y, w, h);
}

function poly(ctx: Ctx, pts: number[], fill: string, line: string) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = line;
  ctx.stroke();
}

function windows(
  ctx: Ctx,
  x0: number,
  y0: number,
  cols: number,
  rows: number,
  w: number,
  h: number,
  gx: number,
  gy: number,
) {
  ctx.fillStyle = GLASS;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) ctx.fillRect(x0 + c * gx, y0 + r * gy, w, h);
}

function star(ctx: Ctx, x: number, y: number, r: number, c: string) {
  ctx.fillStyle = c;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.fill();
  ctx.strokeStyle = '#b07a06';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

/** The owner's initial on a round badge in the bottom-right corner of the art. */
function badge(ctx: Ctx, x: number, y: number, color: string, initial: string) {
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '11px "Lilita One", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, x, y + 0.5);
}

/**
 * Draw a shop centered on (x, y), about 46 x 42 units. `main` is the roof/accent color
 * (owner color, or the district color for unowned shops).
 */
export function drawShop(ctx: Ctx, x: number, y: number, tier: number, main: string, initial?: string) {
  const line = darken(main.startsWith('#') ? main : '#888888', 0.55);
  ctx.save();
  switch (tier) {
    case 0: // Cottage
      box(ctx, x - 13, y - 3, 26, 18, WALL, line);
      poly(ctx, [x - 18, y - 2, x, y - 18, x + 18, y - 2], main, line);
      box(ctx, x - 4, y + 5, 8, 10, main, line);
      break;
    case 1: // House: two storeys, chimney
      box(ctx, x + 7, y - 20, 5, 9, darken(main, 0.8), line);
      box(ctx, x - 16, y - 8, 32, 23, WALL, line);
      poly(ctx, [x - 20, y - 7, x, y - 22, x + 20, y - 7], main, line);
      windows(ctx, x - 12, y - 4, 2, 1, 7, 6, 17, 0);
      box(ctx, x - 4, y + 5, 8, 10, main, line);
      break;
    case 2: // Storefront with a striped awning
      box(ctx, x - 19, y - 12, 38, 27, WALL, line);
      box(ctx, x - 21, y - 16, 42, 6, main, line);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? '#fff' : main;
        ctx.beginPath();
        ctx.moveTo(x - 19 + i * 6.33, y - 6);
        ctx.lineTo(x - 19 + (i + 1) * 6.33, y - 6);
        ctx.lineTo(x - 19 + (i + 1) * 6.33, y);
        ctx.arc(x - 19 + (i + 0.5) * 6.33, y, 3.16, 0, Math.PI);
        ctx.fill();
      }
      box(ctx, x - 15, y + 3, 17, 10, GLASS, line);
      box(ctx, x + 5, y + 2, 9, 13, main, line);
      break;
    case 3: // Townhouse: three floors
      box(ctx, x - 15, y - 20, 30, 35, WALL, line);
      box(ctx, x - 17, y - 24, 34, 5, main, line);
      windows(ctx, x - 11, y - 15, 3, 3, 5, 5, 8.5, 8);
      box(ctx, x - 4, y + 7, 8, 8, main, line);
      break;
    default: // Tower with wings and a dome
      box(ctx, x - 23, y - 4, 14, 19, WALL, line);
      box(ctx, x + 9, y - 4, 14, 19, WALL, line);
      poly(ctx, [x - 24, y - 4, x - 16, y - 11, x - 8, y - 4], main, line);
      poly(ctx, [x + 8, y - 4, x + 16, y - 11, x + 24, y - 4], main, line);
      box(ctx, x - 9, y - 18, 18, 33, WALL, line);
      ctx.beginPath();
      ctx.arc(x, y - 18, 9, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = main;
      ctx.fill();
      ctx.strokeStyle = line;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = line;
      ctx.fillRect(x - 0.75, y - 33, 1.5, 7);
      ctx.fillStyle = main;
      ctx.fillRect(x + 0.75, y - 33, 7, 4);
      windows(ctx, x - 5, y - 13, 2, 3, 3.5, 4, 6.5, 7);
      windows(ctx, x - 20, y + 1, 2, 1, 3.5, 4, 5, 0);
      windows(ctx, x + 12, y + 1, 2, 1, 3.5, 4, 5, 0);
      box(ctx, x - 3, y + 8, 6, 7, main, line);
      break;
  }
  if (initial) badge(ctx, x + 18, y + 10, main, initial);
  ctx.restore();
}

/** Draw a 3-Star Shop centered on (x, y) in one of its three designs. */
export function drawStar3(ctx: Ctx, x: number, y: number, tier: number, main: string, initial?: string) {
  const line = darken(main.startsWith('#') ? main : '#888888', 0.55);
  ctx.save();
  switch (tier) {
    case 0: // Boutique
      box(ctx, x - 20, y - 4, 40, 19, WALL, line);
      box(ctx, x - 22, y - 9, 44, 7, main, line);
      box(ctx, x - 15, y + 2, 14, 9, GLASS, line);
      box(ctx, x + 4, y + 1, 9, 14, main, line);
      for (let i = -1; i <= 1; i++) star(ctx, x + i * 13, y - 17 + (i === 0 ? -3 : 0), 6.5, '#ffd23f');
      break;
    case 1: // Department store with columns
      box(ctx, x - 22, y - 12, 44, 27, WALL, line);
      poly(ctx, [x - 24, y - 12, x, y - 22, x + 24, y - 12], main, line);
      ctx.fillStyle = darken(main, 0.85);
      for (let i = 0; i < 5; i++) ctx.fillRect(x - 19 + i * 9, y - 8, 3, 20);
      windows(ctx, x - 15, y - 6, 4, 2, 5, 6, 9, 9);
      box(ctx, x - 3, y + 6, 6, 9, main, line);
      for (let i = -1; i <= 1; i++) star(ctx, x + i * 7, y - 16, 3.6, '#ffd23f');
      break;
    default: {
      // Grand mall: wide hall, golden dome, banner
      box(ctx, x - 24, y - 6, 48, 21, WALL, line);
      box(ctx, x - 14, y - 16, 28, 11, WALL, line);
      ctx.beginPath();
      ctx.arc(x, y - 16, 11, Math.PI, 0);
      ctx.closePath();
      const g = ctx.createLinearGradient(x - 11, y - 27, x + 11, y - 16);
      g.addColorStop(0, '#fff2a8');
      g.addColorStop(1, '#d99a0b');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = '#b07a06';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      star(ctx, x, y - 30, 4.5, '#ffd23f');
      box(ctx, x - 24, y - 7, 48, 5, main, line);
      windows(ctx, x - 20, y, 6, 1, 4, 7, 7.2, 0);
      windows(ctx, x - 9, y - 13, 3, 1, 4, 5, 7, 0);
      box(ctx, x - 4, y + 7, 8, 8, main, line);
      for (let i = -1; i <= 1; i += 2) star(ctx, x + i * 19, y - 12, 4, '#ffd23f');
      break;
    }
  }
  if (initial) badge(ctx, x + 18, y + 10, main, initial);
  ctx.restore();
}

const iconCache = new Map<string, string>();

/** The same art as an image URL for HTML (stock screen, UI Lab). */
export function propertyIconURL(
  kind: 'shop' | 'star3',
  tier: number,
  main: string,
  initial?: string,
): string {
  const key = `${kind}|${tier}|${main}|${initial ?? ''}`;
  let url = iconCache.get(key);
  if (!url) {
    const s = 3;
    const cv = document.createElement('canvas');
    cv.width = 60 * s;
    cv.height = 52 * s;
    const ctx = cv.getContext('2d')!;
    ctx.scale(s, s);
    (kind === 'star3' ? drawStar3 : drawShop)(ctx, 30, 30, tier, main, initial);
    url = cv.toDataURL();
    iconCache.set(key, url);
  }
  return url;
}
