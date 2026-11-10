# Boon coin-burst sprite

One fixed-color 256px base PNG: a gold up-arrow coin inside a green rounded burst,
matching the cream-trimmed pink Boom badge. Green/gold colors stay fixed; no tint
layer is needed. Generated from the prior Boon coin and Boom badge references,
then normalized on a transparent frame with detached alpha specks removed.

`BOON_SET = burst` in `props.ts` selects this sprite; `previous` restores the earlier
standalone coin. All old artwork, including the unchanged Boom sprite, is preserved.
