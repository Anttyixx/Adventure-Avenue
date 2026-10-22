# Adventure Avenue

A Fortune Street-style board game for the browser. Spec: `docs/spec.md`.

## Branches

- Work happens on `dev`. Only merge/push to `main` when the owner says the build is stable.
- Pushing `dev` deploys the preview to `/dev/` on GitHub Pages; pushing `main` deploys the site root.

## Layout

- `packages/engine` - UI-free rules engine. Every tunable number lives in `src/constants.ts`.
  The engine raises decision requests through `GameIO.decide` and announces changes through
  `GameIO.emit`; it never touches the DOM.
- `apps/client` - Vite + TypeScript hot-seat client (canvas board, HTML/CSS overlays).
- `apps/server` - planned online server (not built yet).

## Commands

- `npm test` - engine unit tests + 1,000-match CPU simulation
- `npm run lint`, `npm run typecheck`, `npm run format`
- `npm run dev` - client dev server; `npm run build` - production build
- `npm run sim -- 500` - CPU-only balance simulation
