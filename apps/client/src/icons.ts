/**
 * HD (vector) icons for the interface. Only the player sprites are pixel art; suits, wild
 * cards and coins are drawn smooth so they stay crisp at any size.
 */

export const SUIT_COLORS = ['#2f3554', '#e5484d', '#e5484d', '#2f3554'];
export const SUIT_CHARS = ['♠', '♥', '♦', '♣'];

// 24 x 24 paths: spade, heart, diamond, club.
const SUIT_SHAPES = [
  '<path d="M12 1.8C9.4 5.6 3.2 8.9 3.2 13.6c0 2.8 2.1 4.7 4.6 4.7 1.4 0 2.6-.5 3.3-1.4L10 22h4l-1.1-5.1c.7.9 1.9 1.4 3.3 1.4 2.5 0 4.6-1.9 4.6-4.7 0-4.7-6.2-8-8.8-11.8z"/>',
  '<path d="M12 21.2s-8.6-5.2-9.9-10.6C1.2 6.8 3.6 3.8 6.9 3.8c2.2 0 3.8 1.2 5.1 3.1 1.3-1.9 2.9-3.1 5.1-3.1 3.3 0 5.7 3 4.8 6.8-1.3 5.4-9.9 10.6-9.9 10.6z"/>',
  '<path d="M12 1.6 20.4 12 12 22.4 3.6 12z"/>',
  '<circle cx="12" cy="7" r="4.6"/><circle cx="6.6" cy="13.4" r="4.6"/><circle cx="17.4" cy="13.4" r="4.6"/><path d="M11 12h2l1.3 10H9.7z"/>',
];

const svgURL = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`)}`;

const suitCache = new Map<string, string>();

/** A suit icon: full color when held, a faint outline-like ghost when missing. */
export function suitIconURL(i: number, on: boolean): string {
  const key = `${i}|${on}`;
  let url = suitCache.get(key);
  if (!url) {
    const fill = on ? SUIT_COLORS[i] : 'rgba(255,255,255,0.2)';
    // Held suits sit on a white disc so dark spades and clubs read on the dark card.
    const disc = on ? '<circle cx="12" cy="12" r="12" fill="#fdfbf5"/>' : '';
    url = svgURL(
      `${disc}<g fill="${fill}" transform="${on ? 'translate(3.6 3.6) scale(.7)' : ''}">${SUIT_SHAPES[i]}</g>`,
    );
    suitCache.set(key, url);
  }
  return url;
}

let wildCache = '';

/** Suit Yourself (wild) card: a purple card with a gold star. */
export function wildIconURL(): string {
  if (!wildCache) {
    wildCache = svgURL(
      '<defs><linearGradient id="w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b57bff"/><stop offset="1" stop-color="#6a3fd0"/></linearGradient></defs>' +
        '<rect x="4" y="1.5" width="16" height="21" rx="3" fill="url(#w)" stroke="#fff" stroke-width="1.4"/>' +
        '<path d="M12 6.2l1.7 3.6 3.9.5-2.9 2.7.8 3.9L12 15l-3.5 1.9.8-3.9-2.9-2.7 3.9-.5z" fill="#ffd166"/>',
    );
  }
  return wildCache;
}

/** A smooth gold coin with a rim and a "G", centered on (x, y). */
export function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff2a8');
  g.addColorStop(0.55, '#ffd23f');
  g.addColorStop(1, '#d99a0b');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = r * 0.16;
  ctx.strokeStyle = '#b07a06';
  ctx.stroke();
  ctx.fillStyle = '#9a6a0a';
  ctx.font = `${r * 1.15}px "Lilita One", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('G', x, y + r * 0.08);
  ctx.restore();
}

/** A four-point sparkle star. */
export function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.3 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
