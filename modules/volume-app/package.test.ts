import { expect, test } from 'vitest';
import { catalog } from '../../src/bridge-browser';

test('a card module after Kecerahan, waiting to be installed', () => {
  const all = catalog('id', []);
  const ids = all.map(m => m.id);
  expect(ids.indexOf('volume-app')).toBe(ids.indexOf('kecerahan') + 1);
  const m = all.find(x => x.id === 'volume-app')!;
  expect([m.entry, m.card, m.action, m.tool]).toEqual(['index.html', { width: 440, height: 284 }, null, false]);
  expect([m.name, m.status]).toEqual(['Volume app', false]);
  expect([m.installed, m.enabled]).toEqual([false, false]);
  expect(catalog('en', []).find(x => x.id === 'volume-app')!.name).toBe('App volume');
});
