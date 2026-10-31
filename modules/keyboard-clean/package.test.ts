import { expect, test } from 'vitest';
import { catalog } from '../../src/bridge-browser';
import iconSvg from './icon.svg?raw';

test('the icon is a line drawing', () => {
  expect(iconSvg).toContain('viewBox="0 0 24 24"');
  expect(iconSvg).toContain('stroke=');
});

test('its tile runs the mode, after Timer, and it needs Accessibility', () => {
  const all = catalog('id', []);
  expect(all.map(m => m.id).slice(-2)).toEqual(['timer', 'keyboard-clean']);
  const m = all.find(x => x.id === 'keyboard-clean')!;
  expect([m.entry, m.card, m.action]).toEqual([null, null, { capability: 'keyclean', method: 'toggle' }]);
  expect(m.permissions).toEqual(['accessibility']);
  expect([m.name, m.shortName, m.status]).toEqual(['Keyboard Cleaning Mode', 'Clean KB', true]);
  expect(m.channels).toEqual([{ id: 'blocked', name: 'Keyboard tidak bisa dikunci', on: true, sound: false, widget: null }]);
});
