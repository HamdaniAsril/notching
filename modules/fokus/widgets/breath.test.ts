// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { breathView, renderBreath } from './breath';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

function host(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

const core = (root: HTMLElement) => root.querySelector<HTMLElement>('.wd-br-core')!;

const title = (root: HTMLElement) => root.querySelector('.wd-br-title')!.textContent;
const detail = (root: HTMLElement) => root.querySelector('.wd-br-detail')!.textContent;

test('idle: a flush card with three accent circles, the name and the length of a session', () => {
  const root = host();
  const w = renderBreath(root, id);
  expect(w.running()).toBe(false);
  expect(root.querySelector('.v-card.flush')).not.toBeNull();
  expect(title(root)).toBe('Tarik napas');
  expect(detail(root)).toBe('4 detik · 5 putaran');
  expect(root.querySelectorAll('.wd-br-ring')).toHaveLength(2);
  expect(root.querySelector('.wd-br-ring.out')!.getAttribute('style')).toContain('60px');
  expect(root.querySelector('.wd-br-ring.mid')!.getAttribute('style')).toContain('40px');
  expect(core(root).style.width).toBe('20px');
  expect(root.querySelector('.rd')).toBeNull();
});

test('English copy', () => {
  const root = host();
  renderBreath(root, en);
  expect(title(root)).toBe('Breathe in');
  expect(detail(root)).toBe('4 s · 5 rounds');
});

test('the editor sample is the idle view', () => {
  const view = breathView(id, id.idle);
  expect(view.querySelector('.wd-br-title')!.textContent).toBe('Tarik napas');
  expect(view.querySelector('.wd-br-detail')!.textContent).toBe('4 detik · 5 putaran');
  expect(view.querySelector('.wd-br-core')).not.toBeNull();
});

test('running: the phase, the seconds left and the round', () => {
  const root = host();
  const w = renderBreath(root, id);
  w.start(0);
  expect(w.running()).toBe(true);
  expect(title(root)).toBe('Tarik napas');
  expect(detail(root)).toBe('4 detik · 1 dari 5');
  w.tick(5000);
  expect(title(root)).toBe('Tahan');
  expect(detail(root)).toBe('3 detik · 1 dari 5');
  w.tick(9000);
  expect(title(root)).toBe('Buang napas');
  w.tick(16000);
  expect(detail(root)).toBe('4 detik · 2 dari 5');
});

test('the core grows from 20 px to 50 px and back with the breath', () => {
  const root = host();
  const w = renderBreath(root, id);
  w.start(0);
  expect(core(root).style.width).toBe('20px');
  w.tick(2000);
  expect(core(root).style.width).toBe('35px');
  expect(core(root).style.height).toBe('35px');
  w.tick(5000);
  expect(core(root).style.width).toBe('50px');
  w.tick(9000);
  expect(core(root).style.width).toBe('42.5px');
  w.tick(13000);
  expect(core(root).style.width).toBe('20px');
});

test('the seconds left change only when a whole second has gone', () => {
  const root = host();
  const w = renderBreath(root, id);
  w.start(0);
  const before = root.querySelector('.wd-br-detail')!;
  w.tick(100);
  expect(root.querySelector('.wd-br-detail')).toBe(before);
  expect(detail(root)).toBe('4 detik · 1 dari 5');
  w.tick(1100);
  expect(detail(root)).toBe('3 detik · 1 dari 5');
});

test('after the last cycle it says done, stops running, and goes idle after 3 seconds', () => {
  const root = host();
  const w = renderBreath(root, id);
  w.start(0);
  w.tick(80000);
  expect(title(root)).toBe('Selesai');
  expect(w.running()).toBe(false);
  vi.advanceTimersByTime(2900);
  expect(title(root)).toBe('Selesai');
  vi.advanceTimersByTime(200);
  expect(title(root)).toBe('Tarik napas');
  expect(detail(root)).toBe('4 detik · 5 putaran');
});

test('a click starts and a second click stops', () => {
  const root = host();
  const starts: number[] = [];
  const w = renderBreath(root, id, { now: () => 1234, onStart: () => starts.push(1) });
  const btn = root.querySelector('button')!;
  btn.click();
  expect(w.running()).toBe(true);
  expect(starts).toHaveLength(1);
  w.tick(1234 + 5000);
  expect(title(root)).toBe('Tahan');
  btn.click();
  expect(w.running()).toBe(false);
  expect(detail(root)).toBe('4 detik · 5 putaran');
});

test('stop does nothing when idle, tick does nothing when stopped', () => {
  const root = host();
  const w = renderBreath(root, id);
  w.stop();
  w.tick(5000);
  expect(detail(root)).toBe('4 detik · 5 putaran');
});

test('a click during the done message starts again', () => {
  const root = host();
  const w = renderBreath(root, id, { now: () => 90000 });
  w.start(0);
  w.tick(80000);
  root.querySelector('button')!.click();
  expect(w.running()).toBe(true);
  vi.advanceTimersByTime(5000);
  expect(detail(root)).toBe('4 detik · 1 dari 5');
});

test('a frame stamped just before the start still shows the first phase', () => {
  const root = host();
  const w = renderBreath(root, id);
  w.start(1000);
  w.tick(990);
  expect(title(root)).toBe('Tarik napas');
  expect(detail(root)).toBe('4 detik · 1 dari 5');
});
