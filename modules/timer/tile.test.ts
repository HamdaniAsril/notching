// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
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
  const sound = { prime: vi.fn(), step: vi.fn() };
  const tile = renderTile(root, s, act, sound);
  tile.update(v);
  tile.tick(NOW);
  const button = root.querySelector<HTMLButtonElement>('button')!;
  const fire = (type: string, x = 0) => button.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true }));
  const click = () => { fire('pointerdown'); fire('pointerup'); };
  // The big number: the minutes shown.
  const minutes = () => root.querySelector('.v-num')!.textContent;
  return { root, act, tile, button, fire, click, minutes, sound };
}

test('idle: an empty ring, the name, the minutes chosen and "Menit"', () => {
  const m = mount(IDLE);
  const card = m.root.querySelector('.v-card.flush.wd-tl')!;
  expect(card).not.toBeNull();
  expect(card.querySelector('.v-lab')!.textContent).toBe('Timer');
  expect(m.minutes()).toBe('25');
  expect(card.querySelector('.wd-tl-sub')!.textContent).toBe('Menit');
  expect(card.querySelectorAll('svg.wd-tl-ring circle.wd-tl-track')).toHaveLength(1);
  expect(card.querySelector('.wd-tl-arc')).toBeNull();
  expect(card.querySelector('.v-acc')).toBeNull();
  expect(m.root.querySelector('.rd')).toBeNull();
  expect(m.button.getAttribute('aria-label')).toBe('25 Menit. Klik untuk mulai');
  const en2 = tileView(document.body, en, { kind: 'idle', minutes: 5 });
  expect(en2.querySelector('.wd-tl-sub')!.textContent).toBe('Minutes');
  expect(en2.querySelector('.v-num')!.textContent).toBe('5');
});

test('only the primary button presses: a right-button down and up does nothing', () => {
  for (const v of [IDLE, RUNNING, PAUSED]) {
    const m = mount(v);
    for (const type of ['pointerdown', 'pointerup']) {
      m.button.dispatchEvent(new MouseEvent(type, { button: 2, bubbles: true }));
    }
    expect(m.act.start).not.toHaveBeenCalled();
    expect(m.act.pause).not.toHaveBeenCalled();
    expect(m.act.resume).not.toHaveBeenCalled();
    // The primary button still works after it.
    m.click();
    expect(m.act.start.mock.calls.length + m.act.pause.mock.calls.length + m.act.resume.mock.calls.length).toBe(1);
  }
});

test('paused: the arc is ink-2 instead of the accent, and the track stays', async () => {
  // The module's CSS is read from disk: vitest blanks a stylesheet imported as text.
  // @ts-expect-error no @types/node in this project
  const { readFileSync } = await import('node:fs');
  const css: string = readFileSync('modules/timer/style.css', 'utf8');
  expect(/\.wd-tl-arc\s*\{[^}]*color: var\(--v-ink2\)/.test(css)).toBe(true);
  expect(/\.wd-tl-arc\.v-acc\s*\{[^}]*color: var\(--v-acc\)/.test(css)).toBe(true);
  const paused = mount(PAUSED).root;
  expect(paused.querySelector('.wd-tl.paused .wd-tl-arc')).not.toBeNull();
  expect(paused.querySelector('.v-acc')).toBeNull();
  expect(paused.querySelector('.wd-tl-track')).not.toBeNull();
});

test('the strip\'s rules do not reach the Timer page', async () => {
  // @ts-expect-error no @types/node in this project
  const { readFileSync } = await import('node:fs');
  const css: string = readFileSync('modules/timer/style.css', 'utf8');
  // Everything from the strip's rules up to the page's, with the comments and the declarations taken out.
  const strip = css.slice(css.indexOf('/* The strip:'), css.indexOf('/* The page:')).replace(/\/\*[^]*?\*\//g, '').replace(/\{[^}]*\}/g, '|');
  const selectors = strip.split('|').flatMap(rule => rule.split(',').map(x => x.trim())).filter(Boolean);
  expect(selectors.length).toBeGreaterThan(10);
  expect(selectors.filter(sel => !sel.startsWith('#tm.tm-strip'))).toEqual([]);
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
  expect(m.minutes()).toBe('29');
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
  expect(m.minutes()).toBe('1');
});

test('idle: the wheel changes the minutes by one and keeps the page still', () => {
  const m = mount(IDLE);
  const up = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true });
  m.button.dispatchEvent(up);
  expect(up.defaultPrevented).toBe(true);
  expect(m.minutes()).toBe('26');
  m.button.dispatchEvent(new WheelEvent('wheel', { deltaY: -40, bubbles: true, cancelable: true }));
  m.button.dispatchEvent(new WheelEvent('wheel', { deltaY: -40, bubbles: true, cancelable: true }));
  expect(m.minutes()).toBe('24');
  m.click();
  expect(m.act.start).toHaveBeenCalledWith(24);
});

test('idle: the chosen minutes survive the core\'s next reading', () => {
  const m = mount(IDLE);
  m.button.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true }));
  m.tile.update(IDLE);
  expect(m.minutes()).toBe('26');
  m.tile.update({ ...IDLE, minutes: 30 });
  expect(m.minutes()).toBe('26');
});

test('running: the ring has an accent arc, the minutes left and "menit lagi"; a click pauses', () => {
  const m = mount(RUNNING);
  // 402 s of 600 left: 33 % has run.
  const arc = m.root.querySelector('.wd-tl-arc')!;
  expect(arc.classList.contains('v-acc')).toBe(true);
  expect(arc.getAttribute('stroke-dasharray')).toBe('33.00 100');
  expect(m.root.querySelector('.v-lab')!.textContent).toBe('Timer');
  expect(m.root.querySelectorAll('.v-acc')).toHaveLength(1);
  expect(m.root.querySelector('.rd')).toBeNull();
  // 6:42 left counts as 7 minutes.
  expect(m.minutes()).toBe('7');
  expect(m.root.querySelector('.wd-tl-sub')!.textContent).toBe('menit lagi');
  expect(mount(RUNNING, en).root.querySelector('.wd-tl-sub')!.textContent).toBe('min left');
  expect(m.button.getAttribute('aria-label')).toContain('6:42');
  m.click();
  expect(m.act.pause).toHaveBeenCalledOnce();
  expect(m.act.start).not.toHaveBeenCalled();
});

test('running: the time follows the frame clock', () => {
  const m = mount(RUNNING);
  m.tile.tick(NOW + 342_000);
  expect(m.button.getAttribute('aria-label')).toContain('1:00');
  expect(m.minutes()).toBe('1');
  expect(m.root.querySelector('.wd-tl-arc')!.getAttribute('stroke-dasharray')).toBe('90.00 100');
  m.tile.tick(NOW + 401_000);
  expect(m.button.getAttribute('aria-label')).toContain('0:01');
  expect(m.minutes()).toBe('1');
});

test('paused: the arc stays, Jeda is the name; a click resumes', () => {
  const m = mount(PAUSED);
  expect(m.root.querySelector('.wd-tl-arc')!.getAttribute('stroke-dasharray')).toBe('33.00 100');
  expect(m.root.querySelector('.v-lab')!.textContent).toBe('Jeda');
  expect(m.minutes()).toBe('7');
  expect(m.root.querySelector('.wd-tl.paused')).not.toBeNull();
  expect(m.button.getAttribute('aria-label')).toContain('6:42');
  m.click();
  expect(m.act.resume).toHaveBeenCalledOnce();
  expect(mount(PAUSED, en).root.querySelector('.v-lab')!.textContent).toBe('Paused');
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

test('running: a drag shows new minutes and the release starts them again, as on the strip', () => {
  const m = mount(RUNNING);
  m.fire('pointerdown', 100);
  m.fire('pointermove', 76);
  // 6:42 left counts as 7; 24 px to the left adds 4.
  expect(m.minutes()).toBe('11');
  // While dragging the ring is the idle one: empty, with the minutes chosen.
  expect(m.root.querySelector('.wd-tl-sub')!.textContent).toBe('Menit');
  expect(m.root.querySelector('.wd-tl-arc')).toBeNull();
  m.fire('pointerup', 76);
  expect(m.act.start).toHaveBeenCalledExactlyOnceWith(11);
  expect(m.act.pause).not.toHaveBeenCalled();
  // The new minutes stay until the core answers with the new timer.
  expect(m.minutes()).toBe('11');
  m.tile.update({ ...RUNNING, minutes: 11, until: NOW + 660_000, text: '11:00' });
  // The timer has just started: its ring is live again, with nothing run yet.
  expect(m.root.querySelector('.wd-tl-arc')).toBeNull();
  expect(m.root.querySelector('.wd-tl-sub')!.textContent).toBe('menit lagi');
  expect(m.minutes()).toBe('11');
  expect(m.button.getAttribute('aria-label')).toContain('11:00');
});

test('running: the core\'s reading during a drag does not drop it', () => {
  const m = mount(RUNNING);
  m.fire('pointerdown', 100);
  m.fire('pointermove', 76);
  m.tile.update(RUNNING);
  expect(m.minutes()).toBe('11');
  m.fire('pointerup', 76);
  expect(m.act.start).toHaveBeenCalledExactlyOnceWith(11);
});

test('paused: a drag starts the new minutes too', () => {
  const m = mount(PAUSED);
  m.fire('pointerdown', 100);
  m.fire('pointermove', 112);
  m.fire('pointerup', 112);
  expect(m.act.start).toHaveBeenCalledExactlyOnceWith(5);
  expect(m.act.resume).not.toHaveBeenCalled();
});

test('running: a small wobble is still a click that pauses', () => {
  const m = mount(RUNNING);
  m.fire('pointerdown', 100);
  m.fire('pointermove', 96);
  m.fire('pointerup', 96);
  expect(m.act.pause).toHaveBeenCalledOnce();
  expect(m.act.start).not.toHaveBeenCalled();
});

test('running: a cancelled drag goes back to the time left and starts nothing', () => {
  const m = mount(RUNNING);
  m.fire('pointerdown', 100);
  m.fire('pointermove', 76);
  m.fire('pointercancel', 76);
  expect(m.act.start).not.toHaveBeenCalled();
  expect(m.button.getAttribute('aria-label')).toContain('6:42');
});

test('a drag or the wheel sounds each whole minute; a click does not', () => {
  const m = mount(IDLE);
  m.click();
  expect(m.sound.step).not.toHaveBeenCalled();
  m.fire('pointerdown', 200);
  expect(m.sound.prime).toHaveBeenCalled();
  // 6 px a minute on the tile: 30 px left is 25 to 30, then one more.
  m.fire('pointermove', 170);
  m.fire('pointermove', 164);
  m.fire('pointermove', 163);
  m.fire('pointerup', 163);
  m.button.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true }));
  expect(m.sound.step.mock.calls).toEqual([[25, 30], [30, 31], [31, 32]]);
});

test('the wheel at 60 stays quiet', () => {
  const m = mount({ ...IDLE, minutes: 60 });
  m.button.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true }));
  expect(m.sound.step).not.toHaveBeenCalled();
});
