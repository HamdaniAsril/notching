// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { CatalogWidget } from '../../pages/layout';
import { packSample } from './widget-samples';

const widget = (ref: string, width = 1): CatalogWidget =>
  ({ ref, moduleId: ref.split('/')[0], id: ref.split('/')[1], name: ref, width, kind: 'time' }) as CatalogWidget;

test('the waktu widgets have samples', () => {
  const clock = packSample(widget('waktu/clockdate', 2), 'id')!;
  expect(clock).toHaveLength(1);
  expect(clock[0].classList.contains('v-card')).toBe(true);
  expect(clock[0].querySelector('.wd-city')!.textContent).toBe('Jakarta');
  expect(clock[0].querySelector('.wd-date')!.textContent).toBe('Jum, 30 Okt');
  expect([...clock[0].querySelectorAll('.wd-time .v-num')].map(n => n.textContent)).toEqual(['09.32', '15']);
  expect(clock[0].querySelector('.wd-pct')!.textContent).toBe('40% hari');
  const analog = packSample(widget('waktu/analog'), 'en')!;
  expect(analog).not.toBeNull();
  expect(analog[0].classList.contains('flush')).toBe(true);
  expect(analog[0].querySelectorAll('line.tk')).toHaveLength(12);
  expect(analog[0].querySelector('text')!.textContent).toBe('Jakarta');
});

test('Kalender, Hari ke- and Minggu ini have samples', () => {
  const cal = packSample(widget('waktu/calendar', 2), 'id')!;
  expect(cal).toHaveLength(1);
  expect(cal[0].querySelector('.today')!.textContent).toBe('30');
  expect(cal[0].querySelector('.wd-cal-month')!.textContent).toBe('Oktober');
  const day = packSample(widget('waktu/yearday'), 'id')!;
  expect(day[0].querySelector('.v-num.v-acc')!.textContent).toBe('303');
  expect(day[0].querySelector('.wd-yearday-left')!.textContent).toBe('62 hari lagi');
  const week = packSample(widget('waktu/weekstrip', 4), 'en')!;
  expect(week[0].querySelectorAll('.wd-wk-cell')).toHaveLength(7);
  expect(week[0].querySelector('.wd-wk-cell.today .wd-wk-name')!.textContent).toBe('Fri');
  expect(week[0].querySelector('.wd-wk-week .v-num')!.textContent).toBe('44');
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
  expect(moon[0].querySelector('.lab')!.textContent).toBe('GIBBOUS');
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
  expect(week[0].querySelectorAll('.wd-pk-day')).toHaveLength(7);
  expect(week[0].querySelector('.wd-pk-day.today')!.textContent).toContain('J');
  expect(week[0].querySelectorAll('.wd-pk-day.has')).toHaveLength(2);
  expect(week[0].querySelector('.wd-pk-title')!.textContent).toBe('Kirim invoice');
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
  expect(packSample(widget('timer/strip', 4), 'id')).toBeNull();
});

test('Jam kerja has a sample: working on the default hours at 09:32', () => {
  const wd = packSample(widget('fokus/workday'), 'id')!;
  expect(wd).toHaveLength(1);
  expect([...wd[0].querySelectorAll('.lab')].map(e => e.textContent)).toEqual(['JAM KERJA', '09–17', 'SUDAH 32 M']);
  expect(wd[0].querySelector('.wd-work-time')!.textContent).toBe('7 J 28 M');
  expect(wd[0].querySelectorAll('.wd-row .d')).toHaveLength(10);
  const en = packSample(widget('fokus/workday'), 'en')!;
  expect([...en[0].querySelectorAll('.lab')].pop()!.textContent).toBe('32 M DONE');
});

test('Zona waktu has a sample: home, Tokyo and London at 09:32', () => {
  const z = packSample(widget('waktu/zones', 2), 'id')!;
  expect(z).toHaveLength(1);
  expect([...z[0].querySelectorAll('.wd-zone-head .v-lab')].map(e => e.textContent)).toEqual(['Zona waktu', '3 kota']);
  const cols = z[0].querySelectorAll('.wd-zone-col');
  expect(cols).toHaveLength(3);
  expect([...cols].map(c => c.querySelector('.wd-zone-city')!.textContent)).toEqual(['Jakarta', 'Tokyo', 'London']);
  expect(cols[0].querySelector('.wd-zone-city')!.classList.contains('v-acc')).toBe(true);
  expect(cols[0].getAttribute('data-time')).toBe('09.32');
  expect(z[0].querySelectorAll('.v-num')).toHaveLength(3);
  expect(packSample(widget('waktu/zones', 2), 'en')![0].querySelector('.wd-zone-head .v-lab')!.textContent).toBe('World clock');
});

test('Tanggal and Jam tumpuk have samples', () => {
  const date = packSample(widget('home/date'), 'id')!;
  expect(date).toHaveLength(1);
  expect(date[0].classList.contains('v-card')).toBe(true);
  expect(date[0].querySelector('.hm-date-top .v-lab')!.textContent).toBe('Jumat');
  expect(date[0].querySelector('.v-num')!.textContent).toBe('30');
  expect(date[0].querySelector('.hm-date-month')!.textContent).toBe('Oktober 2026');
  const clock = packSample(widget('home/clock'), 'en')!;
  expect([...clock[0].querySelectorAll('.hm-clock-stack .v-num')].map(n => n.textContent)).toEqual(['09', '32']);
  expect(clock[0].querySelector('.hm-clock-part')!.textContent).toBe('morning');
});

test('Waktu sholat and Cuaca have samples', () => {
  const prayer = packSample(widget('home/prayer'), 'id')!;
  expect(prayer).toHaveLength(1);
  expect(prayer[0].querySelector('.hm-pr-name')!.textContent).toBe('Ashar');
  expect(prayer[0].querySelector('.hm-pr-next .v-num')!.textContent).toBe('15.12');
  expect(prayer[0].querySelector('.hm-pr-left')!.textContent).toBe('5 j 40 m lagi');
  expect([...prayer[0].querySelectorAll('.v-seg')].map(s => s.classList.contains('on'))).toEqual([false, false, true, false, false]);
  const wx = packSample(widget('home/weather'), 'en')!;
  expect(wx).toHaveLength(1);
  expect(wx[0].querySelector('.hm-wx-city')!.textContent).toBe('Jakarta');
  expect(wx[0].querySelector('.v-num')!.textContent).toBe('31°');
  expect(wx[0].querySelector('.hm-wx-sky')!.textContent).toBe('Cloudy');
  expect(wx[0].querySelector('.hm-wx-icon svg')).not.toBeNull();
});

test('Reminder has a sample with one of four done and three rows', () => {
  const id = packSample(widget('home/reminders', 2), 'id')!;
  expect(id).toHaveLength(1);
  expect(id[0].querySelector('.hm-rem-head .v-lab')!.textContent).toBe('Hari ini');
  expect(id[0].querySelector('.hm-rem-done')!.textContent).toBe('1 dari 4 selesai');
  const rows = [...id[0].querySelectorAll('.rm')];
  expect(rows.map(r => r.querySelector('.t')!.textContent)).toEqual(['Kirim invoice', 'Telepon ibu', 'Servis motor']);
  expect(rows[0].classList.contains('next')).toBe(true);
  expect(rows[0].querySelector('.m')!.textContent).toBe('14.00');
  const en = packSample(widget('home/reminders', 2), 'en')!;
  expect(en[0].querySelector('.hm-rem-done')!.textContent).toBe('1 of 4 done');
  expect(en[0].querySelector('.rm .t')!.textContent).toBe('Send invoice');
});
