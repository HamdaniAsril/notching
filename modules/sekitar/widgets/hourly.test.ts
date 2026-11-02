// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { icon } from '../../../src/kit/icons';
import { at, host, NOW, SNAP } from '../../home/widgets/fixtures';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { renderHourly } from './hourly';

afterEach(() => { document.body.innerHTML = ''; });

// Hourly data from 08:00 on the 27th, 36 hours; 60 percent at 16:00 and 17:00.
const hours = (rain: (h: number) => number, code = 3) =>
  Array.from({ length: 36 }, (_, i) => ({ at: at(27, 8 + i, 0), temp: 28 + (i % 6), code, rain: rain(8 + i) }));
const WET = { ...SNAP, weather: { ...SNAP.weather!, hourly: hours(h => (h === 16 || h === 17 ? 60 : 10)) } };

test('eight cells from the current hour: Kini in bold with an accent icon, the rest hour numbers', () => {
  const root = host();
  renderHourly(root, id, 'id').update(WET, NOW);
  expect(root.querySelector('.wd-hourly')!.classList.contains('v-card')).toBe(true);
  const cells = root.querySelectorAll('.wd-hr-cell');
  expect(cells).toHaveLength(8);
  expect([...cells].map(c => c.querySelector('.wd-hr-h')!.textContent)).toEqual(['Kini', '11', '12', '13', '14', '15', '16', '17']);
  expect(cells[0].classList.contains('now')).toBe(true);
  expect(root.querySelectorAll('.wd-hr-cell.now')).toHaveLength(1);
  expect(cells[0].querySelector('.v-acc .ic svg')).not.toBeNull();
  expect(cells[1].querySelector('.v-acc')).toBeNull();
  const t = cells[0].querySelector<HTMLElement>('.v-num')!;
  expect(t.textContent).toBe('30°');
  expect(t.style.fontSize).toBe('11px');
});

test('the hours that will rain have an accent icon too', () => {
  const root = host();
  renderHourly(root, id, 'id').update(WET, NOW);
  const cells = [...root.querySelectorAll('.wd-hr-cell')];
  expect(cells.map(c => c.querySelector('.v-acc') !== null)).toEqual([true, false, false, false, false, false, true, true]);
});

test('English says Now', () => {
  const root = host();
  renderHourly(root, en, 'en').update(WET, NOW);
  expect(root.querySelector('.wd-hr-cell.now .wd-hr-h')!.textContent).toBe('Now');
});

test('the left block has the label over the current temperature in Barlow', () => {
  const root = host();
  renderHourly(root, id, 'id').update(WET, NOW);
  const left = root.querySelector('.wd-hr-left')!;
  expect(left.querySelector('.v-lab')!.textContent).toBe('Per jam');
  const n = left.querySelector<HTMLElement>('.v-num')!;
  expect(n.textContent).toBe('31°');
  expect(n.style.fontSize).toBe('19px');
  expect(left.querySelector('svg.dm')).toBeNull();
});

test('rain ahead is named with its hour, in accent, over how long it lasts', () => {
  const root = host();
  renderHourly(root, id, 'id').update(WET, NOW);
  expect(root.querySelector('.wd-hr-rain')!.textContent).toBe('Hujan 16.00');
  expect(root.querySelector('.wd-hr-rain')!.classList.contains('v-acc')).toBe(true);
  expect(root.querySelector('.wd-hr-sub')!.textContent).toBe('Selama 2 jam');
  const e = host();
  renderHourly(e, en, 'en').update(WET, NOW);
  expect(e.querySelector('.wd-hr-rain')!.textContent).toBe('Rain 16:00');
  expect(e.querySelector('.wd-hr-sub')!.textContent).toBe('For 2 h');
});

test('no rain ahead shows the day high over the low', () => {
  const dry = { ...SNAP, weather: { ...SNAP.weather!, hourly: hours(() => 10) } };
  const root = host();
  renderHourly(root, id, 'id').update(dry, NOW);
  expect(root.querySelector('.wd-hr-rain')).toBeNull();
  expect(root.querySelector('.wd-hr-high')!.textContent).toBe('Tertinggi 33°');
  expect(root.querySelector('.wd-hr-high')!.classList.contains('v-acc')).toBe(false);
  expect(root.querySelector('.wd-hr-sub')!.textContent).toBe('Terendah 25°');
  const e = host();
  renderHourly(e, en, 'en').update(dry, NOW);
  expect(e.querySelector('.wd-hr-high')!.textContent).toBe('High 33°');
  expect(e.querySelector('.wd-hr-sub')!.textContent).toBe('Low 25°');
});

test('after sunset a clear sky is a moon, by day a sun', () => {
  const clear = { ...SNAP, weather: { ...SNAP.weather!, hourly: hours(() => 0, 0) } };
  const root = host();
  renderHourly(root, id, 'id').update(clear, new Date(2026, 9, 27, 14, 30));
  const names = [...root.querySelectorAll('.wd-hr-cell .ic')].map(i => i.innerHTML);
  // 14, 15, 16, 17 are before the 17:48 sunset; 18 to 21 after.
  expect(names.slice(0, 4).every(h => h === icon('sun', 12).innerHTML)).toBe(true);
  expect(names.slice(4).every(h => h === icon('moon', 12).innerHTML)).toBe(true);
});

test('without sun times every hour is drawn as day', () => {
  const clear = { ...SNAP, sun: null, weather: { ...SNAP.weather!, hourly: hours(() => 0, 0) } };
  const root = host();
  renderHourly(root, id, 'id').update(clear, new Date(2026, 9, 27, 20, 30));
  expect([...root.querySelectorAll('.wd-hr-cell .ic')].every(i => i.innerHTML === icon('sun', 12).innerHTML)).toBe(true);
});

test('without hours it keeps the left part and shows a dash', () => {
  const root = host();
  renderHourly(root, id, 'id').update(SNAP, NOW);
  expect(root.querySelectorAll('.wd-hr-cell')).toHaveLength(0);
  expect(root.querySelector('.wd-hr-left .v-num')).not.toBeNull();
  expect(root.textContent).toContain('Per jam');
  expect(root.textContent).toContain('—');
  expect(root.querySelector('.wd-hr-right')).toBeNull();
  const old = host();
  renderHourly(old, id, 'id').update({ ...SNAP, weather: { ...SNAP.weather!, hourly: [] } }, NOW);
  expect(old.textContent).toContain('—');
});

test('without weather or a city', () => {
  const root = host();
  const w = renderHourly(root, id, 'id');
  w.update({ ...SNAP, weather: null }, NOW);
  expect(root.textContent).toContain('Per jam');
  expect(root.textContent).toContain('—');
  expect(root.querySelector('.v-num')).toBeNull();
  w.update({ ...SNAP, place: null, weather: null }, NOW);
  expect(root.textContent).toBe(id.noPlace);
});

test('a negative temperature is drawn with a minus', () => {
  const cold = { ...SNAP, weather: { ...SNAP.weather!, temp: -3.2, hourly: hours(() => 0).map(h => ({ ...h, temp: -3.2 })) } };
  const root = host();
  renderHourly(root, en, 'en').update(cold, NOW);
  expect(root.querySelector('.wd-hr-cell .v-num')!.textContent).toBe('-3°');
});
