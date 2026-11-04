import { expect, test } from 'vitest';
import { catalog } from '../../src/bridge-browser';
import iconSvg from './icon.svg?raw';

test('the icon is a line drawing', () => {
  expect(iconSvg).toContain('viewBox="0 0 24 24"');
  expect(iconSvg).toContain('stroke=');
});

test('a tool after Cleaner, with no tile, and it needs Accessibility', () => {
  const all = catalog('id', []);
  const ids = all.map(m => m.id);
  expect(ids.indexOf('cut-files')).toBe(ids.indexOf('cleaner') + 1);
  const m = all.find(x => x.id === 'cut-files')!;
  expect([m.entry, m.card, m.action, m.tool]).toEqual([null, null, null, true]);
  expect(m.permissions).toEqual(['accessibility']);
  expect(m.name).toBe('Potong file');
  expect(catalog('en', []).find(x => x.id === 'cut-files')!.name).toBe('Cut files');
  expect(m.channels).toEqual([{ id: 'moves', name: 'Potong dan pindah', on: true, sound: false, widget: null }]);
});
