/**
 * Browsers (Safari on phones especially) can keep showing an old copy of the page after a new
 * build is deployed. On start-up, ask the server which build is live and, if it is newer, load
 * the page again from a fresh address so the new build is used.
 */
import { BUILD } from './build';

const TRIED_KEY = 'adventure-avenue-update-tried';

export async function checkForUpdate(): Promise<void> {
  if (BUILD.sha === 'unknown' || location.protocol === 'file:') return;
  // Keep the address as it was on load (start-up may tidy an invite link's ?join= away).
  const { pathname, search, hash } = location;
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const live = (await res.json()) as { sha?: string };
    if (!live.sha || live.sha === BUILD.sha) return;
    // Only try once per live build, so a stubborn cache can never cause a reload loop.
    if (sessionStorage.getItem(TRIED_KEY) === live.sha) return;
    sessionStorage.setItem(TRIED_KEY, live.sha);
    const q = new URLSearchParams(search);
    q.set('v', live.sha);
    location.replace(`${pathname}?${q}${hash}`);
  } catch {
    /* offline or storage blocked: keep the page as it is */
  }
}
