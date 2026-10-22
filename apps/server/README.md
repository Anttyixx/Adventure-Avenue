# Server (planned)

Milestone 4 of the build plan: a Node + Socket.IO server (Fly.io) that owns the game state and
runs `@aa/engine` authoritatively.

- Rooms with 4-letter codes, seats 1-4 with character pick, host sets rules, target and round limit.
- Every engine decision request becomes a message to one player's socket; replies are validated.
- The server rolls every die and owns all randomness (venture grid, minigames).
- Turn timer (30-45 s) with safe defaults; snapshot per turn for reconnects.

The hot-seat client in `apps/client` already talks to the engine only through the `GameIO`
interface (`decide` + `emit`), which is the seam the server will plug into.
