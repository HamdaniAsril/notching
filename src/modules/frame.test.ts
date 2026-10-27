// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { hostStrings } from '../i18n';
import { fakeBridge, moduleInfo, timers } from '../notch/test-helpers';
import { mountFrameHost, READY_TIMEOUT_MS } from './frame';

const STR = hostStrings('id');
const view = () => document.defaultView!;

afterEach(() => { document.body.innerHTML = ''; });

function host() {
  const container = document.createElement('div');
  document.body.append(container);
  const bridge = fakeBridge();
  const onKey = vi.fn();
  const h = mountFrameHost(container, { bridge, setTimer: timers.setTimer, onKey });
  const frame = () => container.querySelector('iframe')!;
  // A message from `source` to the notch page.
  const say = (data: unknown, source: Window | null = frame().contentWindow) =>
    view().dispatchEvent(new (view().MessageEvent)('message', { data, source }));
  return { container, bridge, onKey, h, frame, say };
}

const flush = () => new Promise(r => setTimeout(r, 0));

test('shows one sandboxed frame for the module', () => {
  const { container, h, frame } = host();
  h.show(moduleInfo('system-stat'), 'id', STR);
  expect(frame().getAttribute('src')).toBe('mod://system-stat/index.html');
  expect(frame().getAttribute('sandbox')).toBe('allow-scripts');
  expect(frame().style.height).toBe('80px');
  expect(h.current).toBe('system-stat');
  h.show(moduleInfo('home'), 'id', STR);
  expect(container.querySelectorAll('iframe')).toHaveLength(1);
  expect(frame().getAttribute('src')).toBe('mod://home/index.html');
});

test('says hello with the module id and language once loaded', () => {
  const { h, frame } = host();
  h.show(moduleInfo('system-stat'), 'en', STR);
  const post = vi.spyOn(frame().contentWindow!, 'postMessage');
  frame().dispatchEvent(new Event('load'));
  expect(post).toHaveBeenCalledWith({ type: 'notching:init', moduleId: 'system-stat', lang: 'en' }, '*');
});

test('forwards calls from its own frame only', async () => {
  const { bridge, h, frame, say } = host();
  bridge.moduleCall.mockResolvedValue({ cpu: 5 });
  h.show(moduleInfo('system-stat'), 'id', STR);
  const post = vi.spyOn(frame().contentWindow!, 'postMessage');
  const call = { type: 'notching:call', id: 1, capability: 'system.stats', method: 'read' };
  say(call, view());
  expect(bridge.moduleCall).not.toHaveBeenCalled();
  say(call);
  expect(bridge.moduleCall).toHaveBeenCalledWith('system-stat', 'system.stats', 'read', undefined);
  await flush();
  expect(post).toHaveBeenCalledWith({ type: 'notching:result', id: 1, ok: true, value: { cpu: 5 } }, '*');
});

test('a refused call comes back as an error', async () => {
  const { bridge, h, frame, say } = host();
  bridge.moduleCall.mockRejectedValue('module home did not declare system.stats');
  h.show(moduleInfo('home'), 'id', STR);
  const post = vi.spyOn(frame().contentWindow!, 'postMessage');
  say({ type: 'notching:call', id: 7, capability: 'system.stats', method: 'read' });
  await flush();
  expect(post).toHaveBeenCalledWith(
    { type: 'notching:result', id: 7, ok: false, error: 'module home did not declare system.stats' }, '*');
});

test('a late answer never reaches the next module', async () => {
  const { bridge, h, frame, say } = host();
  let answer: (v: unknown) => void = () => {};
  bridge.moduleCall.mockReturnValue(new Promise(r => { answer = r; }));
  h.show(moduleInfo('system-stat'), 'id', STR);
  say({ type: 'notching:call', id: 1, capability: 'system.stats', method: 'read' });
  h.show(moduleInfo('home'), 'id', STR);
  const post = vi.spyOn(frame().contentWindow!, 'postMessage');
  answer({ cpu: 5 });
  await flush();
  expect(post).not.toHaveBeenCalled();
});

test('passes Escape up', () => {
  const { h, onKey, say } = host();
  h.show(moduleInfo('system-stat'), 'id', STR);
  say({ type: 'notching:key', key: 'Escape' });
  expect(onKey).toHaveBeenCalledWith('Escape');
});

test('a module that never says ready shows the load error', () => {
  const { container, h, say } = host();
  h.show(moduleInfo('system-stat'), 'id', STR);
  say({ type: 'notching:ready' });
  timers.advance(READY_TIMEOUT_MS);
  expect(container.querySelector('iframe')).not.toBeNull();
  h.show(moduleInfo('home'), 'id', STR);
  timers.advance(READY_TIMEOUT_MS);
  expect(container.textContent).toContain('Modul ini gagal dimuat.');
  expect(container.querySelector('iframe')).toBeNull();
  expect(h.current).toBeNull();
});

test('no module shows the empty card', () => {
  const { container, h } = host();
  h.show(null, 'id', STR);
  expect(container.textContent).toContain('Semua modul mati.');
  expect(container.textContent).toContain('Nyalakan lagi di Pengaturan.');
});

test('clear removes the frame', () => {
  const { container, h } = host();
  h.show(moduleInfo('home'), 'id', STR);
  h.clear();
  expect(container.childElementCount).toBe(0);
  expect(h.current).toBeNull();
});
