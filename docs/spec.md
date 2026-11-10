# Adventure Avenue: Game Spec & Build Hand-off

_Transcribed from "Fortune Street Remake: Game Spec & Build Hand-off" (Oct 22, 2026, @Anthony).
"Adventure Avenue" is the game's name; currency is still "G" (open question)._

## Overview

This spec describes every system in the test build, how each one works, and how it interacts with
the others.

**The game:** 2 to 5 players (any seats not taken by humans are CPUs) roll one die, move around a branching town
board, buy and grow shops, trade district stocks, collect four suits for promotions, and race to
reach a target net worth and then the bank. It follows the rules of Fortune Street (Wii, 2011) with
original characters, an HD board and UI, and pixel-art character sprites.

**The prototype:** a single self-contained HTML file (the "Fortune Street Test Build" artifact). It
is the reference implementation: when this spec and the prototype disagree, treat this spec as the
intent and the prototype as a working example. Multiplayer in the prototype is local hot-seat only.

**How to use this spec:**

- Port the rules into a pure, UI-free rules engine first (Game state through Debt). Every formula
  and constant is collected in Balance constants.
- Rebuild the client (Phaser or canvas + HTML UI) following Interface and art.
- Add the server and online play using Online multiplayer plan.
- Follow Build plan for the order of work.

## Architecture

There is no game server: every device runs the shared rules engine, and the client only draws.
Full details in `docs/architecture.md`; where each file lives is in `docs/codemap.md`.

- `packages/engine` (shared): game state, board data, constants, every formula; the turn flow,
  which raises decision requests and emits events; seeded RNG, CPU decision rules, unit tests
  and simulations.
- `apps/client` (GitHub Pages): the board (HD tiles and pixel sprites on a canvas) and the HTML
  interface. It runs the engine, answers decisions from the UI or the CPU rules and animates the
  events. Online games connect browsers directly (WebRTC through PeerJS) and keep every copy of
  the engine in lockstep by sharing decision answers (see "Online multiplayer").
- `apps/server`: not used; see its README for when one would be worth adding.

The engine never touches the DOM or sockets. The `Game` class raises decisions through
`GameIO.decide(request)` and announces changes through `GameIO.emit(event)`; the client's
`HotSeat` answers decisions (UI, CPU, or the network) and renders events.

**Porting from the prototype:** its turn flow was written as async functions that await a human
or CPU decision (`ask`, `modalChoose`, `stockModal`...). In the engine each await became a
decision request that carries the options; all rendering, floating text, coins and log text stay
in the client.

## Game state

The whole match is one serializable object; every rule reads and writes it, and nothing in it
depends on rendering.

### Match

| Field                    | Type                                           | Meaning                                                                |
| ------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `rules`                  | `"standard" \| "easy"`                         | Rule set                                                               |
| `target`                 | number                                         | Net worth needed to win (1,000 to 90,000G, in 1,000G steps)            |
| `roundCap`               | number                                         | 0 = no limit, else 15 / 20 / 30                                        |
| `round`, `turn`, `order` | number, number, playerId[]                     | Round counter, index into `order`, random turn order                   |
| `nodes`                  | Square[]                                       | The board graph                                                        |
| `groups`                 | squareId[][]                                   | Districts (Standard) or rows (Easy); each square has a group index `g` |
| `factor`                 | number[7]                                      | Per-district stock price multiplier (starts 1.0)                       |
| `changeSuit`             | 0-3                                            | Suit currently offered by the change-of-suit square                    |
| `vg`                     | `{cards: cardId[64], owner: playerId\|-1[64]}` | Venture panel grid                                                     |
| `hist`                   | number[][]                                     | Net worth of every player at the start and end of each round           |
| `log`                    | `{text, color}[]`                              | Event log, newest first                                                |
| `over`, `winner`         | bool, player                                   | End state                                                              |

### Square (`nodes[i]`)

| Field             | Meaning                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `x`, `y`    | Index and grid position (12 x 7 grid)                                                                                                                                |
| `t`               | Type: `shop`, `plot`, `bank`, `venture`, `spade`/`heart`/`diamond`/`club`, `change`, `roll`, `break`, `boon`, `boom`, `broker`, `portal`, `arcade`, `cannon`, `warp` |
| `nb`              | Neighbor square ids (the graph edges)                                                                                                                                |
| `d`               | District index 0-6 (shops and plots)                                                                                                                                 |
| `g`               | Group index used for expansion and domination                                                                                                                        |
| `base`, `value`   | Starting value and current value. Plots: value = money spent on the building                                                                                         |
| `owner`           | Player id or -1                                                                                                                                                      |
| `b`, `lv`, `toll` | Plots only: building key, circus tier 0-3, current checkpoint toll                                                                                                   |

### Player

| Field                                      | Meaning                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `id`, `slot`, `name`, `ch`, `color`, `cpu` | Identity; `ch` = character id (e.g. `farmer`; see Characters)                  |
| `cash`, `level`                            | Ready cash (can go negative mid-turn) and promotion level, starting at 1       |
| `suits`, `wild`                            | Four booleans and a count of Suit Yourself cards                               |
| `shares`                                   | number[7]: shares held per district                                            |
| `node`, `prev`                             | Current square and the square they came from (-1 = may move any direction)     |
| `onBreak`, `closed`, `boon`, `boost`       | Temporary effects that last until the player's next turn                       |
| `bankrupt`, `stats`                        | Out of the game; totals for fees earned/paid, salary, dividends and commission |

**Derived values** (never stored): net worth, fee, max value, stock price, salary.

## Turn flow

Every turn runs the same loop: act, roll, move, land, settle, hand over.

1. **Turn starts:** clear break, boon, boost; save game.
2. **Before rolling:** sell stock, trade, auction, renovate, then roll.
3. **Roll the die:** 1 to 7 (`K.dieSides`), rolled by the engine. The 7 face is a six with an extra
   pip in the middle.
4. **Step one square:** at a fork pick a path; passing collects suits, visits the bank, pays
   checkpoint tolls. Repeat while steps are left.
5. **Land on a square:** shop, plot, bank, venture, arcade, special square.
6. **Settle debt:** sell stock or property; bankrupt if nothing is left.
7. **End checks:** bankruptcy or round limit ends the match.
8. **Next player:** skip bankrupt; new round after the last seat.

Passing the bank only matters when the player can level up (promotion, then a stock purchase), or
when they arrive already at the target, which ends the game immediately.
Landing effects can start a new roll (roll-on, some venture cards), which re-enters the loop at
"Roll the die" with a chain depth limit of 3. Debt is checked only after all landing effects finish.

**Effects that run outside the active player's turn:** fees and tolls paid to owners, dividends and
commissions paid by the bank, Coin Derby prizes, Home pulling everyone to one square, trade answers
and auction bids. In the online build these are the moments other players need to see or answer
something.

## Board and movement

The default board (Town) is a graph of 50 squares: a 38-square outer ring plus a 12-square middle
road through the bank that joins the left and right sides, creating two forks.

**Layout (14 columns x 7 rows, x,y):**

- Corners: spade (0,0), heart (13,0), club (0,6), diamond (13,6). Bank at (7,3), on the middle road.
- Stockbroker (7,0), the square farthest from the bank along the roads; Boon (13,2) and Boom (0,5)
  on opposite sides.
- 32 properties in 8 districts of 4. Which start as vacant plots depends on the plot setting.

Store boards as data (square list with type, position, district, neighbors) so new boards need no
code changes.

**Custom boards (added Oct 2026).** Players build boards in the in-game board editor, save them
in the browser, and export/import them as `.aaboard.json` files (format tag
`adventure-avenue-board`, version 1: name, author, grid size, districts, squares and
connections, plus `oneWay`: [from, to] pairs for one-way roads, and `portalLinks`: {a, b, sa, sb,
oneWay} for portal links; both missing in older files). Squares in neighboring cells connect
automatically; the builder's **Links** tool removes a link, adds it back or makes it one way, and
adds **portal links** (see Board viewer). A **one-way road** is the normal sandy road with a darker
arrow painted on it, in the gap between the two tiles, pointing the way players may go.

A **portal link** joins a side of one tile to a side of another tile anywhere on the board,
without taking a tile space. Each end is a **portal**: a ring beside the tile's side, at the end
of a short road. Players can't stop on a portal; they step through it as if the two tiles were
neighbors (one step, and it counts as the way they came, so no turning back through it). There
are three kinds:

- **Two-way**: players go in and come out there. A two-way portal links to one other two-way
  portal.
- **Entrance**: players can only go in there. An entrance leads to one exit.
- **Exit**: players only come out there. Several entrances may lead to one exit.

Every kind uses a chunky ivory-and-gold circular frame with inset gems in its link color.
Inside, two colored vortex layers counter-rotate, gently breathe and show three orbiting lights.
The frame stays fixed so it remains aligned with the approach road. The outer vortex turns once
per 4.2 seconds; its inner layer turns the opposite way, 1.3 times faster. Phase stays continuous
across turns, without resetting at the end of a revolution. Reduced motion and still board
pictures freeze the vortex, pulse and lights. The way a one-way portal works is
shown on its short road, with the same painted arrow as a one-way road: pointing into the ring at
an entrance, out of it toward the tile at an exit.

**Portal pop-up and tap.** Hovering a portal shows a pop-up like a tile's: its title ("Portal",
"Entrance portal" or "Exit portal", over a stripe in the portal's color), what it does and where
it leads ("Step through to come out next to Harbor Shop, and back the same way."; an exit names
the tiles its entrances are next to), and a muted line "Tap it to see where it leads." Tapping
(or clicking) a portal shows that pop-up too, and the camera frames the portal's tile and the
tiles of every portal it links to for 2 seconds, then goes back to the zoom it had (and the
pop-up goes away). Meanwhile the portal and the portals it links to flash together three times:
each ring lights up white and a glow in its color spreads out (the tiles get no effect).

Portal endpoints are registered even when their two tiles already have a road connection or
another portal link. Neighbor lists stay unique; each portal retains its own source/destination
side. Old saves without the destination-side field use the previous first-matching fallback.
The portal frame is 48 world units across (formerly 40), matching the 44-unit approach road;
hit targets grow to match. Portal approach paths keep their normal road width rather than the
wide decorative ground verge. Canvas fallback rings grow proportionally.
Selected links in the builder and portal-tap feedback in games show directional arcs. One-way
flow always runs entrance to exit, including when the exit is selected. Two-way links have
separate opposing curved lanes. Moving dots have tails and fixed chevrons retain direction with
reduced motion.
A portal step takes 720ms at normal speed (ordinary steps: 420ms): the character accelerates
into the entrance while shrinking, disappears briefly, then grows and hops out of the exact
paired exit onto its target tile. Name/base markers hide during transit; entrance/exit rings
pulse locally. The remaining-steps die updates once, movement continues with unused steps,
and reduced motion places the character directly at the exit tile without distortion.

Rings share a color per group (a pair, or an exit and all its entrances): purple, cyan, pink,
amber, green, blue, in board order. The token walks into one ring and comes out of the other; the
route preview's dotted line does the same, and the direction arrow points out through the
portal's side. Scenery never grows on the cell a portal opens onto. Portal links don't join
Easy-rule rows.

**Portal tiles are retired.** Boards (built-in, saved and imported) turn their portal tiles into
portal links: a portal at a dead end is removed and the link goes on the side of the tile that
led to it; a portal in the middle of a road becomes a venture square with the link on its first
free side; a portal that led to the bank links to a free side of the bank. Saved games keep
their portal tiles and still play them. Every tile with links needs a way in and a way out (a
tile whose one-way links all lead in, or all lead out, is a problem to fix), every portal must
face an empty cell, a side holds one two-way portal, one entrance, or one exit (with any number
of entrances), and an entrance can't lead to two exits. A board is playable only if it has exactly one bank, every suit (or a change-of-suit
square), at least one district, exactly 4 properties in every declared district, a valid starting
average for each district, every warp and portal linked (to a partner of its kind or the bank), at most five pairs of each kind, and every square reachable from the bank (by road or
warp). Grids range from 4 x 4 to 32 x 20 (up to 320
squares). Each board uses a square grid (4 neighbors per cell) or a hex grid (pointy-top
hexagons, odd rows shifted half a cell right, 6 neighbors per cell); the file stores it as
`layout`, and files without one are square.

The builder opens a maximum-size 32 × 20 grid with a bank near the center.
The bank is provided automatically, including for older incomplete boards, and cannot be
erased or overwritten. It can be selected and moved; selections containing it have no Erase
action. The erase tool skips it and groups cannot be placed over an unselected bank.
The bank is not offered in the Place palette. New templates, remixes and reopened
boards also have the full editing grid. Saved boards and exports keep that editing space.
Starting a game (including test play) trims unused outer rows and columns from a copy;
interior gaps, connections, warp partners and hex geometry stay intact.
Trees, ponds, flower beds and other decorative scenery stay hidden in the builder so the
editing grid is clear. Roads and playable tiles remain visible. Decorations appear automatically
when a game or test play starts; they do not affect game rules.
The editor uses the normal game screen's full-screen board and floating HUD: the board name and
save status sit in an info chip at top left; the zoom chip, Undo, Test play, Menu and Done sit at top right
(see Board viewer for Done and saving).
The board fills the entire canvas behind the HUD, with no space reserved beside or below it.
The hovered cell has a tinted fill and two contrasting outlines: a dark outer stroke (6 screen
pixels) and a bright inner stroke (3 screen pixels), gold normally and red while erasing. Their
screen size stays constant at every zoom.
**Ground.** By default (`GROUND_SET = 'solid'` in `props.ts`) the ground around and under the board
is one plain grass color (`#97c26a`) in games, the builder and still pictures: one fill per frame
and nothing to build while zooming. Cloud shadows still drift over it. `GROUND_SET = 'textured'`
restores the painted landscape described next; live views then draw it from ground chunks cached
by `ground.ts` (meadow and terrain baked together), with its decorations drawn live on top.
The textured landscape uses varied cartoon grass, turquoise pond water and warm paving textures,
matching the rounded board-tile style: clean lawn tufts, flowing water highlights and chunky
rounded cobblestones. Adjacent material cells share one surface, with softened
banks and transitions rather than visible individual tile borders. These background materials
fill irregular areas around both square and hex boards; nonrepeating grass continues beneath
and beyond them.
Decoration is light and mostly foliage: rounded trees, occasional fruit trees, flower patches,
reeds, rocks and lily pads. A few benches sit within 260 world units of the nearest playable
tile, with occasional planters near paving within 300 units. There are no default hedge frames,
park dioramas, gazebos, fountains, picnic scenes or decorative walk networks. Preserve open space
so the playable tiles remain the focus. Decorations use the same colorful cartoon theme as
the board and have no isolated tile rims, opaque floor pads or labels.
Terrain and props stay clear of playable tiles, real roads and portal openings. Their placement
stays fixed while panning and uses no engine randomness. The builder hides decorative terrain,
props and verges. Earlier scenery assets and implementations remain available for rollback.
Grass, leaves and clovers stay upright: vary crops and horizontal flips, never rotate patches
or mirror them vertically. The lawn material itself also preserves the source orientation.
Terrain and meadow caches follow the camera's pixel scale (0.5–2 pixels per world unit) instead
of enlarging a small background bitmap. Decorative PNGs render separately at their own native
sprite resolution, with cached placement data. Material boundaries keep a narrow soft blend
(grass 8, paving 6, water 3 world units; water bank 7), while foliage and furnishings stay crisp.
The UI Lab's square/hex landscape previews show the active background at both zoom scales.
The warm path beneath the board follows each tile's square or hex footprint, leaving an even
margin around corners, points, bends and dead ends; round road caps must not cut this margin off.
Portal approach roads retain their normal width.
Grass is a separate background beneath tiles and scenery. Both builder and games fill the
entire visible camera area, including outside the board, at every zoom and screen size. The
landscape is anchored in board coordinates and scales with the tiles; there is no finite
background border or texture seam where the board layer ends.
**Panning.** The view can be moved around the grid: drag with the Pan tool (the four-arrow icon
in the left toolbar), drag with the middle or right mouse button or with Space held (any tool),
drag with two fingers on touch screens (the spread still zooms), or press the arrow keys to glide
a few tiles. The view eases there like the zoom does, and it can't wander so far that the grid
leaves the screen. Opening, importing or starting a board centers the view on its tiles.
Tapping the zoom chip resets the zoom to 300% and centers the view on the tiles again (the grid's
middle when it is empty).
Zoom keeps whatever point is in the middle of the screen in the middle. The existing 250% view
uses the game's sizing: 1.65 × screen fit (2.2 × on small screens). The 100% whole-board limit
uses the space left by the HUD with a 3% margin. The builder extends the same geometric curve
beyond 250% to a new 300% close limit; every scale from 250% down to 100% is unchanged.
It opens and resets at 300%. Wheel, pinch and - / + still use 5% steps, with forty steps from
300% to 100%. Game zoom is unchanged. Camera scale eases with the game's 0.12 factor, or
changes immediately with reduced motion. Pinching does not place tiles;
board picking uses the current camera transform at every zoom. Form typing keeps its normal keys.
An icon-only toolbar is centered vertically 10px from the left edge: Select, Pan, Place and Erase.
Hovering or focusing an icon shows its name; the active tool has a gold fill and inset
outline. Buttons have accessible names and work with keyboard and touch. Erase removes squares.
Board settings is in the top-left info bar.
The builder has one Property tile instead of separate Shop and Vacant plot choices. The saved
board records property locations and districts, not which start vacant. The editor preview and
board thumbnails always show property tiles, and editing an old board discards its plot hints.
Place uses a pencil icon. Only Place shows the tile pane on the right, styled like the side panels
(gold top edge, a Tiles title with a one-line hint, small uppercase group names). Its head stays at
the top while the list scrolls. The chosen tile sits in a gold ring and lifts slightly. Tiles appear as art-only buttons in two columns, without individual
card backgrounds, borders or captions. The enlarged art fills each column; no tile-name popup or selection checkmark is shown.
Accessible button names and hints remain available. Selection uses a glow, with scroll position
and keyboard focus kept after picking a tile.
The categories are Properties (Property), Suits (Spade, Heart, Diamond, Club, Change suit),
Specials (Venture, Roll-on, Take-a-break, Boon, Boom, Stockbroker, Arcade), and Transport
(Warp, Cannon, Taxi).
Choosing a tile keeps Place active; clicking or dragging on the board places it. Returning to
Place remembers the last chosen tile. The pane is hidden for every other tool and board settings.
**Districts are automatic.** There is no color picker: each new property goes into the first
district that has fewer than four properties (so a gap left by erasing is filled first); when
every district is full, the next property starts a new district in the next unused color and name
(twelve colors, up to twelve districts). The action bar says where the next one goes ("Property: goes
into Bay Market (2 of 4)"), and the Property tile in the Tiles pane shows that district's color.
Painting over an existing property keeps its district. A property can still be moved to another
district (with room) from the tile info panel. When all twelve districts are full, the action bar
says so and properties can't be placed.

Select clicks one tile or drags a selection rectangle around multiple tiles. Selected tiles glow
the way a game shows its choices (a gold tint, a pulsing white outline glowing gold, and, for up to
six tiles, white rings spreading out), and the bottom action bar offers Move and Erase. One selected tile opens a
nonmodal tile info panel on the right with the tile name as its heading, a smaller column/row subtitle and a Close button,
including a labeled district selector and a separate starting-value row for properties. It hides when selection changes to a
group or movement begins. It displays the resolved starting value without a per-tile value editor.
Starting values are configured per district in Board settings. Each district has a compact
starting-average stepper (minus, value, plus; hold to repeat, in 10G steps) and, once changed, a
"Use auto" link; unset averages use a default based on the district's mean shortest
walking distance from the bank (warps count as a step). Default averages scale from 100G for the
nearest district to 500G for the farthest, rounded to 10G. When all district distances tie, or a district is unreachable, its default is 100G.
"Use auto" removes the override and follows the current distance-based default again.
Within a four-property district, two properties start exactly at the average, the closest starts
30G below it and the farthest 30G above it. Distance ties use row, column, then square index for a
stable result. Incomplete editing previews keep the average with only their nearest/farthest properties offset,
but districts with any count other than four cannot be played. Starting averages range from
80G to 1,970G, keeping all property values within 50G–2,000G. This policy applies to new games on
all boards and replaces both per-property price overrides and the old near-bank discount. Old
game saves retain their already-resolved values; legacy board price fields are readable but are
not used to price new games. District overrides survive saves and board-file round trips.
Erase deletes the selection in one undoable action. If the bank is part of it, everything else
is erased and the bank stays (the action bar says so); Erase is only missing when the bank is the
only thing selected.

**Placing and erasing feedback.** A placed tile bounces up slightly and settles while a gold ring
with sparkles grows from it (the game's purchase ring); an erased tile leaves a red ring. The
chosen tile in the Tiles pane glows like a game choice (pulsing white outline in a gold glow,
white rings spreading out). Reduced motion keeps the outlines still and skips the rings.

**Problem badges.** Every tile with a problem shows a round badge in its top-right corner: red if
the board can't be played until it's fixed, yellow for a warning (the game still works, e.g. a
dead end or only one district). The badge shows the number of properties its district is missing
("2"), otherwise "!". Selecting the tile lists its problems at the top of the tile info panel,
worst first. The Board settings button carries the board's problem count (red: errors; yellow:
only warnings), and Board settings lists every problem, errors first; a problem tied to tiles can
be clicked to select its first tile and glide the view to it. Board-wide problems (missing suits,
too few properties, no venture squares) appear only there.
Move hides the canvas cursor and lifts the selection as a group, anchored at its middle
(within grid snapping) rather than its first tile. Browsers cannot reposition the system cursor;
the group instead centers under the pointer as it moves. Outlines remain at its original
cells while the tile art follows the pointer and snaps to the grid. A click (or tap) places the
group. Destination tiles underneath the group are erased and replaced; selected tiles may overlap
their own old cells. Tile properties are kept and adjacent tiles automatically connect. Hex-grid movement
preserves the group's geometry across odd/even rows. The entire group must fit inside the grid;
out-of-bounds previews have red outlines and cannot be placed. Cancel or Escape abandons the move
without changing the board. Undo restores the full move, including any replaced tiles.
Menu holds New board, My boards, Import, Export and Back to main menu, each a row with a one-line
description (Back to main menu set apart below the others). New board shows every template and
built-in copy as a card with a picture of the board. My boards lists saved boards with a picture
trimmed to the tiles, the name, tile count and save date (the board being edited is outlined),
and Open, Export and a delete icon. Questions (discarding unsaved changes, deleting a district or
a saved board, switching the grid) use the game's own pop-up with Cancel and a gold (or red, for
deleting) answer button, not the browser's dialog. Escape closes the top pop-up only.

**Board settings** (the button in the info chip, which turns gold while open) opens a side panel
on the right, like the tile info panel: a Board section (Square/Hex grid as pill buttons, Made by),
a Districts section (one card per district: a round color swatch that opens the color picker, the
name, a property count chip that turns green at 4/4, a delete icon and the starting-average
stepper; then "+ Add district"), and a Problems / Ready to play section listing what must be
fixed. The action bar shows "Board settings" with the number of problems left. Close, Escape or
the Board settings button closes it.
The bottom action bar uses the game's glass styling and a 740ms shell width/height morph.
Before the morph, its contents are laid out at the destination width and height; those sizes are
held independently of the shell, without a max-width clamp, until it finishes. Text never changes
line wrapping at intermediate widths or snaps into place at the end. New text uses the game's 220ms, 16-step clip-path typing reveal without changing its layout;
new options fade and settle over 220ms. Unchanged messages keep their original reveal timeline. Interrupted changes, window resizing, font readiness and district removals
retarget the destination after releasing the old fixed layout. Reduced motion uses natural size
immediately with no entrance animation. It floats at the bottom, centered on the entire window at
every screen size, and adapts to placement,
selection, erasing or board settings. Its width fits the current text and options, up to the
window margins. With no options it uses the collapsed status line; it expands only for controls
(such as Move/Erase, Cancel, a placement district picker or board settings). Single-tile details
are in the right-side panel.
Save, export and validation feedback appears in the action bar.

**Built-in boards.** Every built-in board has the bank in the middle of the map, exactly 4
properties in each district. The original seven boards have 8 districts and 32 properties, with
Stockbroker squares toward their outer roads and Boon and Boom apart. Town (square, 14 x 7, 50 squares: a ring with
the bank on the middle road), Harbor (square, 15 x 9, 61: a ring split by two piers joined by the
quay with the bank), Crossroads City (square, 13 x 9, 57: a ring cut into quarters by two avenues
crossing at the bank), Twin Lakes (hex, 14 x 11, 50: two lakes with Main Street and the bank
between them), Coral Isle (hex, 17 x 8, 52: an island coast with roads over the hills), Sky Islands
(square, 20 x 11, 66: a town ring with two floating islands) and Lagoon (square, 19 x 11, 63: a
tall lagoon town with an island on each side). The two island boards have detached areas reached
only by warp: a warp square on the main board sends you to an island, and every warp square on an
island sends you back. Each island has all four suits and one or two districts. Each board can be
copied into the editor to remix.

Three portal boards extend the built-in selection (their portals are two-way portal links):

- **Crossgate Gardens** (square, 13 × 13, 8 districts / 32 properties): four courtyard rings
  around a central bank promenade. Each half-courtyard holds one district. The courtyard corners
  are venture squares, and four portal links join distant corners through their outer sides,
  letting the same roll continue into another quarter. Inward roads offer a route home.
- **Prism Junction** (hex): four hexagonal petals, eight districts / 32 properties and four
  portal links between their outer rims. Inner spokes lead back to the bank.
- **Return Ridge** (square): four winding dead-end branches, twelve districts / 48 properties on a 23 × 13 grid, including districts above and below the bank.
  Special tiles use different orders on each branch and varied distances from the bank, rather
  than mirrored placements. Only four venture squares remain; other relief stops include suits, arcades, stockbrokers,
  Boon, Boom and Take-a-break tiles. There are no change-of-suit tiles and exactly eight Roll-on tiles, four of which replace Boon tiles. Only six Boon tiles remain.
  Each branch ends at a suit tile with a portal on its far side, linked to a tile one road step
  from the bank. The links are two-way, so the tile near the bank also offers a shortcut out to
  its branch tip.

Crossgate Gardens and Prism Junction alternate properties with non-property relief stops.
Return Ridge groups each district into two touching pairs, separated by relief tiles, so all
four never form a continuous run. All four properties of a district are within six walking
steps of one another without crossing a different district or using a portal. Ordinary roads
connect the complete board; portals are shortcuts. All three can be remixed in the builder.

**Movement rules:**

1. Roll one die (1-7). The server or rules engine rolls, never the client.
2. After the roll, the engine lists every square the player could stop on: it walks every route of
   exactly that many steps, where each step goes to a neighbor other than `prev` (no turning back),
   never the wrong way down a one-way road. At a dead end the player turns around (if the road
   back allows it).
3. Those destination squares glow in the player's color and the player taps one (or uses the
   matching button in the action bar). Hovering or focusing a destination previews the route as a
   numbered dotted line. If two routes reach the same square, the engine takes the better one: it
   collects new suits, passes the bank when a promotion is ready, and avoids rival checkpoints. The
   token then walks the route step by step. Passing effects still fire on the way: suits are
   collected, the bank visit runs when passed, and checkpoint tolls are paid. A dashed outline
   marks the target while walking. The CPU scores each destination by distance to its goal (see CPU
   players), suits picked up on the route, buying chances and rival fees. Venture "move 2 more"
   uses the same picker.
4. `prev` is reset to -1 (free direction) when a player stops on the bank or is warped (venture
   zoom, cannon, balloon, portal, Home).
5. Each step records `prev = node; node = next`.

**Pass vs land:**

| Effect                          | Passing                               | Landing                                               |
| ------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| Suit squares and change-of-suit | Collect suit                          | Collect suit, then a venture card (suit squares only) |
| Bank                            | Promotion check, win check, buy stock | Same, plus free direction next turn                   |
| Rival's checkpoint              | Pay toll                              | Pay toll                                              |
| Everything else                 | Nothing                               | Square's effect                                       |

Roll-on chains are capped at a depth of 3 so a turn always ends.

## Shops, districts and rows

Shops are the main source of income: rivals who land on yours pay a fee, and owning more of a group
raises both fees and shop values.

**Districts** (Standard rules use these as groups; both rule sets use them for colors and stock):

| District    | Squares (x,y)            | Base values           | Vacant plot (Standard) |
| ----------- | ------------------------ | --------------------- | ---------------------- |
| Brick Row   | 1,0 · 2,0 · 3,0 · 0,1    | 160 / 180 / 200 / 220 | 2,0                    |
| Bay Market  | 6,0 · 7,0 · 8,0 · 9,0    | 200 / 220 / 240 / 260 | 7,0                    |
| Greenway    | 11,1 · 11,2 · 10,3       | 240 / 260 / 280       | none                   |
| Gold Street | 11,4 · 11,5 · 10,6 · 9,6 | 280 / 300 / 320 / 340 | 11,5                   |
| Lilac Lane  | 5,6 · 4,6 · 3,6 · 2,6    | 180 / 200 / 220 / 240 | 4,6                    |
| Tide Walk   | 0,5 · 0,4 · 1,3 · 2,3    | 220 / 240 / 260 / 280 | 0,4                    |
| Plaza       | 4,3 · 5,3 · 6,3          | 320 / 340 / 360       | none                   |

**Starting property prices:** every new game resolves district averages from the current bank
and roads, unless the district has an explicit starting average. Closest and farthest properties
receive the -30G/+30G adjustments described in the builder section above. There is no additional
near-bank percentage discount. The table above records legacy prototype map values; current
starting values are generated from district averages.

**Rows** (Easy rules): groups are runs of shop squares that are directly connected, broken by any
non-shop square. They are computed from the graph at game start; a row of 1 can never expand.

**Buying.** Landing on an unowned shop offers it at its value. Buying converts cash into an asset of
the same value, so net worth does not change.

**Fee** charged to a rival who lands on an owned, open shop (rounded up to 5G):

```
fee = value x 0.2 x M[k] x (1.4 if dominated) x boost
```

k = squares the owner holds in that group (capped at 4), M = [0, 1, 1.3, 1.6, 2.0]; boost = 1.3
while a Price Hike card is active.

**Expansion.** When a player gets a 2nd or later square in a group (by buying, building, trading,
auctions or buyouts), each of their shops in that group gains 10% of its base value. Owning every
square in a group (domination, needs 2 or more squares) adds 30% of base instead. Vacant plots count
as squares in their district, so domination requires building on the plot.

**Investing.** Landing on your own shop lets you invest up to 999G, as long as cash plus what the
player's stock and property would sell for (the debt-sale value) covers it. Going below 0G is
settled at the end of the turn like any debt; the invest window shows cash after and says so.
Investing raises value one-for-one, which raises the fee, the salary bonus and the district stock
price. Cap: max value = base x (1 + k), x 1.5 if dominated. When none of the player's shops can
take more (all at their cap, or they own only vacant-plot buildings), nothing is asked: the game
says "Rosa has no shops to invest in." (or "has no money to invest" when nothing can pay for it).

**Buyouts.** After paying a fee at a rival's shop, 3-Star Shop or other vacant-plot building (or
visiting it, for an Estate Agency), the visitor may buy it for 5x value. The owner receives 3x value; the bank keeps 2x. Ownership transfers and expansion runs for
the buyer.

**Closed shops.** If the owner is on a break (Take-a-break, Estate Agency or a venture card), their
shops and buildings charge nothing until the owner's next turn starts.

## Vacant plots (Standard rules)

Every valid district has exactly four properties. Game creation uses the **Vacant plots** setting
to choose that many random vacant plots independently in each district:

| Setting | Vacant plots per district | Shops per district |
| ------- | ------------------------- | ------------------ |
| None    | 0                         | 4                  |
| A few   | 1                         | 3                  |
| Some    | 2                         | 2                  |
| A lot   | 3                         | 1                  |
| All     | 4                         | 0                  |

Selection uses the seeded game RNG, so every device gets the same result. There is no board-wide
plot cap and legacy map plot hints do not affect the choice. Easy rules always make all properties
shops. Existing game saves keep their already-chosen plots.
Each building can be built at most 3 times, except with All, which has no building limit. The
first player to stop on a plot may build one of seven buildings; each has an effect on rivals and
a different one for its owner. Built plots show only the building's art on the tile (no name).
The build (and renovate) bar shows how many more of each building can still go up on the board
as a small "2 left" badge in each card's top right corner (just the number on phones; red at 0);
the Guide's Buildings tab says the same during a game ("2 left to build").

| Building      | Cost   | When a rival lands                                                                                                                         | When the owner lands                                                                  | Fee label on board |
| ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------ |
| Checkpoint    | 200G   | Pays the toll (also when passing). Toll starts at 20G and rises 10G every time it is paid, and when the owner passes it (they pay nothing) | Invest in any of your shops                                                           | Current toll       |
| Circus        | 200G   | Pays the show fee: 100G (tier 0)                                                                                                           | Upgrade to 500 / 1,000 / 2,000G for 300 / 600 / 1,200G                                | Show fee           |
| Balloonport   | 200G   | Pays 150G                                                                                                                                  | Fly to any square; that square's landing effect applies (bank counts as a bank visit) | 150G               |
| Tax Office    | 200G   | Pays the owner 10% of the rival's own net worth                                                                                            | Bank pays the owner 5% of their net worth                                             | 10%                |
| Motel         | 200G   | Pays 25% of the cash they hold (`K.motelRate`). Anyone passing may stop here instead (see below)                                           | Invest in any of your shops                                                           | 25%                |
| Estate Agency | 200G   | Rival takes a break: their shops close until their next turn                                                                               | Buy any unowned shop at its value                                                     | Break              |
| 3-Star Shop   | 1,000G | Pays a shop fee on a 1,000G base, with district multipliers; buyouts allowed                                                               | Invest in any of your shops                                                           | Fee                |

**Rules shared by all buildings:**

- The plot's value (counted in net worth) equals what was spent on the current building, including
  circus upgrades.
- Only the 3-Star Shop counts as a shop for expansion bonuses, salary and stock price. Every built
  plot counts toward district ownership and domination.
- Fixed fees (checkpoint, circus, balloonport, motel) are multiplied by the owner's fee boost (Price
  hike card, Price Up square). All building fees pay dividends and commissions like shop fees.
- **Motel fee on the board:** a motel's tile (and its fee in the tooltip, the info pop-up and the
  stock market's shop cards) shows what the player whose turn it is would pay there right now,
  25% of their cash; on its owner's turn it shows "25%".
- **Motel stops:** every player who passes a motel (its owner too) is asked in the action bar
  "Stop at Rosa's motel?" (the fee to stop and the spaces left to move) with **Stop here** or
  **Keep moving**. Stopping ends the move there and counts as landing on it: a rival pays the fee,
  the owner may invest. Landing on it with the roll works the same. CPUs never stop at a rival's
  motel; at their own they stop when they have more than 900G and a shop to invest in.
- **The Home is retired:** the Motel took its place in the build list. Games saved with a Home
  keep it working as before (rivals pay 60G x the owner's level; the owner calls everyone home).
- Closed owners (on a break) charge nothing and their Estate Agency does not trigger.
- **Renovate** (before rolling): swap a building for any other for the new building's cost + 150G.
  Value resets to the new cost; circus tier and checkpoint toll reset.
- **Selling:** a plot sold to the bank in debt returns to vacant (no auction). Plots can be traded
  and voluntarily auctioned like shops.
- In Easy rules, plot squares are ordinary shops.

## Stock market (Standard rules)

Each of the 7 districts has one stock whose price tracks the average value of its shops, so anyone
can profit from (or sabotage) a district they don't own. Game setup picks one of two systems
(`MatchOptions.stocks`, stored as `G.stocks`): **Dynamic** (the default for new games) or
**Classic**. Saves from before the option count as Classic. All tunable numbers are in
`constants.ts`; the formulas are in `rules.ts` (`stockPriceExact`, `shareTradeValue`,
`confidence`, `market`).

The average covers shops and 3-Star Shops in the district (not other buildings). `factor` starts at
1.0 per district and stays between 0.4 and 4.

**Classic:**

```
price_d = max(1, round(average shop value_d x 0.04 x factor_d))
```

Trades pay the listed price per share. Buying 10+ shares multiplies the factor by 1.1; selling 10+
multiplies it by 0.9.

**Dynamic:**

```
price_d = (average base value_d x 0.04 + average growth_d x 0.03) x factor_d x confidence_d x boost_d
boost_d = 1 + 0.00075 x held_d x vol_d
```

- A shop's growth is its value above its base value (investing, ownership bonuses, venture cards
  and arcade prizes; negative when a shop shrinks). Growth counts at 75% of the base-value rate:
  a 50% rise in average shop value raises the underlying share price by 37.5%, before the other
  multipliers (`districtWorth`). This reduces growth's direct price effect by 62.5% from the former
  0.08 rate, without changing the shares-held boost. A plot's base is the cost of what was built on it.
  The lower rate also softens losses from shrinking shops. Existing Dynamic saves use the new rate
  when loaded, so developed districts reprice immediately; Classic stocks are unchanged.
- `held_d` is the total shares everyone holds in the district. The price rises in a straight line:
  every 100 shares add 7.5% at volatility 1 (+0.75 for a 10G stock), with no cap. Trades never
  touch the factor.
- `vol_d` is the district's volatility, rolled evenly at game start between 1 and 2, so a district's
  slope runs from +0.75 to +1.5 per 100 shares (10G stock). Players are never shown a district's
  volatility (the Stocks lab dev tool still labels it Calm, Normal or Wild, `volMood`).
- A trade pays the average of the price before and after it (sells use the same), so buying 99
  shares at once costs the same as buying them in steps.
- **Sell-off:** when 75+ shares of a district are sold in one turn (by anyone, in any number of
  sales), its price is dented by 10%; each further 75 shares add 0.8x the previous step, scaled
  smoothly (`sellOffCut`: 100 shares -12.8%, 150 -18%, 200 -22.3%, 300 -29.5%; one turn never
  quite reaches -50%). Dents stack across turns down to -50% at most (`K.confMin`). The seller is
  paid before the dent lands (the average of the price before and after their shares left). Every
  share bought there repairs 0.1% (100 shares = 10%), and every 100G invested in its shops repairs
  1% (`G.market.cut`). Saves from before this rule count each old dent as 5%.
- A shaken district (a sell-off cut its price) shows a small red falling-chart icon right after its
  name in the stock table; its tooltip says how many shares bought (or how much invested) repair
  it. Every district name keeps the icon's space, so names line up either way.

| Action   | Where / when                                                                               | Classic                     | Dynamic                        |
| -------- | ------------------------------------------------------------------------------------------ | --------------------------- | ------------------------------ |
| Buy      | Landing on the bank, or passing it with a promotion; Stockbroker; some venture cards       | Up to 99 shares; 10+: x 1.1 | Up to 99 shares; repairs dents |
| Sell     | Before rolling; when in debt (any number of shares from any districts); stock venture card | 10+ shares: x 0.9           | 75+ in a turn: sell-off dent   |
| Dividend | Whenever anyone pays a fee or toll in district d                                           | floor(fee x shares / 250)   | Same                           |

**What moves prices:** investing, expansion, domination, venture cards that grow or shrink shops,
Memory Blocks prizes, building a 3-Star Shop, and big trades (Classic factor; Dynamic shares held
and sell-offs). Shares count toward net worth at the current price, so a price drop can push a
leader below the target. The default goal is 10,000G.

**Stocks lab** (dev builds, `#stocks-lab`, `ui/stockslab.ts`): edit every stock constant live
(saved per browser; "Use in games on this device" applies them to games after a reload, and online
every player needs the same values), a price curve for both systems, a trading sandbox running both
systems side by side, and a CPU simulation over every built-in board.

**Interactions:** stocks are the only asset that is liquid before rolling, so they are the first
thing sold in debt. Buying into a rival's district and then selling 10+ shares as they near the
target is the signature sabotage move from the original. Easy rules hide the market and remove stock
venture cards.

**Stock screen (buy and sell):** like the venture board, the stock market opens in a pop-up in the
middle of the screen (over the board, which stays visible around it) and the choice sits in the
action bar: a summary card, the share counter and Buy/Sell with Skip (or Cancel). The card's
heading just says "Buy Brick Row shares" (or Sell); under it two groups split by a thin line. The
market group: the market price and the player's shares, each now and after. The payment group:
the **price per share** (what the player pays or gets for each share: the market price with any
discount or premium, in gold; it stays the same while they change the count) and their cash now
and after. At a discount (10% off) or premium (20% above) a green chip in the card's top right
corner names the deal, and the price per share row shows the market's price crossed out with the
player's own price in green with a soft pulsing glow. The share counter has no 0 button and no "shares" label; Max sits right
beside it. Gift shares' heading just says "Get Brick Row shares"; it shows the market price and the shares
held, then "Price per share: Free". Picking a
district in the table or on the mini map plays the click sound.

**View board chip:** whenever a pop-up is on screen (the stock market, the venture board, an
arcade game, the info pop-up), a **View board** chip pops in at the top right, just left of the
zoom chip, and pulses with a gold glow to catch the eye (a steady glow with reduced motion). Tapping
it hides the pop-up and the camera shows the whole board (auto zoom, so the player can still
zoom); the pop-up plays its closing animation as it goes, the action bar morphs to its new
content, and the chip morphs (its width easing, the words cross-fading) into a gold **Back**, and tapping it again brings the pop-up back as it
was, with its opening animation. While the stock market is hidden the action bar says "Looking at the board" with a gold
**Back to stocks** button too. The chip goes away when the pop-up closes. The bar has the same padding on all
four sides (12px; 8px on phones). The venture cards that pick a
district (Gift shares, Bull and Bear market) work the same, with one button naming the district.
Picking a district on the map or in the table updates the bar. The pop-up puts the mini map (drawn
larger) in the top left, the selected district's shop cards under it, and the district table down
the right side, its rows stretched to the same height. In the table the Price heading is just the
word (no coin), in larger gold text; the price column is kept narrow and each player's shares
column is at least 46px wide. **It never scrolls.** It sits in the middle of the room between
the toolbar and the action bar; when centering it would run under the player cards, it slides left
just far enough to clear them, and when it is still too big for the room it shrinks to fit.
**Small screens** (phones, windows 760px wide or less): the pop-up fills the room between the
toolbar (so **View board** stays in reach) and the action bar, over the player cards, and the board
behind it is blurred so the focus is on the pop-up (the toolbar and the action bar stay sharp).
On short (phone) screens it keeps only the district table; tall narrow screens also show the
title, the mini map and the shop cards above it. The table shows as many districts as fit; moving
the selection past the last one shown shifts the list by one, and past the end of the list it
carries on from the first district (and the other way going up), so the list loops. The counter
is smaller and the "shares you hold" line is left out. The live auction fills small screens the
same way. The pop-up's panels:

- **Mini map** of the whole board. Squares in that district are filled with the district color. An
  owned square gets a ring in the owner's color plus their initial; no ring means it's for sale; a
  dashed square is a vacant plot. The bank is marked G, and each player's current square shows a dot
  in their color. Hovering a square shows its name, owner and value.
- **Holdings table:** one row per player with squares owned in the district, shares held, the value
  of those shares at the current price, and a bar showing their share of all stock held there.
  Players with nothing there are dimmed.
- No note under the table (the stock market pop-up has none either).

## Suits, bank and promotion

Collecting all four suits and then reaching the bank is the game's lap counter and its steady
paycheck.

- **Collecting:** entering a suit square (passing or landing) gives that suit if you don't have it.
  When passing, the token does not stop: the suit pops up above it as it walks on.
  The change-of-suit square gives its current suit and then rotates spade -> heart -> diamond ->
  club. Cannon, balloon and zoom warps also collect the suit at the destination.
- **Suit Yourself cards:** a wild card for any one missing suit. Gained from venture cards, Lucky
  Reels and Memory Blocks. Promotion consumes one wild per missing suit.
- **Bank visit** (pass or land), in this order: win check (net worth already at the target when
  arriving; a promotion on this visit can't win it, the player must come back) -> promotion if 4
  suits (counting wilds) -> stock purchase (Standard; only when landing or after a promotion) ->
  free direction next turn if landed.

**Promotion** clears all suits, adds 1 level and pays:

```
salary = 600 + 250 x level + floor(0.15 x total shop value)
```

"level" is the level before promotion; "shop value" counts shops and 3-Star Shops only. The "sudden
promotion" venture card pays the same salary anywhere on the board but discards suits without using
wilds.

**Interactions:** salary grows with shop value, so investing pays twice. Level also scales Home fees
and every arcade prize. The salary is the main way net worth grows from outside the players'
economy, so its numbers set match length (see Balance constants).

## Venture cards

Landing on a Venture square, or stopping exactly on a suit square, opens the 8 x 8 venture grid; the
player flips one face-down panel and resolves its card. The board container stays centered and
stationary, with rounded square tiles and no header or OK button in its container. It is as big as
the room between the toolbar and the action bar allows, so its tiles are easy to tap: up to 660px
wide on monitors (about 72% of the window height, never reaching the player cards). When the action
bar sits in the bottom left corner (phones), the board sits on the left above it too and fills the
height between the toolbar and the action bar. It does not
dim the background or block interaction with the action bar. As the tile flips, the action bar
shows the card's title and description, for everyone, with nothing else shown in between. The picked tile flips with a card-flip sound. If it makes a
bonus line, the line's tiles flip over again one after another, starting next to the picked tile
and spreading along the line, each with the flip sound; then a gold "Line of 5! +50G" burst rises
from the picked tile with a jingle (a full row of 8 says "Full row!" with a bigger fanfare). There
is no separate bonus prompt, and the bonus is paid (and logged with the card) only once the board
closes. The player who drew the card gets an OK button and closes the board
when they have read it (or it closes by itself after 10 seconds); everyone else sees the card
without a button and the board stays up until then (the engine waits on a `ventureRead`
decision, so online players stay in step). A CPU closes its card after a short reading pause.
On short screens the board shrinks to leave space for the action bar.

- **Card numbers:** each card has a permanent number (0.5–20), shared across Standard and Easy.
  Flipped panels show the card number in the player’s color; face-down panels hide it. The
  result heading includes the same number. Guide → Venture cards lists all numbers, titles
  and effects, including clearly marked Standard-only cards. Numbering is independent of the
  randomly assigned panel position and persists when reopening the board or loading a save.
- **Grid:** 64 panels, each pre-assigned a random card from the deck for the current rule set. A
  flipped panel takes the player's color. When every panel is flipped, the grid resets.
- **Line bonus:** after flipping, count each straight line (row, column and both diagonals) of the
  player's color through that panel. Every line of 4 to 7 pays 10G per panel; a full line of 8
  pays 200G. The lines light up on the grid.
- **Hidden information:** in the online build the server must hold the card assignments and reveal
  only the flipped one.
- **Deck:** 30 cards; 7 marked Standard-only (stock cards) are excluded in Easy rules. Cards are data
  (title, text, effect function) so more can be added.

| Family            | Cards in the prototype                                                                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Movement          | Roll again and move · Move 2 more squares · Zoom to the bank · Zoom to any square (landing effect applies)                                                                                                 |
| Cash              | 50 x die from the bank · 40 x die from the leader · Lose 10% of cash · Give everyone 30G · Half a salary · Give 10% of cash to last place (nothing if the drawer is already last) · 30G per property owned |
| Shop value        | Your shops +10% · One random shop of yours +40% · A random district's shops +15%                                                                                                                           |
| Fees              | Everyone's shops close, then roll again · Odd roll: your shops close / even: everyone else's · Your fees +30% until next turn · 50% commission until next turn                                             |
| Suits             | Free heart (100G if held) · Suit Yourself card · Sudden promotion                                                                                                                                          |
| Property deals    | Invest in any of your shops now · Forced buyout of any rival shop at 5x                                                                                                                                    |
| Stocks (Standard) | 20 free shares · District price +20% · District price -20% · 10% dividend · 2G tax per share · Buy at 10% off · Sell at 20% above                                                                          |

**Interactions:** venture cards touch almost every system: movement can chain into another landing
(and another venture), value changes move stock prices and salary, closures switch off fees and
commissions, and leader-targeting cards act as catch-up.

## Special squares

Every non-property square has one landing effect; temporary effects last until the affected
player's next turn begins.

| Square           | Landing effect                                                                                    | Interacts with                                                |
| ---------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Roll-on          | Roll again and keep moving (max chain depth 3)                                                    | Can reach another venture, bank or roll-on                    |
| Take-a-break     | Your shops and buildings close: rivals pay nothing there                                          | Fees, tolls, dividends and commissions from your squares stop |
| Boon             | 20% commission: the bank pays you 20% of every fee anyone else pays                               | Stacks with nothing; the higher rate wins                     |
| Boom             | Same, at 50%                                                                                      | Same as Boon                                                  |
| Stockbroker      | Buy stock (Standard). Becomes a Venture square in Easy rules                                      | Stock market                                                  |
| Portal (retired) | Only in saved games: stepping on it jumps to its partner portal or the bank, then keep moving     | Boards now use portal links instead (see Custom boards)       |
| Warp             | Stopping on it jumps to its partner warp or the bank; arrival does not teleport again             | Up to five pairs (auto colors) plus any number to the bank    |
| Cannon           | Pick another player and warp to their square. Suits and bank still apply there; nothing else does | Suits, bank, promotion, win                                   |
| Price Up         | Your fees are 10% higher until your next turn (`K.hike`, multiplies any other boost)              | Shop and building fees you charge                             |
| Taxi             | Pick any special square (not the bank, a taxi, a portal or a warp), ride there and use it         | Every special square's effect                                 |
| Swap             | Pick another player and trade places. You pick up a suit or visit the bank where you arrive       | Suits, bank, promotion, win                                   |
| Arcade           | Play one random minigame (see Arcade minigames)                                                   | Cash, shop values, wild suit cards, stock                     |
| Venture          | Venture grid                                                                                      | See Venture cards                                             |
| Change-of-suit   | Gives the current suit, then rotates                                                              | Promotion                                                     |

**Turn-start reset:** when a player's turn starts, their `onBreak`, `closed`, `boon` and `boost` are
cleared. This is what makes "until your next turn" effects expire.

## Arcade minigames

Landing on an arcade chooses one of the five games at random, but never one already played since
every game was last played: each game is played once before any repeats, and a new round of games
never starts with the game that ended the last one (`G.arcadePlayed`). Lucky Reels and Memory
Blocks are solo games; Coin Derby, Lucky Wheel and Treasure Split include every non-bankrupt
player. Party choices are made by **everyone at the same time**: each player picks privately and
taps **Lock in** (Coin Derby: tap Sprint or Grab, then Lock in; Lucky Wheel and Treasure Split:
pick on the board, then Lock in). Portraits over the game show who is still choosing and who has
locked in (a green check); the round starts once everyone has locked in, and the choices are
revealed together. A player who locks in sees "Rosa locked in! Waiting for Milo, Kai…". Players
sharing one device take turns (passing the device between them); players on other devices and
CPUs choose alongside. CPUs choose for their own seats and for disconnected guests. The engine
asks every player at once and applies the answers in seat order (the player who landed first),
so every copy of the game agrees.

| Game           | How it plays                                                                                                                                                                                                                                | Prizes                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lucky Reels    | Five slots, five equally likely symbols (7, coin, star, diamond, clover). One roll plus up to two rerolls. Tap slots to keep them between rolls (only the others spin); take the prize early at any time. Keeping all five takes the prize. | Best set only, times the player's level: pair 10G, two pairs 15G, three matching 30G, five different 50G, full house 50G, four matching 80G, five matching 200G. |
| Memory Blocks  | Nine cards are dealt face up for 1.9 seconds, flip face down, and the player picks one. The prize takes effect after the game closes, so its coins or shop value changes play on the board.                                                 | Two "Shops +10%", two Gold (60G x level), one wild card, two "Shops -5%", two 20G.                                                                               |
| Coin Derby     | Everyone races down a 15-space track over three legs. Each leg, every racer secretly picks Sprint (move 3-5 spaces) or Grab coins (move 1-3 spaces and take 30G). Racers stop at the finish flag.                                           | Everyone keeps the coins they grabbed. The racer furthest along after leg 3 wins 100G x their level (tied leaders each win it).                                  |
| Lucky Wheel    | One optional bet per player, in 10G steps, up to 100G and their cash. Twelve equally likely numbers; odd are red, even are blue. Bet on a color or a group of four (1-4, 5-8, 9-12), or skip.                                               | A winning color bet wins 1x the bet; a winning group bet wins 2x. A losing bet loses the bet. No debt, no level multiplier.                                      |
| Treasure Split | Two rounds. Each player secretly picks the 60G, 100G or 150G chest. Coins found are tallied each round and all handed out after the last round.                                                                                             | Each chest is shared equally by everyone who picked it (rounded down).                                                                                           |

**On screen:** like the venture board, each game sits on a board in the middle of the screen and
the action bar carries its instructions, choices and results; the board stays up from the first
choice to the last result (Lucky Reels keeps its slots between rolls; on a roll every slot not kept spins, flicking through the symbols, and they stop one after another from left to right). The party games show a row
of everyone's portraits that ticks off who has chosen. Lucky Reels shows the prize ladder with the
current set highlighted; at the end only the slots in the set light up. Memory Blocks cards deal in,
flip face up, then flip face down (nothing on a face shows through), and after the pick the chosen
card flips first, then the rest. Coin Derby shows a lane per racer counted in spaces (start line to
finish flag), runners hop space by space with a "+4" or "+30G" badge, and coins add up at the end of
each lane. Lucky Wheel shows the wheel beside the bet board (tap a bet, set the amount in the action
bar); after the spin the winning bets light up and each bet shows its player and what it won or
lost. Treasure Split shows three chests (bigger chests hold more); after the reveal they open with
the choosers' portraits and the share each gets. Results move on by themselves (sooner with Fast
CPU when only CPUs played) or with Continue.

The Arcade Lab in the UI Lab launches each real engine game with one human and CPU opponents in
isolated sample state. It never overwrites the saved match.

## Trading and auctions

Before rolling, a human player can trade with any other player or auction one of their properties;
these are the main tools for completing districts.

### Trades

1. Proposer picks a partner first. The board then pulls back so every square fits in the space the
   player cards and action bar leave free; everything but the two players' properties is dimmed.
   The action bar shows the deal: a row for each side with the chosen properties as chips and a
   cash amount (minus/plus in 50G steps, or typed). Tapping a property on the board adds or removes
   it ("Give"/"Get" labels on the board); tapping a chip removes it.
2. Validation: at least one item, and neither side offers more cash than they hold.
3. The partner sees the same zoomed-out board and an action bar listing both sides, with the offered
   squares marked ("You get" / "You give"), and accepts,
   declines, or sends back different terms (a counter-offer edited the same way). Up to 3
   counter-offers go back and forth; then the last receiver can only accept or decline.
   Everyone else sees the terms being considered (both sides' properties and cash in the action
   bar, the properties labelled on the board, and who is deciding) without buttons. The log does
   not list each counter-offer: while it goes on it shows who is deciding, and it ends with one
   line, "Milo accepted Rosa's trade." or "Milo declined Rosa's trade."
4. On accept, ownership and cash swap atomically, then expansion runs for both players in every
   group that changed hands.

CPU acceptance rule: value each property at value x (1 + 0.35 x squares the CPU already owns in that
group, excluding the square itself when giving it away). Accept if what it receives >= 1.15 x what
it gives + 20G and it can afford its cash side. CPUs never propose trades in the prototype.

### Auctions

- **Voluntary:** the owner taps a shop or built plot in the whole-board pop-up and confirms. Opening bid = its value; the winning bid is
  paid to the seller.
- **Debt sale:** when a player sells a shop to the bank in debt, the bank pays them 75% of value,
  then auctions the shop to everyone else. Opening bid = 75% of value; the winning bid goes to the
  bank.
- **Live bidding:** there are no turns. Every bidder can bid or pass at any moment. A bid is always
  the next step up: the opening bid first, then + 10% of value (minimum 10G) over the high bid.
  The high bidder can't pass (their bid stands); a player who passes is out. A bidder who can't
  pay the next bid counts as out ("Too pricey"). The auction ends:
  - 5 seconds (`TIMING.auctionWindow`) after the last bid: the high bidder wins;
  - 5 seconds after it opens with no bids: no sale (the property stays with the seller or, for
    the bank, goes back on the market);
  - as soon as only one bidder is left: they win (at the opening bid if nobody bid).
- **Screen:** a pop-up in the middle of every player's screen ("Live auction") shows the lot (art,
  name, value and the bid step), the high bid and leader (it pops and a coin chimes on each new
  bid), a countdown bar with the seconds left (gold, turning red for the last 2 seconds; every bid
  fills it again), and each bidder (In, Leading, Passed, Too pricey). The View board chip hides
  it. The action bar says who leads ("Kai leads with 340G", or the opening bid) and when it ends
  ("Sold in 3s unless someone bids"); each player on this device gets **Bid 374G** and **Pass**
  (a row each, with their name, when several share the device; "You lead" while they lead). The
  result shows in the action bar with Continue, and the pop-up closes.
- **Who runs it:** the engine asks one `auction` decision and gets the winner and price back,
  checking that the winner was a bidder and can pay at least the opening bid. The screen runs the
  live auction: on one device it takes bids from everyone there; online the host runs it, guests
  send their bids and passes to the host (`auctionAct`) and draw the state it sends back
  (`auction`), and the host shares the result like any other answer. Without a screen (tests, the
  CPU simulation) it is settled as an ascending auction: the highest CPU limit wins, one step
  above the runner-up's limit.
- **CPU bids:** a CPU bids (after 0.7-2 seconds) while the next bid is <= value x 1.25 (x 1.6 if
  it already owns a square in that group) and it keeps 200G in cash; otherwise it passes.
- The winner gets the property and expansion runs.

## Debt, bankruptcy and ending the game

Cash may go negative during a turn; it is only settled at the end of the active player's own turn,
and a match ends on the first win, bankruptcy or round limit. Players may buy a shop, build on a
plot or buy out a rival even without the cash on hand, as long as their cash plus what their
stock and property would raise in a debt sale covers the price; the prompt warns how short they
are, and they sell at the end of the turn. (CPUs only buy with cash on hand.)

**Ready to win.** When a player's net worth reaches the target, everyone gets a banner ("back to
the bank to win"), their card shows "Can win!", and the music switches to a faster, more urgent
track until no one is above the target.

**Debt settlement** (end of the active player's turn, while cash < 0):

1. List sellable assets: shares (any number from any districts, at market price, through the
   stock screen) and each shop or built plot (bank pays 75% of value).
2. Human picks one sale at a time; the CPU sells stock first (a whole district at a time), then the
   cheapest property.
3. Sold shops go to a debt auction (winning bid to the bank). Sold plots become vacant again.
4. Repeat until cash >= 0. With nothing left to sell, the player goes bankrupt.

Other players who were pushed negative by someone else's action (a venture card, for example)
settle at the end of their own next turn.

**Bankruptcy:** the player is out; all their squares become unowned (plots revert to vacant) and
their shares vanish. The game ends immediately and the richest remaining player wins.

**End conditions:**

| Condition      | Check point                                                 | Winner                             |
| -------------- | ----------------------------------------------------------- | ---------------------------------- |
| Target reached | Arriving at the bank (passing or landing), before promotion | That player                        |
| Bankruptcy     | When a player can't cover debt                              | Highest net worth among the others |
| Round limit    | When the round counter passes the limit                     | Highest net worth                  |

**Results screen:** final ranking, a net-worth-by-round line chart with the target marked, and
per-player totals for fees earned, fees paid, salary, dividends and commission. The save is cleared.

## Rule sets and match options

All options are chosen on the game setup screen; the rule set only changes how the board is built at game
start, so every other system checks one flag (`rules`).

|                                       | Standard                                     | Easy                      |
| ------------------------------------- | -------------------------------------------- | ------------------------- |
| Groups for expansion                  | 7 color districts                            | Rows of connected shops   |
| Vacant plots                          | Set per game (None to All), 7 building types | Plots are ordinary shops  |
| Stock market, dividends, market panel | Yes                                          | Hidden and off            |
| Stockbroker square                    | Buy stock                                    | Becomes a Venture square  |
| Venture deck                          | All 30 cards                                 | 23 cards (no stock cards) |
| Lucky Reels "three stocks"            | 10 shares                                    | 150G                      |

**Main menu:** the title screen has the title on top and, under it, **Play**: the one big gold
button, which opens game setup (with a join code for friends). A "Have a code?" field sits on its
right side; typing in it never presses the button. Once all four letters are in, the button turns
blue and reads **Join** ("Join game KQZD"); pressing it (or Enter in the field) joins that game.
When rejoining a running game needs the player's name there, or joining failed, a slim strip under
the button holds the name field and the reason. **Continue** (only with a saved game) is a smaller
green row centered under it (narrower and shorter than Play) showing the round, board and how long ago it was saved, with a colored dot per
player. **Rejoin** is a small chip in the top left corner ("Rejoin KQZD, as Milo, 5 min ago") while
this device has an online game to go back to. In the top right corner sit the **player card**
button (the same shape as Sound and Menu: the card's whole character on the left, its name on the
right; the first time the game opens it gets a random friendly name and character, saved until
changed), the **Sound** button and, to
its right, **Menu**. The **player card** (`profile.ts`, kept on this device) is the name and
character this device plays as: its button opens a pop-up with the character on its colored spot
(tap it to open the character picker) beside a name box (up to 12 characters, the same characters
removed as in setup), and a line on how it's used. Changes save as they are made; Done, Escape or
a click outside closes it. Game setup seats the host with the card's name and character, and
joining a game uses its name (unless one was typed for a rejoin) and asks the host for its
character: if someone in that game already has it, the player gets a random free one, and can
still change it before the game starts. Changing the name or character in a game's setup doesn't
change the card. **Menu**: a pop-up in the middle of the screen with
**What's new**, **Board collection** and **Credits**, each a row with a line saying what it is (Close,
Escape or a click outside closes it). Menu carries a red "New" badge until the latest update has
been read on this device, and What's new shows a "New" tag in the pop-up. **Credits** lists everyone whose
work the game uses (art, fonts, libraries; data in `apps/client/src/credits.ts`), one card each with
what was used, the license and links to their pages.

**Board collection** (main menu, Menu): every board the player has, the built-in ones and their
own (saved on this device), over the title scene. A top bar holds **Back** (to the main menu) and
the "Board Collection" title in the top left, and **Add a board** (import an `.aaboard.json`
file; hidden on very narrow screens), **New board** (opens the board builder on a blank board)
and **Sound** in the top right. The boards are cards in a grid that scrolls: the board's picture
in a green frame (tapping it views the board), its name with a "Built-in" or "My board" tag
("Needs fixing" when it can't be played yet), a muted line with its shape,
squares and districts, and two chips at the bottom, **View** and **Remove**. An **eye button** in
the card's top right hides the board from game setup or shows it again: a hidden board stays in
the collection with a grey border, a greyed-out picture and a crossed-out eye; a shown board has
a gold border and a gold eye. At least one board must stay shown. **Remove** (asks first)
deletes one of the player's own boards from this device; built-in boards can't be removed (the
chip is faded). The cards show every change on their own; only problems (a file that can't be
read, no room to save, hiding the last shown board) open a small pop-up with OK.

**Board viewer.** View opens the board in the board builder with the editing turned off: only the
board (drag, scroll or pinch to look around), the info chip ("Board viewer" and the name), and
the zoom chip, a gold **Edit** and **Back** at top right. **Edit** turns on every builder tool
and panel; the top right becomes Undo, Test play, Menu and a gold **Done**. Done with changes asks
**Save** (over the player's own board), **Save as** (a new board in the collection, under a name
the player picks, "Harbor (2)" by default) or **Don't save** (the changes are dropped); then it
goes back to the viewer. Built-in boards can't be saved over, so they only offer Save as and
Don't save. Menu also has Save and Save as, and Back asks the same question when there are
unsaved changes. Leaving returns to the collection. Opening a board (to view or edit) moves its tiles to the middle of the
builder's grid; boards are trimmed to their tiles when played, so this changes nothing in games.

**Links tool** (the chain icon, last in the builder's tool rail): every pair of neighboring
tiles shows a badge between them: green with a two-headed arrow (linked both ways), a navy badge
with a gold arrow (one way), or red with a cross (link removed; the road is gone). Tapping a badge
cycles it: both ways, one way, the other way, removed, both ways again. Every free tile side
(facing an empty cell, without a portal) shows a **faint portal** (a see-through purple disc with
a dashed white ring and swirls). Tap one to start a portal link (it turns gold), then tap a faint
portal on another tile to make a two-way link, or an exit portal to add another entrance to it.
Tapping elsewhere or Escape cancels. Tapping an existing portal (with Links or Select) selects it:
a gold ring around it, gold link lines to the portals it joins, and the **portal panel** on the
right: its place and side, **Kind** (Two-way / Entrance / Exit pills; kinds that can't apply are
faded with the reason on hover: an exit with more than one entrance can't become two-way or an
entrance), **Leads to** / **Comes from** with a row per linked portal (tap to select that one),
and **Remove portal**. Changing one end's kind changes the other end to match (an entrance's other
end becomes its exit). Placing a tile on the cell a portal opens onto breaks that portal link.
Dragging elsewhere moves the view; Undo undoes link changes too. Links follow their tiles when a
group is moved (each end of a portal link follows its own tile); erasing a tile removes its
portal links. The Tiles pane no longer has a Portal tile.

**Game setup options.** Over the title scene, a **top bar** that never scrolls runs across the
screen: **Back** (to the main menu, as tall as Sound) and the "New Game" title in the top left
corner with the join code chip right of the title, and **Sound** (the same button as on the main
menu) in the top right corner. The **players column** sits in the bottom right corner, where the
player cards sit in the game. Under the top bar: the **Board** panel on the left and the **Game
Settings** panel on the right, the same width and height, centered across and up and down in the
room between the left edge of the screen and the player cards.

**Fitting the window.** The whole screen scales with the window: the top bar, the panels and the
player cards grow together on bigger windows (normal size at 1366 x 768 sideways or 820 x 1180
upright, up to twice that on big monitors; never smaller than normal, as phones have their own
compact sizes). Then the panels take whichever of three layouts fits, so nothing ever scrolls:

| Window                      | Examples                       | Layout                                        |
| --------------------------- | ------------------------------ | --------------------------------------------- |
| Sideways, room for both     | 1366 x 768, 1920 x 1080, 4K    | Side by side, centered, scaled up on big ones |
| Sideways, not enough room   | phones, 1024 x 768, 1280 x 720 | One at a time with the chips                  |
| Upright, both fit in height | tablets, tall windows          | Board on top of Game Settings                 |
| Upright, too short for both | very short upright windows     | One at a time with the chips                  |

One at a time: two chips under the "New Game" title, **Board** and **Game Settings** (gold when
chosen), pick the panel; it fills the room from the chips to the bottom of the screen and from the
left edge to the player cards, so both panels are the same size. Board shows first; the choice
stays while the screen is open. Upright windows span the panels across the room left of the
player cards, scaling them and everything in them down when that room is narrower than they need
(on a phone held upright they get very small). On very narrow windows the title is smaller and
Sound shows only its icon. Joined and continued games work the same way. Panel shadows fade out
softly at every size (nothing clips them). Headings capitalize every word. There is no Start button (see **Ready up**).

- **Players column:** the seats stacked like the player cards in the game (as wide, the same
  tiles with the player's color down the left edge). There is no heading and no empty seats.
  **Order:** each device shows its own player at the bottom, and everyone else above in the order
  they arrived, the newest on top, so every device lists the players differently (a friend who
  joins sees themselves at the bottom, with the players already there above them in seat order).
  Turn order is still the seat order. When a bot, a local player or a friend joins, the new card
  pops in at the top on every screen and the cards above the bottom ones make room; when a player
  leaves, their card fades out and the ones above slide down.
- **Add chips (the host):** above the top player sit two chips against the right edge of the
  window: **Add local player** (a player on this device, blue) and, right of it, **Add bot**
  (gold), both outlined pills on navy. They slide
  up as each player is added; when the 5th player joins they pop out (while the new player pops
  in), and they come back when a seat frees up.

- **Board:** a horizontal carousel of the built-in boards followed by the player's saved boards,
  looping from the last board back to the first. The chosen board's picture sits in the middle
  with its name under it ("My board" for a saved one, a red "Needs fixing" tag for one with problems), always in a frame of the same size so the panels never change size from board to board; the boards before and after it peek out,
  smaller and faded, on both sides. Tapping a side board, swiping or the arrow keys move it: the
  row slides over while the new board grows into the middle. Under it a thin line shows where in
  the list the board is: a gold bar (one board's share of the line) slides along it, so any
  number of boards fits; tapping the line jumps there. There are no board tool chips here: boards
  are added, removed, hidden and edited in the board collection (main menu, Menu); hidden boards
  are not offered here. The Board and Game Settings
  headings are large.
- **Players** (in the players column): setup starts with only the host ("You · host"); bots and
  other players on this device are added by hand, and friends join with the code (the board and
  settings are remembered from the last game, the players are not). Each seat is a card like a
  player card in the game: the character on the left (tap it to change it, for players on this
  device; a small gold pencil with a soft glow on the character's bottom right says so), the name on the top row, and what kind of player it
  is with the Ready chip on the bottom row. Every seat keeps its name and character as others
  come and go. Bots, extra players on this device and joined friends have a small round remove
  button (×) at the end of the name row.
- **Ready up:** instead of a Start button, every person taps the **Ready** chip on their own seat
  (at the end of the card's bottom row; each player on the host's device has one, and a friend
  who joined has one on their own seat). Ready turns green with a tick; tapping it again takes it back. Bots are always
  ready. There is no status line on screen (screen readers still hear what is needed: "Tap Ready
  to start", "Waiting for Ada, Pip", or a reason the game can't start).
  When everyone is ready the game starts: straight away when there is only one person, otherwise
  after a 3-second countdown ("Everyone's ready! Starting in 3...") that anyone can stop by
  taking their Ready back. Changing the board or a setting un-readies everyone, so nobody starts a
  game they didn't see; a friend who joins arrives not ready. Online, joined players see "Everyone's
  ready! Starting..." read out during the countdown. If a game is saved, the host's Ready chip
  says (on hover) that starting replaces it.
- **Join code:** setup opens a room straight away and always shows its code as a chip in the top
  bar (tap it to copy or share the invite; "Getting a code..." while opening, "Offline · Try again"
  without a connection). A friend who joins takes a free seat; when all 5 seats are full they replace the last
  bot (a full game with no bots turns them away). Starting with nobody joined plays on this device (the room
  closes); with friends joined it is an online game. Without a connection there is no code and
  the game is played on this device.
- **Target net worth:** 5,000G by default; arrows on each digit set any amount in 1,000G steps from
  1,000G to 90,000G (like the share picker); no Min or Max buttons.
- **Game settings** are all shown at once, in two columns: Rule Set and Stocks, then Winning Goal
  and Vacant Plots, each with a one-line hint. Their choice pills have a slightly thicker outline.
- **Vacant Plots:** the amount (None, A few, Some, A lot, All) between two gold arrows that cycle
  through them, looping. Joined players see the amount only.
- **Round limit:** no longer offered: games have no round limit (older saved options with one are
  ignored; saved games keep theirs).
- **Characters:** each seat starts with a different random character and a name. Tapping a human
  seat's character opens the character picker (all nine characters; ones other humans have are
  greyed out with their name, so no two players share one; a CPU holding the picked one switches
  to a free one). Characters cannot change once the game
  starts. **Names** start as before (the host's seat uses the main menu's player card name and
  character; a friend joins with the name on their player card or typed in the join box; other
  players on the host's device and bots get a suggested name), and **can be changed in game
  setup**: tapping the name on a seat card (players on the host's device, and a friend's own seat)
  turns it into a box; Enter or tapping away keeps the new name, Escape or an empty box keeps the
  old one. Names are up to **12 characters**. Renaming in setup doesn't change the player card.
  The host cleans every name (the same rules as the player card). **Long names:** when a name is too
  long for its space (a seat card or a player card), the end of it fades a little and the name
  slides slowly to its end and back, pausing at each end, so both parts can be read (it stays still,
  faded, with reduced motion).

In-game, the Menu button (top right) opens the menu as a pop-up in the middle of the screen, over
everything; a game on this device pauses while it is open (online games carry on). It has Resume, a Fast CPU
toggle (speeds up CPU turns and animations), Full screen, the Sound sliders and mute, and a red Quit
game button. Quit asks for confirmation in a dialog over the menu before returning to the main
menu (no question once the game is over).

## CPU players

CPUs use simple greedy rules with a cash buffer; they are good enough to fill seats, not to
challenge strong players.

| Decision                                | Rule                                                                                                                                                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direction at forks                      | Breadth-first search from each option (not turning back) to the nearest goal: the bank if it can promote or has reached the target, otherwise the nearest missing suit or change-of-suit square. Ties broken randomly                                    |
| Buy a shop                              | If cash after buying >= 150G, or it already owns a square in that group                                                                                                                                                                                  |
| Build on a plot                         | 50% chance of a 3-Star Shop if it keeps 500G after; otherwise a weighted pick (Tax 3, Checkpoint 2, Circus 2, Home 1, Agency 1, Balloonport 1) if it keeps 150G                                                                                          |
| Invest                                  | 80% chance when cash > 900G: invest min(room, 60% of cash above 600G)                                                                                                                                                                                    |
| Buyout                                  | If it owns a square in that group and keeps 600G after paying 5x                                                                                                                                                                                         |
| Buy stock                               | At the bank or stockbroker when cash > 900G: the district whose stock looks best per coin (room its owners can still invest, its own shops counted fully; dividends from fees; a dent recovering; volatility), 55% of cash above 650G, minimum 10 shares |
| Circus upgrade                          | If it keeps 500G after                                                                                                                                                                                                                                   |
| Balloonport / zoom                      | Fly to its current movement goal                                                                                                                                                                                                                         |
| Estate Agency                           | Buy the unowned shop in the group where it owns most, if it keeps 300G                                                                                                                                                                                   |
| Venture panel, minigames, cannon target | Random (venture panels: see below)                                                                                                                                                                                                                       |
| Auctions and trades                     | See Trading and auctions                                                                                                                                                                                                                                 |
| Debt                                    | Sell stock first, then the cheapest property                                                                                                                                                                                                             |

**Venture panels:** the CPU flips the free panel that completes a line of 4+ if it can, otherwise
the one that joins the most of its own panels in a row (squared run lengths in each direction, only
where an unbroken stretch of 4+ is still possible), random among equals.

**Venture card choices:** Gift shares picks the district it would buy stock in; Bear market picks
the district where rivals hold the most stock value (counting its own holdings against it).

**Stock dumps:** before rolling, a CPU sells all its shares of one district (75+) when a rival who
is ahead of it has reached 85% of the goal and holds 500G+ of stock there, picking the district
where that rival holds the most, to crash the price with a sell-off.

**Not yet implemented for CPUs:** proposing trades, starting auctions, renovating. These are good targets for a "hard" CPU in the rebuild.

## Interface and art

**Board and HUD (Oct 2026).** The board is centered on the whole screen; the toolbar, player cards
and options panel float over it. Grass continues seamlessly past the board edge. Every property
tile has a solid border in its district's color; an owned tile is filled with its owner's color
(unowned tiles stay white, with plain grey buildings so they never look like a player's). Tokens stand on a base in the player's color with their name above; the active
player is drawn larger. Money everywhere ends in a small gold coin instead of "G". A shop whose
value changes swells with a green "+" or red "-" label. Property choices (investing, trades,
auctions, renovations, debt sales, buyout and agency cards, the cannon) are made by tapping the
board; the rest of the board dims. **Buying a shop from a venture card** (Hostile takeover: a
rival's shop for 5x its value; Estate Agency: an unowned shop at its value): the action bar never
lists the shops. It says what to do with only **Skip**; tapping a glowing shop marks it (spreading
rings) and the bar asks "Buy Ivy's Bay Market for 2,350G?" with the price (the shop's value too for a
takeover) and the player's cash after, and **Buy** (gold) and **Skip**. Tapping another shop
switches to it; Buy buys the marked one. Online games show a "Room ABCD" button above the player cards. A player holding all four suits has
glowing suits on their card. Arcade games and venture picks open for everyone, so other players
watch them being played; their result screen closes by itself or with Close.

**Chips under the player cards.** One row of glass chips sits just below the player cards,
against the right edge: **Stocks** (Standard rules only) opens the stock market pop-up,
**Properties** opens the properties pop-up (each chip turns gold while its pop-up is open; tapping
it again closes it), and the **layout chip** shows the cards' layout now as an icon only (its name
is in its tooltip): **List** (three bars) or **Smart stack** (a card with an arrow rising out).
The chips have a 2px border. Tapping the layout chip switches to the other layout. The choice is remembered on
that device (an older "folded" or Stack choice becomes Smart stack).

- **List:** every player card, one above the other.
- **Smart stack:** the cards fold into a stack: only the active player's card shows in full, with
  the other players' cards stacked behind it in turn order (the next player just behind, the
  player who just went at the back), each peeking out a little higher as a strip in that player's
  color. When the turn passes, the front card drops down out of the way, slips behind the stack and
  rises into its place at the back, while the next player's card moves forward. When another player's **cash or net worth** changes on someone
  else's turn (they get paid, pay, their shops or shares change value), their card rises out of
  the stack into a list above it. Once it has arrived, the numbers count to their new values and
  the money chip beside the card shows what they gained or lost. About 3 seconds after its last
  change it slides back into the stack. Other changes (suits, level) don't lift a card, and the
  active player's card never rises out. Several cards can be out at once, in turn order. A card
  rising out never knocks the old front card out of line as it drops to the back.

Hidden cards take the front card's height while stacked; extra status rows on a hidden card
must not change the stack's size or expose a larger panel. Opening/popping restores each card's
natural full height. Interrupted glides use the current layout's final pose, and only the latest
glide may restore normal CSS transitions after it finishes.

**Opening a stack** (the same gliding motion as switching layouts, one card just after another): in Smart stack, tapping a card doesn't open the player's info; tapping or
clicking the stack opens it into a list for 3 seconds, then it folds back. With a mouse, resting
on the stack opens it until the mouse moves off the cards. While it is open, tapping a player's
card opens their info. The chosen layout doesn't change. The chips stay fixed below the cards as the cards open, fold, or rise out of a smart stack.

Switching between List and a stack is animated: the cards glide together into the stack (or fan
back out to their places) one just after another; the active player's card glides straight to its slightly-out active spot as part of that motion (it never snaps out afterward); cards rising out of a smart stack and going
back glide the same way.

One rule decides every asset: only the player character sprites are pixel art. Everything else,
including the board, the interface, suits, wild cards, coins and effects, is HD (PNG sprites for static board art, live vectors for UI and effects). _(Changed
by the owner on Oct 23, 2026; the original spec drew suits, coins and wild cards as pixel art.)_

**Board (HD canvas).** Logical size 1300 x 800 with 100-unit squares, scaled to the container and to
devicePixelRatio. The static board (roads, pond, fountain, flower beds, trees, every square)
is drawn into a cached offscreen canvas. When state changes, only the squares that look different
are redrawn (each square's look is compared: owner, value, building, fee...); events that change
no square's look redraw nothing, and a full redraw happens only when many squares change at once.
Each player's tile, flag and shop colors are prepared in idle time at the start of a game. Each
frame draws the ground, that cache, then highlights, sprites, coins, floating text and the die. The cache gets
sharper as the camera zooms in (up to 3x, capped at 16 million pixels for big boards), but only
once the zoom has settled, never in the middle of it.

- Property art is painted PNGs (`apps/client/src/assets/tiles-v2/` plus preserved paired art in `assets/props/`, drawn by `props.ts`): five
  shop designs by value (cottage, house, storefront, townhouse, tower), three 3-Star Shop designs
  (boutique, department store, grand mall), the circus at each of its four levels, and the
  checkpoint, balloonport, tax office, home and estate agency. Their explicit grey tint masks recolor windows, doors,
  awnings and signs: grey when unowned, the owner's color when owned, with the
  owner's initial badge.
- Shops: district-colored border, filled with the owner's color when owned, shop art, value
  label (unowned) or the fee as plain dark text and a pennant in the owner's color (owned). Closed
  shops get a dark overlay.
- Plots: vacant-land PNG and "VACANT" when empty; a building PNG plus its fee when built.
- Hex tiles narrow to a point at the bottom, so their icon and text sit about 10px higher, in the
  full-width middle of the tile, so nothing is cut off by the edges.
- Hover (or tap) any square for a tooltip: owner, value, fee, max value, buyout price, group
  ownership, district stock price.

**Characters (pixel).** Nine townsfolk from Franuka's "Medieval townsfolk" pack (CC BY 4.0,
credited in Credits): Farmer, Fisherman, Blacksmith, Merchant, Alchemist, Barmaid, Bartender, Red
Cap and Blue Cap (`apps/client/src/sprites.ts`, sheets in `apps/client/src/assets/townsfolk/`).
Each has an idle and a walk sheet of 32 x 48 frames, 4 frames per row and one row per facing (down,
left, right, up). On the board they play the walk cycle facing the way they move and the idle cycle
facing the viewer at rest, drawn with smoothing off on a base disc in the player's color, with a
soft dark shadow in the sprite's own shape all round them to lift them off the tiles. Portraits
(log, lobby, tooltips) show the first idle frame down to the hips, head near the middle,
with no frame or background and only the bottom fifth fading out (never over a head); on player cards the place (1st, 2nd...) sits
before the name so it never covers the character.

**Motion.** Tokens tween between squares (260 ms, eased, with a hop) and step through walk frames
every 120 ms (idle frames every 260 ms). The active player has a bobbing pixel arrow; after a roll the die shrinks to sit beside their head and flips to the new number of steps left on each step (each flip along a different axis from the last: sideways, up and over, or a diagonal), popping away when they arrive. Each character has a name plate just above their head. When a human on this device rolls, the camera zooms out to frame them and every square the roll could take them to (and the routes there) in the space the HUD leaves free (the info pop-up may cover it), until they start walking. Pixel coins fly from
payer to payee; floating text shows money changes.

**Action bar.** The current player's options (and most yes/no questions: buying a shop, a buyout,
upgrading a circus, selling a property in debt, bidding) appear in the action bar: one row of a
fixed height (92px; 64px on small screens) centered at the bottom of the screen edge to edge, as
wide as its content up to a maximum that leaves a gap to the player cards on either side.
On small screens that room is narrow, so the question sits above the buttons (which scroll
sideways when there are many).
The question sits on the left, the buttons on the right. Questions stay short ("Buy this Bay
Market shop?", "Buy out Milo's Bay Market shop at 5x?") and the numbers that go with them (price,
cash after, your cash, value, high bid...) show as chips under the question, most important first. It slides up when a question is asked and back down once it
is answered, and is hidden otherwise. Building and renovating use a building picker in the bar: the question and a hint on the left,
Build (gold) and Skip on the right, and a row of seven same-size cards (picture, name, price)
below. Hovering or tapping a card shows its name, cost and what it does for rivals and for you in a
tip floating just above that card; the bar's own text and buttons never change while choosing, so
the bar never resizes. Tapping selects a card (gold ring). Building takes Build or a second tap on
the selected card, so one stray tap never builds. Buildings you can't build are greyed out and the
tip says why (all 3 already built, or can't afford). Phones show the cards as picture and price
only, with the question and buttons above them. Trades
use the bar too (see Trades), and so do stock amounts (the market in a pop-up above the bar). Choices
with more to them (investing amounts, auctions) open their own windows.

**Square symbols.** Boon and Boom squares show a symbol instead of a name and percent: Boon a
green disc with an up arrow (20% commission), Boom a pink starburst with a double up arrow (50%).
Squares without a label (suits, Boon, Boom) center their symbol on the tile.

**Tooltips.** Hovering (or tapping) a square shows a tooltip: properties show their numbers, and
every other square says in a sentence what it does (bank, venture, suits, roll on, break, Boon,
Boom, stockbroker, arcade, cannon...; text in `squareInfo`, `apps/client/src/names.ts`).

**Promotion dance.** A player who levels up does a little dance on the spot: they spin through
their four facings with small hops while the confetti falls.

**Highlighted squares.** Squares a player can pick (or that a choice would affect) get a tint in the
player's color, a white outline that pulses with a glow in that color, and white rings that keep
spreading out from them and fading, so the eye goes straight to them; everything else dims.

**Shops closing.** When a player's shops close (break square, Estate Agency, the Holiday and Odd or
even venture cards; the engine emits `closed`), the camera pulls back to the whole board, each of
their shops' gates rolls down in turn, then the camera returns to the player's zoom. The gates stay
down (inside each tile's border, with a small CLOSED sign) until the owner's next turn starts; the
engine then emits `opened` and the gates roll back up one after another in the background: the
camera does not move and play carries straight on (timings `close*` in `timing.ts`). Each gate
takes 450ms to move, and the next shop's gate starts 70ms after the one before (`closeStagger`), so
a long row of shops closes quickly. Every gate plays its own short sound as it starts to move
(`shutterDown`: a quick quiet rattle and a soft clunk; `shutterUp`: a rising rattle and a tiny
click), slightly detuned at random so a run of them cascades. The older one-off sounds for the
whole closing (`shopClose`, `shopOpen`) are kept in `audio.ts` but no longer played.

**Pacing.** Most events get about a second to themselves (landing, money, ownership and value
changes, suits), and a turn ends with a one-second pause before the next player's turn. When the
active player changes, tokens ease to their new sizes (the active one larger, the rest smaller).

**Small animations** (all turned off when the system asks for reduced motion):

| Where           | Animation                                                                                                                                     | Trigger                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Board (ambient) | Drifting cloud shadows, pond shimmer, fountain ripples and spray, a glint across the bank coin every few seconds                              | Always                                                    |
| Closed squares  | A rolling gate inside the tile border with a CLOSED sign; it rolls down (and back up when the owner's turn starts) with a board overview      | Owner on a break                                          |
| Characters      | Idle animation, offset per player                                                                                                             | Standing still                                            |
| Square          | Gold ring that grows and fades, plus 8 pixel sparkles                                                                                         | Bought, built, bought out, traded, auctioned, or expanded |
| Square          | White ring pulse                                                                                                                              | Landing, or arriving by warp                              |
| Player          | Pixel confetti burst                                                                                                                          | Promotion                                                 |
| Die             | Squash-and-bounce on the result                                                                                                               | Roll ends                                                 |
| Player cards    | Net worth and cash count up or down to the new value, tinted green or red while changing; the active card's glow breathes                     | Any money change                                          |
| Interface       | Prompts and status lines rise in, dialogs ease in, venture and Memory Blocks panels flip, revealed cards pop, main buttons give a small nudge | New prompt, dialog or reveal                              |

**Phones (small screens).** On short screens (500px tall or less) and narrow ones the game
screen packs everything so nothing overlaps: the toolbar stays on one row with short labels
(**Log**, **☰**), the info chip drops the game's name when space is tight, and the player cards are
narrower (176px) and two rows each; names of 8 to 12 letters are a size smaller there so the suits stay beside them, and one that still doesn't fit slides back and forth (level, name and suits; cash, place and net worth) with the goal bar as a thin line
along the card's bottom edge. If five cards still would reach the toolbar, they shrink to fit
(`hud.ts` `fitCards`). Arcade games and the live auction shrink as a whole to fit the room
between the toolbar and the action bar instead of cutting off or scrolling (`modals.ts`
`fitInLayer`), and game boards always leave room for the action bar however tall it is. In game
setup on a phone held sideways, the map and the settings sit side by side and fit on screen
together beside the players column (smaller buttons, no hint lines, the map picture sized to the
room; on narrow phones the settings are one column), and the seat cards are as compact as the
game's player cards on a phone, so five fit.

**Nothing is ever cut off.** When the action bar's options don't fit beside the player cards
(even moved to the bottom left), the bar spreads across the screen over the player cards: the
question goes above the choices, which wrap onto more lines instead of scrolling, and the board
and the cards behind are blurred under a light navy wash so the focus is on the bar (the toolbar
stays sharp). A pop-up (the stock market, the auction, the info pop-up, an arcade game) that would
have to shrink a lot to fit beside the cards, or can't slide far enough left to clear them, does
the same: it sits over the cards with the blur behind it. As soon as things fit again, the bar or
pop-up goes back beside the cards and the blur goes away.

**Layout.** Scrolling panels hide their scrollbars (they still scroll). The board fills the whole game screen edge to edge, and everything else floats over it
as dark glass overlays. Top right: the zoom chip, the Game log button and the Menu button (the menu
also shows the round, target and rule set). **Guide** (`ui/guide.ts`, in the Menu, under Resume; the
menu closes as it opens) opens a pop-up in the middle
of the screen with a tab per topic: Basics (the goal, shops, buyouts, suits and promotion, special
squares, before rolling, debt, controls), Stocks (buying and selling, dividends, what sets the
price, demand and volatility, sell-offs; the classic rules for classic-stock games) and Vacant
plots (a card per building with its art, price, what a rival and the owner get, and the circus
upgrade prices), Arcade games (a card per game: Solo or Everyone plays, how it plays and what it
pays, with the Lucky Reels prize list), and Venture cards (all 30 fixed numbers, titles and
effects, with Standard-only cards marked). Each topic is a card with an icon, a title and a few
short points. Easy rules show Basics, Arcade games and Venture cards. It reopens on the last tab read. Top left: the **info chip**, with the game's name, the goal (target net worth), online a Room
button that shows the room code, and at its end the **Info** button (an "i" in a white outlined circle
and the word Info; gold while open), which opens the **Game info pop-up** (see below). The board name and the
round are on the Game info pop-up instead. Bottom center: the **action bar** (on
narrow windows such as phones in landscape, where a centered bar would have less than 520px
between the screen edge and the player cards, it sits in the bottom left corner instead and uses
all the width up to the cards; this depends only on the window, not on what the bar shows; as a safety net, a centered bar
whose options would not fit moves bottom left too and stays there at that window size). When it
sits bottom left, the pop-ups over the board (the stock market, auctions, the venture board, arcade
games and the info pop-up) line up on the left with it too, between the bar and the toolbar, so they
use all the room up to the player cards. On phones the auction pop-up is compact (a smaller lot
row, the high bid on one line, small bidder chips) so the bidders always fit. While the game waits on
nobody here, it is the status line: one line saying what is going on now: what the game is waiting
on a player to do ("Blue is buying stocks...", "Blue is deciding which space to go to...", see
`ui/activity.ts`; turn handoffs have their own message, and rolling/walking are active phases) or else the last thing that happened, with the log icon for
that kind of action and player names in their colors. A wait stays until the next action or wait replaces it. For observers (CPU or remote turns),
a roll and destination choice are combined: “Rosa rolled a 5 and is deciding where to move...”.
Card movement without a matching roll describes the number of spaces without claiming a die roll.
Landing announces the named space. Completed actions and landings remain in the action bar
for one second within their action; generic waiting is deferred for 1.2 seconds of quiet. A newer result, actual
movement or a new turn replaces stale text immediately. The game does not pause for this timer;
the game log shows the pending decision immediately. Local players receive their interactive choices immediately. Resolving a local prompt removes
its pending waiting message from both the action bar and log. Confirmed purchases, buyouts,
construction, renovations, investments, circus upgrades, stock trades and fees announce their
result at the committed money event, before animation delays. Results are not announced as
successful merely because a button was pressed; the engine must first confirm the action. Landing announcements are presentation-only, not extra saved log entries. When a player on this device has a choice to make, the bar morphs (eases its width and
height, over 740ms) into their options, and morphs back to the status line once they answer. During a resize,
text keeps its destination layout so it does not repeatedly wrap. New messages use a 220ms stepped reveal without sliding or changing their layout. Buttons
are usable immediately and screen readers receive the complete message. Reduced motion skips
the text reveal. Reparenting during resizing never restarts the reveal; repeated identical status messages reuse the same content, and size measurements
retain fractional pixels to avoid a small text shift at the end of a resize. Rapid updates start from the
bar's visible size, and changes to screen size or player-card space retarget the resize. Reduced
motion skips the size animation. The UI Lab's “Action bar resize test” exercises short, long and
interrupted prompts. In the toolbar, between the
zoom chip and Music chip: the **Game log** button (gold while the log is open). It opens the game log
(turn by turn, newest at the bottom, scrollable back to the start of the game) as a glass panel in
the top right, just under the toolbar and above the player cards, as wide as the cards; it pops in
from the top right. On short phone screens the open panel may run down over the player cards so
enough lines show. The current turn's card ends with a waiting
line while the game waits, and the action that answers it fades in in its place. **Skipped
choices are logged too** (a line each, also shown on the status line): "Rosa passed on buying a
shop for 320G.", "Rosa passed on buying out Milo's shop for 1,600G.", "Rosa passed on buying
stock.", "Rosa passed on selling stock.", "Rosa chose not to invest.", "Rosa passed on building on
the vacant plot.", "Rosa passed on the 200G circus upgrade.", "Rosa passed on buying a shop."
(Estate Agency), "Rosa passed on the hostile takeover.". The log's Close button, the Game log button again or Escape closes it. Bottom right: the player cards stacked vertically in turn order (online, each device
turns the order round so its own player's card is at the bottom; turns still go top to bottom) (net worth, cash, level,
suits and progress bar); they are always shown. Player cards show the character's whole sprite
(trimmed to its drawn pixels, no fade).

**Info pop-ups** (`ui/info.ts`). Four kinds of pop-up show what a player may want to look up:
**Game info** (the Info button), the **stock market** (the Stocks chip), the **properties** (the
Properties chip) and a **player's page** (their player card). They sit in the middle of the screen like the stock market (up to
1,000px wide, kept clear of the player cards; Game info and the stock market take the height they
need, while every player page shares one fixed height (400px, enough for its columns; the whole free
area on phones; when three columns fit side by side a long property list scrolls inside its own
column, with no scroll bar), so
flipping between players never makes it jump; pages scroll inside when they need more room; it does not dim the board). **Back** sits in its top
right corner. Game info, the stock market and the properties are separate pop-ups that leave the
**action bar** as it is, still showing what is happening in the game (and any choice waiting), and
they have no View board chip, since they can simply be closed. On a player's page a stand-in action
bar covers the real one, holding a button per player (portrait and name, with 2px borders;
portraits only on phones) to flip between players; when a property is shown on the board from any
of them, the stand-in bar holds its note and **Back to info**. Tapping another of the four buttons is not possible while one is open (see the
pop-up lock below), but the standings on Game info open a player's page.
Anything the game shows in the real bar meanwhile (a status, or a choice waiting for this player)
is there again when the pop-up closes. The pop-up opens and closes with the pop-up motion (rise
and fade in; sink and fade out); the stand-in bar morphs out of the real bar's size with its tabs
fading in, and on closing morphs back to it before handing over. Switching pages pops the old page's parts out (each
section shrinks and fades, one after another), then the pop-up morphs to the new page's height,
then the new page's parts pop in one by one (growing from 82% with a slight overshoot); the top
edge's color fades to the new page's. On a player page the columns keep at least 26px between
them and sections 16px apart, and whatever sits in the top right corner (the shares or
properties heading, or the player's name on narrow screens) stays clear of Back. On player pages the toolbar's View board chip works too. Any of these pop-ups covers
any stock market, venture board or arcade game that is up while open. Escape or Back
closes it. It updates live as the game goes on.

**Pop-up lock.** While any pop-up is on the screen (the info pop-ups, the stock market or venture
board during a choice, an arcade game, a dialog or the Menu), only these still work: the action bar's
buttons, the View board chip (when it is shown), Game log, the Music chip and Menu. The info chip
and its Info and Room buttons, the zoom chip, the player cards (no tap, no hover, no opening the
stack) and the chips under them, and the board (no tile or portal info on hover or tap, no wheel or
pinch zoom) do nothing until the pop-up closes. Squares glowing for a choice can still be tapped.
While View board has the pop-up out of the way, the screen is unlocked.

- **Game:** how to win (the goal, back to the bank, the round limit if any) and who leads; this
  game's facts (board, rules, stock system, round, whose turn, properties owned, venture panels
  flipped), in slightly larger text; and the **standings** in a narrow column: a card per player
  by place, built like the player cards on the game screen (sprite, level, name, suits, the bar
  toward the goal, cash, place and net worth); tapping one opens that player's page.
- **Properties:** a rounded chip per player pinned at the top (it never scrolls away; what scrolls
  under it fades out at its edge): portrait, name and "6 properties · worth 2,610G", bordered in
  their color (all on one row on phones). Tapping a chip picks that player: their properties glow
  in their color and everything else fades back (tap again for everyone). Under the chips, every
  property of the board (owned or not), two districts to a row with each district's four
  properties side by side (eight columns; one district a row on narrow screens), with how many of
  each district's squares are owned. Owned cards show the property's art in its owner's color, a
  large portrait of the owner in the corner, its rent and value, and a bottom edge in the owner's
  color; unowned ones are dimmed, in grey, and say "For sale" with their price (a vacant plot
  shows a dashed VACANT box and "Plot"). Tap any card to find it on the board.
- **Stocks:** the stock market view (mini map, shop cards, district table), as on the buy/sell
  screen; picking a district plays the click sound.
- **A player** (`ui/overview.ts`): every property the player does not own is greyed out on the
  board while it is open, and the page has a 5px top edge in their color. Its columns (stacked
  on narrow screens, with more room from the screen edges on phones): (1) the whole sprite, name,
  level, rank, suits and status tags, with the **net worth** big on the right of the head; under it
  the bar toward the goal (hovering or focusing it pops up the percentage of the goal and how much
  is left); a quiet line with what the **next promotion pays**; the **net worth breakdown** (an unfilled ring split into Cash,
  Properties and Stock, the hovered or biggest part's share in its middle, with a legend of values
  and shares) and, once the game is over,
  **net worth over the game** (a line per round with the goal dashed; hover for each round's value;
  the fees, salary, dividends and commission totals are on the end-of-game results screen); (2) **properties** (no total beside the heading) as one list going down, by district: each row
  has the building's picture on the left and, on the right of it, what it is (the shop's look or
  the building), its district (a dot in the district's color, which also runs down the row's left
  edge), its rent (the fee a rival pays, struck through while closed) and its value; clicking a row finds it (from any info page): the pop-up steps aside, the board shows the
  whole map (auto zoom; when the player zooms, the view centers on that property) with every other
  tile greyed out and white rings spreading from it, and the action bar morphs into the property's
  name, its owner and a gold **Back to info** button, which brings the pop-up back (picking
  another page or closing the pop-up also ends it); (3) **shares** (the stock screen's table for this player: each district's name, price, the shares
  they hold and their value, districts with none dimmed, totals at the bottom).

**Turn moments.** Before the roll, sliding arrows on the board point from the player's square to
each square their first step can reach; they stay up until the player takes that first step. A token that stops part-way through a walk (a pop-up or a
choice on the way) stands still until it walks on. After a roll with only one way to go, the die
first shrinks to sit beside the player, then they start walking (with a choice of where to go, the
choice comes up straight away). Whenever a district's stock price moves, for any reason
(investments, stock deals, venture cards, value changes), the camera frames that district's
squares right away (mid-walk too: the walk pauses for it; an investment first shows the shop's own
value rising), a banner like the turn banner gives the old and new price, and arrows rise from the
squares (green, going up) or sink over them (red, going down). Property choices (e.g. selling
to pay a debt) are framed in the space the HUD leaves free, so none sit under the action bar. When a player comes to own a whole district
(a domination), once the action that caused it is over (a purchase, trade, auction...) the camera
frames the district, a banner says "Rosa dominates Downtown!", gold rings with sparkles burst from
each of its squares and a brassy fanfare plays. When the game is won, the camera closes in on the
winner, who dances under falling confetti and bursting fireworks to a grand (about 5 second)
victory fanfare, before the results appear.

**Camera.** The camera always follows the active player, centered on screen and zoomed in (250%:
1.65x the zoom that fits a 12 x 7 board on screen, 2.2x on small screens, so squares are the same
size on every board however big it is), eased smoothly as they move; it keeps the
player in the middle of the screen even at the board edge (grass continues past it). The mouse wheel, a pinch, or the - and + keys zoom out to show more of the map (a chip at
the start of the top-right toolbar shows the zoom: 250% fully in on the player, about 135% for the whole board, 100%
fully out (`ZOOM_MAX_OUT`), in 5% steps per wheel notch or key press (`ZOOM_STEP`); tapping it zooms back in);
from 250% to 200% the player stays centered, between 200% and 150% the camera moves from the player to the board's center (`ZOOM_BLEND`),
and from 150% down to 100% the board stays centered on the window (with the same margin on
both sides, so it never runs under the toolbar, player cards or action bar) with room to spare (`ZOOM_OUT_EXTRA`: 25% further out than fitting the screen). While a choice is open the
camera keeps the player centered and zooms out just enough to frame every glowing square around
them (if they are too spread out for that, it frames them all instead; never closer than the
player's own zoom). The game-over view shows the whole board.
**Smaller screens** (the same windows where the action bar moves to the bottom left, e.g. phones
in landscape): "centered" means centered between the left edge of the window and the left edge
of the player cards, for the followed player, the zoomed-out board and framed views alike, and
the zoomed-out board fits that space.
When almost every square is a choice (the Balloonport flying anywhere, the Taxi, the zoom
card), nothing is dimmed, lit or pinned: the player taps any square, and only the square under
the pointer glows (lighting the whole board hid it and could slow the game down).

**Zoom modes.** The camera is always in one of three modes, shown by the zoom chip's border:

- **Free zoom** (grey border): the player's own zoom. Only the player changes it; the game never does.
- **Auto zoom** (blue border): the game frames part of the board for the player (see "Views that
  wait on the player" below), and the player can still zoom in and out.
- **Locked zoom** (red border): the game is showing something (see "Shows" below) and only the
  game moves the zoom; the wheel, pinch, keys and the chip do nothing.

When the game is done with an auto or locked view, the camera goes back to free zoom by itself.
(`BoardView.zoomMode`; the chip's `data-mode`.)

**Automatic zoom.** Two kinds:

- _Shows_ play for a few seconds and go back by themselves: shops closing, a stock
  price move, finding a property from a player's info page, the winner's dance. They play on every
  screen, and the zoom is locked (wheel, pinch, keys and the chip do nothing) until they end.
- _Views that wait on the player_: the squares a roll can reach, a choice on the board, a trade.
  They play only on the screen of the player deciding. While another player (a CPU or someone on
  another device) chooses where to move, everyone else sees the squares they could land on glow
  where the camera already is; once they pick, the chosen route lights up and they walk it. The player can zoom them freely (the view keeps its
  center); when the choice ends (the player starts walking, picks, or the trade closes) the camera
  goes back to the zoom they had before, and the chip returns a view to its own zoom. The die and on-board pop-ups are
  drawn at screen size so they stay readable at any zoom. Taps on the board are converted through the
  camera so square picking works at any zoom.

Phone held sideways: the same overlays in compact form. Phone held upright: a "turn your phone
sideways" screen with a "Play upright anyway" option, which moves the cards into a 2-column block
under the action bar and frames the board in the gap above. Full screen uses the browser Fullscreen
API where available.

- **Scoreboard:** portrait; level chip and full name on the top row, with the wild count and four suit
  icons at its top right (they drop below a very long name; collected suits in their own color:
  spades blue, hearts pink, diamonds yellow, clubs green; missing ones faint grey; a full set hops
  until the player levels up); a player who has reached the target gets a pulsing golden glow on
  their net worth and portrait instead of a tag; an active Boon or Boom shows as its symbol after the name (the
  tooltip gives the commission); status tags (Closed, Fees +30%); a progress bar toward the target
  net worth in the player's color; along the bottom, cash on the left
  with a coin in front of it and net worth on the right with the player's place (1st, 2nd...) in
  front of it; no "Cash"/"Net" labels.
  Cards are 10% larger on computer screens.
- **Action bar:** the current prompt and its buttons. Enter or Space presses the main button.
- **Pop-ups with the action bar:** buy stock and sell stock (the market in the middle, the
  summary card and share counter in the bar), the venture grid and the arcade games.
- **Modals:** invest, venture grid, minigames, auction,
  debt, results. In hot-seat, prompts meant for another player show "Pass the device to...".

**Type and color.** Lilita One for headings and numbers, Atkinson Hyperlegible for body text,
Pixelify Sans only for pixel-themed labels. A dark navy UI shell around a bright daytime board.
Player colors: red, blue, green, purple, then orange for a fifth player; district colors are vivid and easy to tell apart.

## Sound and music

All audio is synthesized in the browser with the Web Audio API (`apps/client/src/audio.ts`); there
are no audio files. Browsers only allow sound after the player touches the page, so audio starts
on the first tap or key press (phones only count a finished tap, so the client listens for
`touchend`/`click` too, and keeps listening in case iOS interrupts audio later). On iPhone the
page asks for the "playback" audio session (or plays a silent looping clip on older iOS) so the
ring/silent switch does not mute the game; the in-game Mute switch still does.

- **Music:** looping chiptune tracks: a relaxed one for the main menu and board editor, a light,
  eager "getting ready" one for game setup and the online lobbies (joining, continuing a game), a
  bouncier one during games (a faster, urgent one once someone can win), a curious, twinkly one
  while the venture board is up, and one per arcade game: a casino jingle (Lucky Reels), a calm,
  sparse tune to think by (Memory Blocks), a galloping race theme (Coin Derby), a game-show tune
  (Lucky Wheel) and a sea shanty (Treasure Split). The board music comes back when they close.
  Every change of track cross-fades: the old song plays on while it fades out over 0.7 seconds
  as the new one fades in. The music stops for the winning fanfare at the end of a game.
- **Effects:** a domination fanfare, venture line and full-row jingles, button clicks, dice roll, each step (a soft tap as the token touches each square; the lift-off "hop" sound is switched off for now and kept in `audio.ts`), landing, gaining and paying money, buying a
  shop, buying stock (a short register click and "ching"), selling stock (two quick falling coin clinks into a soft "ching"), buying out a rival's property (a brass stab, a rising run and a cash-register ring), a shop's value going up, collecting a suit, promotion, venture cards, a card flipping over (a paper swish and a click), slot reels ticking as they spin and clunking as each stops, warps, the start of a
  human player's turn, a new round, bankruptcy and the win fanfare.
- **Settings:** Sound buttons on the main menu, setup and collection open a compact navy-glass
  Music & sound pop-up. The game toolbar order is zoom, Game log, Music, Menu (with View board
  first when offered). Music uses a note icon; phones keep just the icon with an accessible name.
  The pop-up shows the live current track title and scene, plus a subtle level animation only
  while audible. Muted, zero-volume, audio-not-started and no-track states are explicit. It has
  gold-filled Music and Effects sliders with percentages and a Mute all sound / Unmute sound
  button. Adjusting a slider unmutes audio; changing Effects previews a coin sound. Controls
  stay synchronized with the Sound section of the game menu, including while that menu is closed.
  The chip highlights while open. Close, Escape, a second chip click or clicking outside closes
  the pop-up; Close/Escape restores focus to its chip. It stays inside the viewport after resizing,
  scrolls internally on very short screens and supports keyboard/touch. Reduced motion disables
  the entrance and level animation. Settings remain saved per device; opening it does not pause
  gameplay. Audio pauses while the tab is hidden.

## Save and resume

The prototype saves a snapshot at the start of every turn, so a match can always be resumed from the
last turn boundary.

- **What is saved:** rules, target, round limit, round, turn index, turn order, stock factors,
  change-of-suit index, venture grid, the last 30 log lines, net worth history, every square's
  `[owner, value, building, circus tier, toll]`, and each player's persistent fields (identity,
  character, cash, level, suits, wilds, shares, position, `prev`, bankrupt, stats). Saves from
  before characters were picked get a different townsfolk character per player on load.
- **Not saved:** temporary effects (break, closed, boon, boost) because they reset at the start of
  the saved turn anyway; sprites and portraits, which are drawn from the character id.
- **Where:** browser localStorage. The main menu's Continue button resumes it (and is hidden
  when there is none). The save is deleted when a match ends.
- **Resume:** rebuild the board for the saved rule set, apply the square and player data, then start
  the main loop at the saved turn.

**For the GitHub build:** keep the same turn-boundary snapshot, but store it on the server per room
(database or Redis). It doubles as the reconnect mechanism and as a replay/debug log if every action
is also recorded.

## Online multiplayer

**Approach (built, Oct 2026): one player hosts in their browser.** No game server and no running
costs: the site stays on GitHub Pages, browsers connect directly to each other with WebRTC through
PeerJS (its free public server only introduces the browsers), and the host's browser is the
authority. Code: `apps/client/src/net/` (protocol, PeerJS wrapper, host and guest rooms) and
`apps/client/src/ui/online.ts` (screens).

**Rooms:** Play on the main menu opens game setup and a room with a 4-letter join code (letters
without I/L/O). Friends type the code in Join on the main menu, or open an invite link
(`?join=CODE`, which fills in the code). A joiner takes a free seat after the people already in (before the bots), or the
last bot's seat when all 5 are full, with their last name on this device (or a random one) and a random character nobody
has; the host can remove them. Joined players see the host's setup with every setting shown but
locked, and can change only their own name and character (the host refuses a character someone
has). Bots keep the characters shown for them, swapped for a free one if a player took it. A running game takes a
player back only under their player's name: a device that isn't recognised is asked for it in
the Join box.

**Lockstep play:** every device runs its own copy of the rules engine from the same starting
state. The engine only waits on decisions, so the host numbers each decision in order and
broadcasts every answer together with the RNG state after it; each copy then plays out the same
game and animates it locally (no state is streamed). The host answers CPU and its own seats,
waits for a guest's answer to that guest's decisions (and ignores answers from the wrong seat),
then broadcasts it. Guests answer their own seat and use the host's broadcast answer. A guest
copy that falls behind speeds up its animations to catch up.

**Staying in step:** at every turn start the host sends a hash of its state; a guest whose copy
differs asks to resync, and the host sends the state at the start of the current turn plus the
answers since, which the guest replays.

**Disconnects:** a guest who drops is played by a CPU until they come back; rejoining with the
same code on the same device (a per-device token) gives them their seat back and replays the
current turn. Guests retry the connection for about two minutes. If the host leaves, the game
ends for everyone; the host's device keeps the save, which also remembers the room code and who
played from which device. Continue on the host's main menu reopens the same room code (a new one
if it was taken) and shows who is back; friends rejoin with the code and the same name (or from
the same device), and the host resumes. Anyone not back yet is played by a CPU until they join. A game that was only ever played on
one device can go online the same way: Continue always reopens a room, every human seat starts on
the host's device, and a friend who joins (before the host resumes) with that player's exact name
takes the seat over, before or after the host resumes. Without a connection, such a game simply
continues on the device.

**Continue game screen.** It looks like game setup: the top bar (Back, "Continue Game", the code
chip that shares or copies the invite, Sound) and the players column in the bottom right corner
with a seat card per player. The board and settings can't be changed, so instead of the Board and
Game Settings panels there is one **Saved Game** panel in the middle of the room: "Saved in
round N" in its corner, the board's picture and name beside the settings that were chosen (Rule
Set, Winning Goal, Stocks, Vacant Plots, and a Round Limit for older saves that had one), then a
line on how friends rejoin and the **Resume Game** button. It scales with the window like setup. Each seat says who it is ("You · host", "On this device", "Back online", "Not back yet",
"Bot"); players who haven't rejoined are faded with a red "Away" badge, and the button reads
"Resume (N away)" until they are back.

**Coming back as a guest:** each device remembers the room and name it last joined (for 3 days,
cleared when that game ends). Reloading the page during a game rejoins straight away; on a later
visit the main menu shows "Rejoin online game". A guest who rejoins mid-turn replays the turn
without being asked again for decisions they already made.

**Not done yet:** turn timer (auctions have a bid timer), chat/emotes, a relay (TURN) server for networks that block direct
connections, and letting guests answer trades and auction bids while it is not their turn without
waiting for their copy to catch up.

## Feature interactions

Most systems meet in four shared quantities: cash, shop value, group ownership and stock price.

| System                 | Cash                                                                  | Shop value                | Ownership / groups                    | Stock price                        | Movement                     | Suits / promotion                      |
| ---------------------- | --------------------------------------------------------------------- | ------------------------- | ------------------------------------- | ---------------------------------- | ---------------------------- | -------------------------------------- |
| Buying shops           | Spent                                                                 |                           | +1 square; may expand or dominate     | Rises if expansion                 |                              |                                        |
| Fees                   | Moved payer to owner; dividends and commissions paid by bank          |                           |                                       |                                    |                              |                                        |
| Investing              | Spent                                                                 | Rises                     |                                       | Rises                              |                              | Raises next salary                     |
| Expansion / domination |                                                                       | Rises (10% / 30% of base) |                                       | Rises                              |                              | Raises next salary                     |
| Buyouts                | 5x paid, 3x to owner                                                  |                           | Transfers; expansion for buyer        | Rises if expansion                 |                              |                                        |
| Vacant plots           | Build cost; building fees                                             | 3-Star Shop only          | Counts toward district and domination | 3-Star Shop only                   | Balloon, Home move players   |                                        |
| Stocks                 | Spent or earned                                                       |                           |                                       | 10+ trades move factor             |                              |                                        |
| Suits and bank         | Salary                                                                |                           |                                       |                                    | Bank sets free direction     | Promotion                              |
| Venture cards          | Many                                                                  | Many                      | Forced buyout                         | Many                               | Roll again, zoom, +2 squares | Free suit, wild card, sudden promotion |
| Special squares        | Boon / Boom commission                                                |                           |                                       |                                    | Roll-on, cannon, portals     | Cannon collects suits                  |
| Arcade                 | Prizes                                                                | Memory Blocks +10% / -5%  |                                       | Via shop value; Reels gives shares |                              | Wild cards                             |
| Trades and auctions    | Moved between players                                                 |                           | Transfers; expansion for receivers    | Rises if expansion                 |                              |                                        |
| Breaks and closures    | Stops fees, tolls, dividends and commissions from the owner's squares |                           |                                       |                                    |                              |                                        |
| Debt                   | Raised by selling                                                     |                           | Squares released and auctioned        | Stock sales drop factor            |                              |                                        |

**Order-sensitive spots to keep in the rebuild:**

- Promotion is checked before the win check on a bank visit, so a salary can push a player over the
  target on the same visit.
- Fees are computed after any boost or closure, then dividends and commissions are paid on the fee
  actually paid.
- Expansion runs after ownership changes, so stock price and salary see the new values right away.
- Debt is settled only at the end of the active player's own turn.

## Balance constants

Every tunable number lives in one object; it is `packages/engine/src/constants.ts` so playtests can
tune it without touching rules code.

| Key                                       | Value                                                   | Used by                                      |
| ----------------------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| `startCash`                               | 2,000G                                                  | New players                                  |
| Target net worth                          | 5,000G default; 1,000-90,000G in 1,000G steps           | Win condition                                |
| `feeRate`                                 | 0.2                                                     | Shop fee                                     |
| `mult`                                    | [0, 1, 1.3, 1.6, 2.0] by squares owned in group         | Shop fee                                     |
| `domFee`, `domMax`                        | 1.4, 1.5                                                | Fee and max value when dominating            |
| `expand`, `expandDom`                     | 10%, 30% of base                                        | Expansion bonus                              |
| `investCap`                               | 999G per visit                                          | Investing                                    |
| Max value                                 | base x (1 + k) (x 1.5 dominated)                        | Investing                                    |
| `buyoutX`, `buyoutOwnerX`                 | 5x, 3x                                                  | Buyouts                                      |
| `salaryBase`, `salaryLevel`, `salaryShop` | 600, 250, 15%                                           | Promotion salary                             |
| `stockRate`                               | 0.04                                                    | Stock price                                  |
| `divDivisor`                              | 250                                                     | Dividend = fee x shares / 250                |
| `bigTrade`, `tradeUp`, `tradeDown`        | 10 shares, x 1.1, x 0.9                                 | Stock price factor (clamped 0.4 to 4)        |
| `maxBuy`                                  | 99 shares                                               | Per purchase                                 |
| `debtSale`                                | 75%                                                     | Bank price in debt; debt auction opening bid |
| `boon`, `boom`                            | 20%, 50%                                                | Commission                                   |
| `plotCost`, `star3Cost`, `renovate`       | 200G, 1,000G, +150G                                     | Vacant plots                                 |
| `toll0`, `tollStep`                       | 20G, +10G                                               | Checkpoint                                   |
| `circus`, `circusUp`                      | 100 / 500 / 1,000 / 2,000G; upgrades 300 / 600 / 1,200G | Circus                                       |
| `balloonFee`, `homeFee`                   | 150G, 60G x level                                       | Balloonport, Home                            |
| `taxRate`, `taxOwner`                     | 10%, 5% of net worth                                    | Tax Office                                   |
| Line bonus                                | 10G x length for 4-7, 200G for 8                        | Venture grid                                 |
| Arcade prizes                             | see Arcade minigames                                    | Arcade                                       |
| Auction step                              | 10% of value (min 10G)                                  | Auctions                                     |

**Playtest data from the prototype** (CPU-heavy automated matches, 5,000G target): Standard ended in
round 17 and Easy in round 19, with winners at level 3. The estimate is 25 to 40 minutes for 4 human
players; confirm with real playtests. Salary and target are the two main dials for match length.

## Build plan

Build the rules engine first and test it headlessly, then put the client on top, then the server;
each milestone ends with something playable.

1. **Repo and tooling.** Monorepo with `packages/engine`, `apps/client`, `apps/server`; TypeScript,
   Vite, Vitest, ESLint, Prettier; GitHub Actions running tests on every push. Commit the prototype
   HTML under `reference/` as the behavior reference.
   - Done when: CI is green on an empty test.
2. **Rules engine.** Port game state, board data, every formula and constant, and the turn flow as a
   state machine that emits "decision needed" requests and events instead of awaiting UI. Use a
   seeded RNG.
   - Done when: unit tests cover fees, expansion, max value, stock price, dividends, salary,
     promotion with wilds, line bonus, debt and bankruptcy, and a CPU-only simulation of 1,000
     matches finishes with no errors and logs average match length.
3. **Local client.** Phaser (or canvas) board renderer with the HD/pixel rules, HTML/CSS UI for the
   scoreboard, action bar and modals, hot-seat play against the local engine. Match the prototype's
   start screen and options.
   - Done when: a full hot-seat match plays end to end in the browser.
4. **Server and rooms.** Node + Socket.IO on Fly.io, room codes, seat claim, the engine running
   server-side, intents and events from Online multiplayer plan, CPUs for empty seats.
   - Done when: 4 browsers finish a match together and the client holds no authoritative state.
5. **Resilience.** Turn timer with safe defaults, reconnect with session tokens, snapshots per turn
   (and an action log for replays), rate limits and input validation.
   - Done when: killing a browser mid-turn and rejoining resumes the seat.
6. **Content and art.** Player characters done (townsfolk, 4 directions); HD
   tile art per board theme, sound and music, the results screen, a second board defined purely as
   data.
7. **Balance and polish.** Use the simulation from step 2 to tune salary, target and fees so
   4-player matches land at 30-45 minutes; add a smarter CPU tier; accessibility pass (keyboard,
   contrast, reduced motion).

## Open questions and known differences

These are deliberate simplifications or guesses in the prototype; decide each before or during the
rebuild.

**Differences from the original Fortune Street:**

- **Numbers are tuned, not copied.** Fee rates, salary (original is about 250 + 150 x level + 10% of
  shops), stock pricing, the buyout split and the dividend formula are approximations chosen for
  shorter matches.
- **Expansion** adds a flat share of base value; the original recalculates value, price and max
  capital from a table.
- **Easy rules** use computed rows; the original also limits rows by board design.
- **Debt sales** pay the seller 75% from the bank and then auction to the bank; check this matches
  the intended feel.
- **Venture deck** has 30 cards versus 128 in the original; the grid assigns cards randomly per
  panel.
- **Minigames** are original designs (Reels, Memory Blocks, Coin Derby), not copies of the original
  four.
- **Board gimmicks** not built: switch squares, lifts, one-way alleys, Boon/Boom stacking rules.
- **Bankruptcy limit** is fixed at 1; the original lets custom games choose 2 or last player
  standing.

**Open questions:**

- [ ] Should characters stay cosmetic, or get optional perks behind a lobby toggle?
- [ ] Keep a 4-seat maximum, or allow 2-6?
- [ ] Should off-turn players be able to sell stock at any time (more interactive) or only before
      their own roll (original)?
- [ ] Turn timer length, and whether it applies in private rooms with friends.
- [ ] Board size: keep 44 squares, or offer small and large boards with different targets?
- [x] Name for the game: **Adventure Avenue**. Currency name still open (currently "G").

### Game setup layout

See "Game setup options": a fixed top bar (Back, title, join code chip, Sound) over the board
selector and the game settings (scrolling only on small screens, no scroll bar), and the players
column in the bottom right corner, laid out like the player cards in the game. Joined guests see
the same screen with the host's board and settings locked and the same seat cards in the players
column, where they tap the Ready chip on their own seat.

### Warps and portals

Portal tiles are retired (boards turn them into portal links, see Custom boards); this section
still describes how they play in saved games. Warps (four-pointed stars) and portals (round
swirls) work the same way except for what sets them off:

- **A warp** sends a player who **stops** on it (passing over one does nothing).
- **A portal** sends a player who **steps** on it during a walk, including on the last step. The
  jump costs no step: they keep moving from where it leads with any steps left, in a free
  direction. Route choices include the jump; arriving on the exit portal doesn't jump again.

Each tile links to **one** place: another tile of the same kind (the two become a **pair**, both
ways) or **the bank** (one way; any number of warps and portals may lead to the bank). Arriving at
the bank counts as a visit: a passing visit if steps are left, a stop if not.

**Colors are automatic.** A new warp or portal is placed **grey and unlinked**. When it is linked
to a partner, the pair gets the first of five colors (purple, cyan, orange, pink, green) that no
other pair of its kind uses; tiles linked to the bank turn **gold**. So there are at most five
warp pairs and five portal pairs, plus any number of bank links. Every tile must be linked before
the board can be played.

**Linking in the builder.** Selecting one warp or portal shows where it leads in the tile info
panel (with a dot in its color) and Link / Change link and Unlink buttons. Link starts a board
picker (the action bar says to click a tile or the bank; Escape cancels): click another tile of
the same kind or the bank. A tile only ever has one link, so if the picked tile already had a
partner, that old partner becomes unlinked (grey). Unlink leaves both tiles of the pair unlinked.
Every change is one Undo step. With all five colors of a kind in use, a new pair is refused with
a hint to unlink one or link to the bank.

**The link line.** Only the selected tile shows its link: a gentle arc whose bend sits at the
middle of the line, at right angles to it (always on the upper side), drawn in the link's color
over a dark outline. Glowing dots with short tails travel along it toward the destination, which
pulses as each one arrives; the source has a small ring. Reduced motion shows the dots still.

Legacy backstreets in stored boards, files and saved games become portals; older boards that
stored mutual links without colors get colors automatically. Lagoon's odd warp leads to the bank.

Problem entries in Board settings and tile info share inset cards with 14px body text, 1.45 line
height, clear spacing, a colored side edge and a plain severity label (Needs fixing or Worth
checking). Tile-related settings entries are full-width buttons with a View tile position hint.
Click, Enter or Space closes settings, selects the first valid affected tile, centers the camera
on it and opens tile info. Board-wide entries remain readable, noninteractive cards. Tile info
uses the shorter tile-specific wording where available.

### Action-bar message pacing

The bar follows actual action phases: turn handoff, rolling, roll result, movement, teleport,
landing, payment, promotion, stock changes, minigames, auction bids/results, closing/reopening and game over. Starting a
new phase immediately discards messages queued for the previous phase; text never claims a
previous action is still happening. The last action stays during the end-turn pause; Passing the turn to [name] appears when the
camera glide begins. The first turn says [name]’s turn. CPU pre-roll does not insert
a fleeting deciding message before an automatic roll.

The die result appears as soon as it settles and remains for about one second while the token
stays still (Fast CPU scales this gameplay pause). For CPU rolls with a route choice, the
existing 1.1-second route preview supplies that beat; do not stack another die hold before it. The first walking step immediately shows moving.
Suit pickups and fees during movement overlay it for one second, regardless of repeated steps,
then return to moving. Same-action bursts use 0.8-second slots with at most six pending events;
the full history stays in the log. New actions supersede those overlays immediately. These text
reading slots are not Fast CPU-scaled. Identical current/pending text does not replay.

Generic waiting/deciding is a fallback, deferred for 1.2 seconds of quiet. Its quiet buffer and
an event’s one-second reading slot overlap rather than adding together. If another action starts
before that timer expires, the waiting message never appears. Actual player-choice prompts
remain immediate and discard stale announcements. Payment summaries announce once; detailed
log entries remain in history. Accepted trades announce before ownership/payment effects.

At normal speed the end-of-turn pause is 1 second, followed by a smooth 1.6-second camera glide
(previously about 0.6). The existing human/CPU introductory pauses remain 0.7/1.2 seconds, with
one additional second allowed for the glide on handoffs. The extra handoff does not apply to the
first turn or repeated turns by the same player. Fast CPU scales gameplay pacing as before;
reduced motion snaps the camera. Purchase/construction/buyout/renovation pre-payment pauses
are 0.5 seconds. Suit tiles skip the usual one-second landing pause and have no pickup pause;
visual effects still play immediately. Other decision delays stay unchanged.

The main menu is a single viewport with no page scrolling or overscroll. Keep top-corner Sound
and Menu and the version chip reachable. The title always sits above the actions; on short screens
(phones in landscape) it shrinks and the tagline is hidden. Fit the complete center group to the
available height when necessary, including Continue and the optional join-name field. Menu pop-ups
and their content retain their own scrolling behavior.

### Layered PNG board art

All static tile artwork uses PNG sprites: property tiers, special icons, suit icons, transport,
vacant land, square/hex shells and district borders, ownership flags, selection outlines, closed
shop shutters, scenery, roads and grass. Buildings and transport accents use explicit base/tint
layers; fixed-color artwork needs only a base. Change-of-suit combines a PNG ring with the
current suit PNG. Prices, labels, initials, highlights and movement remain driven by game state.
Existing paired Checkpoint/Circus/Motel artwork and all old art files are preserved. `ART_SET` in
`props.ts` selects the layered set or the classic assets and vector fallbacks. The UI Lab can
inspect bases, masks and recolored composites.

The warp icon is a beveled four-point crystal above a small ivory/gold socket. Side portals
use a fixed jeweled frame and two separate animated vortex PNG layers. `assets/transport-v13/`
contains aligned base/tint pairs for these four components. Matching link colors, bank gold and
unlinked grey are preserved. `TRANSPORT_SET = previous` restores the earlier artwork; all prior
files and tap/hover behavior remain available. Price Up, Taxi and Swap also have base-only PNG icons.

### Painted property buildings

All nineteen property/bank designs now use new toy-town PNG art matching the special-tile set:
five regular shops, three 3-Star Shops, four Circus tiers, Checkpoint, Balloonport, Tax Office,
Home, Estate Agency, Motel and Bank. The eighteen ownable designs have aligned transparent
base and grey tint layers; the fixed-color Bank has a base only. Artwork grows in scale and
grandeur across shop and Circus tiers. Ownership colors and all game rules remain unchanged.
Old PNGs and the earlier layered set remain intact. `PROPERTY_SET = 'previous'` restores the
previous property art independently of other board sprites; `ART_SET = 'classic'` restores the
original complete board artwork.

Every tile picture is sized by its visible drawing, not by its image frame (frames carry different
amounts of empty space), so all pictures stand on the same base line at matching sizes and stay
clear of the tile's border. Hex tiles narrow toward their top point, so their pictures are drawn
at 90% of the square size.
