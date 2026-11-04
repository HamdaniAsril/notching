// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { renderCard, type Stats } from './card';
import en from './locales/en.json';
import id from './locales/id.json';

const GiB = 1024 ** 3;
const S: Stats = {
  cpu: 34.4,
  memUsed: 9.8 * GiB,
  memTotal: 16 * GiB,
  rx: 48_200_000,
  tx: 2_400_000,
  pressure: 62,
  history: [{ ago: 3, cpu: 20, pressure: 60 }, { ago: 1.5, cpu: 30, pressure: 61 }, { ago: 0, cpu: 34.4, pressure: 62 }],
  apps: [
    { name: 'Xcode', cpu: 18.2, mem: 3.8 * GiB },
    { name: 'Google Chrome', cpu: 9, mem: 2.6 * GiB },
    { name: 'Figma', cpu: 6, mem: 1.4 * GiB },
    { name: 'Docker', cpu: 4, mem: 2.1 * GiB },
  ],
  temps: { chip: 58.4, other: 31, otherKind: 'battery', state: 'nominal' },
  disk: { total: 512e9, free: 200e9, parts: { apps: 96e9, documents: 74e9, photos: 20e9, cleanable: 8e9 } },
};

const q = (root: HTMLElement, sel: string) => root.querySelector(sel) as HTMLElement;
const text = (root: HTMLElement, sel: string) => q(root, sel).textContent;
const all = (root: HTMLElement, sel: string) => [...root.querySelectorAll(sel)].map(e => e.textContent);

function shown(stats: Stats = S, lang: 'id' | 'en' = 'id') {
  const root = document.createElement('div');
  renderCard(root, lang === 'en' ? en : id).update(stats, lang);
  return root;
}

test('three rows, as drawn in Pego', () => {
  const root = shown();
  expect([...root.querySelectorAll('[data-k]')].map(e => (e as HTMLElement).dataset.k))
    .toEqual(['cpu', 'pressure', 'apps', 'temps', 'net', 'disk']);
  expect(root.querySelectorAll('.ss-row')).toHaveLength(3);
});

test('CPU and memory pressure: a big number, a % and a one-minute line', () => {
  const root = shown();
  expect(text(root, '[data-k="cpu"] .ss-num')).toBe('34');
  expect(text(root, '[data-k="cpu"] .ss-unit')).toBe('%');
  expect(text(root, '[data-k="pressure"] .ss-num')).toBe('62');
  expect(text(root, '[data-k="cpu"] .ss-meta')).toBe('1 mnt');
  expect(q(root, '[data-k="cpu"] .ss-line').getAttribute('d')).toMatch(/^M\d/);
  expect(q(root, '[data-k="cpu"] .ss-chart').classList.contains('acc')).toBe(true);
  expect(q(root, '[data-k="pressure"] .ss-chart').classList.contains('acc')).toBe(false);
});

test('the dot sits on the latest reading', () => {
  const root = shown();
  const dot = q(root, '[data-k="cpu"] .ss-dot');
  expect(dot.getAttribute('cx')).toBe('170');
  expect(Number(dot.getAttribute('cy'))).toBeCloseTo(56 - 0.344 * 56, 0);
});

test('a gap in the readings draws two lines', () => {
  const root = shown({ ...S, history: [{ ago: 40, cpu: 10, pressure: 50 }, { ago: 0, cpu: 20, pressure: 50 }] });
  expect(q(root, '[data-k="cpu"] .ss-line').getAttribute('d')!.match(/M/g)).toHaveLength(2);
});

test('top apps: names, CPU as a share of the Mac and memory; the first is lit', () => {
  const root = shown();
  expect(all(root, '.ss-app .ss-name')).toEqual(['Xcode', 'Google Chrome', 'Figma', 'Docker']);
  expect(all(root, '.ss-app .ss-cpu')).toEqual(['18%', '9%', '6%', '4%']);
  expect(text(root, '.ss-app .ss-mem')).toBe('3,8 GB');
  expect(q(root, '.ss-app').classList.contains('top')).toBe(true);
  expect(root.querySelectorAll('.ss-app.top')).toHaveLength(1);
});

test('fewer than four apps leaves the other rows empty but in place', () => {
  const root = shown({ ...S, apps: S.apps.slice(0, 1) });
  expect(root.querySelectorAll('.ss-app')).toHaveLength(4);
  expect(root.querySelectorAll('.ss-app.empty')).toHaveLength(3);
});

test('temperature: the chip and the battery, with macOS own verdict', () => {
  const root = shown();
  expect(all(root, '[data-k="temps"] .ss-num')).toEqual(['58', '31']);
  expect(all(root, '[data-k="temps"] .ss-sub')).toEqual(['Chip', 'Baterai']);
  expect(text(root, '[data-k="temps"] .ss-meta')).toBe('Normal');
  const hot = shown({ ...S, temps: { ...S.temps, otherKind: 'ssd', state: 'serious' } }, 'en');
  expect(all(hot, '[data-k="temps"] .ss-sub')).toEqual(['Chip', 'SSD']);
  expect(text(hot, '[data-k="temps"] .ss-meta')).toBe('Hot');
});

test('a missing sensor reads as a dash without a unit', () => {
  const root = shown({ ...S, temps: { chip: null, other: null, otherKind: null, state: 'nominal' } });
  expect(all(root, '[data-k="temps"] .ss-num')).toEqual(['—', '—']);
  expect(all(root, '[data-k="temps"] .ss-unit')).toEqual(['', '']);
});

test('network: upload and download, number and unit apart', () => {
  const root = shown();
  expect(all(root, '[data-k="net"] .ss-num')).toEqual(['2,4', '48']);
  expect(all(root, '[data-k="net"] .ss-unit')).toEqual(['MB/s', 'MB/s']);
  expect(all(root, '[data-k="net"] .ss-sub')).toEqual(['Unggah', 'Unduh']);
});

test('storage: used of total, as Cleaner counts it', () => {
  const root = shown();
  expect(text(root, '[data-k="disk"] .ss-num')).toBe('312');
  expect(text(root, '[data-k="disk"] .ss-unit')).toBe('dari 512 GB');
});

test('storage: Cleaner\'s parts, the rest as Other, then free', () => {
  const root = shown();
  const parts = [...root.querySelectorAll('.ss-seg')].map(e => (e as HTMLElement).dataset.key);
  expect(parts).toEqual(['apps', 'documents', 'photos', 'other', 'free']);
  expect(all(root, '.ss-leg')).toEqual(['App 96 GB', 'Dokumen 74 GB', 'Foto 20 GB', 'Lainnya 122 GB']);
  expect(Number(q(root, '.ss-seg[data-key="apps"]').style.flexGrow)).toBeCloseTo(96 / 512);
  expect(root.querySelector('.ss-hint')).toBeNull();
});

test('storage before Cleaner measured: used and free, and where to look', () => {
  const root = shown({ ...S, disk: { ...S.disk!, parts: null } });
  expect([...root.querySelectorAll('.ss-seg')].map(e => (e as HTMLElement).dataset.key)).toEqual(['used', 'free']);
  expect(all(root, '.ss-leg')).toEqual(['Terpakai 312 GB', 'Kosong 200 GB']);
  expect(text(root, '.ss-hint')).toBe('Buka Cleaner untuk rinciannya');
});

test('a part macOS kept from Cleaner counts as Other', () => {
  const root = shown({ ...S, disk: { ...S.disk!, parts: { apps: 96e9, documents: null, photos: null, cleanable: 8e9 } } });
  expect(all(root, '.ss-leg')).toEqual(['App 96 GB', 'Dokumen ?', 'Foto ?', 'Lainnya 216 GB']);
});

test('numbers stay empty until the first reading', () => {
  const root = document.createElement('div');
  renderCard(root, id);
  expect(all(root, '.ss-num').every(t => t === '')).toBe(true);
  expect(root.querySelectorAll('.ss-app.empty')).toHaveLength(4);
});

test('labels follow the language', () => {
  const root = shown(S, 'en');
  expect(root.textContent).toContain('CPU load');
  expect(root.textContent).toContain('Memory pressure');
  expect(text(root, '[data-k="disk"] .ss-unit')).toBe('of 512 GB');
});

test('a nearly full disk keeps its sliver of free space; empty parts take no room', () => {
  const root = shown({ ...S, disk: { total: 512e9, free: 0.2e9, parts: { apps: 96e9, documents: 0, photos: 0, cleanable: 0 } } });
  expect([...root.querySelectorAll('.ss-seg')].map(e => (e as HTMLElement).dataset.key)).toEqual(['apps', 'other', 'free']);
  expect(Number(q(root, '.ss-seg[data-key="free"]').style.flexGrow)).toBeGreaterThan(0);
});

test('a disk macOS would not size leaves the row empty', () => {
  const root = shown({ ...S, disk: { total: 0, free: 0, parts: null } });
  expect(text(root, '[data-k="disk"] .ss-num')).toBe('');
  expect(root.querySelectorAll('.ss-seg')).toHaveLength(0);
});

test('used and total in different units both carry theirs', () => {
  const root = shown({ ...S, disk: { total: 1.9e12, free: 1.03e12, parts: null } });
  expect(text(root, '[data-k="disk"] .ss-num')).toBe('870');
  expect(text(root, '[data-k="disk"] .ss-unit')).toBe('GB dari 1,9 TB');
});
