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

test('Cuaca besar and Bulan have samples', () => {
  const wx = packSample(widget('sekitar/bigweather', 2), 'id')!;
  expect(wx).toHaveLength(1);
  expect(wx[0].querySelector('svg.dm')).not.toBeNull();
  expect(wx[0].textContent).toContain('Jakarta');
  expect(wx[0].textContent).toContain('T 33°');
  expect(wx[0].querySelector('.ic svg')).not.toBeNull();
  const moon = packSample(widget('sekitar/moon'), 'en')!;
  expect(moon).toHaveLength(1);
  expect(moon[0].querySelector('.lab')!.textContent).toBe('MOON · GIBBOUS');
  expect(moon[0].querySelector('svg.wd-moon-disk')).not.toBeNull();
  expect(moon[0].querySelector('.wd-big svg.dm')).not.toBeNull();
});

test('Cuaca per jam has a sample with the rainy afternoon', () => {
  const hr = packSample(widget('sekitar/hourly', 4), 'id')!;
  expect(hr).toHaveLength(1);
  expect(hr[0].querySelectorAll('.wd-hr-cell')).toHaveLength(8);
  expect(hr[0].querySelector('.wd-hr-left .lab')!.textContent).toBe('PER JAM');
  expect(hr[0].querySelector('.wd-hr-right')!.textContent).toBe('HUJAN 15.00');
  const en = packSample(widget('sekitar/hourly', 4), 'en')!;
  expect(en[0].querySelector('.wd-hr-right')!.textContent).toBe('RAIN 3 PM');
});

test('Matahari has a sample', () => {
  const sun = packSample(widget('sekitar/sun', 2), 'id')!;
  expect(sun).toHaveLength(1);
  expect(sun[0].querySelector('.lab')!.textContent).toBe('MATAHARI');
  expect(sun[0].textContent).toContain('8J 13M');
  expect(sun[0].textContent).toContain('LAGI');
  expect(sun[0].querySelector('svg.wd-sun-arc')).not.toBeNull();
  expect(sun[0].querySelectorAll('.wd-sun-foot svg.dm')).toHaveLength(2);
});

test('Pekan ini and Berikutnya have samples', () => {
  const week = packSample(widget('rencana/week', 2), 'id')!;
  expect(week).toHaveLength(1);
  expect(week[0].querySelectorAll('.wd-wk-day')).toHaveLength(7);
  expect(week[0].querySelector('.wd-wk-day.today')!.textContent).toContain('J');
  expect(week[0].querySelectorAll('.wd-wk-day.has')).toHaveLength(2);
  expect(week[0].querySelector('.wd-wk-title')!.textContent).toBe('Kirim invoice');
  const next = packSample(widget('rencana/next', 2), 'en')!;
  expect(next).toHaveLength(1);
  expect(next[0].querySelector('.wd-nx-top')!.textContent).toBe('UP NEXT4 H');
  expect(next[0].querySelector('.wd-nx-foot svg.dm')).not.toBeNull();
});

test('Napas has its idle state as a sample', () => {
  const id = packSample(widget('fokus/breath'), 'id')!;
  expect(id).toHaveLength(1);
  expect(id[0].querySelector('.lab')!.textContent).toBe('NAPAS');
  expect(id[0].textContent).toContain('Klik untuk mulai');
  expect(id[0].querySelectorAll('.wd-br-ring')).toHaveLength(2);
  expect(id[0].querySelector('.wd-br-core')).not.toBeNull();
  expect(packSample(widget('fokus/breath'), 'en')![0].textContent).toContain('BREATHE');
});

test('Timer kecil has its idle state as a sample', () => {
  const id = packSample(widget('timer/tile'), 'id')!;
  expect(id).toHaveLength(1);
  expect(id[0].textContent).toContain('TIMER');
  expect(id[0].textContent).toContain('MENIT');
  expect(id[0].querySelector('.wd-big svg.dm')!.getAttribute('width')).toBe('66');
  expect(id[0].querySelectorAll('.wd-tl-ruler i')).toHaveLength(5);
  expect(id[0].querySelector('.wd-tl-head .ic svg')).not.toBeNull();
  expect(packSample(widget('timer/tile'), 'en')![0].textContent).toContain('MINUTES');
});

test('other widgets are not a pack sample', () => {
  expect(packSample(widget('home/date'), 'id')).toBeNull();
});
