import { expect, test } from 'vitest';
import { BAR_COLORS, barParts, sizeText } from './format';

test('sizeText follows Finder units and the language', () => {
  expect(sizeText(25_900_000_000, 'id')).toBe('25,9 GB');
  expect(sizeText(25_900_000_000, 'en')).toBe('25.9 GB');
  expect(sizeText(25_900_000_000, 'id', false)).toBe('25,9GB');
  expect(sizeText(212_000_000_000, 'id')).toBe('212 GB');
  expect(sizeText(44_000_000_000, 'en')).toBe('44 GB');
  expect(sizeText(980_000_000, 'id')).toBe('980 MB');
  expect(sizeText(0, 'en')).toBe('0 B');
});

const overview = { testMode: false, fda: true, volume: 'Macintosh HD', total: 256e9, free: 44e9 };

test('barParts: known parts, the rest as Lainnya, then free', () => {
  const parts = barParts(overview, { apps: 51e9, documents: 36e9, photos: 26e9, cleanable: 31e9, appCount: 84 });
  expect(parts.map(p => p.key)).toEqual(['apps', 'documents', 'photos', 'cleanable', 'other', 'free']);
  expect(parts.find(p => p.key === 'other')!.bytes).toBe(212e9 - 144e9);
  expect(parts.find(p => p.key === 'free')!.bytes).toBe(44e9);
  expect(Object.keys(BAR_COLORS)).toEqual(['apps', 'documents', 'photos', 'cleanable', 'other', 'free']);
});

test('barParts never makes Lainnya negative, and folds unknown parts in', () => {
  const big = barParts(overview, { apps: 300e9, documents: null, photos: null, cleanable: 1e9, appCount: 1 });
  expect(big.find(p => p.key === 'other')!.bytes).toBe(0);
  const docs = big.find(p => p.key === 'documents')!;
  expect([docs.known, docs.bytes]).toEqual([false, 0]);
  const none = barParts(overview, null);
  expect(none.filter(p => p.known).map(p => p.key)).toEqual(['other', 'free']);
  expect(none.find(p => p.key === 'other')!.bytes).toBe(212e9);
});
