import { expect, test } from 'vitest';
import { catalog } from '../../src/bridge-browser';
import iconSvg from './icon.svg?raw';

test('the icon is a broom, stroked', () => {
  expect(iconSvg).toContain('viewBox="0 0 24 24"');
  expect(iconSvg).toContain('stroke=');
});

test('Cleaner comes directly after Screenshot, and its tile opens it', () => {
  const all = catalog('id', []);
  const ids = all.map(m => m.id);
  expect(ids.indexOf('cleaner')).toBe(ids.indexOf('screenshot') + 1);
  const m = all.find(x => x.id === 'cleaner')!;
  expect([m.entry, m.card, m.action]).toEqual([null, null, { capability: 'cleaner', method: 'open' }]);
  expect(m.permissions).toEqual(['full-disk-access']);
  expect([m.name, m.shortName]).toEqual(['Cleaner', 'Cleaner']);
  expect(catalog('en', []).find(x => x.id === 'cleaner')!.description).toBe('Clean caches and remove apps completely');
});
