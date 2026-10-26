# Server (not needed for now)

Online play is built without a server: one player hosts the game in their browser and friends
connect to it directly (WebRTC through PeerJS). See "Online multiplayer" in `docs/spec.md` and
`apps/client/src/net/`.

A dedicated server would only be worth adding for games that survive the host leaving, playing
from several devices with one account, or long-running asynchronous games. The client already
talks to the engine only through `GameIO` (`decide` + `emit`), and the online protocol in
`apps/client/src/net/protocol.ts` could be served by one.
