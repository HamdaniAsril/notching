// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { host, SNAP } from './fixtures';
import { renderWeather } from './weather';

afterEach(() => { document.body.innerHTML = ''; });

test('weather without a city asks for one', () => {
  const root = host();
  renderWeather(root, id, 'id').update({ ...SNAP, place: null, weather: null });
  expect(root.textContent).toContain('Cuaca');
  expect(root.textContent).toContain('Atur kota di Pengaturan');
  expect(root.querySelector('svg.dm')).toBeNull();
});

test('weather shows the city, temperature and range', () => {
  const root = host();
  renderWeather(root, id, 'id').update(SNAP);
  // A column is narrow: the sky and the range get a line each.
  expect([...root.querySelectorAll('.lab')].map(l => l.textContent)).toEqual(['Jakarta', 'Berawan', '25°/33°']);
  expect(root.querySelector('svg.dm')!.getAttribute('height')).toBe('42');
});

test('a cold city still fits its column', () => {
  const root = host();
  renderWeather(root, en, 'en').update({ ...SNAP, weather: { ...SNAP.weather!, temp: -12.2 } });
  expect(root.querySelector('svg.dm')!.getAttribute('height')).toBe('35');
  expect(root.textContent).toContain('Cloudy');
});
