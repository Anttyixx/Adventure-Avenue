/**
 * Confetti raining down over the whole screen and fireworks bursting overhead (the victory
 * celebration). Each is drawn on its own canvas above the board and HUD and removes itself.
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
    // Spread out above the screen so the rain keeps falling for the whole celebration.
    y: -20 - Math.random() * H * Math.max(0.9, ms / 2500),
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

/** Fireworks: rockets burst into rings of sparks across the top half of the screen. */
export function fireworks(parent: HTMLElement, ms: number) {
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
  // One burst every ~0.4 s, each a ring of sparks that spreads, falls a little and fades.
  const bursts = Array.from({ length: Math.max(4, Math.round(ms / 420)) }, (_, i) => ({
    at: i * 420 + Math.random() * 200,
    x: W * (0.15 + Math.random() * 0.7),
    y: H * (0.12 + Math.random() * 0.35),
    c: COLORS[Math.floor(Math.random() * (COLORS.length - 1))],
    n: 26 + Math.floor(Math.random() * 14),
    r: 90 + Math.random() * 90,
  }));
  const life = 1300;
  const t0 = performance.now();
  const tick = (now: number) => {
    const t = now - t0;
    if (t >= ms + life || !cv.isConnected) {
      cv.remove();
      return;
    }
    ctx.clearRect(0, 0, W, H);
    for (const b of bursts) {
      const k = (t - b.at) / life;
      if (k < 0 || k > 1) continue;
      const spread = 1 - (1 - k) ** 3;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = b.c;
      for (let i = 0; i < b.n; i++) {
        const a = (i / b.n) * Math.PI * 2;
        const x = b.x + Math.cos(a) * b.r * spread;
        const y = b.y + Math.sin(a) * b.r * spread + 60 * k * k;
        ctx.beginPath();
        ctx.arc(x, y, 3 * (1 - k) + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      // A bright flash at the centre as it bursts.
      if (k < 0.15) {
        ctx.globalAlpha = 1 - k / 0.15;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
