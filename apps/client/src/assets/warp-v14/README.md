# Flat warp floor pad

Aligned 256px base and grey tint PNGs for a flat, four-point star warp pad. The
star has equal width/height and four equal-length cardinal arms, viewed straight
from above. It has no pedestal, socket or upright crystal. White etching stays
fixed; the broad colored surface follows the linked pair's color.

The source sprite was generated on transparent background, normalized into a
square frame and separated into base/tint layers. The board renders it with
uniform scaling near the token's feet and moves WARP above the pad. Square and
hex grids preserve its proportions. `WARP_SET = crystal` restores the previous
upright sprite in `transport-v13/`; all previous artwork is retained.
