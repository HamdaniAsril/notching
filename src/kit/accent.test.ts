// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { ACCENT_PRESETS, accentPalette, applyAccent, contrast, normalizeHex } from './accent';

const hsl = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  return { s: d ? d / (1 - Math.abs(2 * l - 1)) : 0, l };
};

test('lime keeps today\'s tokens', () => {
  expect(accentPalette('#C8F04A')).toEqual({
    acc: '#c8f04a', hi: '#d6f56e', soft: '#1d260b', deep: '#4c6b12', deepHi: '#5a7d17',
    deepSoft: 'rgba(76, 107, 18, 0.13)', onAcc: '#0f1404', rgb: '200, 240, 74',
  });
});

test('the presets are the eight from the design, Lime first', () => {
  expect(ACCENT_PRESETS.map(p => p.hex)).toEqual(
    ['#c8f04a', '#ffd23f', '#ff8a3d', '#ffa07a', '#ff6fa8', '#b18cff', '#5ac8fa', '#3ee6c4']);
  expect(ACCENT_PRESETS.map(p => p.name)).toEqual(
    ['Lime', 'Citrus', 'Mango', 'Peach', 'Blossom', 'Lavender', 'Sky', 'Mint']);
});

test('presets pass unchanged', () => {
  for (const p of ACCENT_PRESETS) expect(accentPalette(p.hex).acc).toBe(p.hex);
});

test('dark picks are lightened until they read on black', () => {
  for (const hex of ['#1a237e', '#000000', '#3b0a0a']) {
    const { acc } = accentPalette(hex);
    expect(contrast(acc, '#000000')).toBeGreaterThanOrEqual(6);
  }
});

test('pale picks get some colour', () => {
  for (const hex of ['#ffffff', '#cccccc', '#f0f0f5']) {
    const { acc } = accentPalette(hex);
    expect(hsl(acc).s).toBeGreaterThanOrEqual(0.44);
    expect(hsl(acc).l).toBeLessThanOrEqual(0.81);
    expect(acc).not.toBe('#ffffff');
  }
});

test('the deep shade reads on white and the on-accent ink reads on the accent', () => {
  for (const hex of [...ACCENT_PRESETS.map(p => p.hex), '#1a237e', '#ffffff']) {
    const p = accentPalette(hex);
    expect(contrast(p.deep, '#ffffff')).toBeGreaterThanOrEqual(5.5);
    expect(contrast(p.onAcc, p.acc)).toBeGreaterThanOrEqual(4.5);
  }
});

test('bad input is lime', () => {
  expect(accentPalette('red').acc).toBe('#c8f04a');
  expect(normalizeHex('#ABC')).toBe('#aabbcc');
  expect(normalizeHex('#C8F04A')).toBe('#c8f04a');
  expect(normalizeHex('#12345')).toBeNull();
  expect(normalizeHex(5)).toBeNull();
});

test('applyAccent writes the variables on the root', () => {
  const root = document.documentElement;
  applyAccent(root, '#ff8a3d');
  expect(root.style.getPropertyValue('--v-acc')).toBe('#ff8a3d');
  expect(root.style.getPropertyValue('--v-acc-rgb')).toBe('255, 138, 61');
  for (const name of ['--v-acc-hi', '--v-acc-soft', '--v-acc-deep', '--v-acc-deep-hi', '--v-acc-deep-soft', '--v-on-acc']) {
    expect(root.style.getPropertyValue(name)).not.toBe('');
  }
});
