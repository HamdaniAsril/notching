// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { bar, lab, num, segs } from './volt';

test('bar writes the fill width as a clamped percentage', () => {
  const fill = (f: number) => (bar(f).firstElementChild as HTMLElement).style.width;
  expect(bar(0.4).className).toBe('v-bar');
  expect(fill(0.4)).toBe('40%');
  expect(fill(1.7)).toBe('100%');
  expect(fill(-1)).toBe('0%');
});

test('segs lights the first n segments, or the listed indices', () => {
  const a = segs(5, 2);
  expect(a.className).toBe('v-segs');
  expect(a.children).toHaveLength(5);
  expect([...a.children].map((c) => c.classList.contains('on'))).toEqual([true, true, false, false, false]);
  const b = segs(5, [3]);
  expect([...b.children].map((c) => c.classList.contains('on'))).toEqual([false, false, false, true, false]);
});

test('num is a v-num with the given text and pixel size', () => {
  const n = num('09.41', 40);
  expect(n.className).toBe('v-num');
  expect(n.textContent).toBe('09.41');
  expect(n.style.fontSize).toBe('40px');
  expect(num('1', 20, 'v-acc').className).toBe('v-num v-acc');
});

test('lab is a v-lab span that takes an extra class', () => {
  const l = lab('Jakarta', 'ink');
  expect(l.tagName).toBe('SPAN');
  expect(l.className).toBe('v-lab ink');
  expect(l.textContent).toBe('Jakarta');
});
