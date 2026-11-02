// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { renderCard } from './card';

const GiB = 1024 ** 3;
const ID = { cpu: 'CPU', memory: 'Memori', network: 'Jaringan' };
const lit = (root: HTMLElement, key: string) => root.querySelectorAll(`[data-k="${key}"] .v-seg.on`).length;
const S = { cpu: 23.4, memUsed: 9.8 * GiB, memTotal: 16 * GiB, rx: 1_200_000, tx: 80_000 };

test('shows CPU as a big Barlow number with accent segments', () => {
  const root = document.createElement('div');
  renderCard(root, ID).update(S, 'id');
  expect(root.querySelector('[data-k="cpu"] .v-num')!.textContent).toBe('23%');
  expect(root.querySelectorAll('[data-k="cpu"] .v-seg')).toHaveLength(12);
  expect(lit(root, 'cpu')).toBe(3);
});

test('the segments follow the reading, from none to all', () => {
  const root = document.createElement('div');
  const view = renderCard(root, ID);
  view.update({ ...S, cpu: 0 }, 'id');
  expect(lit(root, 'cpu')).toBe(0);
  view.update({ ...S, cpu: 100 }, 'id');
  expect(lit(root, 'cpu')).toBe(12);
  expect(root.querySelectorAll('[data-k="cpu"] .v-segs')).toHaveLength(1);
});

test('three black cards, and no dot-matrix or dotted lines', () => {
  const root = document.createElement('div');
  renderCard(root, ID).update(S, 'id');
  expect([...root.querySelectorAll('.sys-card')].map(c => (c as HTMLElement).dataset.k)).toEqual(['cpu', 'mem', 'net']);
  expect(root.querySelector('svg, .vdots')).toBeNull();
});

test('shows memory as a percentage and as used / total', () => {
  const root = document.createElement('div');
  renderCard(root, ID).update(S, 'id');
  expect(root.querySelector('[data-k="mem"] .v-num')!.textContent).toBe('61%');
  expect(root.textContent).toContain('9,8 / 16 GB');
});

test('shows network speed both ways', () => {
  const root = document.createElement('div');
  renderCard(root, ID).update(S, 'en');
  expect(root.textContent).toContain('↓ 1.2 MB/s');
  expect(root.textContent).toContain('↑ 80 KB/s');
});

test('labels follow the strings', () => {
  const root = document.createElement('div');
  renderCard(root, { cpu: 'CPU', memory: 'Memory', network: 'Network' });
  expect(root.textContent).toContain('Memory');
  expect(root.textContent).toContain('Network');
});

test('numbers stay empty until the first reading', () => {
  const root = document.createElement('div');
  renderCard(root, ID);
  expect(root.querySelector('[data-k="cpu"] .v-num')!.textContent).toBe('');
  expect(root.querySelector('[data-k="mem"] .v-num')!.textContent).toBe('');
  expect(lit(root, 'cpu')).toBe(0);
});
