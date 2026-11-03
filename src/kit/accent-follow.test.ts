// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { followAccent } from './accent-follow';

const root = () => document.documentElement;
afterEach(() => root().removeAttribute('style'));

test('a small window takes the accent when it opens and follows changes', async () => {
  let push: (s: { accent: string }) => void = () => {};
  await followAccent(root(), { get: async () => ({ accent: '#5ac8fa' }), on: cb => { push = cb; } });
  expect(root().style.getPropertyValue('--v-acc')).toBe('#5ac8fa');
  push({ accent: '#ffd23f' });
  expect(root().style.getPropertyValue('--v-acc')).toBe('#ffd23f');
});

test('without the state the window keeps the default colour', async () => {
  await followAccent(root(), { get: () => Promise.reject(new Error('no core')), on: () => {} });
  expect(root().style.getPropertyValue('--v-acc')).toBe('');
});
