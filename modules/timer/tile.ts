import { lab, num } from '../../src/kit/volt';
import { el } from '../../src/kit/widget';
import { DRAG_PX, dragMinutes, formatLeft, MAX_MINUTES, MIN_MINUTES } from './ruler';
import type { Actions, Sound, Strings, TimerView } from './view';

// Minutes per pixel of drag.
const PX_PER_MINUTE = 6;

// The ring fills the 109 x 104 frame: 85 px across, a 2.5 px line.
const SVG = 'http://www.w3.org/2000/svg';
const W = 109;
const H = 104;
const R = 42.5;

export type TileState =
  | { kind: 'idle'; minutes: number }
  // `minutes` is what is left, rounded; `done` is how much of the timer has run, 0 to 1.
  | { kind: 'live'; paused: boolean; text: string; minutes: number; done: number }; // text is "6:42"

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// The ring: a track, and over it the arc of what has run, from the top clockwise. The arc is
// the accent while the timer runs and a step dimmer while it waits; idle has none.
function ringView(done: number | null, paused: boolean): SVGSVGElement {
  const ring = svg('svg', { class: 'wd-tl-ring', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  const at = { cx: String(W / 2), cy: String(H / 2), r: String(R), fill: 'none' };
  ring.append(svg('circle', { ...at, class: 'wd-tl-track' }));
  if (done !== null && done > 0) {
    const arc = svg('circle', {
      ...at,
      class: paused ? 'wd-tl-arc' : 'v-acc wd-tl-arc',
      pathLength: '100',
      'stroke-dasharray': `${(Math.min(1, done) * 100).toFixed(2)} 100`,
      transform: `rotate(-90 ${W / 2} ${H / 2})`,
    });
    ring.append(arc);
  }
  return ring;
}

// Idle: an empty ring, the name, the minutes chosen and "Menit". Live: the ring with its arc,
// the name (or Jeda), the minutes left and "menit lagi". Also what the editor's sample draws.
export function tileView(_root: HTMLElement, s: Strings, st: TileState): HTMLElement {
  const live = st.kind === 'live';
  const paused = live && st.paused;
  const w = el('div', paused ? 'v-card flush wd-tl paused' : 'v-card flush wd-tl');
  const read = el('div', 'wd-tl-read');
  read.append(
    lab(paused ? s.paused : s.label),
    num(String(st.minutes), 34, 'wd-tl-min'),
    el('span', 'wd-tl-sub', live ? s.left : s.ruler),
  );
  w.append(ringView(live ? st.done : null, paused), read);
  return w;
}

// The one-column Timer: the whole frame is one button. Dragging sideways or turning the wheel
// sets the minutes while idle; a click starts them, or pauses, or resumes. A drag while a timer
// runs or waits starts the new minutes on release, as the strip's ruler does. `update` takes a
// reading from the core; `tick` moves the time by this frame's clock between readings.
export function renderTile(root: HTMLElement, s: Strings, act: Actions, sound: Sound = { prime() {}, step() {} }): {
  update(v: TimerView): void;
  tick(now: number): void;
} {
  let view: TimerView = { state: 'idle', minutes: 30, until: null, left: null, text: null };
  // Set by a drag or the wheel: while idle until a reading leaves idle; while a timer runs, for
  // the drag and then until the core answers the new start.
  let chosen: number | null = null;
  let drag: { x: number; base: number; moved: boolean } | null = null;
  let lastNow = Date.now();
  let shown = '';

  const button = el('button', 'wd-tl-btn');
  button.type = 'button';
  root.replaceChildren(button);

  const minutes = () => chosen ?? view.minutes;
  const leftMs = () => view.state === 'running' ? (view.until ?? lastNow) - lastNow : view.left ?? 0;
  // The minutes the tile shows: the time left while a timer runs, rounded, never below 1.
  const shownMinutes = () => view.state === 'idle' ? minutes() : Math.max(MIN_MINUTES, Math.round(leftMs() / 60_000));
  // How much of the timer has run, by this frame's clock.
  const done = () => Math.min(1, Math.max(0, 1 - leftMs() / (view.minutes * 60_000)));
  const editing = () => view.state === 'idle' || chosen !== null;

  function draw(): void {
    const text = formatLeft(leftMs());
    const key = editing() ? `idle ${minutes()}` : `${view.state} ${text}`;
    if (key === shown) return;
    shown = key;
    if (editing()) {
      button.setAttribute('aria-label', `${minutes()} ${s.ruler}. ${s.start}`);
      button.replaceChildren(tileView(root, s, { kind: 'idle', minutes: minutes() }));
    } else {
      button.setAttribute('aria-label', `${view.state === 'paused' ? s.paused : s.label} ${text}`);
      button.replaceChildren(tileView(root, s, { kind: 'live', paused: view.state === 'paused', text, minutes: shownMinutes(), done: done() }));
    }
    button.classList.toggle('idle', editing());
  }

  const set = (m: number) => {
    const was = chosen ?? shownMinutes();
    chosen = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, m));
    if (chosen !== was) sound.step(was, chosen);
    draw();
  };
  const press = () => {
    if (view.state === 'running') act.pause();
    else if (view.state === 'paused') act.resume();
    else act.start(minutes());
  };

  button.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; // a right click opens no timer
    const id = (e as PointerEvent).pointerId;
    if (id !== undefined) button.setPointerCapture?.(id);
    drag = { x: e.clientX, base: shownMinutes(), moved: false };
    sound.prime();
  });
  button.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < DRAG_PX) return;
    drag.moved = true;
    set(dragMinutes(drag.base, dx, PX_PER_MINUTE));
  });
  // A short press is the click: a drag that ends here only leaves its minutes chosen while idle,
  // and starts them while a timer runs or waits.
  button.addEventListener('pointerup', () => {
    const d = drag;
    drag = null;
    if (d && !d.moved) press();
    else if (d && view.state !== 'idle' && chosen !== null) act.start(chosen);
  });
  button.addEventListener('pointercancel', () => {
    const d = drag;
    drag = null;
    if (d?.moved && view.state !== 'idle') {
      chosen = null;
      draw();
    }
  });
  // A click from the keyboard (a mouse click has a detail and was handled by pointerup).
  button.addEventListener('click', e => {
    if (e.detail === 0) press();
  });
  // The page behind a frame must not scroll while the wheel sets the minutes.
  button.addEventListener('wheel', e => {
    e.preventDefault();
    const d = e.deltaY || e.deltaX;
    if (view.state === 'idle' && d) set(minutes() + Math.sign(d));
  }, { passive: false });

  draw();
  return {
    update(v) {
      view = v;
      if (v.state !== 'idle' && !drag) chosen = null;
      draw();
    },
    tick(now) {
      lastNow = now;
      draw();
    },
  };
}
