import { expect, test } from 'vitest';
import { dragTick, glowColor, kelvin, LIGHT, LIGHT_START, lightColor, ZOOM, zoomScale, zoomText } from './ruler';

test('dragging left zooms in, within 1.0× to 3.0×', () => {
  expect(dragTick(ZOOM, 10, -14)).toBe(11);
  expect(dragTick(ZOOM, 10, -14 * 50)).toBe(30);
  expect(dragTick(ZOOM, 12, 14 * 50)).toBe(10);
  expect(zoomScale(15)).toBe(1.5);
  expect(zoomText(10)).toBe('1.0×');
  expect(zoomText(23)).toBe('2.3×');
});

test('the light runs from 6500K to 2700K and starts at 4500K', () => {
  expect(kelvin(LIGHT.min)).toBe(6500);
  expect(kelvin(LIGHT.max)).toBe(2700);
  expect(kelvin(LIGHT_START)).toBe(4500);
});

test('cold light is bluish and warm light amber, as hex', () => {
  expect(lightColor(6500)).toBe('#e2ecff');
  expect(lightColor(2700)).toBe('#ffce96');
  expect(glowColor(6500)).toBe('#96c3ff');
  expect(glowColor(2700)).toBe('#ffa03c');
  expect(lightColor(4500)).toMatch(/^#[0-9a-f]{6}$/);
});
