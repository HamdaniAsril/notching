import { icon } from '../../src/kit/icons';
import { big, el, small } from '../../src/kit/widget';
import { DRAG_PX, dragMinutes, formatLeft, MAX_MINUTES, MIN_MINUTES } from './ruler';
import type { Actions, Strings, TimerView } from './view';

// Minutes per pixel of drag, and the ruler's tick pitch: 2 px tick, 4 px gap.
const PX_PER_MINUTE = 6;
const TICKS = 5;

export type TileState =
  | { kind: 'idle'; minutes: number }
  | { kind: 'live'; paused: boolean; text: string }; // text is "6:42"

// The five minutes around `minutes`, the middle one white; the ones past 1 and 60 are left out.
function rulerView(minutes: number): HTMLElement {
  const r = el('div', 'wd-tl-ruler');
  for (let i = 0; i < TICKS; i++) {
    const m = minutes + i - (TICKS >> 1);
    const cls = i === TICKS >> 1 ? 'mid' : m < MIN_MINUTES || m > MAX_MINUTES ? 'off' : '';
    r.append(el('i', cls));
  }
  return r;
}

// Idle: the name and an icon, the minutes, and the ruler. Live: the name (or Jeda), then the
// minutes over the seconds. Also what the editor's sample draws.
export function tileView(root: HTMLElement, s: Strings, st: TileState): HTMLElement {
  const w = el('div', st.kind === 'live' && st.paused ? 'wd wd-tl paused' : 'wd wd-tl');
  if (st.kind === 'idle') {
    const head = el('div', 'wd-tl-head');
    head.append(el('span', 'lab', s.label.toUpperCase()), icon('timer', 16));
    const foot = el('div', 'wd-tl-foot');
    foot.append(el('span', 'lab', s.ruler.toUpperCase()), rulerView(st.minutes));
    w.append(head, big(root, String(st.minutes)), foot);
    return w;
  }
  const name = el('span', 'lab', (st.paused ? s.paused : s.label).toUpperCase());
  if (!st.paused) name.prepend(el('i', 'rd'));
  const [mm, ss] = st.text.split(':');
  w.append(name, big(root, mm), small(`:${ss}`, 3));
  return w;
}

// The one-column Timer: the whole frame is one button. Dragging sideways or turning the wheel
// sets the minutes while idle; a click starts them, or pauses, or resumes. `update` takes a
// reading from the core; `tick` moves the time by this frame's clock between readings.
export function renderTile(root: HTMLElement, s: Strings, act: Actions): {
  update(v: TimerView): void;
  tick(now: number): void;
} {
  let view: TimerView = { state: 'idle', minutes: 30, until: null, left: null, text: null };
  let chosen: number | null = null; // set by a drag or the wheel, until a reading leaves idle
  let drag: { x: number; base: number; moved: boolean } | null = null;
  let lastNow = Date.now();
  let shown = '';

  const button = el('button', 'wd-tl-btn');
  button.type = 'button';
  root.replaceChildren(button);

  const minutes = () => chosen ?? view.minutes;

  function draw(): void {
    const left = view.state === 'running' ? (view.until ?? lastNow) - lastNow : view.left ?? 0;
    const text = formatLeft(left);
    const key = view.state === 'idle' ? `idle ${minutes()}` : `${view.state} ${text}`;
    if (key === shown) return;
    shown = key;
    if (view.state === 'idle') {
      button.setAttribute('aria-label', `${minutes()} ${s.ruler}. ${s.start}`);
      button.replaceChildren(tileView(root, s, { kind: 'idle', minutes: minutes() }));
    } else {
      button.setAttribute('aria-label', `${view.state === 'paused' ? s.paused : s.label} ${text}`);
      button.replaceChildren(tileView(root, s, { kind: 'live', paused: view.state === 'paused', text }));
    }
    button.classList.toggle('idle', view.state === 'idle');
  }

  const set = (m: number) => {
    chosen = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, m));
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
    drag = { x: e.clientX, base: minutes(), moved: false };
  });
  button.addEventListener('pointermove', e => {
    if (!drag || view.state !== 'idle') return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < DRAG_PX) return;
    drag.moved = true;
    set(dragMinutes(drag.base, dx, PX_PER_MINUTE));
  });
  // A short press is the click: a drag that ends here only leaves its minutes chosen.
  button.addEventListener('pointerup', () => {
    const d = drag;
    drag = null;
    if (d && !d.moved) press();
  });
  button.addEventListener('pointercancel', () => { drag = null; });
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
      if (v.state !== 'idle') chosen = null;
      draw();
    },
    tick(now) {
      lastNow = now;
      draw();
    },
  };
}
