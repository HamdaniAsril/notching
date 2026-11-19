import { expect, test } from 'vitest';
import { catalog } from '../../src/bridge-browser';

test('a card module after Agent AI, waiting to be installed', () => {
  const all = catalog('id', []);
  const ids = all.map(m => m.id);
  expect(ids.indexOf('kecerahan')).toBe(ids.indexOf('ai-agent') + 1);
  const m = all.find(x => x.id === 'kecerahan')!;
  expect([m.entry, m.card, m.action, m.tool]).toEqual(['index.html', { width: 440, height: 160 }, null, false]);
  expect([m.name, m.status, m.permissions]).toEqual(['Kecerahan', false, []]);
  expect([m.installed, m.enabled]).toEqual([false, false]);
  expect(catalog('en', []).find(x => x.id === 'kecerahan')!.name).toBe('Brightness');
});
