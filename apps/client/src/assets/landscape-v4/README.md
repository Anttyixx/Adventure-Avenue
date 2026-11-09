# Painted landscape

`meadow-base.png` is a 1024 × 1024 opaque, base-only painted grass texture. It
matches the soft painted toy-town board sprites, with clover and tiny flowers.
Four mirrored quadrants produce identical opposite edges for seamless repetition.
The generated meadow is softened over a muted green ground before export.

`paintGrass` anchors the repeating texture in world coordinates, covering the whole
visible camera area on square and hex boards, including the board builder.
Larger scenery is sparse; portal landing cells remain clear. Builder decorations
remain hidden. Existing scenery PNGs are reused without modification.

Set `LANDSCAPE_SET` in `props.ts` to `previous` to restore the old grass and scenery
density independently of the property artwork. `ART_SET = classic` also restores
the previous landscape. All original PNGs and canvas fallbacks are preserved.
