import { expect, test } from 'vitest';
import { DEFAULT_PREFS, parsePrefs, serializePrefs } from './prefs';

test('nothing kept yet gives the pen, red and the middle width', () => {
  expect(DEFAULT_PREFS).toEqual({ tool: 'pen', color: 0, width: 1, style: { corner: 0, padding: 64, background: { kind: 'none' } } });
  expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
});

test('what was kept comes back', () => {
  const kept = { tool: 'arrow', color: 3, width: 2, style: { corner: 12, padding: 100, background: { kind: 'gradient', from: '#FF7A18', to: '#7A1FA2' } } } as const;
  expect(parsePrefs(serializePrefs(kept))).toEqual(kept);
});

test('a damaged or strange value falls back, part by part', () => {
  expect(parsePrefs('{')).toEqual(DEFAULT_PREFS);
  expect(parsePrefs('"pen"')).toEqual(DEFAULT_PREFS);
  expect(parsePrefs(JSON.stringify({ tool: 'brush', color: 9, width: 1.5 }))).toEqual(DEFAULT_PREFS);
  expect(parsePrefs(JSON.stringify({ tool: 'rect', color: -1 }))).toEqual({ ...DEFAULT_PREFS, tool: 'rect' });
  expect(parsePrefs(JSON.stringify({ style: { corner: 99, padding: 1 } })).style).toEqual({ corner: 40, padding: 16, background: { kind: 'none' } });
});

test('a picture background is never kept', () => {
  const style = { corner: 4, padding: 64, background: { kind: 'image', src: 'data:image/jpeg;base64,WALL', from: 'wallpaper' } } as const;
  expect(parsePrefs(serializePrefs({ ...DEFAULT_PREFS, style })).style).toEqual({ ...style, background: { kind: 'none' } });
  expect(serializePrefs({ ...DEFAULT_PREFS, style })).not.toContain('WALL');
});
