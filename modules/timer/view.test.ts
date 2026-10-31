// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import iconSvg from './icon.svg?raw';
import id from './locales/id.json';
import { renderTimer, type TimerView } from './view';

const NOW = 1_000_000_000;
const IDLE: TimerView = { state: 'idle', minutes: 5, until: null, left: null, text: null };
const RUNNING: TimerView = { state: 'running', minutes: 10, until: NOW + 402_000, left: 402_000, text: '6:42' };
const PAUSED: TimerView = { state: 'paused', minutes: 10, until: null, left: 402_000, text: '6:42' };

afterEach(() => { document.body.innerHTML = ''; });

function mount(v: TimerView, big = false) {
  const root = document.createElement('div');
  document.body.append(root);
  const act = { start: vi.fn(), pause: vi.fn(), resume: vi.fn(), stop: vi.fn() };
  const view = renderTimer(root, id, act, big);
  view.update(v);
  view.tick(NOW);
  const button = (text: string) => [...root.querySelectorAll('button')].find(b => b.textContent === text);
  const ruler = root.querySelector<HTMLElement>('.tm-ruler')!;
  const time = () => root.querySelector<HTMLElement>('.tm-time')!;
  const pointer = (type: string, x: number) => ruler.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true }));
  return { root, act, view, button, ruler, time, pointer };
}

test('idle shows the presets, the ruler and a dim time', () => {
  const { root, button, time } = mount(IDLE);
  for (const t of ['3m', '5m', '10m', '25m']) expect(button(t)).toBeDefined();
  expect(time().textContent).toBe('5:00');
  expect(time().classList.contains('tm-dim')).toBe(true);
  expect(button('Jeda')).toBeUndefined();
  expect(root.querySelector('.tm-red')).toBeNull();
  expect(root.querySelector('.tm-lab')!.textContent).toBe('Timer');
});

test('a preset starts at once', () => {
  const { act, button } = mount(IDLE);
  button('10m')!.click();
  expect(act.start).toHaveBeenCalledWith(10);
});

test('dragging the ruler and letting go starts at the new value', () => {
  const { act, pointer, time } = mount(IDLE);
  pointer('pointerdown', 200);
  pointer('pointermove', 160);
  expect(time().textContent).toBe('10:00');
  expect(act.start).not.toHaveBeenCalled();
  pointer('pointerup', 160);
  expect(act.start).toHaveBeenCalledWith(10);
});

test('a click on the ruler without moving starts nothing', () => {
  const { act, pointer } = mount(IDLE);
  pointer('pointerdown', 200);
  pointer('pointerup', 200);
  pointer('pointerdown', 200);
  pointer('pointermove', 202);
  pointer('pointerup', 202);
  // A trackpad click may wobble a few pixels: less than one tick is still a click.
  pointer('pointerdown', 200);
  pointer('pointermove', 206);
  pointer('pointerup', 206);
  expect(act.start).not.toHaveBeenCalled();
});

test('a drag that loses the pointer ends without starting, and the ruler moves again', () => {
  const { act, pointer, ruler, view, time } = mount(RUNNING);
  pointer('pointerdown', 100);
  pointer('pointermove', 60);
  ruler.dispatchEvent(new MouseEvent('lostpointercapture'));
  view.tick(NOW + 2_000);
  expect(time().textContent).toBe('6:40');
  pointer('pointerup', 60);
  expect(act.start).not.toHaveBeenCalled();
});

test('the value let go of stays until the core answers', () => {
  const { button, pointer, time, view } = mount(IDLE);
  pointer('pointerdown', 200);
  pointer('pointermove', 160);
  pointer('pointerup', 160);
  view.tick(NOW + 16);
  expect(time().textContent).toBe('10:00');
  view.update({ state: 'running', minutes: 10, until: NOW + 600_000, left: 600_000, text: '10:00' });
  view.tick(NOW + 1_000);
  expect(time().textContent).toBe('9:59');
  button('Stop')!.click();
  view.update(IDLE);
  button('25m')!.click();
  view.tick(NOW + 16);
  expect(time().textContent).toBe('25:00');
});

test('dragging while running restarts at the new value', () => {
  const { act, pointer, view, time } = mount(RUNNING);
  pointer('pointerdown', 100);
  pointer('pointermove', 60);
  // A reading or a frame during the drag leaves the dragged value.
  view.update(RUNNING);
  view.tick(NOW + 1000);
  expect(time().textContent).toBe('12:00');
  pointer('pointerup', 60);
  expect(act.start).toHaveBeenCalledWith(12);
});

test('running shows the red dot, the time left and Jeda/Stop', () => {
  const { root, act, button, time, view } = mount(RUNNING);
  expect(time().textContent).toBe('6:42');
  expect(time().classList.contains('tm-dim')).toBe(false);
  expect(root.querySelector('.tm-red')).not.toBeNull();
  expect(button('3m')).toBeUndefined();
  button('Jeda')!.click();
  expect(act.pause).toHaveBeenCalled();
  button('Stop')!.click();
  expect(act.stop).toHaveBeenCalled();
  view.tick(NOW + 2_000);
  expect(time().textContent).toBe('6:40');
});

test('paused shows Lanjut and the frozen time', () => {
  const { act, button, time, view } = mount(PAUSED);
  view.tick(NOW + 60_000);
  expect(time().textContent).toBe('6:42');
  button('Lanjut')!.click();
  expect(act.resume).toHaveBeenCalled();
});

test('the ruler follows the minutes shown', () => {
  const { root, view } = mount(IDLE);
  const tape = root.querySelector<HTMLElement>('.tm-tape')!;
  expect(tape.style.transform).toBe('translateX(-40px)');
  const on = () => [...root.querySelectorAll<HTMLElement>('.tm-tick.tm-on')].map(t => Number(t.dataset.m));
  expect(on()).toEqual([1, 2, 3, 4, 5]);
  expect(root.querySelectorAll('.tm-tick')).toHaveLength(60);
  view.update(RUNNING);
  view.tick(NOW);
  expect(tape.style.transform).toBe('translateX(-53.6px)');
  expect(on()).toEqual([1, 2, 3, 4, 5, 6]);
});

test('the ruler marks every 5 minutes and numbers every 10', () => {
  const { root } = mount(IDLE);
  expect([...root.querySelectorAll<HTMLElement>('.tm-tick.tm-long')].map(t => t.dataset.m)).toEqual(['5', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55', '60']);
  expect([...root.querySelectorAll('.tm-num')].map(n => n.textContent)).toEqual(['10', '20', '30', '40', '50', '60']);
});

test('the big page draws the time in dots', () => {
  const { root, view } = mount(RUNNING, true);
  const svg = root.querySelector('.tm-big svg')!;
  expect(svg).not.toBeNull();
  view.tick(NOW + 1_000);
  expect(root.querySelector('.tm-big svg')).not.toBe(svg);
  expect(mount(IDLE).root.querySelector('.tm-big')).toBeNull();
});

test('the icon is a line drawing', () => {
  expect(iconSvg).toContain('viewBox="0 0 24 24"');
  expect(iconSvg).toContain('stroke=');
});
