# Painted arcade and location sprites

Sixteen generated sprites extracted from a common 4×4 atlas, matching the rounded painted board art. All sprites have a transparent base PNG. Closed/open chest straps and the location pin also have aligned grey tint PNGs; other art keeps its fixed colors. Regular frames are 256×256; memory card frames are 256×320.

- Lucky Reels: seven, coin, star, diamond, clover.
- Memory Blocks: card-back, card-front, coin-pile, coin, wild; property prizes reuse existing painted buildings.
- Coin Derby: finish flag; existing character walk sprites remain the racers.
- Lucky Wheel: wheel-frame (transparent inside, gold hub), pointer and betting chip. Live sectors and numbers remain code-driven.
- Treasure Split: chest-closed / chest-open, with three strap colors and the original size differences.
- Board: location-pin, recolored for choices, focused properties and gold log focus.

`ARCADE_ART_SET = 'previous'` restores the original arcade CSS/SVG art. `PIN_ART_SET = 'previous'` restores the old choice pin. Earlier assets and rendering paths remain intact. The generated source atlas remains in `/workspace/generated_images/exec-a42b103d-58d0-47e6-9c0b-2b6b67134f7d.png` outside the repository.
