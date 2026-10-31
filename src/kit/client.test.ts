// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { connectKit } from './client';
import { frameWindow, hostSays } from './test-helpers';

test('connects once the host says hello', async () => {
  const { win, posted } = frameWindow();
  const p = connectKit(win);
  hostSays(win, { type: 'notching:init', moduleId: 'system-stat', lang: 'en' });
  const kit = await p;
  expect(kit.lang).toBe('en');
  expect(kit.moduleId).toBe('system-stat');
  expect(posted).toContainEqual({ type: 'notching:ready' });
});

test('ignores messages that do not come from the host', async () => {
  const { win } = frameWindow();
  let done = false;
  void connectKit(win).then(() => { done = true; });
  win.dispatchEvent(new (win as typeof window).MessageEvent('message', {
    data: { type: 'notching:init', moduleId: 'x', lang: 'id' }, source: win,
  }));
  await new Promise(r => setTimeout(r, 0));
  expect(done).toBe(false);
});

test('calls resolve and reject by id', async () => {
  const { win, posted } = frameWindow();
  const p = connectKit(win);
  hostSays(win, { type: 'notching:init', moduleId: 'system-stat', lang: 'id' });
  const kit = await p;
  const a = kit.call('system.stats', 'read');
  const b = kit.call('system.stats', 'read');
  expect(posted).toContainEqual({ type: 'notching:call', id: 1, capability: 'system.stats', method: 'read' });
  hostSays(win, { type: 'notching:result', id: 2, ok: false, error: 'nope' });
  hostSays(win, { type: 'notching:result', id: 1, ok: true, value: { cpu: 5 } });
  await expect(a).resolves.toEqual({ cpu: 5 });
  await expect(b).rejects.toThrow('nope');
});

test('Escape and Cmd+Q are passed to the host', async () => {
  const { win, posted } = frameWindow();
  const p = connectKit(win);
  hostSays(win, { type: 'notching:init', moduleId: 'm', lang: 'id' });
  await p;
  const Key = (win as typeof window).KeyboardEvent;
  win.document.dispatchEvent(new Key('keydown', { key: 'Escape' }));
  win.document.dispatchEvent(new Key('keydown', { key: 'q', metaKey: true }));
  expect(posted).toContainEqual({ type: 'notching:key', key: 'Escape' });
  expect(posted).toContainEqual({ type: 'notching:key', key: 'Quit' });
});

test('the kit knows its widget and passes expand and view', async () => {
  const { win, posted } = frameWindow();
  const p = connectKit(win);
  hostSays(win, { type: 'notching:init', moduleId: 'home', lang: 'id', widget: 'reminders' });
  const kit = await p;
  expect(kit.widget).toBe('reminders');
  kit.expand();
  kit.collapse();
  expect(posted).toContainEqual({ type: 'notching:expand' });
  expect(posted).toContainEqual({ type: 'notching:collapse' });
  kit.expand(193);
  expect(posted).toContainEqual({ type: 'notching:expand', height: 193 });
  kit.lamp(true, '#ffd6a0', '#ffa040');
  kit.lamp(false);
  expect(posted).toContainEqual({ type: 'notching:lamp', on: true, color: '#ffd6a0', glow: '#ffa040' });
  expect(posted).toContainEqual({ type: 'notching:lamp', on: false });
  const seen: boolean[] = [];
  kit.onView(full => seen.push(full));
  hostSays(win, { type: 'notching:view', full: true });
  hostSays(win, { type: 'notching:view', full: false });
  expect(seen).toEqual([true, false]);
});

test('a module frame has no widget', async () => {
  const { win } = frameWindow();
  const p = connectKit(win);
  hostSays(win, { type: 'notching:init', moduleId: 'system-stat', lang: 'id' });
  expect((await p).widget).toBeNull();
});
