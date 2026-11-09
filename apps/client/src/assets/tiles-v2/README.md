# Layered board artwork

The active set is selected by `ART_SET` in `props.ts`. Set it to `classic` to restore the original
PNGs and vector drawing paths. All original files in `../props/` remain unchanged.

- `<key>-base.png` contains fixed colors and transparency.
- Optional `<key>-tint.png` has the same dimensions: transparent outside recolorable details,
  grey shading inside. The renderer colors the mask and composites it over the base.
- Base-only art never uses automatic blue-pixel recoloring. Blue water and navy icons stay blue.
- `checkpoint`, `circus0`–`circus3` and `motel` continue using their original paired PNGs in `../props/`.
- Other building PNGs were separated into explicit layers from their original blue accents,
  retaining the painted building designs. The Bank remains base-only.
- Special tiles, scenery, vacant land and the shop shutter use newly generated toy-town artwork.
  Atlas cells were isolated and normalized to transparent 256-pixel sprite frames. Portal and
  Warp color accents use explicit masks. The fountain is a separate generated illustration.
- Square/hex shells, shadows, borders and selection outlines are rasterized from the existing
  tile geometry at 4× resolution; their frame represents 100 × 116 board units. Roads and grass
  retain their existing geometry/colors in PNG form. Ownership flags have a neutral pole/base
  and a tintable fabric layer.

`ART_SOURCES` exposes resolved base/mask URLs. The UI Lab's **Tile sprites and tint layers**
control shows each source and red/blue composites. Game values, tile labels, initials, animation
positions and transient particles remain live rendering, so they track state and zoom correctly.

Current tiles also include Price Up (`hike`), Taxi and Swap. Side portals use `portal-side`
(base/color ring) plus two independently rotating white swirl PNGs; this preserves their
shared appearance, two-way/entrance/exit behavior, click feedback and reduced-motion support.
