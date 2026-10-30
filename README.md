# Adventure Avenue

A browser board game in the spirit of Fortune Street: roll one die, move around a branching town,
buy and grow shops, trade district stocks, collect the four suits for promotions, and race to reach
the target net worth and get back to the bank. 2-5 players on one device (hot-seat) or online with
friends, with CPU players filling empty seats.

- **Play the stable build:** https://anttyixx.github.io/Adventure-Avenue/
- **Play the dev build:** https://anttyixx.github.io/Adventure-Avenue/dev/

## Branches

| Branch | What it is                                      | Deployed to |
| ------ | ----------------------------------------------- | ----------- |
| `dev`  | Work in progress; every change lands here first | `/dev/`     |
| `main` | Stable builds, promoted from `dev`              | site root   |

## Playing online

Main menu → **Play** opens game setup, which shows a 4-letter join code. Friends tap **Join** on
the main menu and type it (or open the invite link); they take CPU seats and see the host's
setup locked. If nobody joins, it is a game on this device. The host's browser runs the game and
friends connect straight to it, so there is no server to pay for. Details: "Online multiplayer"
in `docs/spec.md`.

## Custom boards

Players can build their own boards on a **square or hex grid** in the **board editor** (main menu → Board editor, or
`/dev/#editor`): paint squares on a grid, set up districts and shop values, and fix any problems
the editor lists. Neighboring squares connect automatically (4 neighbors on a square grid, 6 on
a hex grid); the Links tool cuts a connection.
Boards can be saved in the browser (**My boards**), exported as `.aaboard.json` files to share,
and imported again from the editor or game setup. The **Board** carousel in game setup
chooses which board a game uses. The file format and validation rules live in
`packages/engine/src/boards/format.ts`.

## Testing UI elements

Test builds (anything but `main`) show the build in the version chip in the bottom-right corner
of the main menu. Hold it for 3 seconds to open the dev menu, which links to the **UI Lab**: a
page for viewing and triggering every UI element (player cards, prompts, banners, board effects,
dialogs, the venture grid, minigames, the log, the market and the results screen). Direct link:
`/dev/#ui-lab`. The **Stocks lab** (`/dev/#stocks-lab`) compares the two stock systems.

## Development

```bash
npm install
npm run dev        # client at http://localhost:5173
npm test           # rules engine tests + 1,000 simulated CPU matches
npm run lint
npm run typecheck
npm run build      # apps/client/dist
npm run sim -- 500 # CPU-only balance simulation
```

## Project layout

```
packages/engine/   UI-free rules engine: state, boards, formulas, turn flow, cards, CPU, tests
  src/constants.ts every balance number
  src/engine.ts    the turn flow (Game class)
  src/boards/      built-in boards as text maps + the custom board format
apps/client/       Vite + TypeScript client: canvas board, pixel sprites, HTML/CSS overlays
  src/net/         online play (browser to browser through PeerJS)
apps/server/       not used (online play needs no server)
docs/spec.md          the game spec (rules and interface)
docs/architecture.md  how the code works
docs/codemap.md       where everything lives
AGENTS.md             guide for AI assistants (CLAUDE.md loads it)
reference/            place for the original prototype (not added yet)
```

## Status

The game is playable end to end, hot-seat and online, on 7 built-in boards plus custom boards.
Work continues on `dev` (balance, polish and new features); see "What's new" in the game or
`apps/client/src/changelog.ts`.
