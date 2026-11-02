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
  expect(wx[0].classList.contains('v-card')).toBe(true);
  expect(wx[0].querySelector('.v-num')!.textContent).toBe('31°');
  expect(wx[0].querySelector('.wd-bw-city')!.textContent).toBe('Jakarta');
  expect(wx[0].querySelector('.wd-bw-sky')!.textContent).toBe('Berawan');
  expect(wx[0].querySelector('.wd-bw-high')!.textContent).toBe('Tertinggi 33°');
  expect(wx[0].querySelector('.v-acc .ic svg')).not.toBeNull();
  const moon = packSample(widget('sekitar/moon'), 'en')!;
  expect(moon).toHaveLength(1);
  expect(moon[0].classList.contains('flush')).toBe(true);
  expect(moon[0].querySelector('.wd-moon-title')!.textContent).toBe('Gibbous 80%');
  expect(moon[0].querySelector('.wd-moon-sub')!.textContent).toBe('New in 10 days');
  expect(moon[0].querySelector('svg.wd-moon-disk')).not.toBeNull();
});

test('Cuaca per jam has a sample with the rainy afternoon', () => {
  const hr = packSample(widget('sekitar/hourly', 4), 'id')!;
  expect(hr).toHaveLength(1);
  expect(hr[0].classList.contains('v-card')).toBe(true);
  expect(hr[0].querySelectorAll('.wd-hr-cell')).toHaveLength(8);
  expect(hr[0].querySelector('.wd-hr-left .v-lab')!.textContent).toBe('Per jam');
  expect(hr[0].querySelector('.wd-hr-cell.now .wd-hr-h')!.textContent).toBe('Kini');
  expect(hr[0].querySelector('.wd-hr-rain')!.textContent).toBe('Hujan 15.00');
  expect(hr[0].querySelector('.wd-hr-sub')!.textContent).toBe('Selama 4 jam');
  const en = packSample(widget('sekitar/hourly', 4), 'en')!;
  expect(en[0].querySelector('.wd-hr-rain')!.textContent).toBe('Rain 15:00');
  expect(en[0].querySelector('.wd-hr-sub')!.textContent).toBe('For 4 h');
});

test('Matahari has a sample', () => {
  const sun = packSample(widget('sekitar/sun', 2), 'id')!;
  expect(sun).toHaveLength(1);
  expect(sun[0].classList.contains('v-card')).toBe(true);
  expect(sun[0].querySelector('.wd-sun-top .v-lab')!.textContent).toBe('Matahari');
  expect(sun[0].querySelector('.wd-sun-eta')!.textContent).toBe('Terbenam 8 j 13 m lagi');
  expect(sun[0].querySelector('svg.wd-sun-arc')).not.toBeNull();
  expect([...sun[0].querySelectorAll('.wd-sun-foot .v-num')].map(n => n.textContent)).toEqual(['05.28', '17.45']);
});

test('Udara has a sample', () => {
  const air = packSample(widget('sekitar/air'), 'id')!;
  expect(air).toHaveLength(1);
  expect(air[0].classList.contains('v-card')).toBe(true);
  expect(air[0].querySelector('.wd-air-label')!.textContent).toBe('Kualitas udara');
  expect(air[0].querySelector('.v-num')!.textContent).toBe('42');
  expect(air[0].querySelectorAll('.v-seg.on')).toHaveLength(1);
  expect(air[0].querySelector('.wd-air-advice')!.textContent).toBe('Baik untuk lari');
});

test('Pekan ini and Berikutnya have samples', () => {
  // The sample is Friday 30 Oct 2026, 09:32, in ISO week 44; the next reminder is at 14.00.
  const week = packSample(widget('rencana/week', 2), 'id')!;
  expect(week).toHaveLength(1);
  expect(week[0].classList.contains('v-card')).toBe(true);
  expect(week[0].querySelector('.wd-pk-head .v-lab')!.textContent).toBe('Pekan ini');
  expect(week[0].querySelector('.wd-pk-wk')!.textContent).toBe('Minggu 44');
  expect(week[0].querySelectorAll('.wd-pk-day')).toHaveLength(7);
  expect(week[0].querySelector('.wd-pk-day.today')!.textContent).toBe('J30');
  expect(week[0].querySelector('.wd-pk-time')!.textContent).toBe('14.00');
  expect(week[0].querySelector('.wd-pk-title')!.textContent).toBe('Kirim invoice');
  const next = packSample(widget('rencana/next', 2), 'en')!;
  expect(next).toHaveLength(1);
  expect(next[0].querySelector('.wd-nx-top .v-lab')!.textContent).toBe('Up next');
  expect(next[0].querySelector('.v-pill.soft')!.textContent).toBe('in 4 h');
  expect(next[0].querySelector('.wd-nx-title')!.textContent).toBe('Kirim invoice');
  expect(next[0].querySelector('.wd-nx-detail')!.textContent).toBe('Today');
  expect(next[0].querySelector('.wd-nx-foot .v-num.v-acc')!.textContent).toBe('14:00');
});

test('Napas has its idle state as a sample', () => {
  const id = packSample(widget('fokus/breath'), 'id')!;
  expect(id).toHaveLength(1);
  expect(id[0].classList.contains('flush')).toBe(true);
  expect(id[0].querySelector('.wd-br-title')!.textContent).toBe('Tarik napas');
  expect(id[0].querySelector('.wd-br-detail')!.textContent).toBe('4 detik · 5 putaran');
  expect(id[0].querySelectorAll('.wd-br-ring')).toHaveLength(2);
  expect(id[0].querySelector('.wd-br-core')).not.toBeNull();
  expect(packSample(widget('fokus/breath'), 'en')![0].querySelector('.wd-br-detail')!.textContent).toBe('4 s · 5 rounds');
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
  expect(wd[0].querySelector('.wd-work-head .v-lab')!.textContent).toBe('Jam kerja');
  expect(wd[0].querySelector('.wd-work-range')!.textContent).toBe('09–17');
  expect(wd[0].querySelector('.wd-work-time')!.textContent).toBe('7 j 28 m');
  expect(wd[0].querySelector('.wd-work-worked')!.textContent).toBe('Sudah 32 m');
  expect(wd[0].querySelector<HTMLElement>('.v-bar .v-fill')!.style.width).toBe('6.72%');
  const en = packSample(widget('fokus/workday'), 'en')!;
  expect(en[0].querySelector('.wd-work-worked')!.textContent).toBe('32 m done');
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
