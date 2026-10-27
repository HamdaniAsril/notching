// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { dotText } from '../../src/kit/dots';
import { DOT_PITCH, renderCard } from './card';

const GiB = 1024 ** 3;
const ID = { cpu: 'CPU', memory: 'Memori', network: 'Jaringan' };
// jsdom re-serialises <circle/> as <circle></circle>, so compare parsed markup.
const parsed = (svg: string) => { const d = document.createElement('div'); d.innerHTML = svg; return d.innerHTML; };
const S = { cpu: 23.4, memUsed: 9.8 * GiB, memTotal: 16 * GiB, rx: 1_200_000, tx: 80_000 };

test('shows CPU as dot digits with a dot bar', () => {
  const root = document.createElement('div');
  renderCard(root, ID).update(S, 'id');
  expect(root.querySelector('[data-k="cpu"] .big')!.innerHTML).toBe(parsed(dotText('23%', DOT_PITCH)));
  expect(root.querySelectorAll('[data-k="cpu"] circle[fill="#fff"]')).toHaveLength(4);
});

test('shows memory as a percentage and as used / total', () => {
  const root = document.createElement('div');
  renderCard(root, ID).update(S, 'id');
  expect(root.querySelector('[data-k="mem"] .big')!.innerHTML).toBe(parsed(dotText('61%', DOT_PITCH)));
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
  expect(root.querySelector('[data-k="cpu"] .big')!.innerHTML).toBe('');
});
