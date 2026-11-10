import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('apps/client/src/assets/tiles-v2');
const legacy = resolve('apps/client/src/assets/props');
const png = (path: string) => {
  const data = readFileSync(path);
  expect(data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
};

describe('board PNG artwork contract', () => {
  it('supplies every static tile icon, building tier and board support sprite', () => {
    const pairedLegacy = ['checkpoint', 'circus0', 'circus1', 'circus2', 'circus3', 'motel'];
    const buildings = [
      'shop0',
      'shop1',
      'shop2',
      'shop3',
      'shop4',
      'star0',
      'star1',
      'star2',
      'balloon',
      'tax',
      'home',
      'agency',
    ];
    const staticArt = [
      'bank',
      'venture',
      'spade',
      'heart',
      'diamond',
      'club',
      'change-ring',
      'roll',
      'break',
      'boon',
      'boom',
      'broker',
      'arcade',
      'cannon',
      'warp',
      'portal',
      'vacant',
      'tree',
      'pond',
      'flowers',
      'fountain',
      'closed',
      'grass',
      'road',
      'flag',
      'hike',
      'taxi',
      'swap',
      'portal-side',
      'portal-swirl',
      'portal-swirl-inner',
    ];
    for (const key of [...buildings, ...staticArt])
      expect(existsSync(resolve(root, `${key}-base.png`)), key).toBe(true);
    for (const key of [...buildings, 'warp', 'portal', 'flag', 'portal-side'])
      expect(existsSync(resolve(root, `${key}-tint.png`)), key).toBe(true);
    for (const shape of ['square', 'hex'])
      for (const part of ['tile', 'shadow', 'border', 'selection'])
        expect(existsSync(resolve(root, `${shape}-${part}-tint.png`))).toBe(true);
    for (const key of pairedLegacy) {
      expect(existsSync(resolve(legacy, `${key}.png`))).toBe(true);
      expect(existsSync(resolve(legacy, `${key}-tint.png`))).toBe(true);
      expect(existsSync(resolve(root, `${key}-base.png`))).toBe(false);
    }
  });
  it('keeps base/mask pixel coordinates aligned and all PNGs decodable with nonzero dimensions', () => {
    for (const file of readdirSync(root).filter((f) => f.endsWith('.png'))) {
      const dimensions = png(resolve(root, file));
      expect(dimensions.every((n) => n > 0 && n <= 2048)).toBe(true);
      if (file.endsWith('-tint.png'))
        expect(png(resolve(root, file.replace('-tint', '-base')))).toEqual(dimensions);
    }
  });
});

describe('painted property PNG set', () => {
  const dir = resolve('apps/client/src/assets/properties-v3');
  const keys = [
    'shop0',
    'shop1',
    'shop2',
    'shop3',
    'shop4',
    'star0',
    'star1',
    'star2',
    'circus0',
    'circus1',
    'circus2',
    'circus3',
    'checkpoint',
    'balloon',
    'tax',
    'home',
    'agency',
    'motel',
    'bank',
  ];
  it('provides all nineteen buildings with aligned tint layers for every owned property', () => {
    expect(readdirSync(dir).filter((f) => f.endsWith('.png'))).toHaveLength(37);
    for (const key of keys) {
      const base = png(resolve(dir, `${key}-base.png`));
      expect(base).toEqual([256, 256]);
      if (key !== 'bank') expect(png(resolve(dir, `${key}-tint.png`))).toEqual(base);
      expect(existsSync(resolve(legacy, `${key}.png`))).toBe(true);
    }
  });
});

describe('natural park PNG set', () => {
  it('supplies every new base-only scenery sprite and preserves the previous set', () => {
    const dir = resolve('apps/client/src/assets/park-v6');
    const previous = resolve('apps/client/src/assets/scenery-v5');
    const keys = [
      'scenery-bench',
      'scenery-shrubs',
      'scenery-rocks',
      'scenery-planter',
      'scenery-fence',
      'scenery-sapling',
      'scenery-mushrooms',
      'scenery-lilies',
      'scenery-picnic',
      'scenery-tree',
      'pond',
      'fountain',
      'park-water',
    ];
    expect(readdirSync(dir).filter((f) => f.endsWith('.png'))).toHaveLength(keys.length);
    for (const key of keys) {
      expect(png(resolve(dir, `${key}-base.png`))).toEqual(key === 'park-water' ? [512, 512] : [256, 256]);
      expect(existsSync(resolve(dir, `${key}-tint.png`))).toBe(false);
      if (key.startsWith('scenery-') && key !== 'scenery-tree')
        expect(existsSync(resolve(previous, `${key}-base.png`))).toBe(true);
    }
  });
});

describe('cartoon town terrain PNG set', () => {
  it('adds nine base-only scene tiles while keeping earlier decoration sets', () => {
    const dir = resolve('apps/client/src/assets/town-v7');
    const keys = ['courtyard', 'grove', 'pond', 'garden', 'orchard', 'picnic', 'meadow', 'gazebo', 'hedges'];
    expect(readdirSync(dir).filter((f) => f.endsWith('.png'))).toHaveLength(9);
    for (const key of keys) expect(png(resolve(dir, `land-${key}-base.png`))).toEqual([320, 320]);
    expect(existsSync(resolve('apps/client/src/assets/park-v6/scenery-bench-base.png'))).toBe(true);
    expect(existsSync(resolve('apps/client/src/assets/scenery-v5/scenery-bench-base.png'))).toBe(true);
  });
});

describe('connected terrain material PNGs', () => {
  it('provides opaque material frames and separate cartoon props without replacing earlier assets', () => {
    const dir = resolve('apps/client/src/assets/terrain-v8');
    expect(readdirSync(dir).filter((f) => f.endsWith('.png'))).toHaveLength(9);
    for (const kind of ['park', 'water', 'court'])
      expect(png(resolve(dir, `terrain-${kind}-base.png`))).toEqual([512, 512]);
    for (const kind of ['tree', 'flowers', 'bench', 'fountain', 'gazebo', 'picnic'])
      expect(png(resolve(dir, `park-${kind}-base.png`))).toEqual([256, 256]);
    expect(existsSync(resolve('apps/client/src/assets/town-v7/land-pond-base.png'))).toBe(true);
  });
});

describe('connected park detail PNGs', () => {
  it('provides hedge material and transparent scene ingredients while preserving the base terrain', () => {
    const dir = resolve('apps/client/src/assets/terrain-details-v9');
    expect(readdirSync(dir).filter((f) => f.endsWith('.png'))).toHaveLength(9);
    expect(png(resolve(dir, 'terrain-hedge-base.png'))).toEqual([512, 512]);
    for (const key of [
      'garden-bed',
      'orchard-apple',
      'orchard-orange',
      'pond-reeds',
      'pond-rocks',
      'pond-lilies',
      'pond-bridge',
      'garden-planter',
    ])
      expect(png(resolve(dir, `${key}-base.png`))).toEqual([256, 256]);
    expect(existsSync(resolve('apps/client/src/assets/terrain-v8/park-tree-base.png'))).toBe(true);
  });
});

describe('recombinable park kit', () => {
  it('supplies all curated fragments and wall pieces without replacing the earlier art', () => {
    const dir = resolve('apps/client/src/assets/park-modules-v10');
    expect(readdirSync(dir).filter((f) => f.endsWith('.png'))).toHaveLength(9);
    for (const key of [
      'fountain',
      'gazebo',
      'picnic',
      'grove',
      'orchard',
      'garden',
      'hedge',
      'corner',
      'bridge',
    ])
      expect(png(resolve(dir, `module-${key}-base.png`))).toEqual([256, 256]);
    expect(existsSync(resolve('apps/client/src/assets/town-v7/land-garden-base.png'))).toBe(true);
  });
});

describe('crisp cartoon terrain materials', () => {
  it('supplies high-resolution lawn, water, paving and meadow while preserving the previous art', () => {
    const dir = resolve('apps/client/src/assets/terrain-v12');
    expect(readdirSync(dir).filter((f) => f.endsWith('.png'))).toHaveLength(4);
    for (const key of ['terrain-park', 'terrain-water', 'terrain-court', 'meadow'])
      expect(png(resolve(dir, `${key}-base.png`))).toEqual(key === 'meadow' ? [2048, 2048] : [1024, 1024]);
    expect(existsSync(resolve('apps/client/src/assets/terrain-v8/terrain-park-base.png'))).toBe(true);
  });
});

describe('crystal warp and animated portal components', () => {
  it('provides aligned base/tint pairs and preserves the earlier transport art', () => {
    const dir = resolve('apps/client/src/assets/transport-v13');
    expect(readdirSync(dir).filter((f) => f.endsWith('.png'))).toHaveLength(8);
    for (const key of ['warp', 'portal-side', 'portal-vortex', 'portal-vortex-inner']) {
      expect(png(resolve(dir, `${key}-base.png`))).toEqual([256, 256]);
      expect(png(resolve(dir, `${key}-tint.png`))).toEqual([256, 256]);
    }
    for (const key of ['warp', 'portal-side', 'portal-swirl', 'portal-swirl-inner'])
      expect(existsSync(resolve('apps/client/src/assets/tiles-v2', `${key}-base.png`))).toBe(true);
  });
});

describe('flat warp floor pad', () => {
  it('provides an aligned recolorable pair while preserving the previous crystal and pedestal', () => {
    const dir = resolve('apps/client/src/assets/warp-v14');
    expect(png(resolve(dir, 'warp-base.png'))).toEqual([256, 256]);
    expect(png(resolve(dir, 'warp-tint.png'))).toEqual([256, 256]);
    expect(existsSync(resolve('apps/client/src/assets/transport-v13/warp-base.png'))).toBe(true);
  });
});

describe('Boom burst', () => {
  it('adds a whole, uncut burst while preserving the original Boom sprite', () => {
    expect(png(resolve('apps/client/src/assets/boom-v17/boom-base.png'))).toEqual([256, 256]);
    expect(existsSync(resolve('apps/client/src/assets/tiles-v2/boom-base.png'))).toBe(true);
  });
});

describe('Boon coin burst', () => {
  it('adds a fixed-color sprite while preserving the previous coin and the matching Boom art', () => {
    expect(png(resolve('apps/client/src/assets/boon-v16/boon-base.png'))).toEqual([256, 256]);
    expect(existsSync(resolve('apps/client/src/assets/boon-v15/boon-base.png'))).toBe(true);
    expect(existsSync(resolve('apps/client/src/assets/tiles-v2/boon-base.png'))).toBe(true);
    expect(existsSync(resolve('apps/client/src/assets/tiles-v2/boom-base.png'))).toBe(true);
  });
});
