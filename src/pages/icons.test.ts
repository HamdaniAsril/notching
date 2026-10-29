import { expect, test } from 'vitest';
import { PAGE_ICON_NAMES, PAGE_ICONS, pageIconSvg } from './icons';

test('every page icon is a plain line drawing', () => {
  expect(PAGE_ICON_NAMES).toHaveLength(24);
  expect(new Set(PAGE_ICON_NAMES).size).toBe(24);
  for (const name of PAGE_ICON_NAMES) {
    const body = PAGE_ICONS[name];
    expect(body, name).toBeTruthy();
    expect(body, name).not.toMatch(/<script|\son\w+=|href|<image|<foreignObject/i);
    expect(pageIconSvg(name)).toMatch(/^<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"/);
  }
});

test('an unknown icon falls back to the dot', () => {
  expect(pageIconSvg('zzz')).toBe(pageIconSvg('dot'));
  expect(pageIconSvg('__proto__')).toBe(pageIconSvg('dot'));
});
