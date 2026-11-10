# Recombining cartoon park fragments

Nine clean-alpha, base-only 256px PNGs. Fountain, gazebo, picnic, grove, orchard and
planted bend are curated fragments of a scene rather than enclosed tile islands.
Straight and corner hedge walls provide the same chunky cartoon style; a bridge
fragment complements the existing pond details. Colors are fixed, so no tint is needed.

`park-scenes.ts` composes compatible fragments on arbitrary connected square/hex
footprints. `park-scenes-art.ts` supplies shared ground, paths and water, removes
internal boundaries and assembles a continuous outer hedge. The same fragment can
appear in different arrangements. The Lab can separate the resulting puzzle pieces.

All earlier artwork remains intact. Generated from the owner's approved detailed
cartoon reference; normalized from a transparent atlas, with detached alpha specks
excluded during sprite extraction.
