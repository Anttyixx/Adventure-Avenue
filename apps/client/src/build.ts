declare const __BUILD__: { branch: string; sha: string; time: string };

/** Which build is running: set at build time by vite.config.ts. */
export const BUILD = __BUILD__;

/** The dev menu is for test builds only; the stable (main) build hides it. */
export const IS_DEV_BUILD = BUILD.branch !== 'main';

/**
 * The version released on main (the stable site). Bump it whenever dev is pushed to main:
 * dev builds always work on the next version.
 */
export const VERSION = '0.1';

/** The version after `v` (0.1 -> 0.2). */
function nextVersion(v: string): string {
  const [major, minor] = v.split('.').map(Number);
  return `${major}.${minor + 1}`;
}

/** What the version chip shows: main is the released version, dev builds the next one. */
export const VERSION_LABEL = `v${IS_DEV_BUILD ? nextVersion(VERSION) : VERSION}`;
