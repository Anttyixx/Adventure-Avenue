# Adventure Avenue

A browser board game in the spirit of Fortune Street: roll one die, move around a branching town,
buy and grow shops, trade district stocks, collect the four suits for promotions, and race to reach
the target net worth and get back to the bank. 1-4 players, hot-seat, with CPU players filling
empty seats.

- **Play the stable build:** https://anttyixx.github.io/Adventure-Avenue/
- **Play the dev build:** https://anttyixx.github.io/Adventure-Avenue/dev/

## Branches

| Branch | What it is                                      | Deployed to |
| ------ | ----------------------------------------------- | ----------- |
| `dev`  | Work in progress; every change lands here first | `/dev/`     |
| `main` | Stable builds, promoted from `dev`              | site root   |

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

Test builds (anything but `main`) show a build badge in the bottom-right corner. Tap it 5 times
to open the dev menu, which links to the **UI Lab**: a page for viewing and triggering every UI
element (player cards, prompts, banners, board effects, dialogs, the venture grid, minigames, the
log, the market and the results screen). Direct link: `/dev/#ui-lab`.

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
packages/engine/   UI-free rules engine: state, board data, formulas, turn flow, cards, CPU, tests
  src/constants.ts every balance number
  src/boards/town.ts the 44-square board as data
  src/cards.ts     venture deck as data + effect functions
apps/client/       Vite + TypeScript client: canvas board, pixel sprites, HTML/CSS overlays
apps/server/       planned online multiplayer server
docs/spec.md       the game spec
reference/         the original prototype (to be added)
```

## Status

Following the build plan in `docs/spec.md`:

1. Repo and tooling: done (npm workspaces, TypeScript, Vite, Vitest, ESLint, Prettier, CI).
2. Rules engine: done (unit tests + 1,000-match CPU simulation).
3. Local hot-seat client: done (playable end to end).
4. Server and rooms: not started.
5. Resilience: not started.
6. Content and art: generated sprites for now.
7. Balance and polish: ongoing.
