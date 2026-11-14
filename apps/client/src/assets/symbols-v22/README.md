# Painted board and player-card symbols

New transparent PNGs in the rounded toy-town style: blue Spade, red Heart, yellow Diamond,
green Club, freestanding Random Suit shuffle, Suit Yourself star card, flat four-point Warp,
and a cleaned Boom coin burst retaining the three-coin design.

`props.ts` maps these after the preserved sets. `SYMBOL_ART_SET = 'previous'` restores earlier
board mappings and HUD vectors. Boon on player cards shares the unchanged v16 board sprite.
Warp has equal 460px visible width and height, no pedestal, and an aligned grey tint mask;
its cream rim stays fixed while the star adopts its link color. Other sprites are base-only
and must not auto-recolor their blue pixels. All files have a 512px transparent canvas.

Generated master: `exec-b8c77bca-f893-4b94-a12f-00ba668b40af.png`. Mechanically extracted,
trimmed, cleared of detached export speckles, and resized; Warp's blue region was separated
into the grey tint layer. Every earlier asset remains untouched in its original folder.
