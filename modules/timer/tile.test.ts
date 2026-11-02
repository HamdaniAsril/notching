// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { dotWidth } from '../../src/kit/dots';
import en from './locales/en.json';
import id from './locales/id.json';
import { renderTile, tileView } from './tile';
import type { TimerView } from './view';

const NOW = 1_000_000_000;
const IDLE: TimerView = { state: 'idle', minutes: 25, until: null, left: null, text: null };
const RUNNING: TimerView = { state: 'running', minutes: 10, until: NOW + 402_000, left: 402_000, text: '6:42' };
const PAUSED: TimerView = { state: 'paused', minutes: 10, until: null, left: 402_000, text: '6:42' };

afterEach(() => { document.body.innerHTML = ''; });

function mount(v: TimerView, s = id) {
  const root = document.createElement('div');
  document.body.append(root);
  const act = { start: vi.fn(), pause: vi.fn(), resume: vi.fn(), stop: vi.fn() };
  const tile = renderTile(root, s, act);
  tile.update(v);
  tile.tick(NOW);
  const button = root.querySelector<HTMLButtonElement>('button')!;
  const fire = (type: string, x = 0) => button.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true }));
  const click = () => { fire('pointerdown'); fire('pointerup'); };
  const bigWidth = () => Number(root.querySelector('.wd-big svg')!.getAttribute('width'));
  return { root, act, tile, button, fire, click, bigWidth };
}

test('idle: the name, a timer icon, the minutes in dots and the ruler', () => {
  const m = mount(IDLE);
  expect(m.root.textContent).toContain('TIMER');
  expect(m.root.textContent).toContain('MENIT');
  expect(m.root.querySelector('.wd-tl-head .ic svg')).not.toBeNull();
  expect(m.bigWidth()).toBe(dotWidth('25', 6));
  const ticks = [...m.root.querySelectorAll('.wd-tl-ruler i')];
  expect(ticks).toHaveLength(5);
  expect(ticks.map(t => t.classList.contains('mid'))).toEqual([false, false, true, false, false]);
  expect(m.root.querySelector('.rd')).toBeNull();
  expect(tileView(document.body, en, { kind: 'idle', minutes: 5 }).textContent).toContain('MINUTES');
});

test('idle: the ticks past 1 and 60 are left out', () => {
  const ticks = (minutes: number) => [...tileView(document.body, id, { kind: 'idle', minutes }).querySelectorAll('.wd-tl-ruler i')]
    .map(t => t.classList.contains('off'));
  expect(ticks(1)).toEqual([true, true, false, false, false]);
  expect(ticks(60)).toEqual([false, false, false, true, true]);
  expect(ticks(25)).toEqual([false, false, false, false, false]);
});

test('idle: a click with no move starts the minutes shown', () => {
  const m = mount(IDLE);
  m.click();
  expect(m.act.start).toHaveBeenCalledExactlyOnceWith(25);
});

test('idle: a drag changes the minutes and starts nothing; the click after starts them', () => {
  const m = mount(IDLE);
  m.fire('pointerdown', 100);
  m.fire('pointermove', 76);
  expect(m.bigWidth()).toBe(dotWidth('29', 6));
  m.fire('pointerup', 76);
  expect(m.act.start).not.toHaveBeenCalled();
  m.click();
  expect(m.act.start).toHaveBeenCalledExactlyOnceWith(29);
});

test('idle: a small wobble is still a click', () => {
  const m = mount(IDLE);
  m.fire('pointerdown', 100);
  m.fire('pointermove', 96);
  m.fire('pointerup', 96);
  expect(m.act.start).toHaveBeenCalledExactlyOnceWith(25);
});

test('idle: a drag stays within 1 and 60', () => {
  const m = mount(IDLE);
  m.fire('pointerdown', 0);
  m.fire('pointermove', 600);
  expect(m.bigWidth()).toBe(dotWidth('1', 6));
});

test('idle: the wheel changes the minutes by one and keeps the page still', () => {
  const m = mount(IDLE);
  const up = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true });
  m.button.dispatchEvent(up);
  expect(up.defaultPrevented).toBe(true);
  expect(m.bigWidth()).toBe(dotWidth('26', 6));
  m.button.dispatchEvent(new WheelEvent('wheel', { deltaY: -40, bubbles: true, cancelable: true }));
  m.button.dispatchEvent(new WheelEvent('wheel', { deltaY: -40, bubbles: true, cancelable: true }));
  expect(m.bigWidth()).toBe(dotWidth('24', 6));
  m.click();
  expect(m.act.start).toHaveBeenCalledWith(24);
});

test('idle: the chosen minutes survive the core\'s next reading', () => {
  const m = mount(IDLE);
  m.button.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true }));
  m.tile.update(IDLE);
  expect(m.bigWidth()).toBe(dotWidth('26', 6));
  m.tile.update({ ...IDLE, minutes: 30 });
  expect(m.bigWidth()).toBe(dotWidth('26', 6));
});

test('running: a red dot, the minutes over the seconds; a click pauses', () => {
  const m = mount(RUNNING);
  expect(m.root.querySelector('.lab .rd')).not.toBeNull();
  expect(m.root.textContent).toContain('TIMER');
  expect(m.bigWidth()).toBe(dotWidth('6', 6));
  expect(Number(m.root.querySelector('.wd-small svg')!.getAttribute('width'))).toBe(dotWidth(':42', 3));
  expect(m.button.getAttribute('aria-label')).toContain('6:42');
  m.click();
  expect(m.act.pause).toHaveBeenCalledOnce();
  expect(m.act.start).not.toHaveBeenCalled();
});

test('running: the time follows the frame clock', () => {
  const m = mount(RUNNING);
  m.tile.tick(NOW + 342_000);
  expect(m.button.getAttribute('aria-label')).toContain('1:00');
  expect(m.bigWidth()).toBe(dotWidth('1', 6));
  m.tile.tick(NOW + 401_000);
  expect(m.button.getAttribute('aria-label')).toContain('0:01');
});

test('paused: dimmer, JEDA instead of the dot; a click resumes', () => {
  const m = mount(PAUSED);
  expect(m.root.querySelector('.rd')).toBeNull();
  expect(m.root.textContent).toContain('JEDA');
  expect(m.root.querySelector('.wd-tl.paused')).not.toBeNull();
  expect(m.button.getAttribute('aria-label')).toContain('6:42');
  m.click();
  expect(m.act.resume).toHaveBeenCalledOnce();
  expect(mount(PAUSED, en).root.textContent).toContain('PAUSED');
});

test('the keyboard acts like a click', () => {
  const m = mount(IDLE);
  m.button.click();
  expect(m.act.start).toHaveBeenCalledExactlyOnceWith(25);
});

test('a state change keeps the same button', () => {
  const m = mount(IDLE);
  const button = m.button;
  m.tile.update(RUNNING);
  expect(m.root.querySelector('button')).toBe(button);
  expect(m.root.querySelectorAll('button')).toHaveLength(1);
});
