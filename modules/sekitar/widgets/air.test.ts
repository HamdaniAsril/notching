// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { dotWidth } from '../../../src/kit/dots';
import { host, SNAP } from '../../home/widgets/fixtures';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { aqiBand, renderAir } from './air';

afterEach(() => { document.body.innerHTML = ''; });

const withAir = (aqi: number) => ({ ...SNAP, air: { aqi, fetchedAt: 0 } });
const NOW = new Date(2026, 9, 27, 12, 0);

test('the US AQI bands', () => {
  expect([0, 42, 50].map(aqiBand)).toEqual([0, 0, 0]);
  expect([51, 100].map(aqiBand)).toEqual([1, 1]);
  expect([101, 150].map(aqiBand)).toEqual([2, 2]);
  expect([151, 200].map(aqiBand)).toEqual([3, 3]);
  expect([201, 300].map(aqiBand)).toEqual([4, 4]);
  expect([301, 500].map(aqiBand)).toEqual([5, 5]);
});

test('42 reads Baik, in dots at the big pitch, with the first dot red', () => {
  const root = host();
  renderAir(root, id, 'id').update(withAir(42), NOW);
  expect(root.querySelector('svg.dm')!.getAttribute('width')).toBe(String(dotWidth('42', 6)));
  expect(root.querySelector('.lab')!.textContent).toBe('UDARA · AQI');
  expect(root.textContent).toContain('Baik');
  expect(root.querySelector('.ic svg')).not.toBeNull();
  const dots = [...root.querySelectorAll('.wd-row .d')];
  expect(dots).toHaveLength(6);
  expect(dots.map(d => d.className)).toEqual(['d now', 'd', 'd', 'd', 'd', 'd']);
});

test('a worse band lights the dots below it', () => {
  const root = host();
  renderAir(root, en, 'en').update(withAir(151), NOW);
  expect(root.querySelector('.lab')!.textContent).toBe('AIR · AQI');
  expect(root.textContent).toContain('Unhealthy');
  expect([...root.querySelectorAll('.wd-row .d')].map(d => d.className)).toEqual(['d lit', 'd lit', 'd lit', 'd now', 'd', 'd']);
  renderAir(root, id, 'id').update(withAir(480), NOW);
  expect(root.textContent).toContain('Berbahaya');
  expect([...root.querySelectorAll('.wd-row .d')].map(d => d.className)).toEqual(['d lit', 'd lit', 'd lit', 'd lit', 'd lit', 'd now']);
});

test('500 fits the one-column frame', () => {
  const root = host();
  renderAir(root, id, 'id').update(withAir(500), NOW);
  expect(Number(root.querySelector('svg.dm')!.getAttribute('width'))).toBeLessThanOrEqual(109);
});

test('every band has a label in both languages', () => {
  expect(id.airBands).toHaveLength(6);
  expect(en.airBands).toHaveLength(6);
  expect(en.airBands[2]).toBe('Unhealthy for some');
  expect(id.airBands[2]).toBe('Tidak sehat bagi sebagian');
});

test('without air a dash, without a city the hint', () => {
  const root = host();
  const w = renderAir(root, id, 'id');
  w.update({ ...SNAP, air: null }, NOW);
  expect(root.textContent).toContain('—');
  expect(root.querySelector('svg.dm')).toBeNull();
  w.update({ ...SNAP, place: null, air: null }, NOW);
  expect(root.textContent).toBe('Isi kota di Pengaturan');
});

test('the band label may wrap to two lines and nothing is cut off', async () => {
  // @ts-expect-error no @types/node in this project
  const { readFileSync } = await import('node:fs');
  const css: string = readFileSync('modules/sekitar/style.css', 'utf8');
  const rule = /\.wd-air-band \{([^}]*)\}/.exec(css)![1];
  expect(rule).toContain('white-space: normal');
  expect(rule).not.toContain('nowrap');
  expect(rule).not.toContain('ellipsis');
});

test('the longest band, 101 to 150, is rendered whole in a label that may wrap', async () => {
  // @ts-expect-error no @types/node in this project
  const { readFileSync } = await import('node:fs');
  const css: string = readFileSync('modules/sekitar/style.css', 'utf8');
  // .lab is nowrap and ellipsised in kit.css only where a rule says so; this label's own rule wraps.
  const rule = /\.wd-air-band \{([^}]*)\}/.exec(css)![1];
  for (const [strings, lang, text] of [[id, 'id', 'Tidak sehat bagi sebagian'], [en, 'en', 'Unhealthy for some']] as const) {
    const root = host();
    renderAir(root, strings, lang).update(withAir(120), NOW);
    const label = root.querySelector<HTMLElement>('.wd-air-band')!;
    expect(label.textContent).toBe(text);
    expect(label.classList.contains('lab')).toBe(true);
    expect(label.style.whiteSpace).not.toBe('nowrap');
    expect(label.style.textOverflow).not.toBe('ellipsis');
    expect(rule).toContain('white-space: normal');
    expect(rule).not.toMatch(/nowrap|ellipsis|overflow/);
  }
});
