// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { dotWidth } from '../../../src/kit/dots';
import { host, SNAP } from '../../home/widgets/fixtures';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { renderBigWeather } from './bigweather';

afterEach(() => { document.body.innerHTML = ''; });

const NOON = new Date(2026, 9, 27, 12, 0);

test('the city, the temperature in dots, the sky and the range', () => {
  const root = host();
  renderBigWeather(root, id, 'id').update(SNAP, NOON);
  expect(root.querySelector('svg.dm')!.getAttribute('width')).toBe(String(dotWidth('31°', 6)));
  expect(root.textContent).toContain('Jakarta');
  expect(root.textContent).toContain('Berawan');
  expect(root.textContent).toContain('T 33°');
  expect(root.textContent).toContain('R 25°');
  expect(root.querySelector('.ic svg')).not.toBeNull();
});

test('English names the range H and L', () => {
  const root = host();
  renderBigWeather(root, en, 'en').update(SNAP, NOON);
  expect(root.textContent).toContain('Cloudy');
  expect(root.textContent).toContain('H 33°');
  expect(root.textContent).toContain('L 25°');
});

test('the icon is a moon at night and a sun by day', () => {
  const clear = { ...SNAP, weather: { ...SNAP.weather!, code: 0 } };
  const day = host();
  renderBigWeather(day, id, 'id').update(clear, new Date(2026, 9, 27, 17, 59));
  const night = host();
  renderBigWeather(night, id, 'id').update(clear, new Date(2026, 9, 27, 18, 0));
  const dawn = host();
  renderBigWeather(dawn, id, 'id').update(clear, new Date(2026, 9, 27, 5, 59));
  expect(day.querySelector('.ic svg')!.querySelectorAll('circle')).toHaveLength(1);
  expect(day.querySelector('.ic svg')!.innerHTML).toContain('M12 2v2');
  expect(night.querySelector('.ic svg')!.innerHTML).not.toContain('M12 2v2');
  expect(dawn.querySelector('.ic svg')!.innerHTML).toBe(night.querySelector('.ic svg')!.innerHTML);
});

test('without a city it asks for one', () => {
  const root = host();
  renderBigWeather(root, id, 'id').update({ ...SNAP, place: null, weather: null }, NOON);
  expect(root.textContent).toBe(id.noPlace);
  expect(root.querySelector('svg.dm')).toBeNull();
});

test('a city without weather shows a dash', () => {
  const root = host();
  renderBigWeather(root, id, 'id').update({ ...SNAP, weather: null }, NOON);
  expect([...root.querySelectorAll('.lab')].map(l => l.textContent)).toEqual(['Jakarta', '—']);
  expect(root.querySelector('svg.dm')).toBeNull();
});
