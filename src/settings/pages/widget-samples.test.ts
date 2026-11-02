// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { CatalogWidget } from '../../pages/layout';
import { packSample } from './widget-samples';

const widget = (ref: string, width = 1): CatalogWidget =>
  ({ ref, moduleId: ref.split('/')[0], id: ref.split('/')[1], name: ref, width, kind: 'time' }) as CatalogWidget;

test('the waktu widgets have samples', () => {
  const clock = packSample(widget('waktu/clockdate', 2), 'id')!;
  expect(clock).not.toBeNull();
  expect(clock[0].textContent).toContain('JAKARTA');
  expect(clock[0].textContent).toContain('JUM 30.10');
  expect(clock.some(e => e.querySelector('svg.dm'))).toBe(true);
  const analog = packSample(widget('waktu/analog'), 'en')!;
  expect(analog).not.toBeNull();
  expect(analog[0].querySelectorAll('circle.tk')).toHaveLength(12);
});

test('Kalender, Hari ke- and Minggu ini have samples', () => {
  const cal = packSample(widget('waktu/calendar', 2), 'id')!;
  expect(cal).toHaveLength(1);
  expect(cal[0].querySelector('.today')!.textContent).toBe('30');
  expect(cal[0].querySelector('.wd-cal-month')!.textContent).toBe('OKT');
  const day = packSample(widget('waktu/yearday'), 'id')!;
  expect(day[0].querySelector('svg.dm')).not.toBeNull();
  expect(day[0].querySelector('.wd-yearday-left')!.textContent).toBe('SISA 62 HARI');
  const week = packSample(widget('waktu/weekstrip', 4), 'en')!;
  expect(week[0].querySelectorAll('.wd-wk-cell')).toHaveLength(7);
  expect(week[0].querySelector('.wd-wk-cell.today .lab')!.textContent).toBe('FRI');
  expect(week[0].querySelector('.wd-wk-week svg.dm')).not.toBeNull();
});

test('other widgets are not a pack sample', () => {
  expect(packSample(widget('home/date'), 'id')).toBeNull();
});
