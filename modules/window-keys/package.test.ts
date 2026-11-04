import { expect, test } from 'vitest';
import { catalog } from '../../src/bridge-browser';
import iconSvg from './icon.svg?raw';

test('the icon is a line drawing', () => {
  expect(iconSvg).toContain('viewBox="0 0 24 24"');
  expect(iconSvg).toContain('stroke=');
});

test('a tool after Potong file, before the widget packages', () => {
  const all = catalog('id', []);
  const ids = all.map(m => m.id);
  expect(ids.indexOf('window-keys')).toBe(ids.indexOf('cut-files') + 1);
  expect(ids.indexOf('waktu')).toBe(ids.indexOf('window-keys') + 1);
  const m = all.find(x => x.id === 'window-keys')!;
  expect([m.entry, m.card, m.action, m.tool]).toEqual([null, null, null, true]);
  expect(m.permissions).toEqual(['accessibility']);
  expect(m.name).toBe('Atur jendela');
  expect(catalog('en', []).find(x => x.id === 'window-keys')!.name).toBe('Arrange windows');
});
