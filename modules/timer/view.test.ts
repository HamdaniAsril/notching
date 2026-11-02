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
  const time = () => root.querySelector<HTMLInputElement>('input.tm-time')!;
  const pointer = (type: string, x: number) => ruler.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true }));
  return { root, act, view, button, ruler, time, pointer };
}

test('the strip has no presets, only the ruler and a dim time', () => {
  const { root, button, time } = mount(IDLE);
  for (const t of ['3m', '5m', '10m', '25m']) expect(button(t)).toBeUndefined();
  expect(time().value).toBe('5:00');
  expect(time().classList.contains('tm-dim')).toBe(true);
  expect(button('Jeda')).toBeUndefined();
  expect(root.querySelector('.tm-dot')).toBeNull();
  expect(root.querySelector('.tm-lab')!.textContent).toBe('Timer');
});

// The clock time of NOW plus `ms`, "09.41" style, as the strip draws it.
const clock = (ms: number) => {
  const d = new Date(NOW + ms);
  return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
};

test('the strip in the Volt look: the name over the end time, the ruler, "Menit" over the time left', () => {
  const { root } = mount(IDLE);
  const row = root.firstElementChild!;
  expect(row.classList.contains('v-card')).toBe(true);
  expect([...row.children].map(c => c.className)).toEqual(['tm-lead', 'tm-ruler', 'tm-buttons', 'tm-right']);
  const lead = row.querySelector('.tm-lead')!;
  expect(lead.querySelector('.v-lab')!.textContent).toBe('Timer');
  // Idle: when 5 minutes would end if they started now.
  expect(lead.querySelector('.v-num')!.textContent).toBe(clock(5 * 60_000));
  const right = row.querySelector('.tm-right')!;
  expect(right.querySelector('.v-lab')!.textContent).toBe('Menit');
  expect(right.querySelector('input.tm-time')).not.toBeNull();
  expect(root.querySelector('.rd')).toBeNull();
  expect(root.querySelector('.tm-mark')).not.toBeNull();
});

test('the strip\'s end time is the clock time the timer runs out; a drag previews it', () => {
  const { root, pointer, view } = mount(RUNNING);
  const end = () => root.querySelector('.tm-end')!.textContent;
  expect(end()).toBe(clock(402_000));
  view.tick(NOW + 60_000);
  expect(end()).toBe(clock(402_000));
  pointer('pointerdown', 100);
  pointer('pointermove', 60);
  // 5:42 left counts as 6, and 40 px to the left adds 5: 11 minutes from the frame's now.
  expect(end()).toBe(clock(60_000 + 11 * 60_000));
});

test('the strip\'s name is Jeda while paused, and the page has no end time', () => {
  const { root } = mount(PAUSED);
  expect(root.querySelector('.tm-lab')!.textContent).toBe('Jeda');
  expect(root.querySelector('.tm-end')).not.toBeNull();
  const page = mount(PAUSED, true).root;
  expect(page.querySelector('.tm-end')).toBeNull();
  expect(page.querySelector('.tm-lab')!.textContent).toBe('Timer');
  expect(page.querySelector('.tm-lab')!.classList.contains('v-lab')).toBe(true);
  expect(page.querySelector('.v-card')).toBeNull();
});

test('the Timer page keeps the presets, and one starts at once', () => {
  const { act, button } = mount(IDLE, true);
  button('10m')!.click();
  expect(act.start).toHaveBeenCalledWith(10);
});

test('dragging the ruler and letting go starts at the new value', () => {
  const { act, pointer, time } = mount(IDLE);
  pointer('pointerdown', 200);
  pointer('pointermove', 160);
  expect(time().value).toBe('10:00');
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
  expect(time().value).toBe('6:40');
  pointer('pointerup', 60);
  expect(act.start).not.toHaveBeenCalled();
});

test('the value let go of stays until the core answers', () => {
  const { button, pointer, time, view } = mount(IDLE, true);
  pointer('pointerdown', 200);
  pointer('pointermove', 140);
  pointer('pointerup', 140);
  view.tick(NOW + 16);
  expect(time().value).toBe('10:00');
  view.update({ state: 'running', minutes: 10, until: NOW + 600_000, left: 600_000, text: '10:00' });
  view.tick(NOW + 1_000);
  expect(time().value).toBe('9:59');
  button('Stop')!.click();
  view.update(IDLE);
  button('25m')!.click();
  view.tick(NOW + 16);
  expect(time().value).toBe('25:00');
});

test('dragging while running restarts at the new value', () => {
  const { act, pointer, view, time } = mount(RUNNING);
  pointer('pointerdown', 100);
  pointer('pointermove', 60);
  // A reading or a frame during the drag leaves the dragged value.
  view.update(RUNNING);
  view.tick(NOW + 1000);
  expect(time().value).toBe('12:00');
  pointer('pointerup', 60);
  expect(act.start).toHaveBeenCalledWith(12);
});

test('running shows the time left and Jeda/Stop, with no live dot on the strip but one on the page', () => {
  const { root, act, button, time, view } = mount(RUNNING);
  expect(time().value).toBe('6:42');
  expect(time().classList.contains('tm-dim')).toBe(false);
  expect(root.querySelector('.tm-dot')).toBeNull();
  expect(mount(RUNNING, true).root.querySelector('.tm-dot')).not.toBeNull();
  expect(button('3m')).toBeUndefined();
  button('Jeda')!.click();
  expect(act.pause).toHaveBeenCalled();
  button('Stop')!.click();
  expect(act.stop).toHaveBeenCalled();
  view.tick(NOW + 2_000);
  expect(time().value).toBe('6:40');
});

test('paused shows Lanjut and the frozen time', () => {
  const { act, button, time, view } = mount(PAUSED);
  view.tick(NOW + 60_000);
  expect(time().value).toBe('6:42');
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

test('the Timer page puts a bigger ruler and the time on top, with no dot time', () => {
  const { root } = mount(RUNNING, true);
  expect(root.querySelector('svg')).toBeNull();
  const top = root.firstElementChild!;
  // Two black cards: the ruler with the time, and the buttons.
  expect([...root.children].map(c => c.classList.contains('tm-card'))).toEqual([true, true]);
  expect([...top.children].map(c => c.className)).toEqual(['tm-ruler', 'tm-time']);
  expect(root.querySelector<HTMLElement>('.tm-tick[data-m="5"]')!.style.left).toBe('60px');
  expect(root.querySelector<HTMLElement>('.tm-tape')!.style.transform).toBe('translateX(-80.4px)');
});

test('a drag on the bigger ruler moves a minute every 12 px', () => {
  const { act, pointer } = mount(IDLE, true);
  pointer('pointerdown', 200);
  pointer('pointermove', 140);
  pointer('pointerup', 140);
  expect(act.start).toHaveBeenCalledWith(10);
});

function type(input: HTMLInputElement, text: string, key = 'Enter') {
  input.focus();
  input.value = text;
  input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

test('typing minutes and Enter starts the timer', () => {
  const { act, time } = mount(IDLE);
  type(time(), '7');
  expect(act.start).toHaveBeenCalledWith(7);
  expect(time().value).toBe('7:00');
  type(time(), '12:00');
  expect(act.start).toHaveBeenLastCalledWith(12);
});

test('typing what is not 1–60 minutes starts nothing and puts the time back', () => {
  const { act, time } = mount(IDLE);
  for (const bad of ['0', '61', '', 'abc', '1.5', '7:30']) type(time(), bad);
  expect(act.start).not.toHaveBeenCalled();
  expect(time().value).toBe('5:00');
});

test('a reading or a frame leaves what is being typed', () => {
  const { time, view } = mount(RUNNING);
  time().focus();
  time().value = '2';
  view.update(RUNNING);
  view.tick(NOW + 1_000);
  expect(time().value).toBe('2');
  time().blur();
  view.tick(NOW + 1_000);
  expect(time().value).toBe('6:41');
});

test('the icon is a line drawing', () => {
  expect(iconSvg).toContain('viewBox="0 0 24 24"');
  expect(iconSvg).toContain('stroke=');
});

test('before the first reading the ruler sits at 30 minutes, the middle', () => {
  const root = document.createElement('div');
  document.body.append(root);
  const view = renderTimer(root, id, { start: vi.fn(), pause: vi.fn(), resume: vi.fn(), stop: vi.fn() }, false);
  view.tick(NOW);
  expect(root.querySelector<HTMLInputElement>('input.tm-time')!.value).toBe('30:00');
});
