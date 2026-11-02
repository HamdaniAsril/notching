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

test('idle: the name, three rings with a red dot, and the hint', () => {
  const root = host();
  const w = renderBreath(root, id);
  expect(w.running()).toBe(false);
  expect(root.textContent).toContain('NAPAS');
  expect(root.textContent).toContain('Klik untuk mulai');
  expect(root.querySelectorAll('.wd-br-ring')).toHaveLength(2);
  expect(root.querySelector('.wd-br-ring.out')!.getAttribute('style')).toContain('56px');
  expect(root.querySelector('.wd-br-ring.mid')!.getAttribute('style')).toContain('38px');
  expect(core(root).style.width).toBe('20px');
  expect(root.querySelector('.wd-br-rings .rd')).not.toBeNull();
});

test('English copy', () => {
  const root = host();
  renderBreath(root, en);
  expect(root.textContent).toContain('BREATHE');
  expect(root.textContent).toContain('Click to start');
});

test('the editor sample is the idle view', () => {
  const view = breathView(id, id.tap);
  expect(view.textContent).toContain('Klik untuk mulai');
  expect(view.querySelector('.wd-br-core')).not.toBeNull();
});

test('running: the phase, the cycle and the seconds left', () => {
  const root = host();
  const w = renderBreath(root, id);
  w.start(0);
  expect(w.running()).toBe(true);
  expect(root.textContent).toContain('TARIK');
  expect(root.textContent).toContain('1/5');
  expect(root.textContent).not.toContain('Klik untuk mulai');
  w.tick(5000);
  expect(root.textContent).toContain('TAHAN');
  expect(root.textContent).toContain('1/5');
  expect(root.textContent).toContain('dtk');
  expect(root.querySelector('.wd-br-left svg.dm')).not.toBeNull();
  w.tick(9000);
  expect(root.textContent).toContain('BUANG');
  w.tick(16000);
  expect(root.textContent).toContain('2/5');
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

test('the seconds left change the dot number only when they change', () => {
  const root = host();
  const w = renderBreath(root, id);
  w.start(0);
  const before = root.querySelector('.wd-br-left svg.dm')!;
  w.tick(100);
  expect(root.querySelector('.wd-br-left svg.dm')).toBe(before);
  w.tick(1100);
  expect(root.querySelector('.wd-br-left svg.dm')).not.toBe(before);
});

test('after the last cycle it says done, stops running, and goes idle after 3 seconds', () => {
  const root = host();
  const w = renderBreath(root, id);
  w.start(0);
  w.tick(80000);
  expect(root.textContent).toContain('Selesai');
  expect(w.running()).toBe(false);
  vi.advanceTimersByTime(2900);
  expect(root.textContent).toContain('Selesai');
  vi.advanceTimersByTime(200);
  expect(root.textContent).toContain('Klik untuk mulai');
  expect(root.textContent).not.toContain('Selesai');
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
  expect(root.textContent).toContain('TAHAN');
  btn.click();
  expect(w.running()).toBe(false);
  expect(root.textContent).toContain('Klik untuk mulai');
});

test('stop does nothing when idle, tick does nothing when stopped', () => {
  const root = host();
  const w = renderBreath(root, id);
  w.stop();
  w.tick(5000);
  expect(root.textContent).toContain('Klik untuk mulai');
});

test('a click during the done message starts again', () => {
  const root = host();
  const w = renderBreath(root, id, { now: () => 90000 });
  w.start(0);
  w.tick(80000);
  root.querySelector('button')!.click();
  expect(w.running()).toBe(true);
  vi.advanceTimersByTime(5000);
  expect(root.textContent).toContain('TARIK');
});

test('a frame stamped just before the start still shows the first phase', () => {
  const root = host();
  const w = renderBreath(root, id);
  w.start(1000);
  w.tick(990);
  expect(root.textContent).toContain('TARIK');
  expect(root.textContent).toContain('1/5');
  expect(root.textContent).not.toContain('0/5');
});
