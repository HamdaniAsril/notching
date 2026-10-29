import { expect, test } from 'vitest';
import { isFrameMessage, isHostMessage } from './protocol';

test('frame messages are checked by shape', () => {
  expect(isFrameMessage({ type: 'notching:call', id: 1, capability: 'system.stats', method: 'read' })).toBe(true);
  expect(isFrameMessage({ type: 'notching:ready' })).toBe(true);
  expect(isFrameMessage({ type: 'notching:key', key: 'Escape' })).toBe(true);
  for (const bad of [null, 'x', { type: 'notching:call', id: '1', capability: 'a', method: 'b' }, { type: 'other' },
                     { type: 'notching:key', key: 'Tab' }]) expect(isFrameMessage(bad)).toBe(false);
});

test('host messages are checked by shape', () => {
  expect(isHostMessage({ type: 'notching:init', moduleId: 'home', lang: 'id' })).toBe(true);
  expect(isHostMessage({ type: 'notching:result', id: 1, ok: true, value: 1 })).toBe(true);
  expect(isHostMessage({ type: 'notching:result', id: 1, ok: false, error: 'x' })).toBe(true);
  for (const bad of [undefined, { type: 'notching:init', moduleId: 'home', lang: 'fr' },
                     { type: 'notching:result', id: 1, ok: false }]) expect(isHostMessage(bad)).toBe(false);
});

test('a view message needs a boolean', () => {
  expect(isHostMessage({ type: 'notching:view', full: true })).toBe(true);
  expect(isHostMessage({ type: 'notching:view', full: 'ya' })).toBe(false);
});

test('init may name its widget', () => {
  expect(isHostMessage({ type: 'notching:init', moduleId: 'home', lang: 'id', widget: 'date' })).toBe(true);
  expect(isHostMessage({ type: 'notching:init', moduleId: 'home', lang: 'id', widget: 5 })).toBe(false);
});

test('a frame may ask to expand or collapse', () => {
  expect(isFrameMessage({ type: 'notching:expand' })).toBe(true);
  expect(isFrameMessage({ type: 'notching:collapse' })).toBe(true);
});
