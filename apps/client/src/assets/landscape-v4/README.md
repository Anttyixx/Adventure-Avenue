# Painted landscape

`meadow-base.png` is a 1024 × 1024 opaque, base-only painted grass texture. It
matches the soft painted toy-town board sprites, with clover and tiny flowers.
Four mirrored quadrants produce identical opposite edges for seamless repetition.
The generated meadow is softened over a muted green ground before export.

The original file is preserved. `meadow.ts` now samples only its unmirrored first
quarter with coordinate-seeded crops/turns/reflections, blended with complementary
smoothstep weights. Grass patches span 256 world units and are cached in 768-unit
chunks (384px each, up to 96 chunks). No whole-image repetition or mirrored joins
are drawn. `paintGrass` covers the entire visible area on square/hex boards and
in the builder. Coordinates stay fixed when panning/zooming. New small scenery
comes from `park-v6/`, with the earlier `scenery-v5/` kept for rollback. Park mode
softens grass saturation and adds world-aligned warm clearings/cool woodland tone
fields to the cached chunks. `SCENERY_SET = previous` restores the earlier meadow
and outlined scenery. The builder hides all props, stream and road verges.

Set `LANDSCAPE_SET` in `props.ts` to `previous` to restore the old grass and scenery
density independently of the property artwork. `ART_SET = classic` also restores
the previous landscape. All original PNGs and canvas fallbacks are preserved.
