# Architecture: how Adventure Avenue works

How the code is put together and how data flows through it. The game rules themselves are in
`docs/spec.md`; where each file lives is in `docs/codemap.md`.

## The big picture

```
                 ┌──────────────────────────── apps/client (browser) ───────────────────────────┐
                 │                                                                               │
 main.ts ──────► │ menu / setup screens ──► HotSeat (host.ts) ──► BoardView (board.ts, canvas)   │
 (routing)       │                              │   ▲             Hud (ui/hud.ts, HTML overlays)  │
                 │                    decide()  │   │ emit()      dialogs / pickers (ui/*.ts)     │
                 │                              ▼   │                                           │
                 │                 ┌── packages/engine ─────────────┐                           │
                 │                 │ Game (engine.ts): turn flow    │                           │
                 │                 │ rules.ts, cards.ts, cpu.ts ... │                           │
                 │                 │ GameState: one plain object    │                           │
                 │                 └────────────────────────────────┘                           │
                 │ online: net/ (HostRoom / GuestRoom over PeerJS) shares every decision answer  │
                 └───────────────────────────────────────────────────────────────────────────────┘
```

There is no game server. Every device runs the engine itself; online play keeps the copies in
step by sharing the answers to decisions (see "Online play").

## The engine (`packages/engine`)

### State

The whole match is one serializable object, `GameState` (`types.ts`): settings (rules, target,
round cap, stock system), the board (`nodes`: one `Square` per board square, plus `districts`,
`groups`), the players (`Player`: cash, position, suits, shares, level, stats...), the stock
market (`factor`, `market`), the venture grid (`vg`), the log, net worth history (`hist`), and
the RNG state (`rng`). Nothing in it depends on rendering, so it can be saved, copied
(`cloneState`) and sent over the network as JSON.

`newGame(options)` (`setup.ts`) builds a fresh state from a `BoardDef` and `MatchOptions`: places
players at the bank, picks vacant plots, applies the near-bank price discount, rolls each
district's stock volatility and shuffles the venture deck.

### The turn flow (`engine.ts`)

`Game` runs the match as plain `async` code that reads like the rules:

```
run() → playTurn() repeatedly:
  turnStart → reopen the player's shops → preRoll (sell stock, trade, auction, renovate, or roll)
  → rollAndMove → move (step by step: passing squares collects suits, pays tolls, visits the bank)
  → land(square) → landShop / landPlot / bankVisit / venture / special squares
  → settleDebt (sell assets if cash < 0) → advance to the next player / round
```

Whenever a player must choose, the engine calls `await this.ask(request)`, which goes to
`io.decide(request)`. Whenever the state changes, it calls `await this.emit(event)`, which goes to
`io.emit(event)`. That is the whole interface (`GameIO`):

- **Decisions** (`decisions.ts`, `DecisionMap`): each kind has a request shape and an answer
  shape, e.g. `buyShop: [{ sq, price }, boolean]` or `path: [{ dests, steps }, number]`. The
  engine checks answers before using them (an invalid answer is treated as a safe default).
- **Events** (`events.ts`, `GameEvent`): `turnStart`, `roll`, `step`, `land`, `money`, `owner`,
  `value`, `suit`, `promote`, `venture`, `auctionBid`, `closed`, `gameOver`, `log`... The state
  is already updated when an event arrives; events exist so the client can animate the change.

Because the engine only waits on `decide` and `emit`, the same code runs CPU-only simulations
(`headless.ts`: every seat answered by `cpuDecide`, events dropped), unit tests (scripted
answers) and real games (answers from the UI or the network).

### Rules, numbers and content

- `rules.ts`: pure functions over the state, no decisions: fees (`shopFee`, `squareFee`), shop
  limits (`maxValue`, `investRoom`), stock prices (`stockPrice`, `districtWorth`, `shareBoost`,
  `sellOffCut`), money (`netWorth`, `salary`, `spendable`, `canAfford`), ownership (`dominated`,
  `expand`) and the venture grid's line bonuses.
- `constants.ts`: every tunable number as `K` (with `K.cpu` for CPU behavior). Change balance
  here, not in the rules code. The Stocks lab can override the stock numbers live on a device.
- `cards.ts`: the venture deck as data; each card's `run(game, player)` uses the same `ask`,
  `pay`, `log` helpers as the engine.
- `arcade.ts`: the minigames. The engine decides every random outcome; the player only picks
  when to stop or what to back.
- `cpu.ts`: `cpuDecide(G, request)` answers any decision with simple greedy rules (keep a cash
  buffer, buy what pays back, prefer routes toward goals).
- `rng.ts`: a seeded generator whose state lives in `G.rng`. All randomness must use it.

### Boards

Boards are data (`BoardDef`): squares on a grid (`x`, `y`, type, district, base price), edges
between them, districts and the bank. Built-in boards are text maps in `boards/maps.ts` (one
character per cell, legend at the top of the file), turned into `BoardDef`s by `fromMap`.
`boards/format.ts` defines the `.aaboard.json` file format and `validateBoard` (the rules a
board must meet to be playable), shared by the board editor and imports. Grids are `square` or
`hex` (pointy-top, odd rows shifted right); `apps/client/src/geometry.ts` places cells and draws
tile outlines for both. Which properties start as vacant plots is not fixed by the map: `newGame`
picks them from the plot setting (`MatchOptions.plots`), preferring squares the map marks.

## The client (`apps/client`)

### Screens and start-up (`main.ts`)

`main.ts` loads the sprites and property art, then routes by the address hash: `#ui-lab`,
`#stocks-lab`, `#editor`, an invite link (`?join=CODE`), or the main menu (`ui/menu.ts`). From
the menu: Play opens game setup (`ui/start.ts`, which also opens an online room), Join joins a
room, Continue resumes the saved game, and the board editor (`ui/editor.ts`).

### HotSeat: the bridge between engine and screen (`host.ts`)

`HotSeat` implements `GameIO` and owns one game screen: a `BoardView`, a `Hud` and the `Game`.

- **`decide(request)`**: works out who answers. A CPU: `cpuDecide`, then `showCpu` gives the
  choice a beat on screen so people can follow. A human on this device: `human(request)` shows
  the right prompt (action bar buttons via `hud.prompt`, a choice on the board via
  `board.setChoices`, or a dialog from `ui/modals.ts` / `ui/pick.ts` / `ui/games.ts`) and returns
  the answer. Several humans on one device get a "pass the device" screen between them. Online,
  `decideOnline` adds the network step (below).
- **`emit(event)`**: turns each event into animation and sound (tokens walking, coins flying,
  rings, banners, gates closing...) and waits the time in `timing.ts` so a turn is easy to follow.
  `refresh()` redraws the board and HUD from the state. After events it announces any stock
  price change (`announceStockMoves`).
- It also handles pausing (the menu), Fast CPU speed, saving at each turn start, and the game
  over sequence.

### The board (`board.ts`)

`BoardView` draws everything on one `<canvas>`:

- **Static layer:** scenery and tiles are painted once into an offscreen cache
  (`renderStatic` → `paintBoard`) and redrawn only when `dirty` (state changed) or the zoom needs
  a sharper copy. Property images come from `props.ts` (PNG art in `assets/props`, recolored to
  the owner's color) with vector fallbacks in `art.ts`.
- **Each frame:** camera update, the cached board, then ambient animation, closed-shop gates,
  greyed tiles, choice glows, routes, tokens (pixel characters from `sprites.ts`), direction
  arrows, pins, short-lived effects (`fx`: rings, coins, floating text) and the die.
- **Choices on the board:** `setChoices(ids, color, onPick, routes?, opts?)` makes squares glow
  and clickable; `clearChoices()` ends it. `highlight` lights squares without making them choices.
- **Camera:** follows the active player (`followPid`) at the player's own zoom (`zoomOut`, set by
  wheel, pinch, -/+ keys). Automatic views override it:
  - _Timed shows_ lock manual zoom (`zoomLocked`): `showHold` (shops closing), `lookAt` (a
    district's stock move, the winner), `peekWhole` (finding a property from the overview).
  - _Views waiting on the player_ allow manual zoom and give the player's zoom back when they
    end: `frameIds` (where a roll can reach; only on the roller's device), `fitIds` (set by
    `setChoices`), `overviewHold` (trades).
  - `insets` (set by `hud.updateInsets`) is the screen area covered by HUD panels, so framing
    keeps squares out from under them.

### The HUD (`ui/hud.ts`)

`Hud` owns every HTML overlay on the game screen, by name (see `CLAUDE.md`/`AGENTS.md` naming):
the info chip and Stock market button (top left), the toolbar (zoom chip, Guide, Menu), the
action bar (`.prompt-center`: `prompt()` shows a question with buttons and returns a promise of
the choice; `status()` shows what is happening), the Game log button and log, the player cards
(bottom right; clicking one opens the player overview from `ui/overview.ts`), tooltips, banners,
and modals (`modal()` for any centered dialog). It re-renders from the state on `render(G)`.

### Online play (`net/`)

Lockstep, no server: every device runs the same engine from the same starting state, and the
engine only branches on decision answers and the RNG. So:

1. The host (`HostRoom`) numbers every decision in order (`seq`).
2. The player who owns the decision answers it on their device (a guest sends it to the host,
   `ToHost.answer`); the host checks it came from the right seat. CPU seats, and players who
   dropped, are answered by the host with `cpuDecide`.
3. The host broadcasts each answer with the RNG state after it (`ToGuest.ans`); every copy
   applies it and plays on.
4. At each turn start the host sends a hash of its state; a guest whose copy drifted asks for a
   resync and replays from the turn's starting state (`StartInfo`).

Connections are WebRTC data channels through PeerJS (`peer.ts`; PeerJS's public server only
introduces the browsers; dev builds accept `?peer=host:port` to use a local PeerJS server for
testing). The room code maps to a peer id (`roomPeerId`). Guests that drop keep
retrying and rejoin mid-game. `NET_VERSION` must change whenever the engine's behavior changes,
so mismatched builds refuse to play together. `GameLink` (`link.ts`) is the interface `HotSeat`
uses, implemented by `HostRoom` and `GuestRoom`.

### Saves and settings

- `save.ts`: the game state is saved to `localStorage` at every turn start (and the room details
  for online games, so the host can reopen it). Continue on the main menu resumes it.
- Other `localStorage` keys (all prefixed `adventure-avenue-`): setup options, audio volumes,
  Fast CPU, saved player names, custom boards (`boardstore.ts`), the guest's rejoin info, Stocks
  lab settings, the last "What's new" seen.
- Reading `localStorage` is always wrapped in `try`/`catch` (private browsing can throw).

### Sound (`audio.ts`)

All sound is synthesized with the Web Audio API (no audio files): `sound.play('buy')` for an
effect (`Sfx` lists them), `sound.music('game')` for a looping track. Audio starts after the
first touch or key press, as browsers require.

## Build and deploy

- Vite builds `apps/client` into `apps/client/dist`. `vite.config.ts` injects `__BUILD__` (branch
  and commit) used by `build.ts` for the version chip and the update check (`update.ts` reloads
  the page when a newer build is live).
- GitHub Actions: `ci.yml` runs lint, typecheck, tests and build on every push.
  `pages.yml` deploys `dev` to `/dev/` and `main` to the site root on the `gh-pages` branch.

## Recipes

- **New rule or balance change:** constants in `constants.ts`; logic in `engine.ts` / `rules.ts`;
  CPU handling in `cpu.ts`; a test in `packages/engine/test/`; spec; changelog; bump
  `NET_VERSION`.
- **New decision:** add it to `DecisionMap` (`decisions.ts`), ask it with `this.ask(...)` in the
  engine, answer it in `cpuDecide` (`cpu.ts`), in `HotSeat.human` (`host.ts`) and describe it in
  `ui/activity.ts`.
- **New event:** add it to `GameEvent` (`events.ts`), emit it from the engine, animate it in
  `HotSeat.emit` (`host.ts`).
- **New venture card:** add an entry to `CARDS` in `cards.ts` (mark stock cards `std` so the Easy
  deck leaves them out).
- **New UI element:** build it with `h()`, style it in `style.css`, add a UI Lab control and list
  it in `RECENT` (`ui/lab.ts`).
- **New built-in board:** draw it as a text map in `boards/maps.ts`, add it to `BUILT_IN_BOARDS`
  in `boards/builtin.ts`; the board tests check it is valid.
- **New sound:** add the name to `Sfx` and `SFX_NAMES` and a `case` in `AudioEngine.play`
  (`audio.ts`).

### Action bar resizing

`Hud.askSize()` captures the visible size and synchronously releases any previous animation.
`morphAsk()` measures the destination once, holds its content in a temporary `.ask-content`
wrapper at that width and height, then animates the shell for 240ms. Measurements retain
fractional pixels. Prompt text uses a 220ms Web Animations clip-path reveal, started once per new message
after sizing begins. It does not move text or alter layout, survives reparenting without
restarting, and is skipped with reduced motion. The former CSS `rise` animation must not be
used here because reparenting restarts it. Identical status messages keep their existing nodes. Completion unwraps the
same nodes, preserving listeners and focus. The root/card ResizeObserver retargets the bar
when available space changes. A MutationObserver batches later text and form changes into one
resize per frame. Both observers are disconnected when the HUD is destroyed. Reduced motion
uses the natural layout immediately. UI Lab: “Action bar resize test”.

### Observer result and wait messages

`HotSeat` announces `land` using `squareName` and remembers the latest roll for movement
choices. `activity()` combines a matching roll and path decision; non-roll movement stays
explicit. `Hud.tick()` accepts a result hold duration. `status()` records the actual wait
immediately for the log, while the action bar holds the preceding result up to 2.5 seconds.
New results cancel old timers; movement/turn statuses bypass the hold, local prompts clear it,
and HUD destruction cancels it. This timer never blocks engine or network decisions.
