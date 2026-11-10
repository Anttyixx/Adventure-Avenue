# Crystal warp and portal link components

Four 256px base/tint sprite pairs:

- `warp`: a beveled four-point crystal on a small ivory/gold socket.
- `portal-side`: fixed circular ivory/gold frame, four recolorable inset gems, open center.
- `portal-vortex`: three broad curling energy ribbons.
- `portal-vortex-inner`: a smaller counter-rotating core with white highlights.

Blue working-color pixels were extracted to aligned grey tint masks; cream/gold details and
white highlights remain in the base. Generated in the board's rounded cartoon style and
normalized from a transparent atlas, excluding detached alpha specks.

`props.ts` selects these with `TRANSPORT_SET = crystal`; `previous` restores the old PNGs.
All earlier files remain untouched. `drawPortalRing` keeps the 48-unit frame fixed, animates
its core separately, and freezes when given zero phase for reduced-motion/still previews.
