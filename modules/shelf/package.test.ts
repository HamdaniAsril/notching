import { expect, test } from 'vitest';
import { catalog } from '../../src/bridge-browser';
import iconSvg from './icon.svg?raw';

test('the icon is a line drawing of a tray', () => {
  expect(iconSvg).toContain('viewBox="0 0 24 24"');
  expect(iconSvg).toContain('stroke=');
});

test('Titipan comes after Cermin, its tile opens the shelf, and it shows a status', () => {
  const all = catalog('id', []);
  const ids = all.map(m => m.id);
  expect(ids.indexOf('shelf')).toBe(ids.indexOf('mirror') + 1);
  const m = all.find(x => x.id === 'shelf')!;
  expect([m.entry, m.card, m.action]).toEqual([null, null, { capability: 'shelf', method: 'open' }]);
  expect(m.permissions).toEqual([]);
  expect([m.name, m.shortName, m.status]).toEqual(['Titipan', 'Titipan', true]);
  expect(catalog('en', []).find(x => x.id === 'shelf')!.name).toBe('Shelf');
});
