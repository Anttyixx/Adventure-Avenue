# Design guide: how UI elements look, feel and are built

This is the visual language of Adventure Avenue: the colors, type, surfaces, buttons, motion and
board art every element is made from, and recipes for building new ones so they match. Follow
it for every UI change. Where an element already exists, copy its pattern rather than inventing
a new one. Where this guide and the code disagree, the code in `style.css` is what players see:
fix whichever is wrong (and ask the owner if unsure).

Where things live: tokens and all CSS in `apps/client/src/style.css`; elements are built in
TypeScript with `h()` (`ui/dom.ts`); the board is drawn on a canvas in `board.ts`.

## 1. The look in one paragraph

A bright, cheerful toy town (green grass, cream tiles, pixel-art townsfolk, painted buildings)
under a layer of **dark navy "glass"** interface panels that float over it. The interface is
calm, rounded and compact; color comes from the **players** (each owns a color), the
**districts** (each a vivid hue) and **gold** (money, the main action, winning). Motion is short,
springy and purposeful: things morph from where they were, pop in from the middle, and glow or
pulse only when they need attention. Everything stays readable on a landscape phone.

## 2. Principles

1. **The board is the star.** Interface panels are dark, translucent and compact so the colorful
   board shows through and around them. Don't cover the board with big opaque panels; pop-ups
   dim it instead of hiding it.
2. **Color means something.** A player's color always means that player; a district's color
   always means that district; gold means money or "the thing to press"; green/red mean gain/loss.
   Never use these colors decoratively for something else.
3. **Morph, don't swap.** When one element becomes another (Stock market button → market panel,
   Game log button → game log, status line ↔ options), animate its size from the old to the new
   instead of hiding one and showing the other.
4. **One glance.** Numbers are big and bold, labels small and muted. A card or row should be
   understood without reading every word.
5. **Attention is earned.** Pulsing, glowing, shaking and bouncing are reserved for "your turn",
   "press this", "you can win" and "this just changed". Everything else is still.
6. **Works everywhere.** Desktop and landscape phones (portrait shows a rotate screen), mouse and
   touch, with reduced motion respected.

## 3. Color

### Tokens (`:root` in `style.css`)

| Token          | Value                       | Use                                                                |
| -------------- | --------------------------- | ------------------------------------------------------------------ |
| `--navy`       | `#101a33`                   | Page background behind everything                                  |
| `--navy-2`     | `#18244a`                   | Slightly raised dark surfaces                                      |
| `--glass`      | `rgba(16, 26, 51, 0.82)`    | Floating HUD panels (with a blur behind)                           |
| `--glass-line` | `rgba(255, 255, 255, 0.12)` | 1px borders on glass, ghost buttons, inputs, dividers              |
| `--text`       | `#eef2ff`                   | Main text on dark                                                  |
| `--muted`      | `#a9b4d6`                   | Labels, captions, secondary text, section headings                 |
| `--accent`     | `#ffd166`                   | Gold: highlights, focus outlines, selected tabs, important numbers |
| `--good`       | `#7cf29a`                   | Money gained, rises, positive deltas                               |
| `--bad`        | `#ff8a8a`                   | Money lost, falls, negative values (`.neg`)                        |
| `--radius`     | `14px`                      | Radius of glass panels                                             |

Use the tokens, not new literal colors, for anything on the dark interface. New tokens go in
`:root` with the others.

### Surfaces on dark (by depth)

| Surface        | Value                                                                              | Where                                                       |
| -------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Glass panel    | `var(--glass)` + `--glass-line` border + `blur(8px)` + `0 8px 28px rgba(0,0,0,.3)` | HUD panels (`.glass`)                                       |
| Pop-up / modal | `rgba(16, 26, 51, 0.96-0.97)`                                                      | Dialogs, player overview, guide (more opaque for reading)   |
| Inset box      | `rgba(255, 255, 255, 0.05)` to `0.08`                                              | Fact boxes, tooltip stat boxes, property cards, table cells |
| Input          | `rgba(255, 255, 255, 0.08)` + `--glass-line` border                                | Text and number fields                                      |
| Backdrop dim   | `rgba(5, 10, 25, 0.45)`                                                            | Behind modals                                               |

Lighter = closer. Don't put a solid bright fill behind text on the HUD; use an inset box.

### Players

`PLAYER_COLORS` in `packages/engine/src/setup.ts`: red `#e5484d`, blue `#3e7bfa`, green
`#30a46c`, purple `#a855f7`, orange `#f76b15`. In CSS a player's color is passed as the custom
property **`--pc`** on the element (`style: '--pc:' + color`), and children use `var(--pc)`:

- a 3-5px edge or top border on that player's card or pop-up (`border-top: 5px solid var(--pc)`);
- their progress bar fill, their glow (`box-shadow: 0 0 16px 3px var(--pc)`);
- dots (`.dot`) before their name, chips with their name;
- on the board: tiles they own are filled with a light tint of their color.

Names in log text are colored by `namesInColor` (`ui/log.ts`); reuse it for text that names
players.

### Districts

Each district has its own vivid color (set per board in `boards/maps.ts`, e.g. `#ff4d4d`,
`#2f9bff`, `#2ecc71`, `#ffc21a`, `#9b5cff`, `#13c4b4`, `#ff4fa8`, `#ff8a1f`). Passed as
**`--dc`**. Shown as a 6px tile border on the board, a small rounded **swatch** (`.swatch`, 12px,
radius 3px) or dot beside the district name, and a colored top edge on property cards.

### Suits, money and status

- Suits: spade blue `#4c8dff`, heart pink `#ff5fa2`, diamond yellow `#ffc83d`, club green
  `#35c46a` (`SUIT_COLORS` in `icons.ts`), drawn as smooth vector icons; uncollected suits are
  grey.
- Money is gold. Every amount is written `fmt(n)` → "1,200G", and `coins.ts` turns the "G" into a
  little gold coin (`.gc`) automatically. Don't draw coins by hand in HTML; on the canvas use
  `fillMoney` / `drawCoin`.
- Gains `--good`, losses `--bad`, with a sign: "+120G" / "-50G".
- Ranks: 1st gold gradient, 2nd silver, 3rd bronze (`.rank.r1/.r2/.r3`), white 2px outline.

### Charts

Data colors are fixed per series and validated for color-blind readers: net worth parts are cash
`#3987e5`, properties `#d95926`, stock `#199e70` (`PARTS` in `ui/overview.ts`). Players in charts
use their player color. Legends always accompany 2+ series; gaps of 2px separate segments; text
stays in `--text`/`--muted`, never in the series color.

## 4. Typography

Two fonts from Google Fonts (`index.html`):

| Font                                          | Variable | Use                                                                                                                                 |
| --------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Lilita One** (rounded, chunky display)      | `--head` | Buttons, titles, names, big numbers (cash, net worth, prices), banners, badges; on the canvas: name plates, floating money, the die |
| **Atkinson Hyperlegible** (very legible sans) | `--body` | Everything else: sentences, labels, tables, the log; on the canvas: tile labels (700 weight)                                        |

Lilita One has one weight: never set `font-weight: 700` on it (use `font-weight: 400`). Make
Lilita text stand out with size and color instead.

**Size scale** (px; most UI text is 11-16):

| Size          | Use                                                                                     |
| ------------- | --------------------------------------------------------------------------------------- |
| 10-11         | Tags, pill badges, tiny captions, rank badges                                           |
| 12            | Section headings (UPPERCASE, `letter-spacing: 0.06em`, `--muted`), table headers, notes |
| 13            | Secondary text, small buttons (`.btn.small`), hints (`.hint`)                           |
| 14-15         | Body text in pop-ups, the status line, list rows                                        |
| 16            | Default button text, action bar questions, pop-up headings                              |
| 18-24         | Big numbers on cards, sub-titles, `.btn.big` (22)                                       |
| 26-30         | Banners (26), pop-up titles and hero numbers                                            |
| clamp(44-100) | Only the main menu logo                                                                 |

Section headings inside pop-ups are small uppercase muted labels (e.g. "NET WORTH BREAKDOWN"),
not big titles. Numbers that matter are the biggest thing in their box. Long names truncate with
an ellipsis rather than wrapping a card out of shape. Line height 1.3-1.45 for paragraphs.

## 5. Shape, borders and shadows

**Radius scale:**

| Radius            | Use                                                                      |
| ----------------- | ------------------------------------------------------------------------ |
| `999px`           | Pills: chips, tags, banners, status pills, the zoom chip, segmented tabs |
| `50%`             | Dots, coins, round icon buttons                                          |
| 3px               | Swatches, progress bars                                                  |
| 6-8px             | Inset boxes, inputs, table cells, small cards                            |
| 10px              | Buttons, property cards, list items                                      |
| 12px              | Player cards, larger cards                                               |
| 14px (`--radius`) | Glass panels, modals, pop-ups                                            |
| 16-18px           | Main menu buttons, big menu panels                                       |

**Borders:** 1px `--glass-line` around glass and ghost elements. Color carries meaning through
thicker single-side borders (3-6px in `--pc` or `--dc`), not full colored outlines. Selected
items get an inset ring (`box-shadow: inset 0 0 0 2px ...`) so their size doesn't change.

**Shadows:** soft and dark, offset down: `0 8px 28px rgba(0,0,0,.3)` for floating panels,
`0 8px 24px rgba(0,0,0,.35)` for banners, `0 20px 60px rgba(0,0,0,.5)` for the biggest pop-ups.
"Physical" buttons on the main menu use a solid colored edge below (`0 6px 0 var(--edge)`) that
shrinks when pressed. Glows use the element's meaning color (`--pc`, gold) with blur.

## 6. Building blocks

### Buttons (`.btn`)

All buttons: Lilita One 16px, radius 10px, padding `9px 16px`, no border, press feedback
`translateY(1px) scale(0.98)`, hover a shade lighter, disabled `opacity: 0.4`.

| Variant           | Look                                                         | Use                                                                |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `.btn`            | Navy-blue `#2c3a6b`, hover `#3a4b86`                         | Ordinary options                                                   |
| `.btn.main`       | Gold gradient `#ffd166 → #f5b301`, dark brown text `#3b2a00` | **The** main action; at most one per group; Enter/Space presses it |
| `.btn.main.nudge` | Main + a small hop every few seconds                         | The action the player is expected to take now (e.g. Roll)          |
| `.btn.ghost`      | Transparent with a `--glass-line` border                     | Secondary: Cancel, Skip, Not now, Close                            |
| `.btn.no`         | Red gradient, white text                                     | A strong "no" where saying no matters (turning down a buyout)      |
| `.btn.danger`     | Dark red `#6b2a3a`                                           | Destructive: Quit game                                             |
| `.btn.small`      | `6px 10px`, 13px                                             | Toolbars, headers, compact rows                                    |
| `.btn.big`        | 22px, `12px 28px`                                            | Single hero actions on full screens                                |
| `.btn.on`         | Filled with `--pc`                                           | Toggled-on state                                                   |
| `.btn.pic`        | Picture above a short name and a small price                 | Choosing among things with art (buildings)                         |

Order: the main action on the right end of a row (or top of a stack), secondary actions after or
below it. Labels are short verbs ("Buy", "Upgrade", "Not now"). Every pop-up's close button is a
text button **"Close"** (`btn small ghost`) in its top-right corner, never a bare ✕.

### Pills, chips and tags

- **Pill** (radius 999px): banners, the zoom chip, status line, "Shops closed"-style tags.
- **Tag** (`.tag`): 10px text, `1px 6px`, gold text on `rgba(255,209,102,.2)`; bad states use red
  on a red tint.
- **Chips** in the log and trades show a player or property: small, rounded, with a color edge
  (`border-left: 4px solid var(--dc)`) or the player's color.
- **Segmented tabs** (`.seg` / `.seg-btn`): pill buttons with a `--glass-line` border; the selected
  one is filled gold with dark text and bold. Used for game setup options and the Guide's tabs.

### Inset boxes, facts and tables

- **Fact boxes** (tooltip `.tt-box`, overview `.pv-fact`): inset box, small muted label, value in
  bold/Lilita, often in a 2-column grid to stay compact.
- **Fact strips** in the action bar: `question(text, [[label, value, 'big'?], ...])` from
  `ui/pick.ts`; use it instead of building ad-hoc rows.
- **Tables** reuse the stock screen's `.m-grid` classes: separated cells (`border-spacing:
3px 2px`), district swatch + name on the left, numbers right-aligned in Lilita, a player's
  column headed by their portrait, rows with nothing dimmed to 0.5 opacity, totals in a plain row
  at the bottom.

### Progress

Thin (5px) rounded track `rgba(255,255,255,.12)` with a fill in `--pc` (net worth toward the
goal). No percentages printed on bars; the number sits beside them.

### Icons and art

- **Pixel art** (characters from `sprites.ts`, building art from `props.ts`) is always drawn with
  `image-rendering: pixelated` at whole-number scales, never smoothed or blurred. Portraits show
  the whole body (`bodyURL`) or the upper body (`portraitURL`).
- **Vector icons** (suits, coins, boon/boom, wild card in `icons.ts`) stay smooth and crisp at any
  size; they are generated as data URLs from canvas drawings, not emoji.
- Buildings and shops use the painted art with the owner's color applied (grey when unowned),
  via `propIconURL` / `propertyIconURL`; use those for any picture of a property in the UI.
- Don't use emoji as icons in the game UI (the "? Guide" and "☰ Menu" toolbar labels are plain
  text glyphs).

### Inputs

Dark inset fields (`rgba(255,255,255,.08)`, `--glass-line` border, radius 8px). Number entry for
money and shares uses the **digit picker** (`ui/digits.ts`, up/down arrows per digit, min/max
buttons), not a slider or free text. Range sliders use `accent-color: var(--accent)`.

## 7. Element recipes

How each kind of element is put together. Copy the nearest existing one.

### HUD panel (glass)

`h('div', { class: 'xxx glass' })` absolutely placed in a screen corner with a 10px margin.
Compact; content sized to fit. Clickable panels are `role="button"`, `tabindex="0"`, have a
gold `:focus-visible` outline (`2px solid var(--accent)`, offset 2px), and **morph** into their
expanded form (see Motion). Panels report the room they cover through `hud.updateInsets()` so
the camera keeps squares out from under them.

### Action bar prompt

Built with `hud.prompt(text | node, buttons, color)`: a centered pill-ish glass bar at the bottom.
The question on the left (a player-color dot first, then the text or a `question()` fact strip),
buttons on the right with the main one gold. Rich content may make it taller (up to 75%), never
wider than needed. Choices that are squares glow on the board instead of being listed as
buttons; the bar then only explains what to do ("Tap a glowing square to move there").

### Pop-up (centered dialog)

For anything read or decided in the middle of the screen (Guide, player overview, menu, stock
screen):

- A layer over the whole screen that dims the board (`rgba(5,10,25,.45)`); clicking the dim
  area, pressing Escape or "Close" closes it.
- The box: `rgba(16,26,51,.96)`, `--glass-line` border, radius 14px, padding 16px, big shadow;
  width `min(460 / 760 / 980px, 100%)` by content; `max-height` within the screen, scrolling
  inside its body (headers and the Close button stay put).
- Title in Lilita (`.modal-head h2`) with Close on the right; a player's pop-up has a 5px top
  border in their color.
- Opening pops in (scale 0.92 → 1, fade); closing shrinks and fades faster.
- Use `hud.modal(title, body, { wide, onClose })` for ordinary dialogs.
- On phones keep at least ~22px between the pop-up and the screen edge.

### Cards (player cards, property cards)

- **Player card** (`.pcard`): glass card, 12px radius, a colored left edge in `--pc`, the
  character's whole sprite on the left (pixelated, no fade), name in Lilita + level badge + suit
  icons on top, a progress bar, then cash (bottom-left, with coin) and net worth with rank badge
  (bottom-right). The active player's card breathes a `--pc` glow (on an `::after` layer so only
  opacity animates). Changes pop out beside it ("+120G" in green, "-50G" in red, `money-pop`).
  Reaching the goal makes the net worth and portrait pulse gold.
- **Property card** (`.pv-card`): small inset card, the district color as a top edge, the
  building picture, the rent big in Lilita, the value small and muted under it; `role="button"`
  when clicking it does something.

### Banner

`hud.banner(text, color, ms)`: a pill near the top center, Lilita 26px, glass fill, 3px border in
the meaning color (player or district color, gold by default). Rises in (`rise`), fades up and
out. One short sentence: "Rosa's turn", "Round 5", "Bay Market stock up! 12G → 14G".

### Tooltip

Glass box near the pointer that stays on screen, with a 5px top border in the district's color:
owner pill in their color with portrait, then
a 2-column grid of stat boxes (label small and muted, value bold). Short plain lines for what a
square does.

### Status line and log

The status line is the action bar when no options are up: one line, an icon for the kind of
event, names in their colors, ellipsis when long. "Waiting" shows three dots lighting in turn.
The log groups lines into one card per turn, newest at the bottom like a chat, with players
involved shown as chips.

### Tabs

`.seg` row of `.seg-btn` pills at the top of the content; the active one gold. Every tab's page
keeps the same height (scroll inside) so switching doesn't make the pop-up jump. Remember the last
tab where it helps (the Guide does).

## 8. Motion

Motion is quick and springy, and always tells the player where something came from.

**Durations:**

| What                                                 | Time                                     |
| ---------------------------------------------------- | ---------------------------------------- |
| Hover/press feedback                                 | 0.08-0.15s                               |
| Fade in a layer, modal entrance                      | 0.2-0.22s                                |
| Morph between sizes: market panel, game log          | 260-280ms                                |
| Morph of the action bar (slow and gentle)            | 740ms                                    |
| New action bar message revealed (typing-style sweep) | 220ms                                    |
| Pop-up open / close                                  | 220ms / 160ms                            |
| Banner rise / fade                                   | 0.35s / 0.45s                            |
| Money pop beside a card                              | 2.2s                                     |
| Breathing glow, pulses                               | 1.1-2.6s loops                           |
| Game pacing (walks, coins, pauses)                   | `timing.ts` (`TIMING`), never hard-coded |

**Easing:**

- Morphs and panels: `cubic-bezier(0.2, 0.8, 0.2, 1)` (fast start, gentle settle).
- Things appearing with a little bounce: `cubic-bezier(0.3, 0.8, 0.4, 1.15)` (action bar) or
  `cubic-bezier(0.2, 0.9, 0.3, 1.2)` (pop-ups).
- Closing / leaving: `ease-in`, shorter than opening.
- Loops: `ease-in-out`.

**Patterns:**

- **Morph:** measure the old size, change the content, measure the new size, then
  `el.animate([{width, height: old}, {width, height: new}], {duration, easing})` with
  `overflow: hidden` during it (see `toggleMarket`, `toggleLog`). The action bar
  (`Hud.morphAsk`) also wraps its content in `.ask-content` laid out at the final size for the
  whole morph, so text never reflows or jumps while the bar grows or shrinks.
- **Reveal sweep:** a new action bar message is uncovered left to right in steps (a
  `clip-path` inset animated with `steps(16)`, `Hud.revealAskText`), like quick typing; the
  whole text is in place from the start, so nothing moves and buttons work at once.
- **Pop:** `transform: scale(0.92) → none` with opacity (see `Hud.popOverview`).
- **Rise:** new content slides up 10px and fades in (`.rise`).
- **Nudge:** the expected action hops once every ~2.6s (`.nudge`).
- **Breathe:** a glow layer's opacity cycles (never animate a box-shadow on the element itself;
  put it on `::after` so the content isn't repainted).
- **Attention shake:** two quick shakes, then still (UI Lab `RECENT`).
- Animate `transform` and `opacity` where possible; size morphs are the exception and are short.

**Reduced motion:** every looping or decorative animation gets a
`@media (prefers-reduced-motion: reduce)` rule turning it off, and JavaScript animations check
`matchMedia('(prefers-reduced-motion: reduce)')` (canvas code uses `reducedMotion()`) and jump
straight to the end state.

## 9. The board (canvas)

The board is drawn in `board.ts` in its own style: bright and physical, unlike the dark HUD.

- **World:** green grass (`GRASS #92d268`, a seamless texture) everywhere, trees, flower beds,
  ponds; roads join neighboring tiles. `paintGrass` fills the visible camera area in world
  coordinates, so the background scales with tiles and never exposes an edge. Games and the
  editor draw it separately below transparent board caches (`paintBoard(..., false)`); do not
  bake grass into those caches, which would introduce texture seams at their boundaries.
- **Builder tool bar:** a glass panel centered vertically 10px from the left edge. Stack three
  44px icon buttons (Select, Place, Erase), drawn as simple 24px line SVGs; Place is a pencil. The active tool
  uses gold with a contrasting inset outline; tool names appear to the right on hover or keyboard
  focus. Accessible button names and bottom-bar instructions cover touch use. Only Place shows
  the right-hand tile pane. Keep its Tiles title fixed above the scrolling list. Group the
  two-column tile art into Properties, Suits, Specials and Transport. Tile buttons are transparent,
  borderless and have no captions or card surfaces. Enlarge/crop the art to fill the column width
  instead of leaving large transparent margins. Use a gold glow for selection, with no corner
  checkmark or tile-name tooltip. Keep accessible labels, focus outlines and list scrolling. The only property option is Property; there are no Shop/Vacant plot
  choices or per-tile vacancy checkboxes. Preview properties with the game painter and plots disabled. Board settings is a small ghost button in the top-left info bar.
  Select draws a translucent gold drag rectangle and dashed gold tile outlines. Its Move and
  Erase actions live in the bottom bar. While moving, hide the canvas cursor, show only source
  outlines at the old cells and draw the group at its snapped destination with gold outlines
  (red if outside the grid). Anchor the preview at the selection center. Keep a Cancel action
  visible; Escape also cancels.
- **Property district colors:** center a horizontal row on the action bar. Use ten distinct
  default district colors, 40px rounded-square buttons (34px on landscape phones), 8px/6px gaps,
  and a white outline plus dark check for selection. Accessible names and hover titles include
  the district name and property count. Keep the row's button nodes across inspector redraws,
  retaining keyboard focus. Full districts shrink to 25% and fade over 160ms; then the remaining
  buttons translate to their newly centered positions over 220ms. Cancel departure when Undo
  restores capacity. Reduced motion removes and lays out immediately.
- **Builder hover:** tint the hovered cell lightly and trace a 6px dark outer/3px bright inner
  outline in screen units. Use gold for ordinary tools and red for Erase; keep the strokes
  consistent across zoom and on square/hex grids.
- **Builder tile options:** a nonmodal glass panel at the top right, with the tile name as its title, a muted position subtitle and Close
  button. Separate the header with a subtle divider; show property district as a labeled field
  and starting value as a label/value row, with the settings hint below. Show only for one selected tile, never during a group move. Keep it above the bottom
  bar and scroll its body on phones. Show district and a read-only starting
  value for properties; the bank explains that it can move but cannot be erased.
- **District starting values:** each district card in Board settings groups its name/color,
  Starting average digit picker, Default/Custom hint and Reset button. Use the compact shared
  digit picker; keep Reset beside it so it remains reachable on landscape phones. Disable Reset
  while the district already follows its default. Show property counts as n/4, marking incomplete
  districts in the error color. Hide Erase for any selection containing the bank.
- **Builder action bar:** center on the full window using a 50% anchor and horizontal translation,
  independent of the right pane. Size to the text and controls up to window margins. No controls
  means the compact status style (no minimum prompt height); choices expand it. Keep the existing
  shell morph, but measure its content at the final width/height and hold both for the whole
  resize. Its fixed content must have no `max-width: 100%` clamp from the animated shell.
  Builder text uses the same 220ms, 16-step clip-path reveal as the game, without moving or
  changing its layout. Newly shown options use a smooth 220ms opacity/4px settle.
  Release old locks before retargeting; reduced motion uses natural layout immediately.
- **Builder:** hide decorative scenery (trees, ponds and flower beds) while editing; keep
  grass, roads and playable tiles. Games and test play show scenery as usual.
- **Tiles** (86 units on a 100-unit grid): cream `#fdfbf5` (bank `#fff6d6`), rounded (radius 12),
  a soft shadow offset down-right (`rgba(0,0,0,.18)`, +2/+5). Owned tiles are filled with a tint
  of the owner's color; property tiles have a 6px border in the district color. Vacant plots are a
  dashed grey outline with "VACANT".
- **Tile text:** Atkinson Hyperlegible 700, dark navy `#26314f` (darker `#1b2340` on owner
  tints), 11-16 units; amounts with the coin via `fillMoney`. Special squares show an icon and a
  small uppercase label.
- **Buildings** use the painted art (pixel-ish, colored parts in the owner's color, grey when
  unowned); shops change design as their value grows.
- **Characters:** pixel sprites at whole-number scales with a sprite-shaped shadow; a name plate
  (Lilita, white text on a pill in the player's color with a thin white outline) above the head; the active player is bigger with a bobbing arrow.
- **Choices:** every other tile dims (`rgba(12,18,36,.45)`); choice tiles get a tint of the
  chooser's color, a pulsing white outline glowing in that color, white rings spreading out and
  fading, and bouncing pins. Hovering a destination draws the route.
- **Focus/greying:** squares that don't matter right now are greyed with `rgba(70,74,84,.72)`
  (player overview, finding a property).
- **Effects:** gold ring + sparkles when something is bought or grows (`ring`), coins flying
  between payer and payee, floating "+120G" (green) / "-50G" (red) in Lilita with a dark outline,
  rising green arrows / sinking red arrows for stock moves, gates rolling down on closed shops.
- **Readability at any zoom:** the die, pop-up text and name plates are drawn at screen size.

## 10. Layout habits (light touch)

- HUD hugs the corners with 10px margins; the board stays centered on the whole screen.
- Content-sized panels (`width: fit-content`, `max-width` caps) rather than fixed widths.
- Phones are landscape; test 844×390. Common breakpoints: `max-width: 760px`,
  `max-height: 500px`; give pop-ups more edge room and shrink fonts one step there.
- Scrolling panels hide their scrollbars but still scroll; scroll inside the panel, never the page.
- Compact by default: two-column fact grids, tables with tight spacing, numbers aligned right.

## 11. Interaction and accessibility

- Anything clickable that isn't a `<button>` gets `role="button"`, `tabindex="0"`, and handles
  Enter/Space. Pop-ups are `role="dialog"` with an `aria-label`.
- Visible focus: `outline: 2px solid var(--accent); outline-offset: 2px` on `:focus-visible`.
- Escape closes the top pop-up; Enter/Space presses the main button.
- Hover is a bonus, never required: everything shown on hover must also be reachable by tap
  (touch screens use `@media (hover: none)` where needed).
- Color is never the only signal: pair it with text, an icon, a sign (+/-) or position.
- Text contrast: light text on navy; dark text (`#3b2a00`, `#1b2340`) on gold and light tints.

## 12. Writing on screen

Short, plain and friendly; sentence case; no jargon. Money "1,200G". Tell players what they can
do ("Tap a glowing square to move there"), name the player ("Rosa is buying stocks..."), and
explain refusals in the log ("Kai can't afford the 300G circus upgrade.").

## 13. Checklist for a new or changed element

- [ ] Built with `h()`; styles in `style.css` under a commented group, using the tokens.
- [ ] Surface, radius, border and shadow match its kind (HUD glass / pop-up / inset / card).
- [ ] Lilita One for titles, buttons and key numbers; Atkinson for the rest; sizes on the scale.
- [ ] Player color via `--pc`, district color via `--dc`; gold only for money and the main action.
- [ ] Money via `fmt()`; gains green with "+", losses red with "-".
- [ ] One gold main button at most; Close is a "Close" ghost button top right.
- [ ] Opens/expands with the right motion (morph, pop, rise); reduced motion handled.
- [ ] Pixel art pixelated; no emoji icons.
- [ ] Keyboard and touch work; focus is visible; Escape closes pop-ups.
- [ ] Checked on desktop and a landscape phone; nothing cut off or overflowing.
- [ ] UI Lab control added and listed in `RECENT`.

### Transport tile art and options

Draw Warp as a four-pointed star with a bright center in its pair color. Portal uses a circular
colored glow with white swirl arcs. Both use the shared five transport colors (purple, cyan,
orange, pink, green). The selected tile panel labels warp slots as Pair; portals show Color and
Destination (Matching portal or Bank). Disable full slots and explain missing partners below.
