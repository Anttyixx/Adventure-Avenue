/** Directional portal arcs: one flow entrance to exit, or two opposing curved lanes. */
export function drawLink(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  color: string,
  scale: number,
  still: boolean,
  both = false,
) {
  drawArc(ctx, a, b, color, scale, still, 1);
  if (both) drawArc(ctx, b, a, color, scale, still, -1);
}

function drawArc(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  color: string,
  scale: number,
  still: boolean,
  lane: number,
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
  const bend = Math.min(90, Math.max(16, length * 0.14)) * lane;
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
  // A fixed chevron also communicates direction with reduced motion.
  const tip = at(0.54),
    before = at(0.52);
  const angle = Math.atan2(tip.y - before.y, tip.x - before.x);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.translate(tip.x, tip.y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-7 * px, -5 * px);
  ctx.lineTo(0, 0);
  ctx.lineTo(-7 * px, 5 * px);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5 * px;
  ctx.stroke();
  ctx.restore();
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
