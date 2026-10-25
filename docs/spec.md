# Adventure Avenue: Game Spec & Build Hand-off

_Transcribed from "Fortune Street Remake: Game Spec & Build Hand-off" (Oct 22, 2026, @Anthony).
"Adventure Avenue" is the game's name; currency is still "G" (open question)._

## Overview

This spec describes every system in the test build, how each one works, and how it interacts with
the others.

**The game:** 1 to 4 players (empty seats filled by CPU) roll one die, move around a branching town
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

One shared rules engine runs on the server; the client only draws and sends intents.

- `apps/client` (GitHub Pages): board with HD tiles and pixel sprites; UI (scoreboard, actions,
  modals); sends intents, plays events. In hot-seat the engine runs locally.
- `apps/server` (Node + Socket.IO on Fly.io): rooms, seats, room codes; turn runner asks one seat;
  timers, CPU seats, reconnect; snapshot + action log per turn.
- `packages/engine` (shared): game state, board data, constants, every formula; turn state machine
  that emits decision requests and events; seeded RNG, CPU decision rules, unit tests and
  simulations.

The engine never touches the DOM or sockets: it takes the current state plus a decision and returns
the new state and a list of events. The client renders events; the server validates intents and
runs the engine.

**Porting from the prototype:** its turn flow is written as async functions that await a human or
CPU decision (`ask`, `modalChoose`, `stockModal`...). In the engine, replace each await with a
"decision needed" request that carries the options; the client (hot-seat) or server (online)
answers it. All rendering, `floatAt`, `coins` and log text stay in the client.

> Implementation note: the engine's `Game` class raises decisions through `GameIO.decide(request)`
> and announces changes through `GameIO.emit(event)`. The hot-seat host answers from the UI or the
> CPU rules; a server host will answer from sockets.

## Game state

The whole match is one serializable object; every rule reads and writes it, and nothing in it
depends on rendering.

### Match

| Field                    | Type                                           | Meaning                                                                |
| ------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `rules`                  | `"standard" \| "easy"`                         | Rule set                                                               |
| `target`                 | number                                         | Net worth needed to win (4,000 to 10,000G)                             |
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
| `id`, `slot`, `name`, `ch`, `color`, `cpu` | Identity; `ch` = character look (style, hair, skin, accent)                    |
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
3. **Roll the die:** 1 to 6, rolled by the engine.
4. **Step one square:** at a fork pick a path; passing collects suits, visits the bank, pays
   checkpoint tolls. Repeat while steps are left.
5. **Land on a square:** shop, plot, bank, venture, arcade, special square.
6. **Settle debt:** sell stock or property; bankrupt if nothing is left.
7. **End checks:** bankruptcy or round limit ends the match.
8. **Next player:** skip bankrupt; new round after the last seat.

Passing the bank can promote the player and, if they are at the target, end the game immediately.
Landing effects can start a new roll (roll-on, some venture cards), which re-enters the loop at
"Roll the die" with a chain depth limit of 3. Debt is checked only after all landing effects finish.

**Effects that run outside the active player's turn:** fees and tolls paid to owners, dividends and
commissions paid by the bank, Coin Derby prizes, Home pulling everyone to one square, trade answers
and auction bids. In the online build these are the moments other players need to see or answer
something.

## Board and movement

The board is a graph of 44 squares: a 34-square outer ring plus a 10-square middle road that joins
the left and right sides, creating two forks.

**Layout (12 columns x 7 rows, x,y):**

- Corners: spade (0,0), heart (11,0), diamond (11,6), club (0,6). Bank at (6,6), bottom center.
- Forks: Venture (0,3) on the left and Stockbroker (11,3) on the right each have three neighbors.
- Other specials: Venture (4,0) and (8,6), Change-of-suit (5,0), Roll-on (0,2), Take-a-break (7,6),
  Backstreets (10,0) and (1,6), Arcade (3,3), Boon (7,3), Boom (8,3), Cannon (9,3).
- 26 property squares in 7 districts (see Shops). In Standard rules, 5 of them are vacant plots.

Store boards as data (square list with type, position, district, neighbors) so new boards need no
code changes.

**Custom boards (added Oct 2026).** Players build boards in the in-game board editor, save them
in the browser, and export/import them as `.aaboard.json` files (format tag
`adventure-avenue-board`, version 1: name, author, grid size, districts, squares and
connections). Squares in neighboring cells connect automatically; single connections can be
cut. A board is playable only if it has exactly one bank, every suit (or a change-of-suit
square), at least 4 shops, every shop in a district with a 50-2,000G value, backstreets in
pairs, and every square reachable from the bank. Grids range from 4 x 4 to 32 x 20 (up to 320
squares). Each board uses a square grid (4 neighbors per cell) or a hex grid (pointy-top
hexagons, odd rows shifted half a cell right, 6 neighbors per cell); the file stores it as
`layout`, and files without one are square.

**Built-in boards.** Town (square, 12 x 7), Harbor (square, 14 x 9: a ring and a market loop
joined by two roads), Crossroads City (square, 16 x 11: a ring cut into quarters by two
avenues), Twin Lakes (hex: two lakes with Main Street between them) and Coral Isle (hex: an
island coast with two roads inland). Each can be copied into the editor to remix.

**Movement rules:**

1. Roll one die (1-6). The server or rules engine rolls, never the client.
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

**Investing.** Landing on your own shop lets you invest up to 999G (and no more than your cash).
Investing raises value one-for-one, which raises the fee, the salary bonus and the district stock
price. Cap: max value = base x (1 + k), x 1.5 if dominated.

**Buyouts.** After paying a fee at a rival's shop (or 3-Star Shop), the visitor may buy it for 5x
value. The owner receives 3x value; the bank keeps 2x. Ownership transfers and expansion runs for
the buyer.

**Closed shops.** If the owner is on a break (Take-a-break, Estate Agency or a venture card), their
shops and buildings charge nothing until the owner's next turn starts.

## Vacant plots (Standard rules)

Five district squares start empty; the first player to stop on one may build one of seven
buildings, and each building has one effect on rivals and a different one for its owner.

| Building      | Cost   | When a rival lands                                                                        | When the owner lands                                                                  | Fee label on board |
| ------------- | ------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------ |
| Checkpoint    | 200G   | Pays the toll (also when passing). Toll starts at 20G and rises 10G every time it is paid | Invest in any of your shops                                                           | Current toll       |
| Circus        | 200G   | Pays the show fee: 100G (tier 0)                                                          | Upgrade to 500 / 1,000 / 2,000G for 300 / 600 / 1,200G                                | Show fee           |
| Balloonport   | 200G   | Pays 150G                                                                                 | Fly to any square; that square's landing effect applies (bank counts as a bank visit) | 150G               |
| Tax Office    | 200G   | Pays the owner 10% of the rival's own net worth                                           | Bank pays the owner 5% of their net worth                                             | 10%                |
| Home          | 200G   | Pays 60G x owner's level                                                                  | Every other player is moved to this square (free direction next turn)                 | Fee                |
| Estate Agency | 200G   | Rival takes a break: their shops close until their next turn                              | Buy any unowned shop at its value                                                     | Break              |
| 3-Star Shop   | 1,000G | Pays a shop fee on a 1,000G base, with district multipliers; buyouts allowed              | Invest in any of your shops                                                           | Fee                |

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
can profit from (or sabotage) a district they don't own.

```
price_d = max(1, round(average shop value_d x 0.04 x factor_d))
```

The average covers shops and 3-Star Shops in the district (not other buildings). `factor` starts at
1.0 per district.

| Action   | Where / when                                                                    | Effect                                                                         |
| -------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Buy      | Passing or stopping at the bank; landing on the Stockbroker; some venture cards | Up to 99 shares in one district per purchase. 10+ shares: factor x 1.1 (max 4) |
| Sell     | Before rolling; when in debt (all shares of one district); stock venture card   | 10+ shares: factor x 0.9 (min 0.4)                                             |
| Dividend | Whenever anyone pays a fee or toll in district d                                | Every other shareholder receives floor(fee x shares / 250) from the bank       |

**What moves prices:** investing, expansion, domination, venture cards that grow or shrink shops,
Memory Blocks prizes, building a 3-Star Shop, and big trades (the factor). Shares count toward net
worth at the current price, so a price drop can push a leader below the target.

**Interactions:** stocks are the only asset that is liquid before rolling, so they are the first
thing sold in debt. Buying into a rival's district and then selling 10+ shares as they near the
target is the signature sabotage move from the original. Easy rules hide the market and remove stock
venture cards.

**Stock screen (buy and sell):** the district list sits beside a panel for the selected district:

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
  The change-of-suit square gives its current suit and then rotates spade -> heart -> diamond ->
  club. Cannon, balloon and zoom warps also collect the suit at the destination.
- **Suit Yourself cards:** a wild card for any one missing suit. Gained from venture cards, Lucky
  Reels and Memory Blocks. Promotion consumes one wild per missing suit.
- **Bank visit** (pass or land), in this order: promotion if 4 suits (counting wilds) -> win check
  -> stock purchase (Standard) -> free direction next turn if landed.

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
player flips one face-down panel and resolves its card.

- **Grid:** 64 panels, each pre-assigned a random card from the deck for the current rule set. A
  flipped panel takes the player's color. When every panel is flipped, the grid resets.
- **Line bonus:** after flipping, count the longest straight line (row, column or diagonal) of the
  player's color through that panel. 4 to 7 in a line pays 10G x length; 8 pays 200G.
- **Hidden information:** in the online build the server must hold the card assignments and reveal
  only the flipped one.
- **Deck:** 30 cards; 7 marked Standard-only (stock cards) are excluded in Easy rules. Cards are data
  (title, text, effect function) so more can be added.

| Family            | Cards in the prototype                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Movement          | Roll again and move · Move 2 more squares · Zoom to the bank · Zoom to any square (landing effect applies)                                                         |
| Cash              | 50 x die from the bank · 40 x die from the leader · Lose 10% of cash · Give everyone 30G · Half a salary · Give 10% of cash to last place · 30G per property owned |
| Shop value        | Your shops +10% · One random shop of yours +40% · A random district's shops +15%                                                                                   |
| Fees              | Everyone's shops close, then roll again · Odd roll: your shops close / even: everyone else's · Your fees +30% until next turn · 50% commission until next turn     |
| Suits             | Free heart (100G if held) · Suit Yourself card · Sudden promotion                                                                                                  |
| Property deals    | Invest in any of your shops now · Forced buyout of any rival shop at 5x                                                                                            |
| Stocks (Standard) | 20 free shares · District price +20% · District price -20% · 10% dividend · 2G tax per share · Buy at 10% off · Sell at 20% above                                  |

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
| Cannon                 | Pick another player and warp to their square. Suits and bank still apply there; nothing else does     | Suits, bank, promotion, win                                   |
| Arcade                 | Play one random minigame (see Arcade minigames)                                                       | Cash, shop values, wild suit cards, stock                     |
| Venture                | Venture grid                                                                                          | See Venture cards                                             |
| Change-of-suit         | Gives the current suit, then rotates                                                                  | Promotion                                                     |

**Turn-start reset:** when a player's turn starts, their `onBreak`, `closed`, `boon` and `boost` are
cleared. This is what makes "until your next turn" effects expire.

## Arcade minigames

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

1. Proposer picks a partner, then ticks any of their own properties and the partner's properties,
   plus optional cash from each side.
2. Validation: at least one item, and neither side offers more cash than they hold.
3. The partner accepts or declines. Hot-seat shows a "pass the device" prompt; online, the offer
   goes only to that player with a timeout.
4. On accept, ownership and cash swap atomically, then expansion runs for both players in every
   group that changed hands.

CPU acceptance rule: value each property at value x (1 + 0.35 x squares the CPU already owns in that
group, excluding the square itself when giving it away). Accept if what it receives >= 1.15 x what
it gives + 20G and it can afford its cash side. CPUs never propose trades in the prototype.

### Auctions

- **Voluntary:** the owner picks a shop or built plot. Opening bid = its value; the winning bid is
  paid to the seller.
- **Debt sale:** when a player sells a shop to the bank in debt, the bank pays them 75% of value,
  then auctions the shop to everyone else. Opening bid = 75% of value; the winning bid goes to the
  bank.
- **Bidding:** players are asked in turn order. Each either raises (opening bid, then + 10% of value,
  minimum 10G) or passes and drops out. It ends when one bidder holds the high bid and everyone else
  has passed, or when nobody bids (no sale; the property stays with the seller or, for the bank,
  goes back on the market).
- **CPU bids** while the bid is <= value x 1.25 (x 1.6 if it already owns a square in that group)
  and it keeps 200G in cash.
- The winner gets the property and expansion runs.

## Debt, bankruptcy and ending the game

Cash may go negative during a turn; it is only settled at the end of the active player's own turn,
and a match ends on the first win, bankruptcy or round limit.

**Debt settlement** (end of the active player's turn, while cash < 0):

1. List sellable assets: each district's shares (sold all at once at market price) and each shop or
   built plot (bank pays 75% of value).
2. Human picks one at a time; the CPU sells stock first, then the cheapest property.
3. Sold shops go to a debt auction (winning bid to the bank). Sold plots become vacant again.
4. Repeat until cash >= 0. With nothing left to sell, the player goes bankrupt.

Other players who were pushed negative by someone else's action (a venture card, for example)
settle at the end of their own next turn.

**Bankruptcy:** the player is out; all their squares become unowned (plots revert to vacant) and
their shares vanish. The game ends immediately and the richest remaining player wins.

**End conditions:**

| Condition      | Check point                                                 | Winner                             |
| -------------- | ----------------------------------------------------------- | ---------------------------------- |
| Target reached | On any bank visit (passing or landing), after the promotion | That player                        |
| Bankruptcy     | When a player can't cover debt                              | Highest net worth among the others |
| Round limit    | When the round counter passes the limit                     | Highest net worth                  |

**Results screen:** final ranking, a net-worth-by-round line chart with the target marked, and
per-player totals for fees earned, fees paid, salary, dividends and commission. The save is cleared.

## Rule sets and match options

All options are chosen on the game setup screen; the rule set only changes how the board is built at game
start, so every other system checks one flag (`rules`).

|                                       | Standard                      | Easy                      |
| ------------------------------------- | ----------------------------- | ------------------------- |
| Groups for expansion                  | 7 color districts             | Rows of connected shops   |
| Vacant plots                          | 5 plots with 7 building types | Plots are ordinary shops  |
| Stock market, dividends, market panel | Yes                           | Hidden and off            |
| Stockbroker square                    | Buy stock                     | Becomes a Venture square  |
| Venture deck                          | All 30 cards                  | 23 cards (no stock cards) |
| Lucky Reels "three stocks"            | 10 shares                     | 150G                      |

**Main menu:** the title screen has **Start**, which opens game setup, and **Continue**, which
resumes the saved game (it shows the round, board and players, and is greyed out when there is no
save). A Board editor link sits below them.

**Game setup options** (Start game sits in a bar pinned to the bottom of the screen):

- **Board:** a carousel of the built-in boards followed by the player's saved boards. Arrows,
  swiping, the arrow keys or the dots move through it, and it loops from the last board back to
  the first. Import board file and Board editor sit under it.
- **Players:** 1 to 4 humans.
- **Fill empty seats with CPU:** on by default, giving 4 seats total.
- **Target net worth:** 4,000G (quick), 5,000G (default), 7,000G, 10,000G (long).
- **Round limit:** none (default), 15, 20 or 30.
- **Characters:** each seat gets a random character and name. Each human seat has a name box (up to
  12 characters; the characters `< > & " ' \`` and `\` are removed; leave it blank to keep the
  suggested name), and typed names are remembered for the next game. In the online build, validate
  names on the server; "Shuffle characters" rerolls them.

In-game: a Fast CPU toggle speeds up CPU turns and animations, Rules opens a summary, Quit returns to
the main menu.

## CPU players

CPUs use simple greedy rules with a cash buffer; they are good enough to fill seats, not to
challenge strong players.

| Decision                                | Rule                                                                                                                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direction at forks                      | Breadth-first search from each option (not turning back) to the nearest goal: the bank if it can promote or has reached the target, otherwise the nearest missing suit or change-of-suit square. Ties broken randomly |
| Buy a shop                              | If cash after buying >= 150G, or it already owns a square in that group                                                                                                                                               |
| Build on a plot                         | 50% chance of a 3-Star Shop if it keeps 500G after; otherwise a weighted pick (Tax 3, Checkpoint 2, Circus 2, Home 1, Agency 1, Balloonport 1) if it keeps 150G                                                       |
| Invest                                  | 80% chance when cash > 900G: invest min(room, 60% of cash above 600G)                                                                                                                                                 |
| Buyout                                  | If it owns a square in that group and keeps 600G after paying 5x                                                                                                                                                      |
| Buy stock                               | At the bank or stockbroker when cash > 1,100G: the district where it owns the most (domination bonus), 45% of cash above 800G, minimum 10 shares                                                                      |
| Circus upgrade                          | If it keeps 500G after                                                                                                                                                                                                |
| Balloonport / zoom                      | Fly to its current movement goal                                                                                                                                                                                      |
| Estate Agency                           | Buy the unowned shop in the group where it owns most, if it keeps 300G                                                                                                                                                |
| Venture panel, minigames, cannon target | Random                                                                                                                                                                                                                |
| Auctions and trades                     | See Trading and auctions                                                                                                                                                                                              |
| Debt                                    | Sell stock first, then the cheapest property                                                                                                                                                                          |

**Not yet implemented for CPUs:** selling stock before rolling, proposing trades, starting auctions,
renovating, stock dumps against a leader. These are good targets for a "hard" CPU in the rebuild.

## Interface and art

One rule decides every asset: only the player character sprites are pixel art. Everything else,
including the board, the interface, suits, wild cards, coins and effects, is HD (vector). _(Changed
by the owner on Oct 23, 2026; the original spec drew suits, coins and wild cards as pixel art.)_

**Board (HD canvas).** Logical size 1300 x 800 with 100-unit squares, scaled to the container and to
devicePixelRatio. The static board (grass, roads, pond, fountain, flower beds, trees, every square)
is drawn into a cached offscreen canvas and redrawn only when state changes; each frame draws that
cache, then highlights, sprites, coins, floating text and the die.

- Shops: district color strip, house icon, value label (unowned) or a fee pill, colored ring and
  pennant in the owner's color (owned). Closed shops get a dark overlay.
- Plots: dashed outline and "VACANT" when empty; a vector icon per building plus its fee pill when
  built.
- Hover (or tap) any square for a tooltip: owner, value, fee, max value, buyout price, group
  ownership, district stock price.

**Characters (pixel).** 12 x 14 sprites with two walk frames, drawn with smoothing off at a
whole-number device-pixel scale, with a soft HD shadow. Each character is generated from a head style
(6), hair color, skin tone and accent color; the body uses the player's color. For the real build,
replace with hand-made 24 x 32 sprites (4 directions x 4 frames) and 48 x 48 portraits.

**Motion.** Tokens tween between squares (260 ms, eased, with a hop) and flip walk frames every
110 ms. The active player has a bobbing pixel arrow and a remaining-steps badge. Pixel coins fly from
payer to payee; floating text shows money changes.

**Small animations** (all turned off when the system asks for reduced motion):

| Where           | Animation                                                                                                                                   | Trigger                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Board (ambient) | Drifting cloud shadows, pond shimmer, fountain ripples and spray, a glint across the bank coin every few seconds                            | Always                                                    |
| Closed squares  | Floating "z" letters                                                                                                                        | Owner on a break                                          |
| Characters      | 1-pixel idle bob, offset per player                                                                                                         | Standing still                                            |
| Square          | Gold ring that grows and fades, plus 8 pixel sparkles                                                                                       | Bought, built, bought out, traded, auctioned, or expanded |
| Square          | White ring pulse                                                                                                                            | Landing, or arriving by warp                              |
| Player          | Pixel confetti burst                                                                                                                        | Promotion                                                 |
| Die             | Squash-and-bounce on the result                                                                                                             | Roll ends                                                 |
| Player cards    | Net worth and cash count up or down to the new value, tinted green or red while changing; the active card's glow breathes                   | Any money change                                          |
| Interface       | Prompts and the ticker rise in, dialogs ease in, venture and Memory Blocks panels flip, revealed cards pop, main buttons give a small nudge | New prompt, dialog or reveal                              |

**Layout.** The board fills the whole game screen edge to edge, and everything else floats over it
as dark glass overlays. Top left: a title pill with the round, target and rule set. Top right: the
view toggle, Fast CPU, Market, Log, Full screen, Rules and Quit. Bottom left: the latest-log ticker
above the action bar. Bottom right: the player cards stacked vertically (net worth, cash, level,
suits and progress bar), with a Hide/Show toggle so players can clear the board. The stock market and
game log live in a slide-out drawer on the right.

**Camera.** By default the camera follows the active player, zoomed in (about 1.4x the fit-to-screen
zoom, more on small screens) and eased smoothly as they move. It frames the player in the part of the
screen not covered by overlays, so tokens never sit under the cards or action bar, and it stops
panning at the board edge. The camera switches to the full board automatically when a choice needs
it (more than 4 glowing squares, or a glowing square outside the follow view), and always when the
game ends. The "Full board" / "Follow player" button (or the V key) toggles the view for the current
game; every game (new or continued) starts in Follow player. The die and on-board pop-ups are drawn at screen size so they stay readable at
any zoom. Taps on the board are converted through the camera so square picking works in both views.

Phone held sideways: the same overlays in compact form. Phone held upright: a "turn your phone
sideways" screen with a "Play upright anyway" option, which moves the cards into a 2-column block
under the action bar and frames the board in the gap above. Full screen uses the browser Fullscreen
API where available.

- **Scoreboard:** portrait, name, CPU/P# tag, level, four pixel suit icons, wild count, status tags
  (Closed, Boon/Boom %, Fees +30%), a progress bar to the target, net worth and cash.
- **Action bar:** the current prompt and its buttons. Enter or Space presses the main button.
- **Modals:** buy stock, sell stock, invest, build/renovate, venture grid, minigames, trade, auction,
  debt, results. In hot-seat, prompts meant for another player show "Pass the device to...".

**Type and color.** Lilita One for headings and numbers, Atkinson Hyperlegible for body text,
Pixelify Sans only for pixel-themed labels. A dark navy UI shell around a bright daytime board.
Player colors: red, blue, green, gold; district colors are pastels so they don't clash with owners.

## Save and resume

The prototype saves a snapshot at the start of every turn, so a match can always be resumed from the
last turn boundary.

- **What is saved:** rules, target, round limit, round, turn index, turn order, stock factors,
  change-of-suit index, venture grid, the last 30 log lines, net worth history, every square's
  `[owner, value, building, circus tier, toll]`, and each player's persistent fields (identity,
  character look, cash, level, suits, wilds, shares, position, `prev`, bankrupt, stats).
- **Not saved:** temporary effects (break, closed, boon, boost) because they reset at the start of
  the saved turn anyway; sprites and portraits, which are regenerated from the character look.
- **Where:** browser localStorage. The main menu's Continue button resumes it (and is greyed out
  when there is none). The save is deleted when a match ends.
- **Resume:** rebuild the board for the saved rule set, apply the square and player data, then start
  the main loop at the saved turn.

**For the GitHub build:** keep the same turn-boundary snapshot, but store it on the server per room
(database or Redis). It doubles as the reconnect mechanism and as a replay/debug log if every action
is also recorded.

## Online multiplayer plan

The prototype is local hot-seat only; the GitHub build should make the server the single owner of
game state, with browsers sending intents and drawing events.

**Stack:** Node + Socket.IO server on Fly.io, static client on GitHub Pages. TypeScript everywhere,
with the rules engine as a shared package.

**Rooms:** create a room and get a 4-letter code; others join with the code; seats 1-4 with character
pick; host sets rules, target and round limit; empty seats become CPUs on start.

**Turn protocol:**

- The server runs the same async turn loop as the prototype, but every `ask(...)` becomes a message
  to one player's socket, and the reply is validated before it is applied.
- Intents (client to server): `roll`, `choosePath`, `buyShop`, `build`, `invest`, `buyout`,
  `buyStock`, `sellStock`, `pickVenturePanel`, `stopReel`, `pickBlock`, `pickRacer`, `proposeTrade`,
  `answerTrade`, `bid`, `pass`, `renovate`, `sellAsset`, `pickSquare`, `pickCannonTarget`, `endTurn`.
- Events (server to all clients): `diceRolled`, `stepped`, `paid`, `ownerChanged`, `valueChanged`,
  `priceChanged`, `cardRevealed`, `promoted`, `effectStarted`, `auctionUpdate`, `tradeResult`,
  `bankrupt`, `gameOver`, plus a full `state` snapshot on join or reconnect.
- Off-turn players: can open tooltips and the market, chat and emote, and answer trades and auction
  bids addressed to them. Selling stock stays a pre-roll action of the active player, matching the
  original.

**Fairness and timing:** the server rolls every die and owns all randomness (venture grid,
minigames). Turn timer 30-45 s with safe defaults on timeout (decline purchases, take the first path,
pass in auctions, end turn). Bids and trade answers time out to "pass" or "decline".

**Reconnect:** each seat gets a session token in localStorage; rejoining with the room code restores
the seat from the latest snapshot. A CPU plays the seat while it is empty.

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
| Target options                            | 4,000 / 5,000 (default) / 7,000 / 10,000G               | Win condition                                |
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
6. **Content and art.** Replace generated sprites with the custom cast (24 x 32, 4 directions), HD
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
