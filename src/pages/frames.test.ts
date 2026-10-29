// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { hostStrings } from '../i18n';
import { fakeBridge, timers } from '../notch/test-helpers';
import { type FrameSpec, mountFrameHost, READY_TIMEOUT_MS } from './frames';

const STR = hostStrings('id');
const view = () => document.defaultView!;

afterEach(() => { document.body.innerHTML = ''; });

const spec = (key: string, moduleId: string, widget: string | null = null): FrameSpec =>
  ({ key, moduleId, entry: 'index.html', widget, title: key, height: 104 });

function host() {
  const bridge = fakeBridge();
  const deps = { bridge, setTimer: timers.setTimer, onKey: vi.fn(), onExpand: vi.fn(), onCollapse: vi.fn() };
  const h = mountFrameHost(deps, document);
  const put = (s: FrameSpec, lang: 'id' | 'en' = 'id') => {
    const box = h.frame(s, lang, STR);
    if (!box.isConnected) document.body.append(box);
    return box;
  };
  const iframe = (box: HTMLElement) => box.querySelector('iframe')!;
  const say = (data: unknown, source: Window | null) =>
    view().dispatchEvent(new (view().MessageEvent)('message', { data, source }));
  return { bridge, deps, h, put, iframe, say };
}

const flush = () => new Promise(r => setTimeout(r, 0));

test('a frame is sandboxed and sized', () => {
  const { put, iframe } = host();
  const f = iframe(put(spec('m', 'system-stat')));
  expect(f.getAttribute('src')).toBe('mod://system-stat/index.html');
  expect(f.getAttribute('sandbox')).toBe('allow-scripts');
  expect(f.style.height).toBe('104px');
});

test('a module frame says hello without a widget', () => {
  const { put, iframe } = host();
  const f = iframe(put(spec('m', 'system-stat'), 'en'));
  const post = vi.spyOn(f.contentWindow!, 'postMessage');
  f.dispatchEvent(new Event('load'));
  expect(post).toHaveBeenCalledWith({ type: 'notching:init', moduleId: 'system-stat', lang: 'en' }, '*');
});

test('a widget frame is told its widget', () => {
  const { put, iframe } = host();
  const f = iframe(put(spec('home/0/home/date', 'home', 'date')));
  const post = vi.spyOn(f.contentWindow!, 'postMessage');
  f.dispatchEvent(new Event('load'));
  expect(post).toHaveBeenCalledWith({ type: 'notching:init', moduleId: 'home', lang: 'id', widget: 'date' }, '*');
});

test('calls go out as the sending frame\'s package only', async () => {
  const { bridge, put, iframe, say } = host();
  bridge.moduleCall.mockResolvedValue({ cpu: 5 });
  const a = iframe(put(spec('a', 'system-stat')));
  const b = iframe(put(spec('b', 'home', 'date')));
  const post = vi.spyOn(a.contentWindow!, 'postMessage');
  const call = { type: 'notching:call', id: 1, capability: 'system.stats', method: 'read' };
  say(call, view());
  expect(bridge.moduleCall).not.toHaveBeenCalled();
  say(call, b.contentWindow);
  expect(bridge.moduleCall).toHaveBeenLastCalledWith('home', 'system.stats', 'read', undefined);
  say(call, a.contentWindow);
  expect(bridge.moduleCall).toHaveBeenLastCalledWith('system-stat', 'system.stats', 'read', undefined);
  await flush();
  expect(post).toHaveBeenCalledWith({ type: 'notching:result', id: 1, ok: true, value: { cpu: 5 } }, '*');
});

test('a refused call comes back as an error', async () => {
  const { bridge, put, iframe, say } = host();
  bridge.moduleCall.mockRejectedValue('module home did not declare system.stats');
  const f = iframe(put(spec('b', 'home', 'date')));
  const post = vi.spyOn(f.contentWindow!, 'postMessage');
  say({ type: 'notching:call', id: 7, capability: 'system.stats', method: 'read' }, f.contentWindow);
  await flush();
  expect(post).toHaveBeenCalledWith(
    { type: 'notching:result', id: 7, ok: false, error: 'module home did not declare system.stats' }, '*');
});

test('a late answer never reaches a dropped frame', async () => {
  const { bridge, h, put, iframe, say } = host();
  let answer: (v: unknown) => void = () => {};
  bridge.moduleCall.mockReturnValue(new Promise(r => { answer = r; }));
  const f = iframe(put(spec('a', 'system-stat')));
  const post = vi.spyOn(f.contentWindow!, 'postMessage');
  say({ type: 'notching:call', id: 1, capability: 'system.stats', method: 'read' }, f.contentWindow);
  h.keep([]);
  answer({ cpu: 5 });
  await flush();
  expect(post).not.toHaveBeenCalled();
});

test('passes Escape up', () => {
  const { deps, put, iframe, say } = host();
  const f = iframe(put(spec('a', 'system-stat')));
  say({ type: 'notching:key', key: 'Escape' }, f.contentWindow);
  expect(deps.onKey).toHaveBeenCalledWith('Escape');
});

test('expand and collapse come only from a known frame', () => {
  const { deps, put, iframe, say } = host();
  const f = iframe(put(spec('home/2/home/reminders', 'home', 'reminders')));
  say({ type: 'notching:expand' }, view());
  expect(deps.onExpand).not.toHaveBeenCalled();
  say({ type: 'notching:expand' }, f.contentWindow);
  say({ type: 'notching:collapse' }, f.contentWindow);
  expect(deps.onExpand).toHaveBeenCalledWith('home/2/home/reminders');
  expect(deps.onCollapse).toHaveBeenCalledWith('home/2/home/reminders');
});

test('setFull sends the view message', () => {
  const { h, put, iframe } = host();
  const f = iframe(put(spec('r', 'home', 'reminders')));
  const post = vi.spyOn(f.contentWindow!, 'postMessage');
  h.setFull('r', true);
  expect(post).toHaveBeenCalledWith({ type: 'notching:view', full: true }, '*');
});

test('a frame that never says ready shows the load error in its slot only', () => {
  const { put, iframe, say } = host();
  const a = put(spec('a', 'home', 'date'));
  const b = put(spec('b', 'home', 'weather'));
  say({ type: 'notching:ready' }, iframe(a).contentWindow);
  timers.advance(READY_TIMEOUT_MS);
  expect(a.querySelector('iframe')).not.toBeNull();
  expect(b.querySelector('iframe')).toBeNull();
  expect(b.textContent).toBe('Gagal dimuat.');
});

test('a kept frame is not reloaded', () => {
  const { h, put } = host();
  const a = put(spec('a', 'home', 'date'));
  expect(h.frame(spec('a', 'home', 'date'), 'id', STR)).toBe(a);
  expect(h.frame(spec('a', 'home', 'date'), 'en', STR)).not.toBe(a);
});

test('keep and clear drop frames', () => {
  const { h, put } = host();
  const a = put(spec('a', 'home', 'date'));
  const b = put(spec('b', 'home', 'weather'));
  h.keep(['a']);
  expect(a.isConnected).toBe(true);
  expect(b.isConnected).toBe(false);
  h.clear();
  expect(a.isConnected).toBe(false);
});
