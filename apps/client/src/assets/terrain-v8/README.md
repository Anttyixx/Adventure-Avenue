# Connected cartoon terrain

Three 512 × 512 opaque base-only material textures (`terrain-park`, `terrain-water`,
`terrain-court`) and six 256 × 256 transparent cartoon props (`park-tree`,
`park-flowers`, `park-bench`, `park-fountain`, `park-gazebo`, `park-picnic`).
Natural colors stay fixed; no tint layers are needed. Opposite texture edges match
through mirrored material quadrants, with opaque backing to avoid transparent seams.
Props retain the approved rounded cartoon style, without white rims or dark contours.

`town-terrain.ts` joins 80-unit material cells into shared park, pond and courtyard
surfaces. Shared edges are removed, preserving irregular boundaries and holes.
`town-terrain-art.ts` fills the shared contours in world coordinates and blends their
edges with overscanned masks (park 18, court 14, water 7 world units; soft banks 12).
Rendering caches up to 48 world chunks of 800 units at 512px, including features.

Park clearings use suitable two-by-two cell areas for picnic/gazebo/fountain,
bench, flower and small-tree groups; surrounding trees leave the clearing empty.
One focal feature anchors each connected courtyard. Features never create gameplay
routes, and terrain leaves actual board tiles, roads and portal openings clear.
The builder hides all scenery. Layout is deterministic and changes no engine state.

`SCENERY_SET = connected` selects these surfaces. `park` restores the prior natural
park/stream set; `previous` restores outlined meadow props. All earlier assets,
including `town-v7/` complete-scene artwork, remain preserved for reuse.
