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
