import { expect, test } from 'vitest';
import { catalog } from '../../src/bridge-browser';
import iconSvg from './icon.svg?raw';

test('the icon is a line drawing', () => {
  expect(iconSvg).toContain('viewBox="0 0 24 24"');
  expect(iconSvg).toContain('stroke=');
});

test('Cermin comes before Titipan, opens a 600 × 400 page and needs the camera', () => {
  const all = catalog('id', []);
  expect(all[all.length - 2].id).toBe('mirror');
  const m = all.find(x => x.id === 'mirror')!;
  expect([m.entry, m.card, m.action]).toEqual(['index.html', { width: 600, height: 400 }, null]);
  expect(m.permissions).toEqual(['camera']);
  expect([m.name, m.shortName, m.status]).toEqual(['Cermin', 'Cermin', false]);
  expect(catalog('en', []).find(x => x.id === 'mirror')!.name).toBe('Mirror');
});
