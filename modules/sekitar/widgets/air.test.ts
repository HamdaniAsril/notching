// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { host, SNAP } from '../../home/widgets/fixtures';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { aqiBand, renderAir } from './air';

afterEach(() => { document.body.innerHTML = ''; });

const withAir = (aqi: number) => ({ ...SNAP, air: { aqi, fetchedAt: 0 } });
const NOW = new Date(2026, 9, 27, 12, 0);
const lit = (root: HTMLElement) => [...root.querySelectorAll('.v-seg')].map(s => s.classList.contains('on'));

test('the US AQI bands', () => {
  expect([0, 42, 50].map(aqiBand)).toEqual([0, 0, 0]);
  expect([51, 100].map(aqiBand)).toEqual([1, 1]);
  expect([101, 150].map(aqiBand)).toEqual([2, 2]);
  expect([151, 200].map(aqiBand)).toEqual([3, 3]);
  expect([201, 300].map(aqiBand)).toEqual([4, 4]);
  expect([301, 500].map(aqiBand)).toEqual([5, 5]);
});

test('42 reads the label, the number with AQI, one lit segment of five and the advice', () => {
  const root = host();
  renderAir(root, id, 'id').update(withAir(42), NOW);
  expect(root.querySelector('.wd-air')!.classList.contains('v-card')).toBe(true);
  expect(root.querySelector('.wd-air-label')!.textContent).toBe('Kualitas udara');
  const n = root.querySelector<HTMLElement>('.v-num')!;
  expect(n.textContent).toBe('42');
  expect(n.style.fontSize).toBe('45px');
  expect(root.querySelector('.wd-air-unit')!.textContent).toBe('AQI');
  expect(root.querySelectorAll('.v-seg')).toHaveLength(5);
  expect(lit(root)).toEqual([true, false, false, false, false]);
  expect(root.querySelector('.wd-air-advice')!.textContent).toBe('Baik untuk lari');
  expect(root.querySelector('svg.dm')).toBeNull();
});

test('a worse band lights more segments and changes the advice', () => {
  const root = host();
  renderAir(root, en, 'en').update(withAir(151), NOW);
  expect(root.querySelector('.wd-air-label')!.textContent).toBe('Air quality');
  expect(lit(root)).toEqual([true, true, true, true, false]);
  expect(root.querySelector('.wd-air-advice')!.textContent).toBe('Wear a mask');
  renderAir(root, id, 'id').update(withAir(480), NOW);
  expect(lit(root)).toEqual([true, true, true, true, true]);
  expect(root.querySelector('.wd-air-advice')!.textContent).toBe('Tetap di dalam');
});

test('every band has advice in both languages, and the segments grow with the band', () => {
  expect(id.airAdvice).toHaveLength(6);
  expect(en.airAdvice).toHaveLength(6);
  expect(id.airAdvice[0]).toBe('Baik untuk lari');
  expect(en.airAdvice[0]).toBe('Good for a run');
  const root = host();
  const w = renderAir(root, id, 'id');
  const counts = [30, 80, 120, 180, 250, 400].map(aqi => {
    w.update(withAir(aqi), NOW);
    return lit(root).filter(Boolean).length;
  });
  expect(counts).toEqual([1, 2, 3, 4, 5, 5]);
});

test('500 is drawn in the number at the same size', () => {
  const root = host();
  renderAir(root, id, 'id').update(withAir(500), NOW);
  expect(root.querySelector('.v-num')!.textContent).toBe('500');
});

test('without air a dash, without a city the hint', () => {
  const root = host();
  const w = renderAir(root, id, 'id');
  w.update({ ...SNAP, air: null }, NOW);
  expect(root.textContent).toContain('—');
  expect(root.querySelector('.v-num')).toBeNull();
  expect(root.querySelector('.v-seg')).toBeNull();
  w.update({ ...SNAP, place: null, air: null }, NOW);
  expect(root.textContent).toBe('Isi kota di Pengaturan');
});
