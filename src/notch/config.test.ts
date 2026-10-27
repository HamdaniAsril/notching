import { expect, test } from 'vitest';
import { DEFAULT_CONFIG, clampConfig } from './config';

test('defaults match the spec', () =>
  expect(DEFAULT_CONFIG).toEqual({ bounce: 100, speed: 200, dropDepth: 9, thickness: 4 }));

test('clampConfig keeps values inside the slider ranges', () =>
  expect(clampConfig({ bounce: 150, speed: 10, dropDepth: 40, thickness: 1 }))
    .toEqual({ bounce: 100, speed: 40, dropDepth: 28, thickness: 2 }));
