declare const __BUILD__: { branch: string; sha: string; time: string };

/** Which build is running: set at build time by vite.config.ts. */
export const BUILD = __BUILD__;

/** The badge and dev menu are for test builds only; the stable (main) build hides them. */
export const IS_DEV_BUILD = BUILD.branch !== 'main';
