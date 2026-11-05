import { expect, test } from 'vitest';
import { catalog } from '../../src/bridge-browser';
import iconSvg from './icon.svg?raw';

test('the icon is a line drawing', () => {
  expect(iconSvg).toContain('viewBox="0 0 24 24"');
  expect(iconSvg).toContain('stroke=');
});

test('a tool after Atur jendela, before the widget packages, waiting to be installed', () => {
  const all = catalog('id', []);
  const ids = all.map(m => m.id);
  expect(ids.indexOf('window-peek')).toBe(ids.indexOf('window-keys') + 1);
  expect(ids.indexOf('waktu')).toBe(ids.indexOf('window-peek') + 1);
  const m = all.find(x => x.id === 'window-peek')!;
  expect([m.entry, m.card, m.action, m.tool]).toEqual([null, null, null, true]);
  expect(m.permissions).toEqual(['accessibility', 'screen-recording']);
  expect(m.category).toBe('window');
  expect([m.installed, m.enabled]).toEqual([false, false]);
  expect(m.name).toBe('Intip jendela');
  expect(catalog('en', []).find(x => x.id === 'window-peek')!.name).toBe('Window peek');
});

test('installed once chosen in the Katalog', () => {
  const m = catalog('id', [], ['window-peek']).find(x => x.id === 'window-peek')!;
  expect([m.installed, m.enabled]).toEqual([true, true]);
});
