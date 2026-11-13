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
players at the bank, resolves district starting prices, picks vacant plots, rolls each
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

Boards are data (`BoardDef`): squares on a grid (`x`, `y`, type and district), edges
between them, districts and the bank. Built-in boards are text maps in `boards/maps.ts` (one
character per cell, legend at the top of the file), turned into `BoardDef`s by `fromMap`.
`boards/format.ts` defines the `.aaboard.json` file format and `validateBoard` (the rules a
board must meet to be playable), shared by the board editor and imports. Grids are `square` or
`hex` (pointy-top, odd rows shifted right); `apps/client/src/geometry.ts` places cells and draws
tile outlines for both. Which properties start as vacant plots is not fixed by the map: `newGame`
picks 0/1/2/3/4 uniformly shuffled properties per district from the plot setting
(`MatchOptions.plots`), using `G.rng`. No board-wide cap or legacy plot hints influence selection.
Validation requires exactly four properties per declared district, including rejecting empty ones.
The editor represents all properties as board `shop` tiles, strips legacy plot hints and previews
with `plots: none`; only a running game distinguishes shops from vacant plots.

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
- **Live auctions:** the engine asks one `auction` decision; `runAuction` answers it by running the
  live auction on screen (`ui/auction.ts` `LiveAuction`: bids and passes at any time, a 5-second
  clock, CPU bidders). Online only the host runs it: guests send `auctionAct` messages and draw
  the `auction` updates the host sends (`auctionOnline`), then everyone applies the host's answer.
- **Several decisions at once:** party games (`arcade.ts` `choices`) ask every player at the same
  time and wait with `Promise.all`, applying the answers in seat order. CPUs and players on other
  devices answer side by side; people on this device take turns with the one action bar
  (`oneAtATime` chains their prompts). Decision numbers (`seq`) are still handed out in request
  order, so every device numbers them the same, and answers are matched by number whatever order
  they arrive in.
- **`emit(event)`**: turns each event into animation and sound (tokens walking, coins flying,
  rings, banners, gates closing...) and waits the time in `timing.ts` so a turn is easy to follow.
  `refresh()` redraws the board and HUD from the state. After events it announces any stock
  price change (`announceStockMoves`).
- **Net worth on the cards** (`shownWorth`, set as `Hud.worthOf`): stock is counted from
  `stockShown`, not live prices. `trackStock` (in `refresh`) adds a share purchase at its cost
  (or takes a sale off at its proceeds) and values other share changes at the prices shown so
  far; `announceStockMoves` updates `prices[d]` and re-syncs only after each district's rise or
  fall has played. Rules, saves and online play still use the live `netWorth`.
- It also handles pausing (the menu), Fast CPU speed, saving at each turn start, and the game
  over sequence.

### The board (`board.ts`)

`BoardView` draws everything on one `<canvas>`:

- **Ground:** `GROUND_SET` (`props.ts`) is `solid` by default: `paintGrass` / `paintLiveGrass`
  fill the visible world with one grass color and nothing below is built. With a game state,
  `paintSceneryOnGrass` adds `foliage.ts` `paintFoliage`: the visible stretch of a river path
  stroked live and foliage pieces planned per 800-unit chunk (cached per state), drawn from
  halved sprite copies (`spriteAt`) sized to the screen; pieces under 14px are skipped. With `textured`,
  `paintLiveGrass` draws the background described next from `ground.ts`: meadow and terrain baked
  into one cached 800-unit chunk per resolution level (96MiB LRU), so a frame paints one layer.
  At most one chunk is built per frame and none while the camera zooms (another level stands
  in; with none, the cheap 0.5 level is built), and `BoardView.warm` pre-builds chunks in idle
  time. Terrain decorations stay live on top (`paintTownFeatures`).
- **Background (textured):** `paintGrass` fills the inverse-camera rectangle with nonrepeating grass
  (`meadow.ts`). Default `SCENERY_SET = terrain` adds `town-terrain.ts` / `town-terrain-art.ts`:
  80-unit grass/water/paving material cells, board-aware clearance, shared contours and soft
  material masks. `terrain-v12/` supplies crisp cartoon lawn and cobblestone materials; water retains its v8 material,
  v8/v9 artwork remains intact and supplies foliage. `townBackgroundFeatures` places trees, flowers, reeds, rocks and lily pads, with
  benches only within 260 world units of a playable tile and planters within 300. No default
  hedge frame, activity clearings or decorative paths. Terrain caches use 800-unit world chunks at 0.5–2 pixels/world unit, selected from the current
  camera transform. Overscan grows with resolution; the LRU is bounded by 256 entries and 128MiB.
  Default decorations draw directly from their PNGs after terrain, with placement plans cached
  separately. Meadow caches also keep camera-dependent resolution levels, with a 128MiB budget
  across levels per source. Meadow patches vary their crops and horizontal flips only; no rotation
  or vertical mirroring is allowed for the active lawn artwork. Layout/canvas caches
  live outside game state and never consume engine randomness.
  `puzzle` retains `park-scenes.ts` / `park-scenes-art.ts` and v10 art; `connected` restores
  the earlier detailed terrain. `park` / `previous` retain older scenery. All PNGs remain.
  The builder omits scenery; `drawParkGround` adds verges below actual roads in games, leaving
  portal stems their normal width. Each verge pass joins road strokes with expanded `tileShape`
  pads so square corners and hex points retain a continuous ground margin. Square/hex Lab
  previews show the active scenery.
- **Static layer:** scenery and tiles are painted once into an offscreen cache
  (`renderStatic` → `paintBoard`). When `dirty` (state changed), `updateStatic` compares each
  square's `squareLook` (everything `drawSquare` reads, fees included) with the last paint and
  `repaintSquares` re-draws only changed squares: their `SQUARE_REACH` boxes are cleared on whole
  device pixels, clipped, and scenery plus every square reaching into them is painted again in
  the same order (`drawSquareClean` isolates each square's context state). More than a third of
  the squares changed, a new state (`setState`) or fonts loading (`redrawAll`) paint it all.
  The settled zoom may also need a sharper copy (never mid-zoom; `maxCacheScale` keeps it under
  16M pixels). `BoardView.warm` also pre-tints each player's tile, flag and shop sprites
  (`tintJobs`) in idle time, since `propCanvas` recolors pixel by pixel on first use. Property images come from `props.ts` (PNG art in `assets/props`, recolored to
  the owner's color) with vector fallbacks in `art.ts`.
- **Each frame:** camera update, the cached board, then ambient animation, closed-shop gates,
  greyed tiles, choice glows, routes, tokens (pixel characters from `sprites.ts`), direction
  arrows, pins, short-lived effects (`fx`: rings, coins, floating text) and the die.
- **Choices on the board:** `setChoices(ids, color, onPick, routes?, opts?)` makes squares glow
  and clickable; `clearChoices()` ends it. `highlight` lights squares without making them choices.
- **Camera:** follows the active player (`followPid`) at the player's own zoom (`zoomOut`, set by
  wheel, pinch, -/+ keys). Automatic views override it:
  - _Timed shows_ lock manual zoom (`zoomLocked`): `showHold` (shops closing), `lookAt` (a
    district's stock move, the winner), `peekWhole` (finding a property from a player's info page).
  - _Views waiting on the player_ allow manual zoom and give the player's zoom back when they
    end: `frameIds` (where a roll can reach; only on the roller's device), `fitIds` (set by
    `setChoices`), `overviewHold` (trades). Both `frameIds` and `fitIds` go through `autoFrame`:
    the bounding box of the player and the offered squares (plus a tile margin and room for pins),
    centred in the free area at the zoom that just fits it. The player's own zoom in that view
    (`autoZ`) ranges down to the full zoom-out, and past the frame the centre eases to the board's
    centre (fully there once the whole board fits).
  - `zoomMode` names the three modes for the zoom chip's border: `locked` (a timed show), `auto`
    (a view waiting on the player) or `free` (only the player's `zoomOut`). `onZoom(pct, mode)`
    reports both to the HUD.
  - `centerLeft` (set by `hud.updateInsets` with `.ab-left`, smaller screens): `focusArea` moves
    the camera's center to the middle of the space between the left edge and the player cards,
    and `freeFit` fits the board into that space.
  - `insets` (set by `hud.updateInsets`) is the screen area covered by HUD panels, so framing
    keeps squares out from under them.

Camera zooms stay smooth because background chunks follow `chunk-budget.ts`: chunks use half
resolution at a canvas scale of 0.5 or less and 2x only from 1.5, a live frame builds at most one new chunk
(an already-built chunk at the other resolution stands in until then), and the caches never drop
chunks drawn in the current frame (a whole-board view used to evict and rebuild chunks every frame).
`BoardView` also only re-renders its static board picture at a higher scale, never a lower one.

### The HUD (`ui/hud.ts`)

While any pop-up is up, `Hud.updateLock` (a MutationObserver on the HUD's layers) adds
`.hud.locked` and sets `board.locked`, so only the action bar and the toolbar's View board, Game
log, Music and Menu respond.

`Hud` owns every HTML overlay on the game screen, by name (see `CLAUDE.md`/`AGENTS.md` naming):
the info chip and Info button (top left; `toggleInfo` opens the info pop-ups from `ui/info.ts`), the toolbar (zoom chip, Game log, Music, Menu), the
action bar (`.prompt-center`: `prompt()` shows a question with buttons and returns a promise of
the choice; `status()` shows what is happening; `updateInsets()` moves it bottom left with
`.ab-left` when the window is too narrow to center it), the Game log button (in the toolbar) and the log panel it opens, the player cards
(bottom right; clicking one opens that player's info page, drawn by `ui/overview.ts`) with the
Stocks, Properties and layout chips under them, tooltips, banners,
and modals (`modal()` for any centered dialog). It re-renders from the state on `render(G)`.

Hidden stack cards use CSS size containment and stretch within the front card's grid row;
status rows on hidden cards never change that row's height. Opened/popped cards retain their
natural height. `Hud.glide` samples current positions but uses explicit intended depth transforms
for destinations. Its generation guard prevents cancelled glides from clearing a newer glide's
transition lock. Reduced motion cancels prior animations before applying the final layout.

### Rides (jumps straight to a square)

The engine's `warp(p, to, how, other)` emits `{ type: 'warp', from, how, other }`: `how` names what
carried the player (`TravelKind`: warp, portal, cannon, taxi, balloon, swap/swapBack, card, home).
It changes nothing in the state, so online play and saves are unaffected. `HotSeat.emit` picks the
message and sound and calls `BoardView.travel`, which runs a per-ride animation: the token takes a
special pose (`Token.portal`: alpha, scale, spin; no disc or name plate) while its position moves,
and short-lived effects (`fx`, which may now start later than they are added) draw the beam,
vortex, smoke, taxi, balloon, trails or stars from `travel-art.ts`. A swap animates both players on
the first event; the second (`swapBack`) only snaps. `portalStep` adds sparks and a streak. The
taxi drives `taxiRoute` (`taxi-route.ts`: a breadth-first search over `nb`, honoring `noGo` and
exit-only portals) as legs (`taxiLegs` in `board.ts`): drives between tile centers, and
shrink-into / pop-out legs at portal links.

### Portal rendering and travel

`newGame` registers all portal endpoints independently of graph-neighbor deduplication. Runtime
portal records include optional `toSide`; this keeps parallel links paired correctly and remains
compatible with older saves. `portal-links.ts` resolves exact partner sides and allowed flow;
`portal-link-art.ts` draws shared directional feedback for the editor and portal-tap effects.
`portal-travel.ts` provides pure poses for `BoardView.portalStep`, which updates the die once,
animates for `TIMING.portalStep`, clears the transient token pose and resumes normal stepping.
`drawTokens` transforms only the traveling sprite and hides its name/base until arrival.
`drawPortalRing` composes a fixed v13 frame with tinted vortex layers, a pulse and orbit lights.
`drawPortals` passes continuous unwrapped time; reduced motion passes zero. The game and builder
share the renderer. `TRANSPORT_SET` in `props.ts` selects v13 portals or preserves earlier artwork. `WARP_SET`
selects the active v14 flat star independently; `drawSquare` gives it a ground-plane position
and top label. Uniform scaling keeps its width and height equal on both grids.

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
first touch or key press, as browsers require. `currentTrack` and `TRACK_NAMES` supply the
live track title to `ui/soundpanel.ts`. `onChange` notifies settings, readiness and track changes,
including track selection before audio unlock. Shared controls synchronize while the game menu
is detached; `disposeSoundControls` releases their listeners when the HUD is destroyed. The
nonmodal sound pop-up handles positioning, dismissal, focus return and its own cleanup. The
HUD places its Music chip between Game log and Menu.

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
- **New UI element:** design it by `docs/design.md`, build it with `h()`, style it in `style.css`, add a UI Lab control and list
  it in `RECENT` (`ui/lab.ts`).
- **New built-in board:** draw it as a text map in `boards/maps.ts`, add it to `BUILT_IN_BOARDS`
  in `boards/builtin.ts`; the board tests check it is valid.
- **New sound:** add the name to `Sfx` and `SFX_NAMES` and a `case` in `AudioEngine.play`
  (`audio.ts`).

### Action bar resizing

`Hud.askSize()` captures the visible size and synchronously releases any previous animation.
`morphAsk()` measures the destination once, holds its content in a temporary `.ask-content`
wrapper at that width and height, then animates the shell for 740ms. Measurements retain
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

`paymentActivity()` formats confirmed transaction results from money events. `HotSeat.emit`
publishes these before `beforePay`/money animation waits, using already committed engine state.
Buyouts have split payments, so the early message does not present one part as the total.
`Hud.finishPrompt()` clears the completed wait and its timer, including the log's waiting line.
The later engine log remains authoritative and adds full transaction details without extra log entries.
UI Lab: “Buy result timing” uses an isolated cloned game and an actual engine purchase.

### Board builder overview

`ui/editor.ts` (`openEditor`) edits a `BoardDef` on a full 32 × 20 grid drawn on its own canvas
with the game's painters (`paintBoard`, `paintSquare`, `drawTileGlow`, `drawRingBurst` from
`board.ts`). The screen is the game's HUD layout:

- **Info chip** (top left): name, save status, Board settings (with the problem-count badge).
- **Toolbar** (top right): zoom chip (tap: reset zoom and recenter), Undo, Save, Test play, Menu.
- **Tool rail** (left): Select, Pan, Place, Erase. Pan also works with right/middle-drag,
  Space+drag, two fingers and arrow keys; the camera eases (`pan`, `cameraPan`, `clampPan`).
- **Tiles pane** (right, only while placing): the game's tile art; the chosen one glows.
- **Side panels** (right): Board settings (grid, author, district cards with steppers, problems)
  and the selected tile's info (its problems, district, starting value, warp/portal links).
- **Action bar** (bottom): what the tool does or where the next property goes, plus Move / Erase
  for a selection (Erase keeps the bank). Morphs like the game's.
- **On the board:** selected tiles glow like game choices; placed tiles bounce inside a gold ring;
  tiles with problems carry red/yellow badges (`BoardIssue`s from `validateBoard`); a selected
  warp/portal shows its link line (`drawLink`).

The Blank tile (`SquareType` 'blank') is a builder placeholder: placeable, drawn as a dashed empty
tile, and an error in `validateBoard` until replaced, so it never reaches a game. The view chip
switches the cached board picture between `paintBoard` and `paintTileTypes` (part of
`boardImageKey`).

Districts are automatic (`nextDistrict`), warp/portal colors are automatic (`transport.ts`), every
edit is one undo step (`snapshot`), and `recompute` re-derives roads, the bank, transport links and
problems after each change. Questions use the game-style `ask()` pop-up.

### Board editor selection

`ui/editor.ts` keeps a set of selected square indices. Click or drag selects tiles; the action
bar moves or erases the group. Movement is a preview until placement, so Cancel does not mutate
the saved board. The base cache omits lifted tiles and their roads, then draws source outlines
and snapped tile art above it. `ui/editor-selection.ts` translates hex groups in axial coordinates,
checks bounds, replaces destination tiles, remaps indices and connects every adjacent tile.
A committed move or group erase takes one undo snapshot. Place alone exposes the tile pane;
Board settings is in the top-left info bar. Single selection draws a separate right-side options
panel; the centered action bar switches to status styling whenever it has no controls.
`selectionAnchor` chooses the cell nearest the group's center; it never tries to warp the OS cursor.
`ensureEditorBank` seeds a missing bank and removes duplicate banks when opening an editing board.
Painting and erasing skip the bank; selection groups cannot replace an unselected bank and their
Erase action is hidden when they contain one. The Place icon is a pencil.

### District starting prices

`property-values.ts` `districtStartingValues(board)` uses BFS over roads and warp links, then
resolves each district's distance-based default, optional `District.startingValue` override and
per-property prices. For four properties the result is average-30, average, average, average+30,
ranked by walking distance with coordinate/index tie breaks. Other group sizes keep the same
arithmetic mean. This runs before plot selection in `newGame` and is also the editor's preview.
Defaults are independent of overrides, so Reset simply deletes `startingValue`. Legacy tile
`base`/`autoBase` fields remain readable but no longer set new-game prices. Resumed game saves
already contain resolved base/value fields and keep them. New-game changes bump `NET_VERSION`.

### Editor districts and problems

`ui/editor-districts.ts` owns the ten default colors/names, `districtChoices` and
`canAssignProperty`. Placing a property asks `nextDistrict()` in `ui/editor.ts`: the lowest-index
district with fewer than four properties, else the first unused color as a new district (appended
on first placement, so empty districts never enter saved data). There is no color picker.

`validateBoard` (`boards/format.ts`) returns `issues` besides the `errors`/`warnings` strings:
each `BoardIssue` has a level, the board-wide text, the squares it concerns, a per-tile text and a
badge mark. The editor groups them by square (`tileIssues`) to draw badges on the canvas, list a
selected tile's problems, count them on the Board settings button and link problem rows to tiles.

### Builder zoom and action-bar layout

`zoom.ts` keeps the game curve unchanged. The builder uses `EDITOR_ZOOM_MIN_OUT` (-one third
of the old range) and `editorZoomPercent` to extend 250%–100% to 300%–100%, adding ten 5% steps.
Its initial/reset view is 300%; cache resolution includes this closer limit.

`ui/editor.ts` captures the current shell rectangle, releases old locks, renders and measures the
new natural layout once, then sets `--ed-content-width/height` while the shell animates. The
morphing content overrides its parent-relative max-width and keeps its own final height, so no
intermediate shell size can rewrap it. New messages use the game's 220ms, 16-step clip-path
reveal. Unchanged prompt nodes are reused across inspector rebuilds so the reveal never restarts.
New options settle with transform and opacity.
Stage resize, font readiness and each district departure retarget this layout safely; completion
releases the locks. The game's `Hud.morphAsk` and its stepped reveal remain unchanged.

### Builder tile pane

The palette's fixed Tiles heading sits above `.ed-palette-list`, which scrolls category sections
with two-column art-only buttons. `PALETTE` groups properties, suits, specials and transport.
`drawPalette` crops the art closer and scales it to the column width, preserving list scrolling
and the focused tool across rebuilds. Tile-name tooltips and selection corner checks are absent;
accessible names/descriptions and a selected glow remain. The board hover overlay adds a tint
and scales its two contrast stroke widths inversely with camera scale to retain 6px/3px screen widths.

Portal links (`BoardDef.portalLinks`) are plain graph neighbors: `setup.ts` adds them to `nb`,
records each end on the square (`portals`: the other tile, this tile's side, and the portal's
kind), and a one-way link adds the entrance to the exit's `noGo`. `boards/portal-tiles.ts`
`convertPortalTiles` turns retired portal tiles into portal links for built-in, saved and imported
boards; saved games keep portal tiles, which still play as described next.

Portal tile traversal in `Game.destinations` inserts entry and exit into the route path while spending
only one road step. `Game.move` emits a step for entry and a warp for the exit, tracks remaining
steps separately from path length, and resumes walking with free direction. Arrival at the exit
does not retrigger a portal; bank passing/landing behavior follows remaining steps.

### Arcade decisions and reveals

`arcade.ts` owns the five-game rotation, set scoring, bets and seeded race/wheel outcomes.
`reels` asks one keep/reroll decision at a time; `arcadeChoice` collects each player's private
choice in turn order starting with the player who landed (the request carries that `order`)
through the normal host/guest decision protocol, and `arcadeRound` reveals everyone's choices
together (`rows[].choice`, derby `score`/`previous` in spaces). On the client, `ui/arcade.ts`
`ArcadeStage` is one board per game, opened by `HotSeat.stage(game)` on the first request (as a
spectator in `spectate`, or to choose in `human`) and closed after the final result
(`endArcade`); the action bar carries its prompts. No client animation decides anything.
The UI Lab launches the actual engine games through an isolated, non-saving HotSeat.

### PNG artwork selection

`props.ts` resolves legacy images and the layered `assets/tiles-v2` set by logical sprite key.
Layered files override matching legacy keys only when `ART_SET` is `layered`; existing paired
Checkpoint/Circus/Motel images stay mapped to their original files. `propCanvas` composites aligned
grey masks, and `drawStamp` renders full sprite frames for geometry and scenery. Base-only new
assets bypass blue detection. `ART_SOURCES` supplies source URLs to the Lab inspector. Canvas
fallbacks remain available for `classic` and initial loading. Artwork changes do not alter saves
or engine/network outcomes.

`props.ts` applies `properties-v3` overrides after the board-art mapping when `PROPERTY_SET` is
`painted` and `ART_SET` is `layered`. Choosing `previous` skips those overrides, preserving the
prior layered buildings and original paired art. No old image files are overwritten.

Online connections use PeerJS binary serialization, which chunks large snapshots. JSON serialization rejects messages above roughly 16KB and cannot carry saved-game snapshots reliably. Reopened rooms lock their seats but wait for Resume before sending start; lobby details are delivered first.
