import { expect, test } from 'vitest';
import { DEFAULT_PREFS, parsePrefs, serializePrefs } from './prefs';

test('nothing kept yet gives the pen, red and the middle width', () => {
  expect(DEFAULT_PREFS).toEqual({ tool: 'pen', color: 0, width: 1 });
  expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
});

test('what was kept comes back', () => {
  const kept = { tool: 'arrow', color: 3, width: 2 } as const;
  expect(parsePrefs(serializePrefs(kept))).toEqual(kept);
});

test('a damaged or strange value falls back, part by part', () => {
  expect(parsePrefs('{')).toEqual(DEFAULT_PREFS);
  expect(parsePrefs('"pen"')).toEqual(DEFAULT_PREFS);
  expect(parsePrefs(JSON.stringify({ tool: 'brush', color: 9, width: 1.5 }))).toEqual(DEFAULT_PREFS);
  expect(parsePrefs(JSON.stringify({ tool: 'rect', color: -1 }))).toEqual({ tool: 'rect', color: 0, width: 1 });
});
