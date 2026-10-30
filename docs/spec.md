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

| Field             | Meaning                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `x`, `y`    | Index and grid position (12 x 7 grid)                                                                                                                      |
| `t`               | Type: `shop`, `plot`, `bank`, `venture`, `spade`/`heart`/`diamond`/`club`, `change`, `roll`, `break`, `boon`, `boom`, `broker`, `back`, `arcade`, `cannon` |
| `nb`              | Neighbor square ids (the graph edges)                                                                                                                      |
| `d`               | District index 0-6 (shops and plots)                                                                                                                       |
| `g`               | Group index used for expansion and domination                                                                                                              |
| `base`, `value`   | Starting value and current value. Plots: value = money spent on the building                                                                               |
| `owner`           | Player id or -1                                                                                                                                            |
| `b`, `lv`, `toll` | Plots only: building key, circus tier 0-3, current checkpoint toll                                                                                         |

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
connections). Squares in neighboring cells connect automatically; single connections can be
cut. A board is playable only if it has exactly one bank, every suit (or a change-of-suit
square), at least 4 shops, every shop in a district with a 50-2,000G value, backstreets in
pairs, every warp leading to another warp, and every square reachable from the bank (by road or
warp). Grids range from 4 x 4 to 32 x 20 (up to 320
squares). Each board uses a square grid (4 neighbors per cell) or a hex grid (pointy-top
hexagons, odd rows shifted half a cell right, 6 neighbors per cell); the file stores it as
`layout`, and files without one are square.

**Built-in boards.** Every built-in board has the bank in the middle of the map, exactly 4
properties in each district (8 districts, 32 properties), its Stockbroker squares as far from the
bank as the roads allow, and Boon and Boom far apart. Town (square, 14 x 7, 50 squares: a ring with
the bank on the middle road), Harbor (square, 15 x 9, 61: a ring split by two piers joined by the
quay with the bank), Crossroads City (square, 13 x 9, 57: a ring cut into quarters by two avenues
crossing at the bank), Twin Lakes (hex, 14 x 11, 50: two lakes with Main Street and the bank
between them), Coral Isle (hex, 17 x 8, 52: an island coast with roads over the hills), Sky Islands
(square, 20 x 11, 66: a town ring with two floating islands) and Lagoon (square, 19 x 11, 63: a
tall lagoon town with an island on each side). The two island boards have detached areas reached
only by warp: a warp square on the main board sends you to an island, and every warp square on an
island sends you back. Each island has all four suits and one or two districts. Each board can be
copied into the editor to remix.

**Movement rules:**

1. Roll one die (1-7). The server or rules engine rolls, never the client.
2. After the roll, the engine lists every square the player could stop on: it walks every route of
   exactly that many steps, where each step goes to a neighbor other than `prev` (no turning back;
   a dead end allows any neighbor).
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
   zoom, cannon, balloon, backstreet, Home).
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

**Near the bank, cheaper:** at game start every district's base values are cut by up to 10%
(`K.nearBank`) depending on how near it is to the bank: the district with the shortest average walk
from the bank to its squares (warps count as a step) gets the full 10%, the farthest keeps its map
prices, and the rest scale in between. Prices round to 5G. This applies to every board, custom ones
included, and both rule sets; the tables above list the map's prices before it.

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
price. Cap: max value = base x (1 + k), x 1.5 if dominated.

**Buyouts.** After paying a fee at a rival's shop, 3-Star Shop or other vacant-plot building (or
visiting it, for an Estate Agency), the visitor may buy it for 5x value. The owner receives 3x value; the bank keeps 2x. Ownership transfers and expansion runs for
the buyer.

**Closed shops.** If the owner is on a break (Take-a-break, Estate Agency or a venture card), their
shops and buildings charge nothing until the owner's next turn starts.

## Vacant plots (Standard rules)

Some district squares start empty, as set by the **Vacant plots** option when a game starts: None,
A few (15% of properties), Some (30%), A lot (50%) or All. Except with All there are at most 21 plots
(spread over the districts, every district keeping at least one shop) and at most 3 of each
building on the board (7 buildings x 3 = 21); with All every property is a plot and buildings have
no limit. Squares a custom board marks as plots are picked first. The first player to stop on a
plot may build one of seven buildings, and each building has one effect on rivals and a different
one for its owner. Built plots show only the building's art on the tile (no name).

| Building      | Cost   | When a rival lands                                                                                                                         | When the owner lands                                                                  | Fee label on board |
| ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------ |
| Checkpoint    | 200G   | Pays the toll (also when passing). Toll starts at 20G and rises 10G every time it is paid, and when the owner passes it (they pay nothing) | Invest in any of your shops                                                           | Current toll       |
| Circus        | 200G   | Pays the show fee: 100G (tier 0)                                                                                                           | Upgrade to 500 / 1,000 / 2,000G for 300 / 600 / 1,200G                                | Show fee           |
| Balloonport   | 200G   | Pays 150G                                                                                                                                  | Fly to any square; that square's landing effect applies (bank counts as a bank visit) | 150G               |
| Tax Office    | 200G   | Pays the owner 10% of the rival's own net worth                                                                                            | Bank pays the owner 5% of their net worth                                             | 10%                |
| Home          | 200G   | Pays 60G x owner's level                                                                                                                   | Every other player is moved to this square (free direction next turn)                 | Fee                |
| Estate Agency | 200G   | Rival takes a break: their shops close until their next turn                                                                               | Buy any unowned shop at its value                                                     | Break              |
| 3-Star Shop   | 1,000G | Pays a shop fee on a 1,000G base, with district multipliers; buyouts allowed                                                               | Invest in any of your shops                                                           | Fee                |

**Rules shared by all buildings:**

- The plot's value (counted in net worth) equals what was spent on the current building, including
  circus upgrades.
- Only the 3-Star Shop counts as a shop for expansion bonuses, salary and stock price. Every built
  plot counts toward district ownership and domination.
- Fixed fees (checkpoint, circus, balloonport, home) are multiplied by the owner's fee boost (Price
  Hike card). All building fees pay dividends and commissions like shop fees.
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
  slope runs from +0.75 to +1.5 per 100 shares (10G stock). The market panel tags the bottom third
  of the range Calm, the middle Normal and the top third Wild (`volMood`).
- A trade pays the average of the price before and after it (sells use the same), so buying 99
  shares at once costs the same as buying them in steps.
- **Sell-off:** when 75+ shares of a district are sold in one turn (by anyone, in any number of
  sales), its price is dented by 10%; each further 75 shares add 0.8x the previous step, scaled
  smoothly (`sellOffCut`: 100 shares -12.8%, 150 -18%, 200 -22.3%, 300 -29.5%; one turn never
  quite reaches -50%). Dents stack across turns down to -50% at most (`K.confMin`). The seller is
  paid before the dent lands (the average of the price before and after their shares left). Every
  share bought there repairs 0.1% (100 shares = 10%), and every 100G invested in its shops repairs
  1% (`G.market.cut`). Saves from before this rule count each old dent as 5%.
- The market panel tags each district's mood and shows "Shaken -X%: N shares to recover".

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

**Stock screen (buy and sell):** the mini map sits beside the district list (with the district's
summary under it), the selected district's squares fill a row of cards across the full width, and
the amount picker sits beside the summary card and buttons. The panels:

- **Mini map** of the whole board. Squares in that district are filled with the district color. An
  owned square gets a ring in the owner's color plus their initial; no ring means it's for sale; a
  dashed square is a vacant plot. The bank is marked G, and each player's current square shows a dot
  in their color. Hovering a square shows its name, owner and value.
- **Holdings table:** one row per player with squares owned in the district, shares held, the value
  of those shares at the current price, and a bar showing their share of all stock held there.
  Players with nothing there are dimmed.
- **Footer note** with the number of unowned squares, total shares held, and the dividend rule.

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
stationary, with rounded square tiles and no header or OK button in its container. It does not
dim the background or block interaction with the action bar. After a flip, the action bar shows
the card's title, description and OK button. A line bonus appears in the action bar first;
dismissing it shows the card with its own OK button. The board remains visible until the card
is dismissed. Spectators and CPU turns use the same sequence with timed dismissal or Close.
On short screens the board shrinks to leave space for the action bar.

- **Card numbers:** each card has a permanent number (1–30), shared across Standard and Easy.
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

| Square                 | Landing effect                                                                                        | Interacts with                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Roll-on                | Roll again and keep moving (max chain depth 3)                                                        | Can reach another venture, bank or roll-on                    |
| Take-a-break           | Your shops and buildings close: rivals pay nothing there                                              | Fees, tolls, dividends and commissions from your squares stop |
| Boon                   | 20% commission: the bank pays you 20% of every fee anyone else pays                                   | Stacks with nothing; the higher rate wins                     |
| Boom                   | Same, at 50%                                                                                          | Same as Boon                                                  |
| Stockbroker            | Buy stock (Standard). Becomes a Venture square in Easy rules                                          | Stock market                                                  |
| Backstreet (2 squares) | Warp to the other backstreet; the move ends there with no further effect and free direction next turn | Fast route between bottom-left and top-right                  |
| Warp                   | Landing (not passing) sends you to the warp square it links to; the move ends there                   | Detached areas (islands); linked warps share a color          |
| Cannon                 | Pick another player and warp to their square. Suits and bank still apply there; nothing else does     | Suits, bank, promotion, win                                   |
| Arcade                 | Play one random minigame (see Arcade minigames)                                                       | Cash, shop values, wild suit cards, stock                     |
| Venture                | Venture grid                                                                                          | See Venture cards                                             |
| Change-of-suit         | Gives the current suit, then rotates                                                                  | Promotion                                                     |

**Turn-start reset:** when a player's turn starts, their `onBreak`, `closed`, `boon` and `boost` are
cleared. This is what makes "until your next turn" effects expire.

## Arcade minigames

Arcade windows keep instructions and results clearly separated. Lucky Reels highlights the next
reel and names each Stop button by reel number. Memory Blocks shows a remember/pick/reveal
status and enables blocks only during the pick. Coin Derby highlights your racer and counts
down before the race. Buttons stay usable on landscape phones.

**Arcade Lab:** the dev menu's Arcade Lab (`#arcade-lab`, also a UI Lab section) provides replay
buttons for all three games, fixed reel jackpot/pair/no-match previews, a tour of every memory
prize, and a close derby finish. It uses sample state and leaves saved games untouched.

Landing on the Arcade picks one of three short games at random; prizes scale with the player's level
(L) so they stay relevant late in the match.

| Game          | How it plays                                                                                                                        | Prizes                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lucky Reels   | Three reels cycle through 7, coin, wild card and stock every 120 ms. The player stops them one at a time (timing skill)             | Three 7s: 300 x L · three coins: 100 x L · three wilds: a Suit Yourself card · three stocks: 10 shares in a random district (150G in Easy) · any pair: 20 x L |
| Memory Blocks | A 3 x 3 grid shows its prizes for 1.9 s, then hides them; the player picks one (memory skill)                                       | Two "Shops +10%", two Gold (60 x L), one wild card, two "Shops -5%", two 20G                                                                                  |
| Coin Derby    | The lander picks one of 5 racers; every other player is assigned one at random. Racers move at random speeds with occasional bursts | Each racer's coins pay its backer 10G each; the winner's backer gets 100 x their level. Everyone can earn something                                           |

**Notes for the rebuild:**

- Outcomes that depend on timing (Reels) or memory (Blocks) need the server to own the random seed
  and the cycle clock, and to accept the player's stop inputs with timestamps.
- Coin Derby is the only game that involves all players, so it is a good moment to show everyone's
  screen the same animation.
- CPU players stop reels and pick blocks at random.
- Shop value prizes move stock prices and salary, so the arcade feeds the economy, not just cash.

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
- **Live window:** an auction opens a window in the middle of every player's screen showing the
  lot (art, name, value), the high bid and leader, and each bidder (in, passed, leading,
  deciding); players bid from inside it. A human has 12 seconds (`TIMING.auctionBid`) to raise,
  with a countdown bar everyone sees; running out of time counts as a pass, so the high bidder wins
  once everyone else has passed or timed out.
- **Bidding:** players are asked in turn order. Each either raises (opening bid, then + 10% of value,
  minimum 10G) or passes and drops out. It ends when one bidder holds the high bid and everyone else
  has passed, or when nobody bids (no sale; the property stays with the seller or, for the bank,
  goes back on the market).
- **CPU bids** while the bid is <= value x 1.25 (x 1.6 if it already owns a square in that group)
  and it keeps 200G in cash.
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

**Main menu:** the title screen has **Play**, which opens game setup (with a join code for
friends), and **Join**: a box with a code field whose Join button lights up once all four letters
are in. **Continue** (resume the saved game; it shows the round, board and players) and **Rejoin
online game** appear only when there is something to go back to. What's new, Board editor and Credits links sit below them. **Credits** lists everyone whose
work the game uses (art, fonts, libraries; data in `apps/client/src/credits.ts`), one card each with
what was used, the license and links to their pages.

**Game setup options** (Start game sits in a bar pinned to the bottom of the screen):

- **Board:** a carousel of the built-in boards followed by the player's saved boards. Arrows,
  swiping, the arrow keys or the dots move through it, and it loops from the last board back to
  the first. Import board file and Board editor sit under it.
- **Players in the game:** 2 to 5 (default 4); never fewer than the people already seated.
- **Humans on this device:** 1 up to the number of players; then friends who joined, and the
  remaining seats are CPUs.
- **Join code:** setup opens a room straight away and shows its code (with Copy/Share invite).
  Friends who join take CPU seats. Starting with nobody joined plays on this device (the room
  closes); with friends joined it is an online game. Without a connection there is no code and
  the game is played on this device.
- **Target net worth:** 5,000G by default; arrows on each digit set any amount in 1,000G steps from
  1,000G to 90,000G (like the share picker), with Min and Max buttons.
- **Round limit:** none (default), 15, 20 or 30.
- **Characters:** each seat starts with a different random character and a name. Tapping a human
  seat's character opens the character picker (all nine characters; ones other humans have are
  greyed out with their name, so no two players share one; a CPU holding the picked one switches
  to a free one). "Shuffle characters" rerolls them. Characters cannot change once the game
  starts. Each human seat has a name box (up to 12 characters; the characters `< > & " ' \`` and
`\` are removed; leave it blank to keep the suggested name), and typed names are remembered for
  the next game. In the online build, validate names on the server.

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
board; the rest of the board dims. Online games show a "Room ABCD" button above the player cards. A player holding all four suits has
glowing suits on their card. Arcade games and venture picks open for everyone, so other players
watch them being played; their result screen closes by itself or with Close.

One rule decides every asset: only the player character sprites are pixel art. Everything else,
including the board, the interface, suits, wild cards, coins and effects, is HD (vector). _(Changed
by the owner on Oct 23, 2026; the original spec drew suits, coins and wild cards as pixel art.)_

**Board (HD canvas).** Logical size 1300 x 800 with 100-unit squares, scaled to the container and to
devicePixelRatio. The static board (grass, roads, pond, fountain, flower beds, trees, every square)
is drawn into a cached offscreen canvas and redrawn only when state changes; each frame draws that
cache, then highlights, sprites, coins, floating text and the die.

- Property art is painted images (`apps/client/src/assets/props/`, drawn by `props.ts`): five
  shop designs by value (cottage, house, storefront, townhouse, tower), three 3-Star Shop designs
  (boutique, department store, grand mall), the circus at each of its four levels, and the
  checkpoint, balloonport, tax office, home and estate agency. Their blue parts (windows, doors,
  awnings, signs) are recolored: grey when unowned, the owner's color when owned, with the
  owner's initial badge.
- Shops: district-colored border, filled with the owner's color when owned, shop art, value
  label (unowned) or the fee as plain dark text and a pennant in the owner's color (owned). Closed
  shops get a dark overlay.
- Plots: dashed outline and "VACANT" when empty; a vector icon per building plus its fee when
  built.
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
every 120 ms (idle frames every 260 ms). The active player has a bobbing pixel arrow; after a roll the die shrinks to sit beside their head and flips to the new number of steps left on each step (each flip along a different axis from the last: sideways, up and over, or a diagonal), popping away when they arrive. Each character has a name plate just above their head. When a human on this device rolls, the camera zooms out to frame them and every square the roll could take them to (and the routes there) in the space the HUD leaves free (the stock market panel may cover it), until they start walking. Pixel coins fly from
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
is answered, and is hidden otherwise. Building and renovating show a picture button per building
(name below; what it does on hover), with the question and cost chips on one line above. Trades
use the bar too (see Trades). Choices with more to them (stock amounts, investing, auctions,
arcade games) open their own windows.

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
engine then emits `opened` and the same overview plays with the gates rolling back up (timings
`close*` in `timing.ts`).

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

**Layout.** Scrolling panels hide their scrollbars (they still scroll). The board fills the whole game screen edge to edge, and everything else floats over it
as dark glass overlays. Top right: the zoom chip, the Guide button and the Menu button (the menu
also shows the round, target and rule set). **Guide** (`ui/guide.ts`) opens a pop-up in the middle
of the screen with a tab per topic: Basics (the goal, shops, buyouts, suits and promotion, special
squares, before rolling, debt, controls), Stocks (buying and selling, dividends, what sets the
price, demand and volatility, sell-offs; the classic rules for classic-stock games) and Vacant
plots (a card per building with its art, price, what a rival and the owner get, and the circus
upgrade prices), and Venture cards (all 30 fixed numbers, titles and effects, with Standard-only
cards marked). Easy rules show Basics and Venture cards. It reopens on the last tab read. Top left: the **info chip**, with the game's name, the board
name, the current round (out of the round limit, if any), the goal (target net worth) and, online,
a Room button that shows the room code; under it, the Stock market button (Standard rules), which
morphs into the stock market panel in the top-left corner for anyone to look at (kept up to
date) and morphs back into the button when closed. Bottom center: the **action bar**. While the game waits on
nobody here, it is the status line: one line saying what is going on now: what the game is waiting
on a player to do ("Blue is buying stocks...", "Blue is deciding which space to go to...", see
`ui/activity.ts`; the turn starts with "Blue is deciding what to do..." and a three-dot icon, and
rolling and walking are waits too) or else the last thing that happened, with the log icon for
that kind of action and player names in their colors. A wait stays until the next action or wait replaces it. For observers (CPU or remote turns),
a roll and destination choice are combined: “Rosa rolled a 5 and is deciding where to move...”.
Card movement without a matching roll describes the number of spaces without claiming a die roll.
Landing announces the named space. Completed actions and landings remain in the action bar
for up to 2.5 seconds before a pending waiting message replaces them. A newer result, actual
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
interrupted prompts. Above the player
cards, right-aligned: the **Game log button**; tapping it morphs it into the game log (turn by
turn, newest at the bottom, scrollable back to the start of the game), exactly as wide as the
cards and fitting between the toolbar and the cards. The current turn's card ends with a waiting
line while the game waits, and the action that answers it fades in in its place. Only the log's
Close button folds it back. Bottom right: the player cards stacked vertically in turn order (online, each device
turns the order round so its own player's card is at the bottom; turns still go top to bottom) (net worth, cash, level,
suits and progress bar); they are always shown. Player cards show the character's whole sprite
(trimmed to its drawn pixels, no fade).

**Player overview** (`ui/overview.ts`). Clicking (or Enter on) a player card pops up that
player's overview in the middle of the screen (up to 980px wide, scrolling when taller than the
screen allows) over a light backdrop; the board and the action bar stay as they are, and every
property the player does not own is greyed out on the board while it is open. Its columns (stacked
on narrow screens, with more room from the screen edges on phones): (1) the whole sprite, name,
level, rank, suits and status tags, net worth with the goal bar and how much is left, the **net
worth breakdown** (an unfilled ring split into Cash, Properties and Stock, the hovered or biggest
part's share in its middle, with a legend of values and shares), **earnings** in two columns (fees
earned and paid, salary, dividends, commission, next promotion's pay) and, once the game is over,
**net worth over the game** (a line per round with the goal dashed; hover for each round's value); (2) **properties** as little
cards under their district's name, each with its picture, its rent (the fee a rival pays, struck
through while closed) and its value; clicking a card finds it: the pop-up steps aside, the board zooms out to the whole map
with every other tile greyed out and white rings spreading from that property for 3 seconds, then
the board zooms back and the pop-up returns; (3) **shares** (the stock screen's table for this player: each district's name, price, the shares
they hold and their value, districts with none dimmed, totals at the bottom). The Close button in the top right corner (it stays put while the
content scrolls), Escape, a click outside it or clicking the card again closes it. It updates live as the game goes on.

**Turn moments.** Before the roll, sliding arrows on the board point from the player's square to
each square their first step can reach; they stay up until the player takes that first step. A token that stops part-way through a walk (a pop-up or a
choice on the way) stands still until it walks on. Whenever a district's stock price moves, for any reason
(investments, stock deals, venture cards, value changes), the camera frames that district's
squares, a banner like the turn banner gives the old and new price, and arrows rise from the
squares (green, going up) or sink over them (red, going down). Property choices (e.g. selling
to pay a debt) are framed in the space the HUD leaves free, so none sit under the action bar. When the game is won, the camera closes in on
the winner, who dances under confetti falling across the screen, before the results appear.

**Camera.** The camera always follows the active player, centered on screen and zoomed in (about
1.65x the fit-to-screen zoom, more on small screens), eased smoothly as they move; it keeps the
player in the middle of the screen even at the board edge (grass continues past it). The mouse wheel, a pinch, or the - and + keys zoom out to show more of the map (a chip at
the start of the top-right toolbar shows the zoom: 250% fully in on the player, about 135% for the whole board, 100%
fully out (`ZOOM_MAX_OUT`), in 5% steps per wheel notch or key press (`ZOOM_STEP`); tapping it zooms back in);
from 250% to 200% the player stays centered, between 200% and 150% the camera moves from the player to the board's center (`ZOOM_BLEND`),
and from 150% down to 100% the board stays centered with room to spare (`ZOOM_OUT_EXTRA`: 25% further out than fitting the screen). While a choice is open the
camera keeps the player centered and zooms out just enough to frame every glowing square around
them (if they are too spread out for that, it frames them all instead; never closer than the
player's own zoom). The game-over view shows the whole board.

**Automatic zoom.** Two kinds:

- _Shows_ play for a few seconds and go back by themselves: shops closing or reopening, a stock
  price move, finding a property from the player overview, the winner's dance. They play on every
  screen, and the zoom is locked (wheel, pinch, keys and the chip do nothing) until they end.
- _Views that wait on the player_: the squares a roll can reach, a choice on the board, a trade.
  They play only on the screen of the player deciding (a CPU's or another device's path choice
  glows where the camera already is). The player can zoom them freely (the view keeps its
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
- **Modals:** buy stock and sell stock (with a summary card: the cost, and the share price, the
  player's cash and their shares now and after), invest, venture grid, minigames, auction,
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

- **Music:** two looping chiptune tracks: a relaxed one for the main menu, setup and board editor,
  and a bouncier one during games. The music stops for the winning fanfare at the end of a game.
- **Effects:** button clicks, dice roll, each step, landing, gaining and paying money, buying a
  shop, buying out a rival's property (a brass stab, a rising run and a cash-register ring), a shop's value going up, collecting a suit, promotion, venture cards, warps, the start of a
  human player's turn, a new round, bankruptcy and the win fanfare.
- **Settings:** a speaker button on the main menu and game setup (and the Sound section of the in-game menu) has Music and
  Effects volume sliders and a Mute switch. Settings are saved per device. Audio pauses while the
  tab is hidden.

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
(`?join=CODE`, which fills in the code). A joiner takes the first CPU seat (after the host's own
players), with their last name on this device (or a random one) and a random character nobody
has; the host can remove them. Joined players see the host's setup with every setting shown but
locked, and can change only their own name and character (the host refuses a character someone
has). Seats left open become CPUs on start, with characters no player has. A running game takes a
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
| Special squares        | Boon / Boom commission                                                |                           |                                       |                                    | Roll-on, cannon, backstreets | Cannon collects suits                  |
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
