import { expect, test } from 'vitest';
import { catalog } from '../../src/bridge-browser';
import iconSvg from './icon.svg?raw';

test('the icon is a viewfinder: corner brackets and a dot, stroked', () => {
  expect(iconSvg).toContain('viewBox="0 0 24 24"');
  expect(iconSvg).toContain('stroke=');
});

test('Screenshot comes directly after Titipan, and its tile takes the shot', () => {
  const all = catalog('id', []);
  const ids = all.map(m => m.id);
  expect(ids.indexOf('screenshot')).toBe(ids.indexOf('shelf') + 1);
  const m = all.find(x => x.id === 'screenshot')!;
  expect([m.entry, m.card, m.action]).toEqual([null, null, { capability: 'screenshot', method: 'open' }]);
  expect(m.permissions).toEqual(['screen-recording']);
  expect([m.name, m.shortName]).toEqual(['Screenshot', 'Screenshot']);
  expect(catalog('en', []).find(x => x.id === 'screenshot')!.name).toBe('Screenshot');
});
