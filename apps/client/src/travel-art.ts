/**
 * Drawings for the rides that carry a player straight to a square (`BoardView.travel`): a warp's
 * beam of light, a portal's vortex, cannon smoke, the taxi, a hot-air balloon and venture stars.
 * Everything is drawn in world coordinates on the live board, for one frame at a time.
 */
import { propCanvas } from './props';

type Ctx = CanvasRenderingContext2D;

/** A column of light rising from (x, y): `k` 0..1 is how strong it is right now. */
export function drawBeam(ctx: Ctx, x: number, y: number, color: string, k: number, now: number) {
  if (k <= 0) return;
  const h = 240;
  const w = 34 + 10 * k;
  ctx.save();
  const g = ctx.createLinearGradient(0, y - h, 0, y + 10);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, color);
  g.addColorStop(1, '#ffffff');
  ctx.globalAlpha = 0.55 * k;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y + 4, w / 2, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - w / 2, y - h, w, h + 4);
  // A bright core and sparkles rising up the column.
  ctx.globalAlpha = 0.8 * k;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - w * 0.12, y - h, w * 0.24, h + 4);
  for (let i = 0; i < 7; i++) {
    const t = (now / 900 + i / 7) % 1;
    const sx = x + Math.sin(i * 2.3 + now / 300) * w * 0.4;
    const sy = y - t * h;
    ctx.globalAlpha = k * (1 - t);
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A swirling vortex at (x, y) in `color`: `k` 0..1 is how open it is. */
export function drawVortex(ctx: Ctx, x: number, y: number, color: string, k: number, now: number) {
  if (k <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.55);
  const r = 46 * k;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, 'rgba(20,10,40,0.85)');
  g.addColorStop(0.6, color);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = 0.75 * k;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // Three spiral arms turning inward.
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  for (let arm = 0; arm < 3; arm++) {
    ctx.beginPath();
    for (let s = 0; s <= 20; s++) {
      const t = s / 20;
      const a = now / 160 + arm * ((Math.PI * 2) / 3) + t * 4;
      const rr = r * (1 - t) * 0.95;
      if (s === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.globalAlpha = 0.7 * k;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}

/** A soft grey puff of smoke (or dust, with a warm `tint`). */
export function drawPuff(ctx: Ctx, x: number, y: number, r: number, alpha: number, tint = '230,230,236') {
  if (alpha <= 0) return;
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${tint},${0.9 * alpha})`);
  g.addColorStop(1, `rgba(${tint},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A five-point gold star (venture card rides). */
export function drawStar(ctx: Ctx, x: number, y: number, r: number, alpha: number, turn = 0) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(turn);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd166';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#fff6d6';
  ctx.stroke();
  ctx.restore();
}

/** The taxi, wheels on the ground at (x, y), facing left or right, with a little bounce. */
export function drawTaxi(ctx: Ctx, x: number, y: number, left: boolean, bounce: number, color: string) {
  const w = 74;
  const art = propCanvas('taxi', '#808080');
  ctx.save();
  ctx.translate(x, y - bounce);
  if (!left) ctx.scale(-1, 1);
  // A shadow under the car.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, bounce + 2, w * 0.45, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  if (art) {
    const h = (w * art.height) / art.width;
    ctx.drawImage(art, -w / 2, -h, w, h);
  } else {
    ctx.fillStyle = '#ffc533';
    ctx.beginPath();
    ctx.roundRect(-w / 2, -28, w, 22, 8);
    ctx.roundRect(-w / 4, -44, w / 2, 18, 6);
    ctx.fill();
    ctx.fillStyle = '#26314f';
    for (const wx of [-w / 3, w / 3]) {
      ctx.beginPath();
      ctx.arc(wx, -6, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  // The rider's color on the roof light, so it's clear who is inside.
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y - bounce - 52, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * A hot-air balloon in the rider's `color`: the basket's top at (x, y) (around the rider's
 * waist), the envelope above, swaying by `sway` radians.
 */
export function drawBalloon(ctx: Ctx, x: number, y: number, color: string, sway: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  // Envelope with stripes.
  const ey = -78;
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-12, ey + 40);
  ctx.bezierCurveTo(-44, ey + 10, -40, ey - 42, 0, ey - 42);
  ctx.bezierCurveTo(40, ey - 42, 44, ey + 10, 12, ey + 40);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const sx of [-24, 0, 24]) {
    ctx.beginPath();
    ctx.ellipse(sx, ey - 4, 5, 46, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Ropes and the basket (in front of the rider's legs).
  ctx.strokeStyle = '#6b4a2a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-11, ey + 40);
  ctx.lineTo(-13, 0);
  ctx.moveTo(11, ey + 40);
  ctx.lineTo(13, 0);
  ctx.stroke();
  ctx.fillStyle = '#b07a43';
  ctx.strokeStyle = '#6b4a2a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-16, 0, 32, 18, 4);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
