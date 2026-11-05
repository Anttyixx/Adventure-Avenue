# Design guide: how Adventure Avenue's interface is designed and built

This guide is how the game's interface is designed: the look, **how to make design decisions**,
and a spec for **every element** (info chip, toolbar, action bar, side panels, pop-ups, cards,
board overlays and more), with code examples. The owner reviewed and approved this style; follow
it for every UI change, by any assistant.

How to use it:

1. Read **§1 The look** and **§2 How to make design decisions** before designing anything.
2. Find the element you are building in **§5 Screen elements** and follow its spec. If it is new,
   pick the closest existing element and adapt it; don't invent a new style.
3. Build it from the **§4 Components** and **§3 Foundations** (tokens, type, spacing).
4. Go through the **§12 Checklist**, then look at it in a browser on desktop and a landscape
   phone (844 × 390) before calling it done.

Where things live: CSS (all of it, one file) in `apps/client/src/style.css`, grouped by feature
with a comment heading each group; elements are built in TypeScript with `h()` from `ui/dom.ts`;
the board and anything on it is drawn on a canvas in `board.ts`. When this guide and the code
disagree, the code is what players see: fix whichever is wrong, and ask the owner if unsure. When
a change sets a new pattern, add it here in the same commit.

---

## 1. The look

A bright, cheerful **toy town** (green grass, cream tiles, pixel-art townsfolk, painted buildings)
under a layer of **dark navy glass** panels that float over it. The interface is calm, rounded and
compact. Color comes from meaning: **players** (each owns a color), **districts** (each a vivid
hue), **gold** (money, the main action, winning, "selected"). Motion is short and springy: things
grow from where they were, pop in from the middle, and glow or pulse only when they need attention.

The feel to aim for: _a polished mobile board game_. Chunky friendly headings, very readable small
text, generous but not wasteful spacing, every control obviously tappable, nothing that looks like
a default browser widget.

---

## 2. How to make design decisions

### 2.1 The process (do these in order)

1. **Name the job.** One sentence: _what does the player need to see or do here, and when?_
   ("While building, pick a district's starting price." / "Before rolling, choose to sell stock.")
2. **Pick the container** from the table in §2.2: where on screen does this live? This is the
   most important choice; most bad designs are the right content in the wrong container.
3. **Pick the controls** from the table in §2.3: what is the simplest control for this input?
4. **Set the hierarchy**: what is the one thing the eye should land on first? Make that the
   biggest (Lilita, larger size or gold); make labels small and muted; push secondary actions
   to ghost buttons or text links.
5. **Decide the motion**: how does it appear (morph / pop / rise / slide), and does anything need
   attention (nudge / glow)? Usually nothing does.
6. **Write the words** (§10): short, plain, name the action.
7. **Check it** in the browser at both sizes, with the checklist (§12).

### 2.2 Which container?

| The player needs to...                                                  | Use                                                                                  | Examples                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Make **this turn's** choice (2-6 options), or read what's happening now | **Action bar** (bottom center)                                                       | Buy this shop?, Roll, choose a building, "Rosa is moving..." |
| Pick a **square** on the board                                          | **Board highlight** (glowing squares) + action bar explaining it                     | Choose where to move, cannon target, invest in a shop        |
| Edit **many settings** or a **long list** while still seeing the board  | **Side panel** (right edge, nonmodal)                                                | Board settings, the selected tile's options, the Tiles pane  |
| Read or decide something **big**, with the board out of the way         | **Pop-up** (centered, dims the board)                                                | Guide, menu, results                                         |
| Make a choice that needs **a big view to choose from**                  | **Pop-up + action bar**: the view in a non-dimming pop-up, the choice in the bar     | Stock screen, venture board, arcade games, info pop-up       |
| Answer a **yes/no** that can lose something                             | **Question pop-up** (small pop-up, Cancel + answer)                                  | Discard changes?, Delete district?, Quit game?               |
| **Choose one of many things** that have pictures                        | **Card grid** in a pop-up                                                            | New board templates                                          |
| **Manage a list** of saved things                                       | **List rows** in a pop-up                                                            | My boards                                                    |
| Be **told** something happened (no answer needed)                       | **Banner** (top center, fades) or the status line                                    | "Rosa's turn", "Bay Market stock up!"                        |
| See **details on demand** about something on the board                  | **Tooltip**                                                                          | Hovering/tapping a square                                    |
| Get to a **screen-wide tool** or info at any time                       | **Toolbar / info chip** (top corners)                                                | Zoom, Guide, Menu, game name and goal                        |
| Pick a **tool** in an editor                                            | **Tool rail** (icon buttons, left edge)                                              | Select, Pan, Place, Erase                                    |
| Pick **one color/category** while doing something else                  | Let **the game decide** and say so; a color row only if the player truly must choose | Districts and warp/portal colors (automatic)                 |

Rules of thumb:

- **The action bar is for one decision at a time**, never a form. If it needs a scroll bar, a
  list of more than ~6 buttons, or more than one input, it belongs in a side panel or pop-up.
  (Example: Board settings used to be crammed into the action bar with a scrolling box; it now
  lives in a side panel and the action bar just says "Board settings · ready to play".)
- **Side panel vs pop-up:** if the player benefits from seeing the board change while they edit
  (prices on tiles updating, a selected tile), use a side panel. If the board is irrelevant or the
  content is wide (tables, charts, card grids), use a pop-up.
- **Never use the browser's own dialogs** (`alert`, `confirm`, `prompt`). Use a question pop-up.
- **Don't stack** pop-ups more than two deep (a question over a pop-up is fine).

### 2.3 Which control?

| Input                                           | Control                                                      |
| ----------------------------------------------- | ------------------------------------------------------------ |
| The main thing to do                            | One gold **main button** (`.btn.main`)                       |
| Other options in the same decision              | Navy **buttons** (`.btn`) or **ghost** buttons for "no/skip" |
| Destructive yes                                 | Red **no** button (`.btn.no`) inside a question pop-up       |
| A small action next to content (delete, more)   | **Icon button** (`.ed-icon-btn`, 30 × 30, line icon)         |
| A quiet secondary action under a value          | **Text link button** (`.ed-link-btn`, gold 11px bold)        |
| "Add another" at the end of a list              | **Dashed add row** (`.ed-add`)                               |
| Choose 1 of 2-4 modes                           | **Segmented pills** (`.seg` + `.seg-btn`)                    |
| A number in a **list** (several per screen)     | **Stepper** (`ui/stepper.ts`: − value +, hold to repeat)     |
| One **big** amount (shares, investment, target) | **Digit picker** (`ui/digits.ts`)                            |
| A name                                          | Text input; inside cards use the **inline-edit** style       |
| A color                                         | Round **swatch** wrapping a hidden `<input type=color>`      |
| A square on the board                           | **Board highlight** (`board.setChoices`)                     |
| One of many pictured things                     | **Cards** (picture on top, title, one-line description)      |
| A category while placing                        | Decide it automatically; say it in the action bar            |
| Show that something needs fixing                | **Problem badge** (red / yellow) on it; list on select       |

Never use: native-looking range sliders for money, free-typed numbers for money, dropdowns with
two options (use segmented pills), tiny ✕ glyphs as close buttons.

### 2.4 Hierarchy and density

- **One focal point per container.** In a district card it's the name; in a price row it's the
  gold value; in a pop-up it's the title then the main button.
- **Three text levels are enough:** title / value (Lilita, 16-22px, `--text` or gold), body
  (Atkinson 13-15px, `--text`), label (Atkinson 11-12px, `--muted`).
- **Section headings are small, not big:** 12px bold uppercase, letter-spacing 0.06em, muted
  ("BOARD", "DISTRICTS"), with an optional count on the right ("8 of 10").
- **Group with surfaces, not lines.** Related things share an inset box (`rgba(255,255,255,.05)`,
  radius 10). Use a 1px `--glass-line` divider only between major sections.
- **Compact by default.** Put pairs side by side (label left, value right; two-column fact grids).
  If a list row needs more than two lines on desktop, it's doing too much.
- **Fill the container.** Lists and menus span the full width of their pop-up; don't leave a
  dead column. Size pop-ups to their content (a menu is ~400px wide, not 760px).

### 2.5 Things to avoid (real mistakes that were fixed)

| Don't                                                                | Do                                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A form crammed into the action bar with its own scroll box           | A side panel; the action bar shows a one-line status                   |
| A big digit picker (Min/Max buttons, arrows) repeated in a list      | A compact stepper per row                                              |
| `confirm()` / `alert()`                                              | `ask(title, text, yes, danger)` question pop-up                        |
| Board thumbnails showing a tiny board in the corner of an empty grid | Thumbnails trimmed to the tiles (`boardThumb` does it) in a framed box |
| Names wrapping onto three lines in a list row                        | One line with ellipsis, details in a muted line below                  |
| Each panel styling its own headings differently                      | The shared side-panel head and section head                            |
| A menu narrower than its pop-up, leaving a blank strip               | Full-width rows; pop-up sized to the content                           |
| Twenty near-identical UI Lab buttons                                 | A few controls that open meaningful states                             |
| A link line that only arcs upward when tiles are side by side        | A bend at the middle, at right angles to the line (always an arc)      |
| Color pickers for things the game can decide (transport pair colors) | Let the game assign; show the result                                   |

---

## 3. Foundations

### 3.1 Color tokens (`:root` in `style.css`)

| Token          | Value                       | Use                                                         |
| -------------- | --------------------------- | ----------------------------------------------------------- |
| `--navy`       | `#101a33`                   | Page background behind everything                           |
| `--navy-2`     | `#18244a`                   | Raised dark surfaces, `<option>` backgrounds                |
| `--glass`      | `rgba(16, 26, 51, 0.82)`    | Floating HUD panels (with `backdrop-filter: blur(8px)`)     |
| `--glass-line` | `rgba(255, 255, 255, 0.12)` | 1px borders on glass, ghost buttons, inputs, dividers       |
| `--text`       | `#eef2ff`                   | Main text on dark                                           |
| `--muted`      | `#a9b4d6`                   | Labels, captions, section headings, secondary text          |
| `--accent`     | `#ffd166`                   | Gold: selected, focus outline, important numbers, top edges |
| `--good`       | `#7cf29a`                   | Gains, rises, "complete" (e.g. a full 4/4 count)            |
| `--bad`        | `#ff8a8a`                   | Losses, falls, problems, delete hover                       |
| `--radius`     | `14px`                      | Glass panels                                                |
| `--head`       | Lilita One                  | Display font                                                |
| `--body`       | Atkinson Hyperlegible       | Text font                                                   |

Use tokens, not new literal colors, for anything on the dark interface. Meaning colors:

- **Player color** `--pc` (`PLAYER_COLORS`: red `#e5484d`, blue `#3e7bfa`, green `#30a46c`,
  purple `#a855f7`, orange `#f76b15`): that player's card edge, glow, dots, chips, owned tiles.
- **District color** `--dc` (set per board, ten defaults in `ui/editor-districts.ts`): district
  card edge, swatches and dots, tile borders.
- **Link color** `--lc`: a warp/portal pair's color (`transportColor()`; five colors, gold for
  bank links, grey `#9aa3b5` for unlinked).
- **Gold** = money, the main action, selected, focus. **Green/red** = gain/loss, good/problem.
- **Charts** use fixed color-blind-safe series colors (net worth: cash `#3987e5`, properties
  `#d95926`, stock `#199e70`), always with a legend; text never in the series color.

Pass a meaning color as a custom property on the element and use `var()` inside:

```ts
h('div', { class: 'ed-dcard', style: `--dc:${district.color}` }, ...)
```

```css
.ed-dcard {
  border-left: 4px solid var(--dc);
}
```

### 3.2 Surfaces (lighter = closer)

| Surface         | Value                                                                       | Where                                         |
| --------------- | --------------------------------------------------------------------------- | --------------------------------------------- |
| HUD glass       | `--glass`, 1px `--glass-line`, blur 8px, shadow `0 8px 28px rgba(0,0,0,.3)` | Info chip, toolbar buttons, cards, action bar |
| Panel / pop-up  | `rgba(16, 26, 51, 0.94-0.97)` (more opaque: for reading)                    | Side panels, pop-ups                          |
| Inset box       | `rgba(255, 255, 255, 0.05)`; hover `0.07-0.12`                              | Cards in panels, fact boxes, list rows        |
| Input           | `rgba(255, 255, 255, 0.08)` + `--glass-line` border                         | Text fields, selects                          |
| Dark well       | `rgba(0, 0, 0, 0.22)` + inset 1px `--glass-line` ring                       | Stepper track                                 |
| Backdrop        | `rgba(5, 10, 25, 0.45)`                                                     | Behind pop-ups                                |
| Gold tint       | `rgba(255, 209, 102, 0.16)` + inset 2px gold ring                           | Selected item in a grid/list                  |
| Good / bad tint | `rgba(124,242,154,.16)` / `rgba(255,138,138,.18)`                           | Count chips, problem rows                     |

### 3.3 Typography

| Font                                  | Use                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| **Lilita One** (`--head`), weight 400 | Titles, buttons, names, values and money, banners, badges, counts            |
| **Atkinson Hyperlegible** (`--body`)  | Sentences, labels, hints, tables, inputs, section headings (bold, uppercase) |

Lilita One has one weight: always `font: 400 <size> var(--head)`; never bold it.

| Size  | Use                                                                   |
| ----- | --------------------------------------------------------------------- |
| 10-11 | Tags, tiny captions, notes under a value ("Auto, by distance")        |
| 12    | Section headings (UPPERCASE, 0.06em, muted), field labels, sub-titles |
| 13    | Hints (`.hint`), small buttons, secondary rows                        |
| 14-15 | Body text in panels and pop-ups, inputs, the status line              |
| 16-17 | Buttons, list/menu item titles, card titles, stepper values           |
| 20-22 | Side panel and pop-up titles, big values                              |
| 26-30 | Banners, hero numbers                                                 |

Long names: one line, `overflow: hidden; white-space: nowrap; text-overflow: ellipsis`.
Paragraph line-height 1.35-1.45.

### 3.4 Spacing, radius, shadow

**Spacing scale (px):** 2, 4, 6, 8, 10, 12, 14, 16, 18. Common uses: 6 between buttons in a row,
8 between cards/list rows, 10-14 panel padding, 12-14 between sections (with a divider), 16-18
pop-up padding. Screen edge margin for HUD: 10px (phones: still 10, pop-ups ≥ 22px).

**Radius:** 999px pills (tags, chips, segmented pills, zoom chip, steppers, banners) · 50% dots,
swatches, round buttons · 3px progress bars, tiny swatches · 8px inputs, icon buttons, thumbnails ·
10px buttons, inset cards, list rows · 12px player cards, picture cards · 14px panels and pop-ups.

**Borders:** 1px `--glass-line` around glass and ghost things. Meaning is shown with a thicker
**single side**: 4px top edge (gold) on side panels, 4px left edge (`--dc`) on district cards,
5px top edge (`--pc`) on a player's pop-up, 5px left edge (`--pc`) on player cards. Selection is
an **inset ring** (`box-shadow: inset 0 0 0 2px var(--accent)`) so size never changes.

**Shadows:** `0 8px 28px rgba(0,0,0,.3)` floating panels · `0 12px 30px rgba(0,0,0,.35)` action
bar · `0 20px 60px rgba(0,0,0,.5)` big pop-ups. Glows use the meaning color with blur.

---

## 4. Components

Small reusable pieces. Several were first built for the board builder and carry an `ed-` prefix;
when you need one elsewhere, **move its CSS to a shared group and give it a neutral name** (e.g.
`.ed-icon-btn` → `.icon-btn`) instead of copying it.

### 4.1 Buttons

All `.btn`: Lilita 16px, radius 10, padding `9px 16px`, press `translateY(1px) scale(.98)`,
hover one shade lighter, disabled `opacity .4`.

| Class             | Look                                     | Use                                          |
| ----------------- | ---------------------------------------- | -------------------------------------------- |
| `.btn`            | Navy `#2c3a6b` (hover `#3a4b86`)         | Ordinary options                             |
| `.btn.main`       | Gold gradient, dark brown text `#3b2a00` | **The** main action (max one per group)      |
| `.btn.main.nudge` | + a small hop every ~2.6s                | What the player is expected to do now (Roll) |
| `.btn.ghost`      | Transparent, 1px `--glass-line`          | Cancel, Skip, Close, secondary               |
| `.btn.no`         | Red gradient, white text                 | Destructive answer (Delete, Discard)         |
| `.btn.danger`     | Dark red                                 | Destructive item in a menu (Quit game)       |
| `.btn.small`      | `6px 10px`, 13px                         | Toolbars, panel heads, rows                  |
| `.btn.pic`        | Picture over a short name and price      | Choosing pictured things in the action bar   |

Order: main action **last in a row** (right) or **first in a stack**; Cancel/ghost before it.
Labels are short verbs: "Buy", "Link", "Use auto", "Delete". **Every pop-up and side panel closes
with a "Close" ghost button in its top-right corner**, never a bare ✕.

### 4.2 Icon button (`.ed-icon-btn`)

30 × 30, radius 8, transparent, `--muted` line icon 18px (stroke 1.8, round caps). Hover: red
tint + `--bad` for delete (use a neutral hover for non-destructive icons). Always an
`aria-label` and a `title`.

```ts
h(
  'button',
  { class: 'ed-icon-btn', 'aria-label': `Delete ${d.name}`, title: 'Delete district' },
  icon(TRASH),
);
```

Icons are simple 24 × 24 line paths (`icon(d)` in `ui/editor.ts`); no emoji, no icon fonts.

### 4.3 Text link button (`.ed-link-btn`)

Gold bold 11px text, no box, underline on hover. For a quiet action that belongs to a value
("Use auto" under a custom price). Hide it (`hidden`) when it doesn't apply rather than disable it.

### 4.4 Dashed add row (`.ed-add`)

Full width, 1px dashed `rgba(255,255,255,.25)`, radius 10, Lilita 15px "+ Add district". Ends a
list of cards; disappears when the list is full.

### 4.5 Pills, tags and count chips

- **Tag** (`.tag`): 10px, `1px 6px`, gold on gold tint ("Fees +30%"); red on red tint for bad.
- **Count chip** (`.ed-count`): Lilita 12px, `1px 7px`, pill. Red tint when incomplete
  ("2/4"), **green tint when complete** ("4/4"). Use for any "n of required" count.
- **Chips** naming players/properties (log, trades): pill with a color edge or player color.

### 4.6 Segmented pills (`.seg` + `.seg-btn`)

A row of pill buttons with a `--glass-line` border; the chosen one is gold with dark text. Inside
a panel make them share the width (`flex: 1`). Use for 2-4 exclusive choices (Square / Hex,
Guide tabs, game setup options). Set `aria-pressed`.

### 4.7 Stepper (`ui/stepper.ts`)

A dark pill well: round − button, the value (Lilita 16px gold, tabular numbers, min 62px), round

- button. Click steps once; **holding repeats**, speeding up; keyboard Enter/Space steps once.
  Ends are disabled at min/max. `onStart` runs once per press (save an undo step there).

```ts
const price = stepper({
  value: 340,
  min: 80,
  max: 1970,
  step: 10,
  label: `${d.name} starting average`,
  onStart: snapshot,
  onChange(v) {
    d.startingValue = v;
    redraw();
  },
});
row.append(price.el);
```

### 4.8 Digit picker (`ui/digits.ts`)

Up/down arrows per digit plus Min/Max. Only for **one big amount on its own** (buying shares,
investing, the target net worth). Never repeat it in a list.

### 4.9 Inputs

- Standard field: full width, `7px 10px`, radius 8, input surface, 14px; gold 2px focus outline.
  Label above it: 12px muted (`.ed-field > span`).
- **Inline-edit** (a name inside a card): looks like plain Lilita 16px text (transparent border and
  background) until hovered or focused, then shows the input surface.
- **Color swatch** (`.ed-swatch`): a 22px round dot in the color with an inset white ring; a hidden
  `<input type=color>` fills it, so clicking the dot opens the picker; focus ring on
  `:focus-within`.
- Selects only when there are 3+ options (else segmented pills); style with the input surface.

### 4.10 Inset box, facts and tables

- **Inset box**: `rgba(255,255,255,.05)`, radius 10, padding `10px 12px`. Groups a label + value +
  its actions (e.g. tile info "Leads to · The bank · Change link · Unlink").
- **Label/value row**: label 13px muted left, value Lilita 20-22px gold right.
- **Fact grid**: two columns of inset boxes, label small/muted, value bold.
- **Action-bar facts**: `question(text, [[label, value, 'big'?]])` from `ui/pick.ts`.
- **Tables** reuse the stock screen's `.m-grid`: district swatch + name left, numbers right in
  Lilita, rows with nothing dimmed to 0.5, totals in a plain final row.

### 4.11 Thumbnails (`.ed-thumb` + `boardThumb`)

A fixed frame (radius 8, grass `#7fc25a` fill) with the board picture centered inside.
`boardThumb()` trims to the tiles, so a board never sits tiny in a corner. Card thumbnails fill the
card width at a fixed height (86px); list thumbnails are 112 × 64. Empty boards show "Empty grid".

### 4.12 Progress, icons and art

- Progress: 5px track `rgba(255,255,255,.12)`, fill in the meaning color, number beside it.
- Pixel art (characters, buildings) always `image-rendering: pixelated`, whole-number scales.
- Vector icons (suits, coins, boon/boom) stay smooth; generated from canvas, never emoji.
- Property pictures via `propIconURL` / `propertyIconURL` (owner color applied, grey unowned).

---

## 5. Screen elements

Each element: **purpose**, **placement**, **anatomy**, **spec**, **behavior**, then examples.

### 5.1 Info chip (top left) — "info bar"

- **Purpose:** what you're playing/editing, always visible.
- **Placement:** `top: 10px; left: 10px`; game: the Info button sits right beside it (`.top-row`).
- **Anatomy (game):** gold Lilita title ("Adventure Avenue") · muted pills: board, round, goal ·
  Room button online. **(builder):** "Board builder" · inline name input · save status
  ("Not saved yet" gold, "Saved" green) · "Board settings" small ghost button.
- **Spec:** `.info-chip.glass`, padding `5px 6px 5px 12px`, gap 6, 12px text, wraps if needed.
- **Behavior:** buttons in it turn **gold while their thing is open** (`aria-pressed="true"`).
- Keep it to one line on desktop; put nothing here that changes every second.

### 5.2 Toolbar (top right)

- **Purpose:** screen-wide tools.
- **Anatomy:** zoom chip (a pill showing "250%"; tap = reset zoom **and recenter**; its 2px border
  shows the zoom mode: grey `#8a93a8` free, blue `#4c9bff` auto, red `#e5484d` locked, via
  `data-mode`), then small
  buttons ("? Guide", "☰ Menu"; builder: Undo, Save, gold "Test play", Menu).
- **Spec:** `.toolbar`, `top/right: 10px`, gap 6, buttons `.btn.small` on glass. Order: View
  board chip (only while a pop-up is up; pops in, gold "Back" while the pop-up is hidden), zoom
  chip, Game log, Guide, Menu.
- **Rule:** at most one gold button here (the thing to do next, e.g. Test play).

### 5.3 Action bar (bottom center)

- **Purpose:** this moment's one decision, or what's happening now.
- **Placement:** centered on the whole window, `bottom: 16px`, never under the player cards.
  When the window is too narrow for a centered bar to have 520px (`AB_CENTER_MIN` in `hud.ts`)
  between the cards on both sides, the HUD gets `.ab-left` and the bar sits bottom left
  (14px from the edge, 8px on phones), using all the room up to the cards. Decide by window size
  only, never by the bar's content, so the bar does not jump between prompts. Safety net: if a
  centered bar still overflows (or squeezes its question into a sliver), it moves bottom left and
  stays there until the window width changes.
- **Two modes:**
  - **Status line** (`.status`): one line, an icon for the kind of event, names in their colors,
    ellipsis when long. "Rosa is buying stocks...", "Board settings · 2 problems to fix".
  - **Options**: question on the left (player-color dot first, or a `question()` fact strip),
    buttons on the right with the main one gold.
- **Spec:** glass, 2px border in `--pc` (the deciding player's color), min height 92px (options),
  grows up to 75% taller for rich content, width = content (max 920px; no minimum width, so a
  short message gets a short bar on every screen size).
- **Motion:** morphs size between states (740ms, content laid out at its final size so text never
  jumps); new text is revealed with a 220ms left-to-right sweep; new controls fade/settle 220ms.
- **Do:** say what to do when the choice is on the board ("Tap a glowing square to move there").
- **Don't:** put forms, lists or scrolling areas here (→ side panel / pop-up).
- **Picker variant** (`.bp`, building on a vacant plot / renovating, `buildPrompt` in
  `ui/modals.ts`): when the choice is one of several pictured things and each needs explaining,
  use a grid: the question and a muted hint top left (they never change while choosing, so the bar
  keeps one size), the buttons side by side top right (gold "Build" disabled until a pick, ghost Skip;
  labels stay fixed too). The hovered or selected card's details float in a glass tip above that
  card (`.bp-tip`: 250px, 5px top edge in the player color, Lilita name + gold price, then muted
  "Rivals:"/"You:" lines, kept inside the picker's width), and a row of same-size cards below (inset surface,
  radius 10, picture 40px, Lilita name 11px, gold price; selected = gold tint + 2px inset gold
  ring + lifted; unavailable = greyscale picture and muted text, still selectable to read why).
  Choosing is two steps (select, then the main button or a second tap on the card) so one stray
  tap never commits money. Phones: cards become picture + price only, buttons sit in a row beside
  the details. The bar lifts its height cap for it (`.prompt-center:has(.bp)`).

Example (TypeScript):

```ts
const yes = await hud.prompt(
  question('Upgrade your circus?', [
    ['Cost', fmt(300), 'big'],
    ['Fee when rivals land', '100G → 500G'],
  ]),
  [
    { label: 'Upgrade', value: true, main: true },
    { label: 'Not now', value: false, secondary: true },
  ],
  player.color,
);
```

### 5.4 Side panel (right edge) — Board settings, tile info, Tiles pane

- **Purpose:** edit settings or a list while the board stays visible and live.
- **Placement:** `top: 58px` (below the toolbar), `right: 10px`, width `min(320px, 100% - 96px)`
  (phones 270px); stops above the action bar; nonmodal (the board still works).
- **Anatomy:**
  1. **Head** (`sideHead(title, subtitle, onClose)`): Lilita 21px title, 12px muted subtitle
     ("Column 17 · Row 15"), "Close" ghost button right; 1px divider under it. Stays put.
  2. **Body** (`.ed-side-body`): scrolls; padding `10px 14px 14px`.
  3. **Sections** (`sideSection(title, aside, ...)`): uppercase muted heading + optional count
     right ("DISTRICTS · 8 of 10"); sections separated by a divider and 12-14px.
- **Spec:** `.ed-side.glass`, background `rgba(16,26,51,.94)`, **4px gold top edge**, slides in
  from the right (16px, 220ms).
- **Behavior:** Escape or Close closes it; the button that opened it is gold while open; keep the
  body's scroll position across re-renders.

```ts
panel.append(
  sideHead('Board settings', null, close),
  h(
    'div',
    { class: 'ed-side-body' },
    sideSection('Board', null, gridField, madeByField),
    sideSection('Districts', '8 of 10', hint, ...districtCards, addRow),
    sideSection('Ready to play', null, summary, okRow),
  ),
);
```

### 5.5 Cards inside panels — e.g. the district card

- **Anatomy:** inset box, radius 10, **4px left edge in the item's color**. Top row: color
  swatch · inline-edit name (flex 1) · count chip · icon button. Second row: label + muted note
  on the left, control (stepper) on the right.
- **Spec:** padding `8px 8px 8px 10px`, 6px between cards.
- **Example:** `● Brick Row ............ [4/4] 🗑` / `Starting average · Auto, by distance  [− 340G +]`
  (the 🗑 here stands for the trash line icon; never use the emoji).

### 5.6 Pop-up (centered)

- **Purpose:** read or decide something big; board out of the way.
- **Anatomy:** backdrop dim over everything; box with head (Lilita 20-28px title + "Close" ghost
  right, 12px gap below) and body that scrolls inside.
- **Spec:** `.modal`, background `rgba(16,26,51,.96)`, radius 14, padding `16px 18px 18px`, big
  shadow. Width by content: menus ~400px, standard 460px, wide 720-760px, extra-wide 980px.
  A player's pop-up gets a 5px top edge in `--pc`.
- **Motion:** pops in (scale .92 → 1, 220ms, slight overshoot), closes faster (160ms).
- **Behavior:** Escape, Close or clicking the backdrop closes it; **Escape only closes the top
  pop-up** (stop the event so nothing underneath reacts). Use `hud.modal()` in games; the builder
  has its own `modal()` with the same look.

### 5.7 Question pop-up — `ask()`

- **Purpose:** confirm something that can lose work or change a lot.
- **Anatomy:** title as the question ("Delete Brick Row?"), one muted sentence saying what happens
  ("Its 4 properties will be removed from the board."), then **Cancel** (ghost) and the answer
  button named for the action ("Delete" red `.btn.no` when destructive, else gold "Switch").
- **Spec:** width ~380px; answer button focused on open; Escape/Cancel = no.

```ts
if (!(await ask(`Delete ${d.name}?`, 'Its 4 properties will be removed from the board.', 'Delete', true)))
  return;
```

### 5.8 Menu pop-up

- **Anatomy:** full-width rows (`.pop-menu-item`), each a Lilita 17px title + a 12px muted line
  saying what it does ("My boards — Open, export or delete boards saved on this device"). The
  "leave" item (Back to main menu) is set apart below with an outline instead of a fill.
- **Spec:** pop-up ~400px; rows padding `10px 14px`, radius 10, inset surface, 6px gap.
- Shared classes: `.pop-menu` (the list) and `.pop-menu-item` (a row) inside a `.modal`; used by
  the board builder's Menu and the main menu's Menu (What's new, Board editor, Credits). A
  "New" tag (`.tag`) can follow a row's title; the button that opens the menu carries the red
  "New" dot instead.
- The in-game menu (`.game-menu .gm-item`) follows the same idea.

### 5.9 Card grid pop-up (choose one of many pictured things)

- **Anatomy:** grid `repeat(auto-fill, minmax(160px, 1fr))`, gap 8; each card: thumbnail (full
  width, 86px), Lilita 16px title, 12px muted one-line description.
- **Behavior:** hover lifts 2px and brightens; the whole card is the button.
- **Example:** New board (Starter loop, Lakeside, Copy of Town...).

### 5.10 List rows pop-up (manage saved things)

- **Anatomy per row:** thumbnail 112 × 64 · name (Lilita 17px, one line, ellipsis) over a muted
  detail line ("50 tiles · saved 11/2/2026 · open now") · actions right: gold "Open", ghost
  "Export", trash icon button. The current item has a gold inset ring.
- **Phones:** drop secondary text buttons (keep Open and the icon).

### 5.11 Tool rail (builder, left edge)

- **Anatomy:** glass column of 44px icon buttons (24px line icons), vertically centered, 10px from
  the left: Select (arrow), Pan (four arrows), Place (pencil), Erase (eraser).
- **States:** active = gold fill with an inset light ring; name appears to the right on hover or
  focus. The action bar always explains the active tool in words.

### 5.12 Tiles pane (builder)

- A side panel (§5.4) titled "Tiles" with the hint "Pick one, then click or drag on the board";
  groups (PROPERTIES, SUITS, SPECIALS, TRANSPORT) use section headings; tiles are the game's own
  tile art in a two-column grid. The chosen tile glows like a game choice (pulsing white outline
  in a gold glow + white rings spreading out, CSS `::before`/`::after` matched to the tile).
  Shown only while placing.

### 5.13 Problem badges and lists

- **Where:** on the thing with the problem (a tile's top-right corner) and, with a count, on the
  button that opens the full list (Board settings). Red = can't continue until fixed; yellow =
  worth fixing, still works. A number when it's meaningful ("2" properties missing), else "!".
- **On select:** the thing's own problems are listed first in its panel (red/yellow rows, worst
  first, one plain sentence each saying how to fix it).
- **In the full list:** errors first; rows tied to a thing are clickable (they select it and move
  the view to it).
- **Don't** use a color row or picker for something the game can decide (districts and
  warp/portal colors are assigned automatically; the action bar says what will happen:
  "Property: goes into Bay Market (2 of 4)").

### 5.14 Player cards (bottom right)

- Glass card, radius 12, **5px left edge in `--pc`**; whole character sprite left; name (Lilita)
  - level badge + suits on top; progress bar; cash (coin) bottom-left, rank badge + net worth
    bottom-right. Active player: breathing `--pc` glow on an `::after` layer. Money changes pop out
    beside the card ("+120G" green / "-50G" red). Can win: net worth and portrait pulse gold.
    Clicking opens that player's page in the info pop-up.

### 5.15 Info pop-up (pop-up + action bar)

- **Info button** (`.info-btn`): a glass pill right of the info chip, a round gold "i" and "Info";
  gold (`.on`) while the pop-up is open.
- **Pop-up** (`.info-layer > .modal.info-pop`): up to 1,000px wide, sized to its page (max 680px
  tall, scrolling inside), 5px top edge (gold; the player's `--pc` on a player page), centered and
  kept clear of the player cards (`keepClearOfCards`); non-dimming, only the box catches clicks;
  opening/closing motion as for the stock market; page changes ease its size (240ms).
- **Action bar:** a stand-in `.prompt-center.info-bar` over the real bar (`.hud.info-open` hides
  the real one and any stock/venture/arcade layer): pill tabs (`.ib-tab`, gold when on) Game,
  Stocks, a divider, one per player (`.ib-player`: portrait + name, border and fill in `--pc`;
  portrait only on phones), then a ghost Close. It grows out of the real bar's size on opening.
- **Pages:** Game (how to win, facts grid, standings rows `.info-row` with place badge, portrait,
  name/level/suits, net worth + `--pc` bar, cash); Stocks (`marketView(..., { split: true })`);
  a player (`playerOverview`: three columns, net worth + ring chart + earnings · properties as
  small cards · shares table; property cards: district top edge, picture, rent big, value small;
  click to find it on the board).

### 5.16 Banner

- A pill near the top center: Lilita 26px, glass, 3px border in the meaning color. Rises in, fades
  up and out. One short line: "Round 5", "Rosa's turn", "Bay Market stock up! 12G → 14G".

### 5.17 Tooltip

- Glass box near the pointer (kept on screen), 220-280px, **5px top edge in the district color**;
  owner pill (player color + portrait), then a 2-column grid of stat boxes; one plain sentence for
  what a special square does ("Stop here to jump to the bank.").

### 5.17b Board tiles (canvas)

- Every tile uses the same two spots (`drawSquare` in `board.ts`): pictures stand on one base line
  (property and building art is bottom-aligned at `artY + 23`; symbols for special squares are
  centered at `iconY`) and the price, fee or name is centered on one text line (`textY`). The
  owner's initial badge sits in the same spot on every property (`x + 22, y + 14` from the art).
  Everything keeps at least 5px clear of the border's inner edge (art at most ~59 x 45, text 15px).
  Squares with no name (suits, Boon, Boom) center their symbol on the tile.

### 5.17c Game setup seats

- Players come first, across the top: up to 5 seat cards in a row (`.setup .seat-card`): the
  character trimmed to its pixels (`charButton(look, 'body', ...)`) standing centered on a soft
  spot in the seat's color, the name (an input for players on this device), a muted tag
  ("You · host", "On this device", "Joined online", "Bot") and a × remove button in the top right
  (never on the host). The empty spot is a dashed card with a gold round **+ Add bot** button and
  a small ghost **+ Player on this device** button. The join code sits right under the seats.

### 5.18 Game log

- **Game log:** a toolbar button (`.log-toggle`, between the zoom chip and Guide, gold `.on`
  while open) opens a glass panel (`.log-panel`) top right: `top: var(--top-free)` (just under the
  toolbar), `right: 10px`, as wide as the player cards (`--cards-w`, min 240px), max height down to
  the top of the cards (`--dock-b`); on phones (`max-height: 500px`) it may run over the cards. It
  pops in (200ms, fade + 8px drop + scale .96 from the top right); Close, the button or Escape
  closes it. The log groups lines by turn, newest at the bottom, players as chips.

### 5.19 Board overlays (canvas)

- **Choices:** other squares dim; choice squares get a tint of the chooser's color, a pulsing
  white outline glowing in that color, spreading white rings and bouncing pins.
- **Highlights / focus:** irrelevant squares grey `rgba(70,74,84,.72)`; the one that matters
  glows with rings.
- **Builder hover cell:** light tint + 6px dark outer / 3px bright inner outline in screen pixels
  (gold; red while erasing).
- **Builder selection:** selected tiles glow like game choices (`drawTileGlow` from `board.ts`:
  gold tint, pulsing white outline in a gold glow, spreading white rings for up to six tiles);
  the marquee is a translucent gold rectangle.
- **Placing / erasing:** a placed tile bounces (scale up to 1.14 and back, 650ms) inside a gold
  ring with sparkles (`drawRingBurst`, the game's purchase ring); an erased tile leaves a red ring.
- **Problem badges:** a round badge at a tile's top-right corner (screen-sized, ~20px): red
  `#e5484d` with white text for errors, yellow `#ffc21a` with dark text for warnings, white ring
  and a soft shadow. It shows a number when there's one to give (properties missing), else "!".
  The same badge sits on the button that opens the full list (Board settings) with the count.
- **Link line** (selected warp/portal, `drawLink`): a quadratic arc whose bend is at the **middle
  of the line, at right angles to it** (upper side), bend = 14% of length (16-90 units) — gentle,
  always visible. Dark 9px outline, 4px line in the link color at 55% opacity, white source ring,
  3 glowing dots with short tails traveling to the destination (1.5s loop), a ring pulse at the
  destination on each arrival, solid destination dot with a white ring. Widths are screen pixels
  at any zoom. Reduced motion: still dots, no pulse.

---

## 6. Motion

| What                                        | Time                        | Easing                                       |
| ------------------------------------------- | --------------------------- | -------------------------------------------- |
| Hover / press                               | 80-150ms                    | default                                      |
| Layer fade, modal entrance                  | 200-220ms                   | ease-out                                     |
| Side panel slide-in (16px)                  | 220ms                       | `cubic-bezier(0.2, 0.8, 0.2, 1)`             |
| Pop-up open / close                         | 220ms / 160ms               | `cubic-bezier(0.2, 0.9, 0.3, 1.2)` / ease-in |
| Market panel / log morph                    | 260-280ms                   | `cubic-bezier(0.2, 0.8, 0.2, 1)`             |
| Action bar morph                            | 740ms                       | `cubic-bezier(0.2, 0.8, 0.2, 1)`             |
| New action bar text sweep                   | 220ms                       | `steps(16, end)`                             |
| Banner rise / fade                          | 350ms / 450ms               | ease-out                                     |
| Camera pan / zoom easing (builder and game) | per frame, factor 0.12-0.15 | —                                            |
| Loops (breathe, pulse, link dots)           | 1.1-2.6s                    | ease-in-out / linear                         |
| Game pacing (walks, coins, pauses)          | `timing.ts`                 | never hard-coded                             |

Patterns: **morph** (measure old size, change content, animate width/height to the new size with
`overflow: hidden`), **pop** (scale .92 → 1 + fade), **rise** (10px up + fade), **slide** (side
panels, 16px from the right), **nudge** (the expected button hops every ~2.6s), **breathe** (glow
on an `::after` layer, opacity only), **reveal sweep** (clip-path left to right).

Rules: animate `transform` and `opacity`; nothing loops unless it needs attention; every
animation has a `prefers-reduced-motion` path (CSS media query, or `matchMedia(...)` /
`reducedMotion()` in code) that jumps to the end state.

---

## 7. The board (canvas art)

Bright and physical, unlike the dark HUD:

- **World:** seamless grass (`GRASS #92d268`) everywhere, painted in world coordinates under
  transparent board caches; trees, ponds and flower beds in games (hidden in the builder).
- **Tiles** (86 units on a 100 grid): cream `#fdfbf5` (bank `#fff6d6`), radius 12, soft shadow
  down-right. Owned: tint of the owner's color. Properties: 6px district-color border. Vacant
  plots: dashed grey outline + "VACANT".
- **Tile text:** Atkinson 700, navy `#26314f` (`#1b2340` on tints); amounts with the coin
  (`fillMoney`). Special squares: icon + small uppercase label.
- **Warps** (four-pointed star) and **portals** (round swirl) in their link color: a pair's color,
  gold to the bank, grey unlinked.
- **Characters:** pixel sprites, whole-number scales, sprite-shaped shadow, a name plate (white
  Lilita on a player-color pill with a white outline); the active one is bigger with a bobbing
  arrow.
- **Effects:** gold ring + sparkles (bought, grew), flying coins, floating "+120G"/"-50G" in
  Lilita with a dark outline, stock arrows, shop gates.
- Text, rings and lines that must stay readable are drawn at **screen size** (divide widths by
  the camera scale).

---

## 8. Layout and responsive

- HUD hugs corners with 10px margins; the board fills the screen behind it; the camera keeps
  important squares out from under panels (`hud.updateInsets()`).
- Content-sized panels; caps with `min(<px>, 100% - <margin>)`.
- Phones play **landscape** (test 844 × 390); breakpoints `max-width: 760-900px` and
  `max-height: 500-560px`: shrink type one step, tighten padding, narrow side panels to 270px,
  drop secondary buttons that have another way in.
- Scroll inside panels (hidden scrollbars), never the page.

---

## 9. Interaction and accessibility

- Real `<button>`s for everything clickable; otherwise `role="button"`, `tabindex="0"`,
  Enter/Space. Pop-ups and side panels `role="dialog"` with `aria-label`.
- Focus: `outline: 2px solid var(--accent); outline-offset: 2px` on `:focus-visible`.
- Keys: Escape closes the top layer (question → pop-up → side panel → selection); Enter/Space
  presses the main button; builder: Space+drag pans, arrows pan, −/+ zoom, Ctrl+Z undo.
- Hover is a bonus: anything on hover is also reachable by tap/focus.
- Color is never the only signal: add text, an icon, a sign or a count ("4/4").
- Contrast: light text on navy; dark text on gold and light tints.

---

## 10. Writing on screen

Short, plain, friendly, sentence case, no jargon. Money "1,200G". Name the action on buttons
("Delete", not "OK"). Hints say what to do next ("Pick one, then click or drag on the board").
Status lines say who is doing what ("Rosa is buying stocks..."). Refusals explain how to fix it
("All five warp colors are in use. Unlink a pair first, or link this one to the bank.").
Questions are the title; the sentence under it says what will happen.

---

## 11. Worked example: designing a feature

_Request: "Let builders set each district's starting price."_

1. **Job:** while building, adjust up to ten prices and see tiles update.
2. **Container:** several values + live board → **side panel** (Board settings), not the action
   bar and not a pop-up.
3. **Controls:** a number per row in a list → **stepper** (not the digit picker); a way back to the
   automatic price → **text link** "Use auto", shown only when the price is custom.
4. **Hierarchy:** district name is the focal point (Lilita, inline-editable); the price is gold;
   "Auto, by distance" is a muted 11px note; delete is a quiet icon.
5. **Layout:** a **district card** per district (4px left edge in its color), count chip "4/4"
   turning green when complete, a dashed "+ Add district" row at the end.
6. **Motion:** none beyond the panel slide-in; values change instantly; holding the stepper
   repeats.
7. **Words:** section "DISTRICTS · 8 of 10"; hint "Each needs exactly 4 properties. In a game the
   nearest one costs 30G less than the average and the farthest 30G more."
8. **Check:** desktop and phone; Escape closes; keyboard works on − / +; the action bar shows
   "Board settings · ready to play".

---

## 12. Checklist for a new or changed element

- [ ] The right **container** (§2.2) and the simplest **controls** (§2.3).
- [ ] One focal point; labels small and muted; section headings uppercase 12px.
- [ ] Built with `h()`; CSS in `style.css` under a commented group, using the tokens.
- [ ] Surface, radius, edge and shadow match its kind (HUD glass / panel / pop-up / inset card).
- [ ] Lilita for titles, buttons, values; Atkinson for the rest; sizes on the scale.
- [ ] Meaning colors via `--pc` / `--dc` / `--lc`; gold only for money, main action, selected.
- [ ] At most one gold button per group; "Close" ghost button top right on panels and pop-ups.
- [ ] No browser dialogs; questions use `ask()` with an action-named answer button.
- [ ] Right motion (morph / pop / slide / rise); reduced motion handled.
- [ ] Keyboard, touch and Escape work; visible focus; names don't wrap out of shape.
- [ ] Looked at in a browser on desktop and 844 × 390; nothing cut off, no dead space.
- [ ] UI Lab control added (a meaningful state, not one per tweak) and listed in `RECENT`.
- [ ] If it introduced a new pattern, this guide is updated in the same commit.

Problem entries in Board settings and tile info share inset cards with 14px body text, 1.45 line
height, clear spacing, a colored side edge and a plain severity label (Needs fixing or Worth
checking). Tile-related settings entries are full-width buttons with a View tile position hint.
Click, Enter or Space closes settings, selects the first valid affected tile, centers the camera
on it and opens tile info. Board-wide entries remain readable, noninteractive cards. Tile info
uses the shorter tile-specific wording where available.

### Action-bar lifecycle priority and quiet gaps

`ui/status-messages.ts` gives new action phases priority over old result timers. A phase change
clears obsolete events immediately; repeated updates for the same phase preserve short event
overlays. Keep the last action during the one-second end-turn pause. Show Passing the turn to [name]
when the slower camera glide starts, Rolling during die animation,
Rolled [n] during its one-second hold, then Moving from the first step. Suit/fee overlays last
one second while walking continues, then resume moving without another idle delay. Same-phase
bursts use 0.8-second slots, at most six pending events. Full history stays in the log.

Generic waiting is deferred for 1.2 seconds; overlap that debounce with event reading time,
never add them. Known automatic CPU pre-rolls skip deciding text. Actual controls remain
immediate. Use `hud.action(key,text,kind)` for a real phase, `hud.tick(..., hold, true)` for an
in-phase overlay, and `hud.status` for fallback activity. Preserve the existing morph/typing
reveal and duplicate-purchase consolidation. UI Lab’s Action lifecycle and Event burst → quiet
fallback controls demonstrate the priorities. Turn-camera glides stay 1.6 seconds with reduced
motion snapping the camera; no other decision delays change.

The main menu's Play button doubles as Join: a field inside the big button (right side, labelled
"Have a code?") changes the button itself (gold Play → blue Join with a small 1.03 pop) rather than
adding a second button. The button is a `div.menu-btn` holding a real `<button>` for the label
area and a `<label>` for the field, since an input can't sit inside a button; clicks on the field
never press it. Secondary actions under it (Continue) are slimmer rows, never a second big button.

The main menu is a single viewport with no page scrolling or overscroll. Keep top-corner Sound
and Menu and the version chip reachable. The title always sits above the actions; on short screens
(phones in landscape) it shrinks and the tagline is hidden. Fit the complete center group to the
available height when necessary, including Continue and the optional join-name field. Menu pop-ups
and their content retain their own scrolling behavior.

### Stock screen (pop-up + action bar)

Buying and selling stock and the district venture cards (Gift shares, Bull/Bear market) follow the
same pattern as the venture board: the stock market (`marketView(..., { split: true })`: map top
left, shop cards bottom left, table on the right filling the height) sits in a centered glass pop-up that does not
dim the board (`.stock-layer > .modal.stock-pop`, only the pop-up catches clicks; equal space above and below
it, and `stockPopup` slides it left only as far as needed to clear the player cards), and the decision is in the action bar (`.stock-bar`):
the summary card (`.m-card`, compact), the digit picker, then `.tb-btns` with the gold Buy/Sell
(or the district button) over a ghost Skip/Cancel. Changing district in the pop-up redraws the bar
in place (no new prompt, so the bar doesn't morph). The summary card has two groups split by an `hr.m-divider` (market price + shares held; price per share + cash). The toolbar's **View board** chip (`.view-chip`, `hud.offerViewBoard(el)`; it morphs into
"Back": width eases over 260ms while the word cross-fades, colors transition) hides the pop-up with
the pop-up closing motion (sink 14px, shrink to 0.97, fade, 180ms; showing again plays the 220ms
opening motion) and the action bar morphs to its new content (`hud.morphChange`)
(`hud.setPeek`, `board.overviewHold` for an auto whole-board view); the stock bar then swaps to a
short note with a gold "Back to stocks". The deal chip is `.m-corner` (absolute, top right of the card); the price per share
is an `.m-line.m-pay` row in gold (a deal strikes the market price through and glows the
player's price green). The digit picker runs with `minButton: false` and no suffix, Max
beside it with even padding. The bar's padding is the same on all four
sides (12px, phones 8px; no min height). The card's heading names only the action and district
("Buy Brick Row shares"). A discount or premium is a `.m-deal-row`: the green deal tag, the market
price per share struck through, and the player's price in green Lilita with a pulsing glow
(`.m-deal-price`, still under reduced motion). Shaken districts get `.m-shake.on` (a red
falling-chart icon) after their name in the table; every name has the empty 14px slot. Phones: the pop-up keeps only the district
table (6 rows at a time, shifting by one to follow the selection), the digit faces shrink to 32x34 and the "shares you hold" line (`.m-line.held`) is hidden.

### UI Lab tabs

The Lab's control panel has a row of small `.seg` pills (`.lab-tabs`) under the search box:
**New** (only the glowing `RECENT` controls, from every section), then one tab per group of
sections (`LAB_TABS` in `lab.ts`). A gold dot marks tabs that hold glowing controls. Search looks
through every tab. The Target player picker stays above every tab.

### Arcade games (board + action bar)

Arcade games follow the venture board: a glass board centered on the screen
(`.arcade-layer > .arcade-stage`, kept clear of the toolbar, the action bar and, on phones, the
player cards) and the action bar for words and buttons. Never a pop-up.

- **Board head:** the game name in Lilita gold, a muted one-line subtitle ("Leg 1 of 3", "Everyone
  may bet"), and for party games a row of portraits: faded = waiting, gold ring + bob = choosing,
  green tick = ready.
- **Action bar (`.aa`):** a Lilita title saying what to do or what happened ("Rosa: pick a chest",
  "Rosa leads after leg 2"), one muted hint line with the numbers that matter, and the controls on
  the right (stacked under the text on phones). One gold button; equal options (Sprint / Grab
  coins) are plain buttons; Skip/Take are ghost. Results end with a gold Continue that also moves on
  by itself.
- **Picking on the board:** things you choose (slots, cards, bets, chests) are tappable on the
  board with the build picker's selected look (gold tint + 2px inset ring + lift); the action bar's
  gold button then names the choice ("Bet 20G on Red", "Take the 150G chest").
- **Art:** smooth icons (`coinIconURL`, `starIconURL`, suit icons, wild card), cream "paper" faces
  for slots and cards, player portraits for people. No text-symbol stand-ins.
- **Sound:** the venture board and each arcade game have their own music (`HotSeat.setScene`, `GAME_MUSIC`); a card
  flipping plays `flip`.
- **Motion:** slots not kept spin (symbols flick past blurred every 70ms, then stop left to right with a small bounce, `reelTick`/`reelStop` sounds); memory cards flip with 3D `rotateY`
  and `backface-visibility: hidden`; derby runners are the players' walking sprites (no circle), stepping one space at a time down a paved lane; the wheel spins about
  four turns and eases out; chest lids swing open. All respect reduced motion.
