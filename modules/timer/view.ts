import type id from './locales/id.json';
import {
  BIG_PX_PER_MINUTE, DRAG_PX, dragMinutes, formatLeft, MAX_MINUTES, PRESETS, PX_PER_MINUTE, shownMinutes, typedMinutes,
} from './ruler';

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

// The strip, or the Timer page (design 31 Oct, Timer §4–5, as the owner changed
// them on the day): the ruler and the time, which takes typed minutes; Jeda/Lanjut
// and Stop while a timer runs. The page's ruler is bigger and sits on top, with
// the presets below it; the strip has no presets. `update` takes a reading from
// the core; `tick` moves the ruler and the time by this frame's clock between
// readings. A drag or typing owns them until it ends, and the minutes just
// started stay shown until the core answers.
export function renderTimer(root: HTMLElement, s: Strings, act: Actions, big: boolean): {
  update(v: TimerView): void;
  tick(now: number): void;
} {
  let view: TimerView = { state: 'idle', minutes: 5, until: null, left: null, text: null };
  let built: TimerView['state'] | null = null;
  let drag: { x: number; base: number; minutes: number | null } | null = null;
  let pending: number | null = null; // minutes started, until the next reading
  let lastNow = Date.now();
  let lit = -1;
  const px = big ? BIG_PX_PER_MINUTE : PX_PER_MINUTE;

  const red = el('i', 'rd tm-red');
  const head = el('span', 'lab tm-lab', s.label);
  const presets = el('div', 'tm-chips');
  const controls = el('div', 'tm-chips');
  const start = (m: number) => {
    pending = m;
    act.start(m);
  };
  for (const m of PRESETS) presets.append(chip(`${m}m`, 'tm-chip', () => start(m)));

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
    t.style.left = `${m * px}px`;
    ticks.push(t);
    tape.append(t);
    if (m % 10 === 0) {
      const n = el('span', 'tm-num', String(m));
      n.style.left = `${m * px}px`;
      tape.append(n);
    }
  }
  ruler.append(tape, el('i', 'tm-mark'));
  // Minutes typed here start on Enter; anything else puts the time back.
  const time = el('input', 'tm-time');
  time.type = 'text';
  time.inputMode = 'numeric';
  time.maxLength = 5;
  time.spellcheck = false;
  time.setAttribute('aria-label', s.ruler);
  time.addEventListener('focus', () => time.select());
  time.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const m = typedMinutes(time.value);
    if (m !== null) start(m);
    time.blur();
    tick(lastNow);
  });
  time.addEventListener('blur', () => tick(lastNow));

  // The ruler never leaves its row: moving it would drop a drag's pointer capture.
  const lead = el('span', 'tm-lead');
  const buttons = el('span', 'tm-buttons');
  if (big) {
    const top = el('div', 'tm-row tm-top');
    top.append(ruler, time);
    const bottom = el('div', 'tm-row');
    bottom.append(lead, buttons);
    root.replaceChildren(top, bottom);
  } else {
    const row = el('div', 'tm-row');
    row.append(lead, ruler, time, buttons);
    root.replaceChildren(row);
  }

  // Presets while idle; Jeda or Lanjut and Stop while a timer runs or waits.
  function build(state: TimerView['state']): void {
    built = state;
    root.classList.toggle('tm-live', state !== 'idle');
    if (state === 'idle') {
      lead.replaceChildren(...(big ? [head, presets] : [head]));
      buttons.replaceChildren();
      return;
    }
    controls.replaceChildren(
      state === 'running' ? chip(s.pause, 'tm-chip', () => act.pause()) : chip(s.resume, 'tm-chip', () => act.resume()),
      chip(s.stop, 'tm-chip tm-ghost', () => act.stop()),
    );
    lead.replaceChildren(red, head);
    buttons.replaceChildren(controls);
  }

  function draw(minutes: number, text: string, dim: boolean): void {
    tape.style.transform = `translateX(${ruler.clientWidth / 2 - minutes * px}px)`;
    const whole = Math.floor(minutes + 1e-9);
    if (whole !== lit) {
      lit = whole;
      ticks.forEach((t, i) => t.classList.toggle('tm-on', i + 1 <= whole));
      ruler.setAttribute('aria-valuenow', String(Math.max(1, Math.round(minutes))));
    }
    if (time.ownerDocument.activeElement === time) return;
    time.value = text;
    time.classList.toggle('tm-dim', dim);
  }

  function tick(now: number): void {
    lastNow = now;
    if (drag) return;
    if (pending !== null) {
      draw(pending, formatLeft(pending * 60_000), false);
      return;
    }
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
    drag.minutes = dragMinutes(drag.base, dx, px);
    draw(drag.minutes, formatLeft(drag.minutes * 60_000), false);
  });
  const end = (go: boolean) => {
    const minutes = drag?.minutes ?? null;
    drag = null;
    if (go && minutes !== null) start(minutes);
    tick(lastNow);
  };
  ruler.addEventListener('pointerup', () => end(true));
  ruler.addEventListener('pointercancel', () => end(false));
  ruler.addEventListener('lostpointercapture', () => { if (drag) end(false); });

  build('idle');
  return {
    update(v) {
      view = v;
      pending = null;
      if (v.state !== built) build(v.state);
      tick(lastNow);
    },
    tick,
  };
}
