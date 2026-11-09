# Natural park landscape

Twelve 256 × 256 transparent base-only scenery sprites replace their active
counterparts in `scenery-v5/` and the Town pond/fountain. Colors remain natural;
no tint layers are needed. The new art has painted edges, organic soil/contact
patches and soft shading, without black contour strokes or cream sticker rims.
Each sprite was generated in one atlas, isolated and normalized onto its own frame.

- `scenery-bench`, `scenery-shrubs`, `scenery-rocks`, `scenery-planter`
- `scenery-fence`, `scenery-sapling` (young birch), `scenery-mushrooms`
- `scenery-lilies`, `scenery-picnic`, `scenery-tree` (mature oak)
- `pond`, `fountain` (Town landmarks)

`park-water-base.png` is an opaque 512 × 512 painted water surface with mirrored
quadrants and matching opposite edges. `park.ts` clips it to the variable-width
stream ribbon outside the playable rectangle. Earth banks and low rocks soften
the shore. It is scenery, never a game route.

`props.ts` applies this set when `PARK_LANDSCAPE` is active. `scenery.ts` keeps small
props clear of board geometry and groups the surrounding trees/furniture/gardens;
`park-geometry.ts` keeps both stream and planting off playable ground. The builder
hides props, stream and warm road verges while retaining the varied grass.

All earlier PNGs are untouched. Set `SCENERY_SET` in `props.ts` to `previous` to
restore the earlier outlined meadow scene, or `LANDSCAPE_SET` to `previous` to
restore the original grass and decoration density. Engine state is unchanged.
