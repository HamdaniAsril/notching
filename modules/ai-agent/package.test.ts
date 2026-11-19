import { expect, test } from 'vitest';
import { catalog } from '../../src/bridge-browser';

test('a card module after Keyboard Cleaning Mode, waiting to be installed', () => {
  const all = catalog('id', []);
  const ids = all.map(m => m.id);
  expect(ids.indexOf('ai-agent')).toBe(ids.indexOf('keyboard-clean') + 1);
  const m = all.find(x => x.id === 'ai-agent')!;
  expect([m.entry, m.card, m.action, m.tool]).toEqual(['index.html', { width: 520, height: 236 }, null, false]);
  expect(m.permissions).toEqual([]);
  expect([m.name, m.shortName, m.status]).toEqual(['Agent AI', 'Agent', true]);
  expect([m.installed, m.enabled]).toEqual([false, false]);
  expect(m.channels).toEqual([
    { id: 'waiting', name: 'Agent menunggu kamu', on: true, sound: true, widget: null },
    { id: 'done', name: 'Agent selesai', on: true, sound: false, widget: null },
  ]);
  expect(catalog('en', []).find(x => x.id === 'ai-agent')!.name).toBe('AI agents');
});
