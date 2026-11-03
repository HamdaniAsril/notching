// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { zoneLabel } from '../../../src/kit/dates';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { renderClock } from './clock';
import { host } from './fixtures';

afterEach(() => { document.body.innerHTML = ''; });

const at = (h: number, m: number) => new Date(2026, 9, 27, h, m);

test('the clock stacks the hour in white over the minutes in the accent', () => {
  const root = host();
  renderClock(root, id, 'id').update(at(9, 5));
  expect(root.querySelector('.hm-clock')!.classList.contains('v-card')).toBe(true);
  const nums = [...root.querySelectorAll<HTMLElement>('.hm-clock-stack .v-num')];
  expect(nums.map(n => n.textContent)).toEqual(['09', '05']);
  expect(nums.map(n => n.classList.contains('v-acc'))).toEqual([false, true]);
  expect(nums.map(n => n.style.fontSize)).toEqual(['42px', '42px']);
  // Barlow 800 (hm-clock-no), not the condensed number face.
  expect(nums.every(n => n.classList.contains('hm-clock-no'))).toBe(true);
  expect(root.querySelectorAll('svg')).toHaveLength(0);
});

test('the right column has the part of the day on top and the zone below', () => {
  const root = host();
  const now = at(9, 5);
  renderClock(root, id, 'id').update(now);
  expect(root.querySelector('.hm-clock-part')!.textContent).toBe('pagi');
  expect(root.querySelector('.hm-clock-zone')!.textContent).toBe(zoneLabel('id', now));
});

test('the part of the day by the hour', () => {
  const root = host();
  const w = renderClock(root, id, 'id');
  const part = (h: number) => {
    w.update(at(h, 0));
    return root.querySelector('.hm-clock-part')!.textContent;
  };
  expect([0, 3, 4, 10, 11, 14, 15, 17, 18, 23].map(part))
    .toEqual(['malam', 'malam', 'pagi', 'pagi', 'siang', 'siang', 'sore', 'sore', 'malam', 'malam']);
});

test('English names the part of the day in English', () => {
  const root = host();
  const w = renderClock(root, en, 'en');
  w.update(at(9, 5));
  expect(root.querySelector('.hm-clock-part')!.textContent).toBe('morning');
  w.update(at(16, 5));
  expect(root.querySelector('.hm-clock-part')!.textContent).toBe('afternoon');
});

test('an update replaces the content', () => {
  const root = host();
  const w = renderClock(root, id, 'id');
  w.update(at(9, 5));
  w.update(at(9, 6));
  expect(root.querySelectorAll('.hm-clock')).toHaveLength(1);
  expect(root.querySelector('.v-acc')!.textContent).toBe('06');
});
