// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { at, host, NOW, SNAP } from './fixtures';
import { renderWeather } from './weather';

afterEach(() => { document.body.innerHTML = ''; });

test('weather without a city asks for one', () => {
  const root = host();
  renderWeather(root, id, 'id').update({ ...SNAP, place: null, weather: null }, NOW);
  expect(root.querySelector('.hm-wx-city')!.textContent).toBe('Cuaca');
  expect(root.textContent).toContain('Atur kota di Pengaturan');
  expect(root.querySelector('.v-num')).toBeNull();
  expect(root.querySelector('.ic')).toBeNull();
});

test('a city without weather yet shows a dash', () => {
  const root = host();
  renderWeather(root, id, 'id').update({ ...SNAP, weather: null }, NOW);
  expect(root.querySelector('.hm-wx-city')!.textContent).toBe('Jakarta');
  expect(root.querySelector('.hm-wx-foot')!.textContent).toBe('—');
});

test('weather shows the city, the big temperature, the sky and the range, with the icon in the accent', () => {
  const root = host();
  renderWeather(root, id, 'id').update(SNAP, NOW);
  expect(root.querySelector('.hm-weather')!.classList.contains('v-card')).toBe(true);
  expect(root.querySelector('.hm-wx-city')!.textContent).toBe('Jakarta');
  const temp = root.querySelector<HTMLElement>('.v-num')!;
  expect(temp.textContent).toBe('31°');
  expect(temp.style.fontSize).toBe('40px');
  expect(root.querySelector('.hm-wx-sky')!.textContent).toBe('Berawan');
  expect(root.querySelector('.hm-wx-range')!.textContent).toBe('25°/33°');
  const icon = root.querySelector('.hm-wx-top .ic')!;
  expect(icon.querySelector('svg')).not.toBeNull();
  expect(icon.parentElement!.classList.contains('v-acc')).toBe(true);
  expect(root.querySelector('svg.dm')).toBeNull();
});

test('the icon is a moon when the sun is down', () => {
  const root = host();
  const clear = { ...SNAP, weather: { ...SNAP.weather!, code: 0 } };
  const w = renderWeather(root, id, 'id');
  w.update(clear, NOW);
  const day = root.querySelector('.hm-wx-top .ic')!.innerHTML;
  w.update(clear, new Date(at(27, 20, 0)));
  expect(root.querySelector('.hm-wx-top .ic')!.innerHTML).not.toBe(day);
});

test('a cold city still fits its column', () => {
  const root = host();
  renderWeather(root, en, 'en').update({ ...SNAP, weather: { ...SNAP.weather!, temp: -12.2 } }, NOW);
  expect(root.querySelector('.v-num')!.textContent).toBe('-12°');
  expect(root.querySelector('.hm-wx-sky')!.textContent).toBe('Cloudy');
});
