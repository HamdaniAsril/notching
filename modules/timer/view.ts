import { BIG_PITCH, dotText } from '../../src/kit/dots';
import type id from './locales/id.json';
import { DRAG_PX, dragMinutes, formatLeft, MAX_MINUTES, PRESETS, PX_PER_MINUTE, shownMinutes } from './ruler';

// Same as TimerDto in src-tauri/src/timer.rs.
export interface TimerView {
  state: 'idle' | 'running' | 'paused';
  minutes: number; // the last started, or the default 5
  until: number | null; // wall-clock ms, only while running
  left: number | null; // ms, while running or paused
  text: string | null; // the status text unless idle: "6:42"
}

export interface Actions {
  start(minutes: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

export type Strings = typeof id;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
}

function chip(text: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

// The strip, or the Timer page with the time in big dots above it (design 31 Oct,
// Timer §4–5): presets, the ruler and the time; Jeda/Lanjut and Stop while a
// timer runs. `update` takes a reading from the core; `tick` moves the ruler and
// the time by this frame's clock between readings. A drag owns both until it ends.
export function renderTimer(root: HTMLElement, s: Strings, act: Actions, big: boolean): {
  update(v: TimerView): void;
  tick(now: number): void;
} {
  let view: TimerView = { state: 'idle', minutes: 5, until: null, left: null, text: null };
  let built: TimerView['state'] | null = null;
  let drag: { x: number; base: number; minutes: number | null } | null = null;
  let lastNow = Date.now();
  let lit = -1;
  let bigText = '';

  const red = el('i', 'rd tm-red');
  const head = el('span', 'lab tm-lab', s.label);
  const presets = el('div', 'tm-chips');
  const controls = el('div', 'tm-chips');
  for (const m of PRESETS) presets.append(chip(`${m}m`, 'tm-chip', () => act.start(m)));

  const ruler = el('div', 'tm-ruler');
  ruler.setAttribute('role', 'slider');
  ruler.setAttribute('aria-label', s.ruler);
  ruler.setAttribute('aria-valuemin', '1');
  ruler.setAttribute('aria-valuemax', String(MAX_MINUTES));
  const tape = el('div', 'tm-tape');
  const ticks: HTMLElement[] = [];
  for (let m = 1; m <= MAX_MINUTES; m++) {
    const t = el('i', m % 5 === 0 ? 'tm-tick tm-long' : 'tm-tick');
    t.dataset.m = String(m);
    t.style.left = `${m * PX_PER_MINUTE}px`;
    ticks.push(t);
    tape.append(t);
    if (m % 10 === 0) {
      const n = el('span', 'tm-num', String(m));
      n.style.left = `${m * PX_PER_MINUTE}px`;
      tape.append(n);
    }
  }
  ruler.append(tape, el('i', 'tm-mark'));
  const time = el('span', 'tm-time');

  const row = el('div', 'tm-row');
  const bigBox = big ? el('div', 'tm-big') : null;
  root.replaceChildren(...(bigBox ? [bigBox] : []), row);

  // Presets while idle; Jeda or Lanjut and Stop while a timer runs or waits.
  function build(state: TimerView['state']): void {
    built = state;
    root.classList.toggle('tm-live', state !== 'idle');
    if (state === 'idle') {
      row.replaceChildren(head, presets, ruler, time);
      return;
    }
    controls.replaceChildren(
      state === 'running' ? chip(s.pause, 'tm-chip', () => act.pause()) : chip(s.resume, 'tm-chip', () => act.resume()),
      chip(s.stop, 'tm-chip tm-ghost', () => act.stop()),
    );
    row.replaceChildren(red, head, ruler, time, controls);
  }

  function draw(minutes: number, text: string, dim: boolean): void {
    tape.style.transform = `translateX(${ruler.clientWidth / 2 - minutes * PX_PER_MINUTE}px)`;
    const whole = Math.floor(minutes + 1e-9);
    if (whole !== lit) {
      lit = whole;
      ticks.forEach((t, i) => t.classList.toggle('tm-on', i + 1 <= whole));
      ruler.setAttribute('aria-valuenow', String(Math.max(1, Math.round(minutes))));
    }
    time.textContent = text;
    time.classList.toggle('tm-dim', dim);
    if (bigBox && text !== bigText) {
      bigText = text;
      bigBox.innerHTML = dotText(text, BIG_PITCH); // digits and a colon only
    }
  }

  function tick(now: number): void {
    lastNow = now;
    if (drag) return;
    const minutes = shownMinutes(view, now);
    const left = view.state === 'running' ? (view.until ?? now) - now : view.state === 'paused' ? view.left ?? 0 : minutes * 60_000;
    draw(minutes, formatLeft(left), view.state === 'idle');
  }

  ruler.addEventListener('pointerdown', e => {
    if ((e as PointerEvent).pointerId !== undefined) ruler.setPointerCapture?.((e as PointerEvent).pointerId);
    drag = { x: e.clientX, base: Math.max(1, Math.round(shownMinutes(view, lastNow))), minutes: null };
  });
  ruler.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (drag.minutes === null && Math.abs(dx) < DRAG_PX) return;
    drag.minutes = dragMinutes(drag.base, dx);
    draw(drag.minutes, formatLeft(drag.minutes * 60_000), false);
  });
  const end = (start: boolean) => {
    const minutes = drag?.minutes ?? null;
    drag = null;
    if (start && minutes !== null) act.start(minutes);
    tick(lastNow);
  };
  ruler.addEventListener('pointerup', () => end(true));
  ruler.addEventListener('pointercancel', () => end(false));

  build('idle');
  return {
    update(v) {
      view = v;
      if (v.state !== built) build(v.state);
      tick(lastNow);
    },
    tick,
  };
}
