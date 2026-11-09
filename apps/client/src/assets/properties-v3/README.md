# Painted property buildings

Nineteen new building designs match the rounded, outlined, softly shaded toy-town tile icons.
Each uses a transparent 256 × 256 frame. The Bank is fixed-color, with a gold roof. Every other
building has a same-size grayscale tint layer for roofs, awnings, banners, signs and windows.
Walls, greenery, gold trim and wood details are fixed in the base.

The source artwork was generated as a building atlas, separated into isolated transparent frames
and split into fixed-color bases and grayscale masks from its blue accent regions. No previous
PNG was modified. Originals remain in `../props`, and the earlier layered versions remain in
`../tiles-v2`.

`props.ts` maps these files after the earlier artwork. Set `PROPERTY_SET` to `previous` to restore
the prior property art while keeping the new board icons; `ART_SET = 'classic'` restores the
original complete board. The UI Lab's Design gallery and Tile sprites and tint layers inspector
show all active designs and ownership-color variants.
