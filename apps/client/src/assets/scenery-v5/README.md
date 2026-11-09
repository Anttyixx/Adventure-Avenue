# Small painted scenery

Nine 256 × 256 transparent, base-only PNG sprites, matching the painted toy-town
board style. Natural colors are fixed; no tint layers are required. Each sprite
was generated together in an atlas and isolated onto its own transparent frame.

- `scenery-bench`: wooden bench with a little bush
- `scenery-shrubs`: flowering shrubs
- `scenery-rocks`: smooth garden rocks and grass
- `scenery-planter`: wooden flower planter
- `scenery-fence`: short vine-covered garden fence
- `scenery-sapling`: small leafy tree
- `scenery-mushrooms`: mushrooms and ferns
- `scenery-lilies`: pebble-lined lily pond
- `scenery-picnic`: picnic table with cloth

`props.ts` maps these when the painted landscape is active. `scenery.ts` places
stable, varied-size pieces in free cells, along margins and in the surrounding
meadow. Pieces stay clear of playable tiles, roads, portals and Town's landmarks.
The builder hides all scenery. They are cosmetic and never change engine state.
All earlier grass and scenery PNGs remain untouched for rollback.
