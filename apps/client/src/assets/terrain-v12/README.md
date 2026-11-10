# Crisp cartoon terrain materials

Four opaque, base-only PNGs (1024px materials, 2048px meadow): `terrain-park`, `terrain-water`, `terrain-court`
and the alternate `meadow`. Cleaner rounded tufts, flowing highlights and chunky
cobblestones match the board pieces' colorful cartoon style. These are material
surfaces, not replacement playable board tiles.

Normalized from a new 2x2 material atlas. Lawn patches repeat without vertical mirroring, with a narrow edge blend; paving quadrants match opposite edges;
water has a narrow wrapped-color edge blend so highlights stay unmirrored. The meadow
uses finer lawn details with coordinate-seeded blending to avoid a repeating world pattern.
Default `SCENERY_SET = terrain` maps the grass, paving and meadow; its water retains the
previous v8 material (the alternate water study is preserved here); previous v8 textures and all earlier
art are untouched. Fixed natural colors need no tint layer.

Terrain/meadow caches follow camera pixel scale. Decorations draw independently
from their native PNGs, so increasing zoom does not enlarge a low-resolution scenery cache.
