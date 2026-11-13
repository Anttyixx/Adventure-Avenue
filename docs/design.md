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
| Get to a **screen-wide tool** or info at any time                       | **Toolbar / info chip** (top corners)                                                | Zoom, Game log, Menu (with the Guide), game name and goal    |
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
  ("BOARD", "DISTRICTS"), with an optional count on the right ("8 of 12").
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
- **Placement:** `top: 10px; left: 10px` (`.top-row`; the UI Lab puts its build chip `.lab-ver` to
  its right).
- **Anatomy (game):** gold Lilita title ("Adventure Avenue") · a muted goal pill · Room button
  online · the Info button at its end. **(builder):** "Board builder" · inline name input · save status
  ("Not saved yet" gold, "Saved" green) · "Board settings" small ghost button.
- **Spec:** `.info-chip.glass`, padding `5px 6px 5px 12px`, gap 6, 12px text, wraps if needed.
- **Behavior:** buttons in it turn **gold while their thing is open** (`aria-pressed="true"`).
- Keep it to one line on desktop; put nothing here that changes every second.

### 5.2 Toolbar (top right)

- **Purpose:** screen-wide tools.
- **Anatomy:** zoom chip (a pill showing "250%"; tap = reset zoom **and recenter**; its 2px border
  shows the zoom mode: grey `#8a93a8` free, blue `#4c9bff` auto, red `#e5484d` locked, via
  `data-mode`), then small
  buttons ("Game log", "Music", "☰ Menu"; builder: Undo, Save, gold "Test play", Menu).
- **Spec:** `.toolbar`, `top/right: 10px`, gap 6, buttons `.btn.small` on glass. Order: View
  board chip (only while a pop-up is up; pops in, gold "Back" while the pop-up is hidden), zoom
  chip, Game log, Music, Menu. The Guide is an item in the Menu pop-up (under Resume), not a toolbar
  button.
- **Rule:** at most one gold button here (the thing to do next, e.g. Test play).

### Music and sound pop-up

- **Job:** identify the current music and adjust audio without leaving the current screen.
- **Container:** anchored nonmodal `.snd-pop.glass`, right-aligned under its chip, 336px wide
  (up to viewport minus 16px), 14px radius, 12px padding, navy 96% background and the shared
  glass edge/blur/shadow. Clamp within 8px of the viewport, reposition on resize and scroll
  internally if needed. Use a 180ms pop-in; no backdrop wash or game pause.
- **Hierarchy:** gold Lilita 20px Music & sound heading and a round 30px Close button; an inset
  current-track card with a small muted uppercase label, Lilita 18px title and 12px scene/status.
  Four tiny gold level bars move only while audible. Keep track titles on one line with ellipsis
  and full title on hover. Muted/zero-volume/not-started/no-track states replace the scene line.
- **Controls:** an inset group with Music/Effects labels, gold percentages and rounded gold-filled
  range sliders (28px touch area, 18px thumb); a full-width navy mute toggle below. These are
  audio levels, not money controls. All instances share live settings. Slider changes unmute;
  Effects previews a coin sound on release. The game menu uses the same controls inline.
- **Chip:** Music after Game log, before Menu; note icon with a desktop label, icon only on phones.
  Open chips have a gold inset edge; muted chips have a red icon. Menus/setup retain Sound labels.
- **Access:** dialog name, expanded/control state, labelled sliders with percentage value text,
  visible keyboard focus and a pressed mute toggle. Escape/Close returns focus to the chip;
  outside click and a second chip click dismiss. Audio-control keys never trigger turn shortcuts.
  Reduced motion removes pop-in and level animation.

### 5.3 Action bar (bottom center)

- **Purpose:** this moment's one decision, or what's happening now.
- **Placement:** centered on the whole window, `bottom: 16px`, never under the player cards.
  When the window is too narrow for a centered bar to have 520px (`AB_CENTER_MIN` in `hud.ts`)
  between the cards on both sides, the HUD gets `.ab-left` and the bar sits bottom left
  (14px from the edge, 8px on phones), using all the room up to the cards. With `.ab-left`, the
  pop-up layers (`.stock-layer`, `.venture-layer`, `.arcade-layer`, `.info-layer`) use
  `justify-items: start` with the same left gap, so pop-ups line up with the bar. `hud.ts` sets
  `--ask-free` (the room the bar takes at the bottom) so pop-ups can fill the height above it. Decide by window size
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
     right ("DISTRICTS · 8 of 12"); sections separated by a divider and 12-14px.
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
    sideSection('Districts', '8 of 12', hint, ...districtCards, addRow),
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
  groups (LAYOUT with the Blank placeholder, PROPERTIES, SUITS, SPECIALS, TRANSPORT) use section
  headings; tiles are the game's own
  tile art in a two-column grid. The chosen tile glows like a game choice (pulsing white outline
  in a gold glow + white rings spreading out, CSS `::before`/`::after` matched to the tile).
  Shown only while placing.

- **View chip** (`.ed-view-chip`, first in the toolbar): "View: Normal" / "View: Tile types",
  gold outline and text when on. The tile-type view is a planning aid: solid fills by kind
  (`TILE_TYPE_COLORS`), district borders with a white ring inside, no pictures, and a glass key
  (`.ed-legend`: 12px swatches and names, 12px bold) under the info chip while it is on.

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
- **Chips under the cards** (`.cards-bar` of `.cards-chip.glass`): one row, right-aligned, 5px
  apart: Stocks (hidden on Easy rules), Properties, then the layout chip (`.cards-mode-chip`). Glass
  pills with a 2px border (one step thicker than the glass default), Nunito 700 12px, padding 2px 9px; hover gives a gold border; `.on` (its pop-up is open) is
  gold with dark text, like the Info button; focus shows a gold ring.
- **Card layouts** (`.cards-wrap.collapsed`, `hud.setCardsMode`): the layout chip shows only the
  current layout as a 14px stroked SVG icon only (the name is its tooltip and aria-label), List (three bars) or Smart stack (a card
  with an arrow rising out); a tap switches to the other one (`CARDS_MODES` in `hud.ts`).
  Collapsed (Smart stack), every card shares one grid cell (`grid-area: var(--row) / 1`, with
  `--stack-n` x 7px of room above for the peeking cards); the active card is in front
  and the others sit behind by turn order (`--d` = depth), each 7px higher and 5% narrower, filled
  with their `--pc` and their contents hidden (3 show, deeper ones fade out). Back cards use
  `contain: size` and stretch to the front card’s grid row: hidden status content never sizes
  the stack. Opening or popping removes containment and restores natural card height. Folding/unfolding (`setCardsCollapsed`): each card glides from
  where it was to its new place, matched at its top middle (`.pcard` `transform-origin: 50% 0`,
  `T.cardStack` 504ms, `T.cardStackStagger` 26ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`; `hud.glide`, the
  one motion for the layout chip, opening a stack for a moment and smart pop-outs), with the cards' own
  transform transitions off meanwhile (`.cards-wrap.stacking`). The chips remain anchored below the bottom card, with no translation animation
  while the cards fold, unfold or pop out. Interrupted glides resolve to the intended depth
  transform, with a generation guard preventing cancelled glides from ending a newer one. Turn change: the old front card
  drops 55% of its height (ease-in), goes behind the stack, then rises into its back place
  (ease-out; `T.cardCycle` 750ms, Web Animations), while the rest ease forward (0.4s). Behind cards are `inert`.
  Opening a stack (`openStack` / `closeStack`, `hud.stacked`): a click or tap on `.cards` (the
  front card or the strips) unfolds it to the list with the same glide for `T.stackOpen` (3s); a
  mouse `pointerenter` keeps it open until `pointerleave` (taking over a tap's timer). Cards open
  the info pop-up only while the cards aren't stacked; the layout chip doesn't change.
  Smart: a card behind the front one (never the active player's) whose cash or net worth changes
  gets `.popped`
  (`popCard`): it takes a row of its own above the stack (`--row` 1, 2... in turn order, the stack
  on the next row) with its contents showing, and goes back `T.cardPop` (2.8s) after its last
  change; its count-up and money chip start `T.cardStack` later, once it has arrived. Rising out
  and going back glide every card from where it was (`glide`, `T.cardStack`), once per update
  however many cards changed; a card already running its own move (the old front card's drop to
  the back) is left to finish it. The pattern for any stack of
  same-shaped cards where only the front one matters.

### 5.15 Info pop-up (pop-up + action bar)

- **Info button** (`.info-btn`): a pill at the end of the info chip, an "i" in a white outlined circle and "Info";
  gold (`.on`) while the Game info pop-up is open. The Stocks and Properties chips under the player
  cards open the stock market and properties pop-ups the same way (5.14).
- **Pop-up lock** (`hud.updateLock`, `.hud.locked`, `board.locked`): while any pop-up layer has
  content (info, stock, venture, arcade, or a `.modal-wrap` dialog) and View board isn't peeking,
  `pointer-events: none` on the top-left chips, the zoom chip and the player cards with their chips,
  and the board ignores hover, taps, wheel and pinches (glowing squares of a choice stay
  pickable). The action bar and the toolbar's View board, Game log, Music and Menu stay live. Use
  this for every new pop-up: put it in one of those layers so the lock follows it.
- **Pop-up** (`.info-layer > .modal.info-pop`): one width (up to 1,000px). Game and Stocks take
  the height they need (max 640px); player pages (`.player`) all share one fixed height (400px;
  phones fill the free area; with three columns the properties list `.pv-props` scrolls inside
  its column, scroll bar hidden) so flipping between players never resizes it; page changes ease the
  height (320ms); pages scroll inside. 5px top
  edge (gold; the player's `--pc` on a player page, fading between). Ghost **Back** button in the
  top right (`.info-close`). Centered and kept clear of the player cards (`keepClearOfCards`);
  non-dimming, only the box catches clicks; opening/closing motion as for the stock market. Page
  changes pop: the old page's parts (`popParts`: head, sections, map, shop cards, table) shrink
  to 0.82 and fade (136ms, 16ms apart), the box morphs its height (235ms), then the new parts pop
  in (0.82 → 1.03 → 1, 253ms, 27ms apart). Scrolling areas keep 6px of room inside their edges
  (`.info-scroll`, the property list's right side) so popping and hovered parts are never clipped. Player pages: columns 26px apart (rows 18px),
  sections 16px apart, the first column at least 300px; a container query keeps the top-right
  heading (or the name, single column) 70px clear of Back.
- **Action bar:** Game info, the stock market and the properties leave the real bar showing
  (`.hud.info-plain`, `InfoPopup.syncBar`) and offer no View board chip: View board is only for
  pop-ups that can't be closed until a choice is made. Player pages (and finding a property) use a
  stand-in `.prompt-center.info-bar` over the real bar (`.hud.info-open` hides the real one and
  any stock/venture/arcade layer) with pill tabs (`.ib-tab`, 2px border, gold when on), one per player (`.ib-player`: portrait + name, border and fill in `--pc`;
  portrait only on phones, and anywhere the chips don't all fit the bar's widest size:
  `info.ts` `fitTabs` adds `.compact`, rechecked as the bar resizes). It morphs out of the real bar's size on opening (300ms, tabs fade in
  after 120ms) and back into it on closing (tabs fade out first; then the real bar shows underneath while the
  stand-in fades out over it, and the pop-up stays hidden once its closing motion ends, so nothing
  blinks).
- **Finding a property** (`InfoPopup.showOnBoard`): the box sinks away, `board.overviewHold` +
  `board.focusSquare` (auto zoom; zooming recenters on the square) + `board.spot`, and the bar
  morphs (`swapBar`, 260ms) into `.ib-note` (name, owner) and a gold "Back to info"; no timer.
- **Pages:** Game (how to win and a facts grid at 14-17px; standings as `.pcard.info-pcard`
  cards, the game screen's player card markup, in a ~320px column); Properties (rounded player
  chips `.info-owner` pinned above the scroll area (`.info-fade` masks the top 20px), 2px `--pc`
  border and tint, name in Lilita over "N properties · worth X"; tap to pick: `.on` glows white +
  `--pc`, other chips fade, cards `.picked` glow and `.faded` drop to 30%; then a grid of two districts per row,
  four cards each (`.info-props`, eight columns, one district a row below 640px): 64px art,
  owned cards `.pv-card.owned-by` with a 26px owner portrait badge top left and a `--pc` bottom
  edge, unowned cards `.unowned` dimmed to 55% with "For sale" or a dashed VACANT box);
  Stocks (`marketView(..., { split: true })`);
  a player (`playerOverview`: three columns. First: the head (sprite, name + CPU tag,
  level/rank/suits, net worth in Lilita 26px at the right), an 8px goal bar (`.pv-goal`;
  hover/focus pops a `.pv-tip` with the percentage and what is left), a muted "Next promotion
  pays" line, then the ring chart. Second: properties as a one-column list (`.pv-row`: 4px
  district left edge, 40px building art on the left, then the kind in bold over the district with
  its dot, and "Rent" (gold Lilita) over "Value" on the right; hover nudges it 2px; click to find
  it on the board). Third: the shares table, starting 16px
  lower so its heading sits beside Back).

### 5.16 Banner

- A pill near the top center: Lilita 26px, glass, 3px border in the meaning color. Rises in, fades
  up and out. One short line: "Round 5", "Rosa's turn", "Bay Market stock up! 12G → 14G".
- Banners stack in a column (8px apart). When one leaves, the ones still showing glide up into
  its place (`hud.dropBanner`: `T.bannerShift` 360ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`, on
  `translate` so it doesn't fight the rise-in or fade-out) instead of jumping there.

### 5.17 Tooltip

- Glass box near the pointer (kept on screen), 220-280px, **5px top edge in the district color**.
- **Head** (`.tt-head`): a 56px picture of the tile drawn with `paintSquare` (`.tt-pic`), then the
  name (Lilita 15px, no price) and the owner pill (player color + portrait) or a muted "For sale"
  pill (`.tt-owner.free`).
- **Headline number** (`.tt-hero`): one gold Lilita 22px amount on a faint gold panel with a muted
  label: the Fee when owned (muted and struck through when closed), the Price when for sale.
- **Lines** (`.tt-lines`): muted label left, bold amount right (Value, Max value, Buyout, Stock).
  Never repeat a number: a shop for sale shows only its price.
- Then a plain sentence (`.tt-info`: what a building or special square does) and the district strip.

### 5.17b Board tiles (canvas)

- Property tiles use the same two spots (`drawSquare` in `board.ts`): pictures stand on one base
  line (property and building art is bottom-aligned at `artY + 23`) and the price or fee is
  centered on one text line (`textY`). **Special tiles have no text**: their picture is centered on
  the tile by its visible part (`drawPropCentered`, about 66 x 66; the bank 76 x 64). The
  owner's initial badge sits in the same spot on every property (`x + 22, y + 14` from the art).
  Everything keeps at least 5px clear of the border's inner edge (art at most ~59 x 45, text 15px).
  `drawProp` fits each image's visible part (its alpha bounding box, `contentBox` in `props.ts`),
  never the frame, so sprites with uneven padding line up. Hex tiles draw their pictures at
  `HEX_ART` (90%) around the base line, clear of the slanted top edges.
- Sprites must never be clipped: check new art for straight cuts at the image edge (the old Boom
  burst had them; `boom-v17/` replaces it).
- **Rides** (`travel-art.ts`, drawn by `BoardView.travel`): each way of jumping to a square has its Balloon rides use `balloon-v18/` base/tint art, with a recolored canopy, cream panels and warm wicker basket. Keep the rider visible in the open suspension gap and anchor the basket rim at their waist. Boarding uses a 5% larger basket: the player steps in over the first 18% of the ride, shrinking to 62% size, then hops out and returns to full size during the final 18%, after landing. Reduced motion skips the ride.
  own look (warp beam, portal vortex, cannon smoke and tumbling arc, taxi with the rider's color on
  the roof, hot-air balloon in the player's color, swap trails in both players' colors, venture
  gold stars). New rides follow the same pattern: a token pose plus short-lived world effects.

Trade offers keep the compact action bar layout: two colored offer columns and buttons to their right. Each column has a high-contrast heading above its property chips; editing places the cash stepper beside the heading, while reviewing keeps gold cash chips inline with the properties. Received offers say “You get” and “You give.” Accept sits above Counter/Decline. Keep phone labels and chips at least 11px, preserving the existing small footprint and scrolling long property lists.

Checkpoint and suit arrivals skip the generic landing announcement and pause, so the effect takes priority immediately. Checkpoint payment and toll-rise effects run without pauses between them, matching a pass-through; subsequent decisions restore normal pacing.

Motel check-in uses the existing action-bar question: show the lodging fee, “Added to your next roll +N spaces”, and that checking in ends the turn. Check in and Keep moving are the only choices. Normal landings skip this prompt. Player cards show pending carryover as a status tag; roll-result text explains “5 + 2 saved = 7 spaces,” with the real die face preserved. Saved spaces are a second die: at check-in the counting die flips to the saved number and arcs into the motel tile, shrinking and fading (`T.dieToMotel`); on the next roll it pops out of the motel in an arc and lands left of the new die (`T.diePop`), then both shrink beside the head (saved left, new right). The saved die counts first. A saved die dropped by a second check-in puffs away (grows, fades, a ring of small white clouds).

Tax Office board labels and tile-info headlines show the active player's actual fee, or “Receive” and the owner payout on their own turn. Estate Agencies show “Buy” for the owner and “Break” for rivals. Shop landing and Buy/Pass action bars omit the price; the board and tile info remain the price reference.

Arcade art uses the same rounded painted style as board props (`arcade-v19/`). Memory cards retain their flip, reels retain their spin/lock feedback, and treasure chests crossfade between closed and open sprites; reduced motion suppresses transitions. Keep wheel numbers and alternating red/blue sectors separate from its gold frame so bets remain accurate. Pin sprites use a fixed cream center and recolored body, preserve tip alignment and bobbing, and freeze the bounce with reduced motion. Preserve the earlier CSS and vector art behind independent rollback flags.

### 5.17c Game setup

Reopened online games keep guests on Continue Game until the host presses Resume; no Ready, rename or character controls are shown there. The host then sends the same saved turn to all connected guests before play starts. Reopened local games designate the first human as host, so Resume is always available.

- **Layout** (`.setup.su`): a fixed top bar `.su-top` across the screen, 10px from the edges:
  "‹ Back" (`.btn`, navy 60%) and the title (Lilita 34px) in the top left corner, the join code
  chip `.su-code` (dashed gold pill: "Code", the code in Lilita gold, "Copy link") right of the
  title, then the main menu's Sound button in the top right corner; Back and Sound are both 40px
  tall (32px on phones). The status line is a screen-reader-only live region (`.sr-only`). Under
  it `.su-body` (a row): `.su-scroll` (stretched to the full height left of the players column;
  `overflow: visible`, since every layout fits and a clipping box would cut the panels' shadows
  off in a hard line) with the board panel (left) and the settings panel (right) in a 1fr : 1fr
  grid, equal heights (up to 1120px before scaling), the grid centered across and up and down by
  `margin: auto`. **Fitting** (`setupFrame` `fit`, on every redraw, resize and once the fonts
  load): a scale `--s` = min(window / reference) clamped to 1..2 (reference 1366 x 768 sideways,
  820 x 1180 upright) zooms the top bar, the players column (`CARDS_ZOOM` 1.2 x s; 1 x s on
  phones) and the panels together. Then one class on the screen: `layout-side` (sideways, when the
  room is at least `SIDE_WIDTH` 950px before scaling and the panels' height fits), `layout-stack`
  (upright, when Board over Game Settings fits: full width, zoom min(s, room / `UPRIGHT_WIDTH`
  540px)), else `layout-tabs` (one panel at a time at that zoom, `.su-main` exactly the room's
  size with 0/10/10px padding, `.su-tabs` under the title: two `.su-tab` chips on the left
  ("Board", "Game Settings"; Lilita 15px pills, navy 88% fill, 2px `--glass-line` border, gold
  border on hover, solid gold with dark text when chosen, soft shadow, `role="tab"`), the shown
  panel stretched to the bottom (settings scroll inside if needed, the map picture up to 100dvh -
  300px tall above 500px high), the hidden one without `.shown`). Widths and heights are set in
  pixels and heights measured unzoomed, so the browsers' different zoom handling can't push the
  panels under the player cards. The tab choice is kept between redraws. Under 520px wide the
  title is 22px, Sound is icon-only and the code chip drops its "Copy link" text. Panel headings are title case, Lilita 28px (21px on phones):
  "Board" and "Game Settings"; screen titles too ("New Game"). The settings' `.seg-btn` pills have
  2px borders (one step up from 1px). The Board panel has no tool chips. On the right, the players column
  `.su-side` (`setupFrame().side`) sits against the bottom right corner like the game's
  `.cards-wrap`: 300px at zoom 1.2 x s (phones 232px, 190px when 500px tall or less, zoom 1), 10px from
  the edges, `justify-content: flex-end` so it grows upward. Every redraw goes through
  `morphSide`: the column eases its height (320ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`), seats
  matched by `data-key` (a lasting seat id, or a joined player's name: never the character, which
  can change) slide from their old place (measured from the column's
  bottom edge, divided by its zoom), new seats pop in (fade + scale from 0.85) and removed seats
  leave a fading ghost copy; an interrupted change starts from what is on screen. Settings are two
  columns (`.su-rules`, 14/16px gaps): rule set and stocks, then goal and vacant plots. Vacant plots is a cycler (`cycler()`, `.su-cycle`): the value
  in a gold-outlined pill (2px, gold 12% fill, min 96px) between two 32px gold round arrow buttons
  (`.su-cycle-btn`, 3px drop shadow, pressed 2px down) that loop through the amounts; read-only
  shows the pill alone.
- **Map carousel** (`mapCarousel()`): `.mapcar` (overflow hidden, edges faded out with a
  12%/88% mask) holds a `.mapcar-track` of five `.mapcar-slide`s (the board and two either side,
  wrapping round the list), each 62% wide with a 14px gap; the middle one (`.on`) is full size,
  the others scale to 0.8 toward it (`.before`/`.after` set the origin) at 45% opacity (70% on
  hover) with their names hidden; tapping one moves there. Each card (`mapSlide()`) is the
  `.car-thumb` picture in a frame of one fixed size whichever board shows (full card width,
  `--thumb-h` tall: min(250px, 30vh), 96px or the room left on phones, more in `layout-tabs`;
  the picture scales to fit inside, centered), so the panels never resize as the carousel moves,
  and `.mapcar-name` (one line, the name ellipsized; a red "Needs fixing" `.car-tag.bad` for a
  board with problems) (Lilita 24px, plus a purple "My board" `.car-tag`). A move
  redraws the row and animates it in from one step over (`translateX(k * (62% + 14px))`, 380ms,
  `cubic-bezier(0.2, 0.8, 0.2, 1)`), the new middle board growing from 0.8 and the old one
  shrinking. Under it `.mapcar-line` (6px, white 14%, up to 320px / 70% wide, tappable with a
  taller hit area) holds `.mapcar-pos`, a gold bar one board's share wide (min 18px) with a soft
  glow, whose `left` eases along with the move. Board pictures are drawn once per board and
  copied (`thumbOf`).
- **Landscape phones** (500px tall or less, 540px wide or more): the chosen panel fills the room
  under the chips instead of scrolling: the map picture shrinks to fit (board names 17px), settings drop their hints and use 26px
  buttons and a smaller digit picker; only the settings panel scrolls (thin bar) if a phone is too
  short.
- **Players column** (`playersColumn()`): no heading and no empty seats. Top to bottom: the add
  chips (host only, until 5 players; `addChips()`, `.su-add`, keyed `add`), `.su-seats` (up to 5
  seat cards with the game's 6px gap, 4px on phones), then an optional footer tile (`.su-start`). Order (`byArrival`): this device's own player at the bottom, everyone
  else above by arrival, newest on top; seats already there when a device first draws keep seat
  order. Because the column is bottom-anchored, a new seat on top pushes the chips up (they slide)
  and pops in itself; at 5 players the chips leave as a fading ghost while the new card pops in.
- **Add chips** (`.su-add`, right-aligned, 6px gap): both navy 88% fill with a 2.5px outline:
  `.seat-add-local` "Add local player" in blue (`#4c9bff` outline, `#7db8ff` text) left of
  `.seat-add` "Add bot" in gold (`--accent` outline and text);
  both 999px pills, 12px bold, 4/12px padding (phones 11px, 2/9px), a soft shadow so they read over
  the scene, scale .95 on press.
- **Long names** (`marquee.ts` `nameText`, `.name-fit`): any player name that may not fit (player
  cards, seat cards) is an inner `.name-run` in a clipping box. When it overflows (rechecked by a
  `ResizeObserver`), `.name-long` fades its last part to 30% (a mask twice the box's width, so
  the fade can move) and slides it to its end and back (`--name-shift`; pauses at both ends; 5s
  plus 1s per 12px of overflow), the fade moving to the start while the end shows. Reduced motion:
  no slide, the end stays faded. Never an ellipsis (it would hide the sliding text).
- **Renaming in setup** (`NameEdit`, `.su-rename` / `.su-name-input`): on seats that may rename
  (players on the host's device, a friend's own seat) the name is a button (dotted underline on
  hover, gold focus ring); tapping it swaps in a box in the name's font (Lilita 16px, 1.5px gold
  outline, dark fill, a soft gold ring when focused, `maxlength` 12). The screen keeps the draft,
  so redraws (someone joining) keep the text and the cursor (`refocusName`).
- **Seat cards** (`seatCard()`, `.pcard.su-seat`): the game's player card tile (glass, 5px
  `--pc` left edge, 12px radius, same paddings and phone sizes) so setup and game read as one. Left
  (`.pc-side`): the character trimmed to its pixels (`charButton(look, 'body', ...)`, 34 x 52 like
  `.pcard .portrait.body`; phones 24 x 38, short phones 22 x 32); a player who can change it gets a
  gold ✎ on its bottom right instead of the "Change" strip: just the icon, no badge, 15px (12px on
  phones) with a dark navy halo and a soft gold glow (`text-shadow`) so it reads on any sprite. Top row: the name
  (`.pname`, Lilita 16px) and, at the row's end, a round 18px remove button (`.seat-kick`, faint
  white, red on hover; never on the host). Bottom row (`.su-seat-foot`): a muted bold tag ("You ·
  host", "On this device", "Joined online", "Bot") and, at the end, the `.seat-ready` chip (2px
  border; gold outline "Ready", green with a tick when ready; joined players' state as the same chip without a
  button, `.badge`; bots have none). An open seat shows a dashed "?" box and "Open"; a player not
  back yet is faded with a red "AWAY" pill (`.seat-away`) beside the tag. Open seats (a CPU
  plays them unless a friend joins) are not shown.
- **Player card** (main menu, `.menu-card` + `openPlayerCard`): a `.menu-sound` button in the top
  right beside Sound, the same shape and height as Sound and Menu (37px, 32px on phones; all three
  `.menu-top > .btn`): the whole character (`bodyURL`, 26px tall, 22px on phones, never cropped
  to a circle) then the name (ellipsis past 200px). Never blank: `ensureProfile` gives a first
  visit a random friendly name and character. Its pop-up is a
  `.modal.player-card` (same frame as the Menu pop-up): the character on a spot in a tile like a
  seat card (`.pc-stage`, gold-free, the seat color's top edge) beside a labeled name input and a
  muted hint; Done in the head. No Save button: changes save as they are made.

### 5.17d Continue game

- `online.ts` `resumeLobby` builds the game setup frame (`setupFrame`, `setupHead`, exported from
  `start.ts`) so continuing looks like starting: the code chip in the top bar and the players
  column with seat cards (no remove buttons). One panel (`setupFrame().single()`, `layout-solo`:
  up to 720px wide before scaling, scaled down to fit) replaces Board and Game Settings:
  `.su-saved` with the head "Saved Game" and the muted "Saved in round N" pill (`.su-round`), a body
  with the board (`boardStage()`: `.mapcar.locked`, picture and name) beside a `dl.su-saved-facts`
  of the chosen settings (muted 13px labels, bold white 15px values; wraps under the board when
  narrow), and a foot (a hairline above) with the rejoin hints. **Resume** is on the host's seat
  card, in the Ready chip's place: the same pill filled gold like a main button
  (`button.seat-ready.resume`). A player not back yet: seat faded to 50% with a red "AWAY" pill
  (`.seat-away`) beside the tag.

### 5.17f Board collection

- `collection.ts` `openCollection`: the title scene with the setup screen's top bar (`.su-top`:
  Back and the title left; Add a board (plain), New board (gold) and Sound right). Below, a grid
  that scrolls without a scroll bar (`.coll-grid`, `auto-fill, minmax(250px, 1fr)`; 220px on
  small screens) of dark glass cards (`.coll-card`) with a 3px border: gold when the board is
  shown in new games, grey (`#7c8597`) when hidden, which also greys out the picture. Each has the
  carousel's green frame (`.car-thumb`) at one fixed height so every card matches, a round eye
  button over its top right (`.coll-eye`, gold or grey with a crossed-out eye), the name in the
  heading font with `car-tag` pills, a muted meta line, and outline chips (`.su-tab`) View /
  Remove (Remove turns red on hover; faded and disabled on built-in boards).
- Remove asks in the menu pop-up frame (`modal-wrap menu-pop`): a red **Remove** and a ghost
  **Cancel**. Problems (and only problems) show in the same frame with a gold OK; nothing else
  needs a message because the cards change in place.
- Board viewer (`editor.ts` with `view`, `.ed-viewing`): the builder with the tool rail, Tiles
  pane, side panels, Board settings button and save status hidden; the top right holds the zoom
  chip, a gold Edit and Back. Editing swaps them for Undo, Test play, Menu and a gold Done. The
  save question is the builder's `ask` pop-up with Don't save (ghost), Save as and Save (gold, the
  last button); Save as asks for a name in an input (`.ed-saveas-name`).
- Roads (`board.ts` `drawRoads`): sandy (`#c9b07a` edge, `#efe0b6` paving, 44 and 36 wide). A
  one-way road is the same road with a darker arrow (`#a07b3f`, 13 long, 24 wide) painted in the
  gap between the tiles (or on a portal's short road, 2/3 of the way out), pointing the way
  players may go.
- Portals (`portalGates`, `drawPortals`, `drawPortalRing`): a short road from the tile out
  through its side to a ring 0.72 of a cell step from the tile's center (`portalPoint`). The ring
  is the same for every kind: a 48-unit ivory stone/gold frame with four inset gems in its
  link color, enclosing a shaded colored core. The frame stays fixed. Two separate PNG energy
  layers counter-rotate (outer 4.2 s/revolution, inner 1.3x faster in reverse), with a gentle
  5.5% sinusoidal pulse and three tiny cream lights orbiting the rim. Use continuous time rather
  than wrapping phase, so the different speeds never snap at a loop boundary. Reduced motion
  freezes all parts. Entrance/exit direction is still indicated by the arrow on its short road.
  Live views draw portals every frame over the cached board (`paintBoard(..., portals = false)`);
  still pictures draw them unturned. The cell a portal opens onto gets no scenery.
- Portal pop-up (`hud.showPortalTooltip`): the tile tooltip's frame with the portal's color as
  `--dc`, a title, a `.tt-info` line and a muted `.tt-hint` line. Tapping a portal
  (`BoardView.showPortal`) sets `lookAt` to frame its tile and its linked portals' tiles and
  clears it after `T.portalShow` (2 s) unless something else took the camera. `flashPortals`
  flashes the tapped portal and its linked portals three times over that time: each pulse lights
  the ring white (up to 85%) in its first fifth, then fades, while a glow in the portal's color
  (up to 55%) and a 3px white ring spread out from it.
- Builder Links tool (canvas, world units, radius 15 with a white ring): road badges between tile
  centers: one way is `drawRoadArrow` (navy fill, gold chevron); `drawLinkBadge` is green
  `#2f9e5b` with a white two-headed arrow (both ways) or red `--bad` with a dashed ring and a white
  cross (removed). Free sides (`drawSideMarker`): a faint portal, purple at 75% with a dashed white
  ring and white swirls; gold with navy swirls once picked as a new link's start. A selected portal
  gets a gold ring (radius 23) and gold `drawLink` lines to the portals it joins.
- Portal panel (`gatePanel`, the tile info panel's frame): `sideHead('Portal', place · side)`,
  a **Kind** section with `seg` pills (disabled pills carry the reason as their title), a
  **Leads to / Comes from** section of `.ed-gate-row` buttons (gold dot, tile and place, the side
  on the right in muted text), then a small red **Remove portal** button.

### 5.17e Too big for the room (over the player cards)

- **Action bar** (`hud.fitAskOver`, `.hud.ab-over`): checked after every change once the bar has
  stopped morphing. If anything is cut off or has to scroll (a button, the question or one of its
  chips reaching outside the bar, a button row that has to scroll, or the question squeezed; the
  bar's own scroll size isn't used, since button rows' spare room for shadows pokes past it), the bar spans the screen 8px from each
  side at `z-index: 6`, as a column: the question (no line clamp) above the choices, which wrap
  (centered) instead of scrolling; up to the room under the toolbar tall. `.hud::after` puts a
  full-screen navy 25% wash with a 6px backdrop blur behind it (`z-index: 5`), and the toolbar
  rises to `z-index: 6`. Button rows otherwise line up with `justify-content: safe flex-end`, so
  a row that overflows spills to its scrollable side, never out of reach.
- **Pop-ups** (`modals.ts`): `fitInLayer` lets a pop-up that would shrink below 0.9 spread over the
  cards first (`.over-wide`: the layer's right padding drops to 8px; the stock pop-up's width
  limit lifts), then zooms if still needed; `keepClearOfCards` doesn't move a spread pop-up and
  marks a pop-up that can't clear the cards (`.over-cards`). `.over-cards` gives the layer the same
  wash and blur, and the toolbar and action bar sit above it.

### 5.18 Game log

- **Game log:** a toolbar button (`.log-toggle`, between the zoom chip and Music, gold `.on`
  while open) opens a glass panel (`.log-panel`) top right: `top: var(--top-free)` (just under the
  toolbar), `right: 10px`, as wide as the player cards (`--cards-w`, min 240px), max height down to
  the top of the cards (`--dock-b`); on phones (`max-height: 500px`) it may run over the cards. It
  pops in (200ms, fade + 8px drop + scale .96 from the top right); Close, the button or Escape
  closes it. The log groups lines by turn, newest at the bottom. Rolls and arrivals are main rows; follow-up actions use an indented branch beneath their landing. Keep action icons, high-contrast text and colored player names. Tile-linked rows are full-width buttons with an arrow, a hover background and a visible keyboard focus outline. Clicking briefly frames and outlines the tile for 3 seconds, leaving movement choices intact. Legacy rows remain plain text. No extra confirmation is needed.
- **Log entry grid** (`.log-entry`): a 22px icon column, 8px gap, the text, then the locate arrow.
  Every icon (main rows, follow-ups and the waiting line) is the same 22px rounded square with a
  15px centered picture; the text's line height is 20px plus 1px padding, so the icon centres on
  the first line. Names in the log are bold Lilita at 14px with `line-height: 1`, so they never
  stretch that line. Follow-ups hang off a 2px line that runs straight down from the centre of the
  main icon. The turn header's portrait sits in the same 22px column.

### Results (pop-up)

- Winner strip (player-color gradient from the left, 5px left edge, 56px character, Lilita 26px
  gold name), then player cards in an auto-fit grid (min 250px, 300px on short screens; 4px top
  edge in the player color, the winner's card with a soft gold inset ring). Each card: a place
  medal pill (gold / silver / bronze gradients, then plain), portrait, name in their color, level,
  "Net worth" with the amount (Lilita 22px) on the right, and below it the player page's net worth
  ring (`overview.ts` `assetMix`, 88px here). Section headings in Lilita 16px. The stats table sits
  in a faint glass panel: tabular numbers right-aligned, every other row shaded, player chips
  (portrait + name, 1.5px border in their color) as column heads, gold uppercase group rows, the
  best cell gold and bold with a small star.

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

- **Ground:** solid grass `#97c26a` by default (`GROUND_SET` in `props.ts`), for speed, with
  light scenery from `foliage.ts`: a river beside the board (bank `#7fae58`, water `#4cb8cf`,
  broken white ripples) and foliage clumps that thicken away from the board. Only draw scenery
  as separate small pieces (never a full-screen layer), keep tiles, roads and portal openings
  clear, and skip specks when zoomed far out. The textured world below is kept for rollback
  (`GROUND_SET = 'textured'`).
- **World (textured ground):** varied cartoon grass, turquoise water and warm paving, with soft transitions and
  the same rounded forms and cheerful colors as the board tiles. Use light foliage-led
  decoration: trees, flowers, reeds and lily pads, with occasional benches/planters near the
  board. Keep furnishings sparse and distant areas quiet. No default dioramas, enclosing hedge
  walls or decorative walk networks. Keep gameplay tiles, roads and portal mouths clear; no
  sticker rims, opaque floor pads, labels or realistic botanical detail. Terrain uses clean lawn
  tufts, flowing water highlights and chunky rounded paving; keep all lawn tufts/clovers upright
  (no rotated patches or vertical texture mirroring). Keep outlines readable at close
  zoom. Draw decoration PNGs at native resolution, outside the terrain bitmap cache. Match cache
  resolution to camera pixel scale (up to 2px/world unit); soften only the material boundary
  (grass/paving/water: 8/6/3 units, bank 7). Hide scenery in the builder.
- **Ground beneath tiles:** follow the square/hex tile footprint with a continuous margin at
  corners, points and dead ends. Join these pads with the existing path strokes; keep portal
  approach roads their normal width.
- **Tiles** (86 units on a 100 grid): cream `#fdfbf5` (bank `#fff6d6`), radius 12, soft shadow
  down-right. Owned: tint of the owner's color. Properties: 6px district-color border. Vacant
  plots: dashed grey outline + "VACANT".
- **Tile text:** Atkinson 700, navy `#26314f` (`#1b2340` on tints); amounts with the coin
  (`fillMoney`). Special squares: icon + small uppercase label.
- **Warps** (flat four-point star floor pad, equal width/height with four equal arms) and **portals** (round swirl) in their link color: a pair's color,
  gold to the bank, grey unlinked.
- The warp pad sits low on its tile, under the token’s feet, with its WARP label above. Keep its
  geometry square and its plane flat; no socket, pedestal, upright gem or perspective squash.
- **Boon / Boom board sprites:** matched rounded burst silhouettes around gold coins, cream
  trim and bold cartoon shading. Boon is green with a plain gold coin at 70% of the earlier diameter (burst size unchanged); Boom retains its pink
  burst and coins. Fixed colors need only base PNGs; preserve earlier artwork.
- **Characters:** pixel sprites, whole-number scales, sprite-shaped shadow, a name plate (white
  Lilita on a player-color pill with a white outline); the active one is bigger with a bobbing
  arrow.
- **Effects:** gold ring + sparkles (bought, grew), flying coins, floating "+120G"/"-50G" in
  Lilita with a dark outline, stock arrows, shop gates (a drawn navy rolling gate with pale slats
  filling the tile inside its border, a light bottom bar and a red CLOSED sign once down;
  `CLOSED_SET = 'sprite'` brings back the painted `closed` PNG, which is kept).
- Text, rings and lines that must stay readable are drawn at **screen size** (divide widths by
  the camera scale).

---

Portal link feedback uses shared `portal-link-art.ts` arcs in the builder and game. One-way
arcs run from the actual entrance to exit, independent of selection; two-way links draw two
opposing arches, with glowing heads/tails and a static chevron on each lane. Keep line widths
in screen pixels at every zoom. Reduced motion freezes the dots but retains directional arrows.
Side portal frames are 48 world units to meet the 44-unit road; their hit radius is 26 units.
Portal travel is a 1,100ms pull-in / brief disappearance / launch-out pose, with soft local bursts,
no nameplate or base disc during transit, and a small landing hop. Keep the character readable
until it enters and restore its full size afterward; reduced motion skips this transformation.

## 8. Layout and responsive

On smaller screens (`.ab-left`, the action bar sits bottom left), the board centers between the
left window edge and the player cards' left edge (`BoardView.centerLeft`), not on the window.

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

1. **Job:** while building, adjust up to twelve prices and see tiles update.
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
7. **Words:** section "DISTRICTS · 8 of 12"; hint "Each needs exactly 4 properties. In a game the
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
dim the board (`.stock-layer > .modal.stock-pop`, only the pop-up catches clicks; the layer's room is
`--top-free` + 8px to `--ask-free` + 8px, `stockPopup` slides it left only as far as needed to clear the
player cards, and it never scrolls: `overflow: hidden`, `fitInLayer` zooms it down to fit). On
small screens (`FILL_SCREENS`: 500px tall or less, or 760px wide or less) the layer gets `.fill`:
the pop-up fills the room (2px under the toolbar, 8px from the sides, over the player cards, 4px
above the action bar) and the layer behind it is a 25% navy wash with a 6px backdrop blur; the
toolbar and the action bar get `z-index: 5` so they stay sharp above it. The district table then
shows as many rows as fit (`marketView` measures them, a `ResizeObserver` re-counts) as a looping
window onto the list (`holdingsGrid(..., order)`): the selection moving past either end shifts it
by one, wrapping from the last district to the first. Tall narrow screens (760px wide or less,
600px tall or more) bring back the title, map and shop cards above the table. The live auction
uses the same frame, and the decision is in the action bar (`.stock-bar`):
the summary card (`.m-card`, compact), the digit picker, then `.tb-btns` with the gold Buy/Sell
(or the district button) over a ghost Skip/Cancel. Changing district in the pop-up redraws the bar
in place (no new prompt, so the bar doesn't morph). The summary card has two groups split by an `hr.m-divider` (market price + shares held; price per share + cash). The toolbar's **View board** chip (`.view-chip`, `hud.offerViewBoard(el)`; while on offer it
pulses (scale 1.06) with a gold glow every 1.6s; it morphs into
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

### Auction (pop-up + action bar, live)

The live auction follows the stock screen: `stockPopup(hud, 'Live auction', content, 'auction-pop')`
(460px wide, centered, View board chip) holds the lot (with the bid step), the high bid (it pops on
each new bid), the countdown (`.au-clock`: a 14px bar emptying to the end with the seconds in
Lilita on it, gold, red for the last 2 seconds; every bid refills it) and the bidder chips (In,
Leading in gold, Passed / Too pricey faded). The action bar is one live `hud.prompt` that stays up
for the whole auction and is redrawn in place (no morphing between bids): on the left the state
("Kai leads with 340G", muted "Sold in 3s unless someone bids"), on the right a row per bidder on
this device (`.au-me`): gold **Bid 374G** and ghost **Pass**, or a "You lead" / "Passed" tag
(`.au-tag`); with several people on one device each row starts with their name in their color.
Watchers get the same bar with no buttons. The result is a prompt with Continue (auto after a
moment), then the pop-up closes.

### Fitting small screens

Phones in landscape can be 320px tall. Rules, in order: (1) pack first: short labels
(`.tb-long` / `.tb-short` in the toolbar), compact rows (two-row player cards under
`max-height: 500px`), hide decoration (the info chip's game name); (2) then shrink: a board or
pop-up whose contents don't fit its layer gets `fitInLayer(box)` (CSS zoom, down to 55%) rather
than scrolling or clipping; the player cards shrink with `fitCards` so they never reach the
toolbar; (3) layers above the action bar pad their bottom with `--ask-free` (the bar's real height),
never a fixed number. Check 568x320, 667x375 and 844x390 with five players.

### Choices that cover the whole board

When almost every square is a choice (`setChoices(..., { plain: true })`, used when the options
are more than 60% of the board), don't dim, light or pin anything: only the hovered square glows,
and the bar says "Tap a square". Lighting the whole board hides it and costs frame time.

### Badges on picture cards

A count on a picture card (the build bar's "2 left") is a small navy pill in the card's top right
corner (`.bp-left`: 9px bold, `--text`; red when 0). On phones it shows the number only, so it
doesn't cover the picture.

### UI Lab

The Lab's controls live in a pop-up (`.lab-panel`, glass, 14px radius, up to 580px wide, under
the top-left chips, a 180ms pop-in from the top left) that the version chip opens and closes
(`.lab-ver`: a gold "UI Lab" `.lab-ver-tag` and the build, gold outline while open; Escape and the
pop-up's round × close it too; the open state is remembered on the device). It overlays the
screen (it doesn't take room from the board or pop-ups). Inside: a header (Lilita gold "UI Lab",
a pill search field, ×), the target player as pills in each player's color (filled when chosen),
then two panes. Left, the categories (`.lab-rail`, `LAB_TABS`): **New** (only the glowing
`RECENT` controls, from every section) first, then one per group of sections, each with its number
of controls; the chosen one is gold on a gold 16% fill, and a gold dot marks categories with
glowing controls. Right, the controls (only this pane scrolls): each section has a small muted
uppercase heading and note, then its controls as even tiles in a grid (`.lab-row`, min 150px,
left-aligned 12.5px bold text on white 6%, a gold outline on hover). Search looks through every
category; "No controls match." shows when nothing does.

Board controls (the Board effects section, made with `boardBtn` in `lab.ts`, except the builder
button) step the pop-up aside so the effect can be seen: it fades out (160ms), 0.5s later the
effect plays, and 0.5s after it has finished (its promise resolves, then no board effects are left
and the camera is at rest, at most 8s) it pops back in on the same tab and scroll position.
The **Turn moments** section (Board tab) plays real rolls in a separate, non-saving game, like the
Arcade Lab: "Roll and choose where to land" (the target player rolls a 4, free to go either way, so
the glowing choices come up) "Roll after a motel check-in" (6 saved spaces and a roll of 7: the saved die pops out of the motel)
and "Check in again with two dice" (4 saved and a roll of 3, one square before a motel: checking in
keeps only the 3 and the old die puffs away).
Opening or closing the pop-up by hand meanwhile cancels the return (`playOnBoard`). "Travel
through a portal" walks the target player three tiles up to a portal, through it, and three tiles
on. While the
effect plays, the camera zooms in on the target player at the game's close zoom and follows them
(so a ride or a ring stays in view, as in a real game), then returns to the Lab's overview zoom as
the pop-up comes back. The zoom controls (Zoom in, Zoom out, Zoom modes) pass `focus: false` and
leave the camera to themselves.

### Arcade games (board + action bar)

The venture board's layer keeps `--venture-ask` free at the bottom: `max(116px, --ask-free)`
(94px on screens 500px tall or less), the room the action bar takes once it shows the card
drawn, so the board never jumps or shrinks as the bar grows (the arcade layer does the same).

Arcade games follow the venture board: a glass board centered on the screen
(`.arcade-layer > .arcade-stage`, kept clear of the toolbar, the action bar and, on phones, the
player cards) and the action bar for words and buttons. Never a pop-up.

- **Board head:** the game name in Lilita gold, a muted one-line subtitle ("Leg 1 of 3", "Everyone
  may bet"), and for party games a row of portraits: gold ring + bob = still choosing, green tick
  = locked in. Everyone chooses at the same time, so there is no "waiting" state.
- **Pick, then lock in:** party choices are picked first (the picked option gets a gold inset
  outline, `.aa-pick[aria-pressed='true']`, or the board zone/chest is pressed) and a gold **Lock
  in** button sends it. After locking in, the status line names who the round still waits for.
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

### Board PNG layers

Use the rounded, outlined toy-town PNG set in `assets/tiles-v2` for static board art. Retain
existing paired Checkpoint/Circus/Motel art. Fixed details belong to the transparent base; owner,
district and transport colors use a same-size grey tint mask. Base-only art keeps its colors.
Square and hex shells share icon art; each shell has its own aligned border/shadow/selection
sprites. Text, amounts and motion remain live. Inspect masks and red/blue composites with the
UI Lab’s Tile sprites and tint layers control; keep original assets for reversible art changes.

### Painted property set

`assets/properties-v3` uses the same charcoal outlines, light rim, rounded shapes and soft painted
shading as the special-tile sprites. Cream walls, green planting and gold details remain fixed;
roofs, awnings, banners and signs take the owner's color through explicit grey tint layers.
Tier silhouettes grow from cottage to tower, boutique to mall and small tent to grand circus.
Bank art keeps its gold roof. Keep all previous art files; property-only rollback uses
`PROPERTY_SET` in `props.ts`. The existing layer inspector and Design gallery show the active set.
