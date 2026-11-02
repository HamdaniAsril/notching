// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { dotWidth, fitPitch } from '../../../src/kit/dots';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { host, NOW } from './fixtures';
import { renderYearDay } from './yearday';

afterEach(() => { document.body.innerHTML = ''; });

test('31 Oct 2026 is day 304 with 61 days left', () => {
  const root = host();
  renderYearDay(root, 'id', id).update(NOW);
  const svg = root.querySelector('.wd-big svg.dm')!;
  expect(svg.getAttribute('width')).toBe(String(dotWidth('304', 6)));
  const labs = [...root.querySelectorAll('.lab')].map(l => l.textContent);
  expect(labs).toEqual(['HARI KE', '2026', 'SISA 61 HARI']);
});

test('the month bar has the past months lit, this month red and the rest dim', () => {
  const root = host();
  renderYearDay(root, 'id', id).update(NOW);
  expect(root.querySelectorAll('.wd-row .d')).toHaveLength(12);
  expect(root.querySelectorAll('.wd-row .lit')).toHaveLength(9);
  expect(root.querySelectorAll('.wd-row .now')).toHaveLength(1);
  expect(root.querySelectorAll('.wd-row .d:not(.lit):not(.now)')).toHaveLength(2);
});

test('the last day of a leap year fits one column', () => {
  const root = host();
  renderYearDay(root, 'id', id).update(new Date(2028, 11, 31, 12, 0));
  const svg = root.querySelector('.wd-big svg.dm')!;
  expect(svg.getAttribute('width')).toBe(String(dotWidth('366', fitPitch('366', 109))));
  expect(Number(svg.getAttribute('width'))).toBeLessThanOrEqual(109);
  expect(root.querySelector('.wd-yearday-left')!.textContent).toBe('SISA 0 HARI');
  expect(root.querySelectorAll('.wd-row .now')).toHaveLength(1);
  expect(root.querySelectorAll('.wd-row .lit')).toHaveLength(11);
});

test('English, and one day left reads in the singular', () => {
  const root = host();
  const w = renderYearDay(root, 'en', en);
  w.update(NOW);
  expect(root.querySelector('.wd-yearday-left')!.textContent).toBe('61 DAYS LEFT');
  expect(root.querySelector('.lab')!.textContent).toBe('DAY');
  w.update(new Date(2026, 11, 30));
  expect(root.querySelector('.wd-yearday-left')!.textContent).toBe('1 DAY LEFT');
});
