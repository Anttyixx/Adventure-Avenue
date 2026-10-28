/**
 * Confetti raining down over the whole screen (the victory celebration). Drawn on its own
 * canvas above the board and HUD; it removes itself when done.
 */
const COLORS = ['#ff5d73', '#ffd166', '#4cc9f0', '#80ed99', '#c77dff', '#ffffff'];

export function confettiRain(parent: HTMLElement, ms: number) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti-rain';
  parent.append(cv);
  const ctx = cv.getContext('2d')!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth;
  const H = window.innerHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  ctx.scale(dpr, dpr);
  // Pieces start above the top edge, staggered, and flutter down at different speeds.
  const parts = Array.from({ length: Math.round(Math.min(260, W / 5)) }, () => ({
    x: Math.random() * W,
    y: -20 - Math.random() * H * 0.9,
    vy: 140 + Math.random() * 180,
    sway: 20 + Math.random() * 40,
    phase: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 10,
    w: 6 + Math.random() * 6,
    h: 3 + Math.random() * 4,
    c: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  const t0 = performance.now();
  const tick = (now: number) => {
    const t = (now - t0) / 1000;
    const k = (now - t0) / ms;
    if (k >= 1 || !cv.isConnected) {
      cv.remove();
      return;
    }
    ctx.clearRect(0, 0, W, H);
    // Fade out over the last fifth.
    ctx.globalAlpha = Math.min(1, (1 - k) * 5);
    for (const q of parts) {
      const y = q.y + q.vy * t;
      if (y < -20 || y > H + 20) continue;
      ctx.save();
      ctx.translate(q.x + Math.sin(t * 2 + q.phase) * q.sway, y);
      ctx.rotate(q.spin * t);
      // A flat ribbon turning over: its width wobbles.
      ctx.scale(Math.cos(t * 4 + q.phase), 1);
      ctx.fillStyle = q.c;
      ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
      ctx.restore();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
