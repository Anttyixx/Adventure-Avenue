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

Default `SCENERY_SET = terrain` uses light foliage, water details and occasional
benches/planters near the board (`townBackgroundFeatures`). There are no default
hedge frames, dioramas or decorative walks. The builder hides scenery. Layout is
stable and changes no engine state.

`connected` preserves the earlier clearings, courtyard anchors, walks and hedge
frames. `park` restores natural park/stream scenery; `previous` the outlined meadow
props. All earlier assets, including `town-v7/` complete-scene artwork, are retained.
