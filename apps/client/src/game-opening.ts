/** Presentation-only timing and poses for a fresh game's bank entrance. */
import { TIMING as T } from './timing';

export function openingPlayerPose(elapsed: number, index: number) {
  const local = elapsed - index * T.openingStagger;
  const progress = Math.max(0, Math.min(1, local / T.openingJump));
  return {
    visible: local >= 0,
    progress,
    travel: 1 - (1 - progress) ** 3,
    hop: Math.sin(progress * Math.PI) * 42,
    scale: Math.min(1, 0.25 + progress * 1.6),
  };
}

/** Cancellation also releases waits when a game is closed or replaced during its entrance. */
export function openingDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}

/** Fade the real setup surface away over the new board, preserving its canvas artwork. */
export function fadeSetupScreen(app: HTMLElement, screen: HTMLElement | null) {
  if (!screen) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return screen.remove();
  screen.inert = true;
  screen.setAttribute('aria-hidden', 'true');
  screen.classList.add('setup-departing');
  app.append(screen);
  void screen
    .animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'scale(1.025)' },
      ],
      {
        duration: T.openingBoard,
        easing: 'ease-in-out',
        fill: 'forwards',
      },
    )
    .finished.catch(() => {})
    .finally(() => screen.remove());
}
