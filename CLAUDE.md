# Adventure Avenue

A Fortune Street-style board game for the browser. Spec: `docs/spec.md`.

## Branches

- Work happens on `dev`. Only merge/push to `main` when the owner says the build is stable.
- Pushing `dev` deploys the preview to `/dev/` on GitHub Pages; pushing `main` deploys the site root.
- After every change, end the reply with the playable link for the branch that was updated:
  - `dev`: https://anttyixx.github.io/Adventure-Avenue/dev/
  - `main`: https://anttyixx.github.io/Adventure-Avenue/
- With the link, say which build it is: the short commit hash shown in the build badge (e.g.
  "dev build `bbca06e`").
- For updates players will notice, add an entry at the top of `apps/client/src/changelog.ts`
  (shown in "What's new" on the main menu).

## Layout

- `packages/engine` - UI-free rules engine. Every tunable number lives in `src/constants.ts`.
  The engine raises decision requests through `GameIO.decide` and announces changes through
  `GameIO.emit`; it never touches the DOM.
- `apps/client` - Vite + TypeScript hot-seat client (canvas board, HTML/CSS overlays).
- Online play (`apps/client/src/net/`, screens in `ui/online.ts`): one player hosts in their
  browser; friends join with a 4-letter room code over WebRTC (PeerJS). Every device runs the
  engine in lockstep: the host numbers and broadcasts each decision answer plus the RNG state, and
  checks a state hash every turn. Keep the engine deterministic (all randomness through `G.rng`).
  Dev builds accept `?peer=host:port` to use a local PeerJS server for testing.
- `apps/server` - not needed for now (see its README).
- Boards are data (`BoardDef`). Built-in boards are listed in `boards/builtin.ts`; all but Town are
  drawn as text maps in `boards/maps.ts`. Custom boards are built in the board editor
  (`apps/client/src/ui/editor.ts`, `#editor`), saved in localStorage (`boardstore.ts`) and
  exported/imported as `.aaboard.json` files. The file format and the playability rules are in
  `packages/engine/src/boards/format.ts`; `newGame({ board })` plays on any valid board.
  Boards use a `square` or `hex` grid (`BoardDef.layout`; hex = pointy-top, odd rows shifted
  right). Cell positions and tile outlines for both live in `apps/client/src/geometry.ts`.
- Dev/test builds show a build badge in the bottom-right corner (on menus and the UI Lab, not during a game); tapping it 5 times opens the dev
  menu. The UI Lab (`#ui-lab`, code in `apps/client/src/ui/lab.ts`) shows every UI element with
  controls to trigger it. When adding a new UI element, add a control for it to the UI Lab.
  The stable `main` build hides the badge and dev menu.

## Commands

- `npm test` - engine unit tests + 1,000-match CPU simulation
- `npm run lint`, `npm run typecheck`, `npm run format`
- `npm run dev` - client dev server; `npm run build` - production build
- `npm run sim -- 500` - CPU-only balance simulation
