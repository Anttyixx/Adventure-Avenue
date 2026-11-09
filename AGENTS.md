# Adventure Avenue: guide for AI assistants

This file is for any AI coding assistant working on the project (ChatGPT/Codex, Claude, others).
`CLAUDE.md` loads this file, so both tools follow the same rules. Keep it current: when a rule
or a major piece of the code changes, update this file in the same commit.

Adventure Avenue is a Fortune Street-style board game for the browser: roll a die, move around a
branching town, buy and grow shops, trade district stocks, collect four suits for promotions, and
race to a target net worth, then get back to the bank. 2-5 players hot-seat on one device or
online (browser to browser), with CPU players filling empty seats.

## Read first

| File                               | What it gives you                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `AGENTS.md` (this file)            | How to work on the project: rules, workflow, conventions                         |
| `docs/architecture.md`             | How the pieces work together: engine, client, camera, HUD, online play, saves    |
| `docs/codemap.md`                  | Where everything lives: every file, its key functions, and a "where is X" index  |
| `docs/design.md`                   | How to design UI: deciding where things go, and a spec for every element         |
| `docs/spec.md`                     | The game's rules and interface in full detail (the source of truth for behavior) |
| `packages/engine/src/constants.ts` | Every balance number, each with a comment                                        |

When the spec and the code disagree, ask the owner which is right; then fix the other one.

## Workflow rules

- **Explain things simply.** The owner has limited coding experience. Use plain language and
  keep explanations short and easy to understand. Explain technical terms when needed, and
  save deeper technical detail for when the owner asks for it.
- **Branches.** Work happens on `dev`. Only merge or push to `main` when the owner says the build
  is stable. Pushing `dev` deploys the preview to `/dev/` on GitHub Pages; pushing `main` deploys
  the site root.
- **End every reply that changes something with the playable link** for the branch updated, and
  say which build it is (the short commit hash, shown in the game's version chip):
  - `dev`: https://anttyixx.github.io/Adventure-Avenue/dev/ (e.g. "dev build `bbca06e`")
  - `main`: https://anttyixx.github.io/Adventure-Avenue/
- **Versions.** `VERSION` in `apps/client/src/build.ts` is the version released on `main` (now
  0.1). `dev` shows the next version (v0.2) plus its build. When the owner says to push to
  `main`, bump `VERSION` to the version being released.
- **For every change players will notice:**
  1. Add an entry at the top of `apps/client/src/changelog.ts` (shown in "What's new" on the main
     menu): biggest changes as `features`, small ones as `extras`.
  2. Update `docs/spec.md` so it describes the new behavior.
  3. UI changes: design and build them by `docs/design.md`: first choose the container and
     controls with its section 2 ("How to make design decisions"), then follow the element's
     spec in section 5, and go through its checklist. Add a control for any new UI element to the UI Lab (`apps/client/src/ui/lab.ts`),
     and list the controls touched by the change in `RECENT` at the top of `lab.ts` (they shake
     and glow so the owner can find them, and the Lab's **New** tab shows only them). Replace
     the whole list with each push: `RECENT` holds only the latest change's controls, never
     older ones. A new Lab section goes in one of the tabs in `LAB_TABS`.
- **Engine changes that alter what happens in a game** (rules, decisions, randomness) must bump
  `NET_VERSION` in `apps/client/src/net/protocol.ts`, so players on different builds are not put
  in the same online game.
- **Before committing:** `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` must
  all pass. Format with Prettier (`npm run format`, or `npx prettier --write <files>`).
- **Check UI changes in a browser** (see "Testing" below), on a desktop size and a phone size
  (phones play in landscape; portrait shows a "rotate your phone" screen).
- **Commits:** a one-line summary of what changed for the player, then a short body. Never commit
  screenshots or scratch files into the repo.

## Rules for the code

- **The engine (`packages/engine`) is UI-free and deterministic.** It never touches the DOM,
  timers or sockets. All randomness goes through `G.rng` (`rng.ts`), never `Math.random`, or
  online games fall out of step. Every tunable number lives in `src/constants.ts` as `K` (CPU
  behavior under `K.cpu`, which `cpu.ts` calls `C`).
- **The engine talks to the outside only through `GameIO`:** `decide(request)` when a player
  must choose (see `decisions.ts`), `emit(event)` after every state change (see `events.ts`).
  Add a new choice by adding it to `DecisionMap`, answering it in the CPU (`cpu.ts`), in the
  client (`host.ts` `human()`), and in `ui/activity.ts` (the "X is ..." status text).
- **Arcade games:** `arcade.ts` owns five-slot reel rolls, party-game choices and payouts. `ui/arcade.ts` (`ArcadeStage`) shows them like the venture board: a board in the middle of the screen with prompts and results in the action bar; all randomness stays in the engine. Party choices use sequential `arcadeChoice` decisions and a shared `arcadeRound` reveal, so hot-seat and online share the same flow.
- **Venture card numbers** in `packages/engine/src/cards.ts` are permanent reference numbers.
  Keep existing numbers when reordering cards; give new cards unused numbers. The Guide reads
  the same card data, and numbers are shown only on flipped panels.
- **The game state (`GameState`, `types.ts`) is one plain serializable object.** Saves and online
  play copy it as JSON, so no classes, Maps or functions in it. Old saves must keep loading: new
  fields are optional, with a fallback where they are read.
- **The client (`apps/client`) is plain TypeScript and DOM, no framework.** Elements are built
  with `h(tag, attrs, ...children)` from `ui/dom.ts`; money is written with `fmt(n)` ("1,200G",
  turned into a coin icon on screen by `coins.ts`). Styles are in one file, `src/style.css`,
  grouped by feature with a comment above each group.
- **UI look and feel follows `docs/design.md`.** Use its color tokens, fonts, button variants,
  surfaces and motion patterns; copy the nearest existing element instead of inventing a new
  style. If a change sets a new pattern (a new kind of element, color meaning or animation), add
  it to `docs/design.md` in the same commit.
- **Match the surrounding code:** its naming, comment density and idiom. Comments explain why or
  what a piece is for, in plain English; doc comments (`/** */`) on exported functions and on
  non-obvious fields.
- **Player-facing text:** short, plain, friendly; money as "1,200G"; no jargon.

## Names the owner uses for things

Requests refer to parts of the game by these names:

- **Game screen (HUD, `apps/client/src/ui/hud.ts`):**
  - **info chip:** top left; game name, board, round, goal, and the Room button online.
  - **Info button:** right of the info chip; it opens the **info pop-up** (`ui/info.ts`): Game,
    Stocks and one page per player, picked in the action bar.
  - **toolbar:** top right; the **zoom chip**, the **Game log** button (opens the **game log**
    panel in the top right, under the toolbar and above the player cards) and the **Menu** button (a centered
    pop-up that pauses games on this device; it holds the **Guide**, `ui/guide.ts`, a centered pop-up with tabs).
  - **action bar** (`.prompt-center`): the current player's options at the bottom, or the
    **status line** when no options are up; it morphs between the two. `ui/status-messages.ts` gives new action phases priority over old results, protects brief in-phase overlays and debounces idle activity; actual choices interrupt stale announcements.
  - **player cards:** bottom right. Clicking one opens that player's page in the info pop-up
    (drawn by `ui/overview.ts`).
- **Board** (`apps/client/src/board.ts`):
  - **tiles/squares**, **districts** (color groups of shops), **vacant plots** (empty properties
    that get a building).
  - **background:** `board.ts` `paintGrass` covers the visible camera area with world-aligned grass. Live views draw `paintBoard(..., false)` into transparent caches so no grass seam appears at board edges.
  - **auto zoom / camera:** see "Camera" in `docs/architecture.md`.
- **Board builder** (or board editor, `ui/editor.ts`, `#editor`): the full-screen builder with the
  left icon toolbar (Select, Pan, Place, Erase, Links), the Tiles pane, Board settings, tile info panel, the portal panel and
  warps/portals. How it works in detail: "Board builder overview" in `docs/architecture.md`.
- **Menus and tools:**
  - **main menu**, **game setup**, **What's new** (`changelog.ts`), **Credits**, **board
    collection** (`ui/collection.ts`, Menu pop-up: view, add, hide and remove boards), **board
    viewer** (the board builder opened read-only from the collection, with an Edit button).
  - **version chip:** bottom right of the main menu only; holding it 3 s on test builds opens the
    **dev menu**.
  - **UI Lab** (`#ui-lab`), **Stocks lab** (`#stocks-lab`), **board editor** (`#editor`).
- **Stocks:** two systems chosen in game setup (`G.stocks`): `dynamic` (default) and `classic`
  (for old saves). See "Stock market" in the spec.
- **Board art:** property base/tint PNGs live in `apps/client/src/assets/properties-v3/`, other board art in
  `assets/tiles-v2/`, mapped in
  `props.ts` (`ART_SET`, `ART_SOURCES`). The previous property set and original Checkpoint/Circus/Motel pairs remain
  unchanged in `assets/tiles-v2/` and `assets/props/`; `PROPERTY_SET` selects the property set. Base-only sprites never auto-recolor blue pixels. New recolorable sprites
  require an aligned grey `-tint.png`. Keep legacy assets and canvas fallbacks for rollback.

## Commands

```bash
npm install
npm run dev          # client dev server at http://localhost:5173
npm test             # engine unit tests + a 1,000-match CPU simulation
npm run lint
npm run typecheck
npm run format       # Prettier on everything
npm run build        # production build to apps/client/dist
npm run preview      # serve the build (http://localhost:4173)
npm run sim -- 500   # CPU-only balance simulation (average match length, etc.)
```

## Testing

- **Engine:** Vitest tests in `packages/engine/test/` (`helpers.ts` has `makeGame()` with a small
  test board and scripted answers). Add a test for every rule change or rule bug fix.
- **UI Lab:** `/#ui-lab` (or the dev menu: hold the version chip on the main menu for 3 seconds).
  It builds a sample game and has a button for every UI element, in a pop-up that the version chip
  in the top left opens and closes (scripts can preset `localStorage['aa-lab-open'] = '0'` to
  start with it closed). `/#stocks-lab` compares the
  stock systems; `/#editor` is the board editor.
- **Browser automation:** Playwright works against `npm run preview`. Dev builds expose the
  running game as `window.__aaGame` (the `HotSeat`: `.G` state, `.board`, `.hud`, `.game`), so a
  script can set up a situation directly. Game settings (not players) can be preset with
  `localStorage['adventure-avenue-options']` (e.g. `{"target":4000,"rules":"easy"}`) and
  `localStorage['adventure-avenue-fast'] = '1'` speeds up CPU turns. Start a game from the main
  menu with `.menu-btn.start`; setup starts with only the host, so add bots with `.seat-add` (and
  local players with `.seat-add-local`), then tap each player's Ready chip
  (`button.seat-ready`); the game starts when everyone is ready.

## Project layout (short version; full map in `docs/codemap.md`)

```
packages/engine/      rules engine (TypeScript, no DOM)
  src/engine.ts       Game class: the whole turn flow
  src/rules.ts        pure formulas: fees, stock prices, net worth, salary...
  src/constants.ts    every balance number
  src/cards.ts        venture cards, src/arcade.ts minigames, src/cpu.ts CPU players
  src/boards/         built-in boards as text maps + the custom board format
  test/               Vitest tests
apps/client/          Vite + TypeScript browser client
  src/main.ts         start-up and screen routing (menu, setup, game, editor, labs)
  src/host.ts         HotSeat: runs the engine, answers decisions, animates events
  src/board.ts        BoardView: the canvas board, camera, tokens and effects
  src/ui/hud.ts       Hud: every overlay on the game screen
  src/ui/*.ts         menus, dialogs, pickers, labs, editor
  src/net/            online play (PeerJS, lockstep)
docs/                 spec.md, architecture.md, codemap.md, design.md
```
