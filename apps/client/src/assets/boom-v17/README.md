# Boom burst, whole

Fixed-color 256px base PNG. The original Boom sprite (`tiles-v2/boom-base.png`) had its
starburst cut off with straight edges at the left and right of the image, so the tile showed
flat, clipped spikes. This version keeps the original coins, sparkles and pink fill and redraws
the burst's outline as a clean 14-spike star (dark magenta outline, soft light halo) that fits
inside the frame with an 8px margin. No tint layer is needed.

`BOOM_SET = whole` selects this version; `BOOM_SET = previous` restores the original, which is
kept unchanged.
