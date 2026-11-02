import { el, small } from '../../../src/kit/widget';
import { breathAt, CYCLES, type Breath, type Phase } from '../breath';

export interface BreathStrings {
  phases: Record<Phase, string>;
  tap: string;
  sec: string;
  done: string;
  widgets: { breath: string };
}

const CORE_MIN = 20;
const CORE_SPAN = 30;
const DONE_MS = 3000;

// The three rings (outer 56, middle 38, core `core` px, a red dot on the outer one).
function ringsView(core: number): { box: HTMLElement; core: HTMLElement } {
  const box = el('div', 'wd-br-rings');
  const c = el('i', 'wd-br-core');
  c.style.width = c.style.height = `${core}px`;
  const outer = el('i', 'wd-br-ring out');
  outer.style.width = outer.style.height = '56px';
  const mid = el('i', 'wd-br-ring mid');
  mid.style.width = mid.style.height = '38px';
  box.append(outer, mid, c, el('i', 'rd'));
  return { box, core: c };
}

const title = (s: BreathStrings) => el('span', 'lab', s.widgets.breath.toUpperCase());

// Idle, or done when `text` is the done message. Also what the editor's sample draws.
export function breathView(s: BreathStrings, text: string): HTMLElement {
  const w = el('div', 'wd wd-breath');
  w.append(title(s), ringsView(CORE_MIN).box, el('div', 'lab wd-br-note', text));
  return w;
}

interface Running {
  view: HTMLElement;
  update(b: Breath): void;
}

// The running view is built once and updated every frame: the core size each time, the
// text only when it changes.
function runningView(s: BreathStrings): Running {
  const w = el('div', 'wd wd-breath');
  const head = el('div', 'wd-br-head');
  const count = el('span', 'lab');
  head.append(title(s), count);
  const rings = ringsView(CORE_MIN);
  const foot = el('div', 'wd-br-foot');
  const name = el('span', 'lab wd-br-phase');
  const left = el('div', 'wd-br-left');
  foot.append(name, left, el('span', 'lab', s.sec));
  w.append(head, rings.box, foot);
  let shown = '';
  return {
    view: w,
    update(b) {
      const d = CORE_MIN + CORE_SPAN * b.scale;
      rings.core.style.width = rings.core.style.height = `${d}px`;
      const key = `${b.phase} ${b.left} ${b.cycle}`;
      if (key === shown) return;
      shown = key;
      count.textContent = `${b.cycle}/${CYCLES}`;
      name.textContent = s.phases[b.phase];
      left.replaceChildren(small(String(b.left), 3, 'wd-small wd-br-num'));
    },
  };
}

export interface BreathHooks {
  now?: () => number; // the clock a click starts from
  onStart?: () => void; // the caller starts its frame loop here
}

export interface BreathWidget {
  start(nowMs: number): void;
  stop(): void;
  tick(nowMs: number): void;
  running(): boolean;
}

// Napas: a click starts or stops the five rounds. The caller calls `tick` every frame while
// `running()`; the "Selesai" message goes back to idle on its own timer.
export function renderBreath(root: HTMLElement, s: BreathStrings, hooks: BreathHooks = {}): BreathWidget {
  const button = el('button', 'wd-br-btn');
  button.type = 'button';
  root.replaceChildren(button);
  let t0: number | null = null;
  let run: Running | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const show = (v: HTMLElement) => button.replaceChildren(v);
  const idle = () => {
    clearTimeout(idleTimer);
    t0 = null;
    run = null;
    show(breathView(s, s.tap));
  };

  const w: BreathWidget = {
    start(nowMs) {
      clearTimeout(idleTimer);
      t0 = nowMs;
      run = runningView(s);
      show(run.view);
      run.update(breathAt(0)!);
    },
    stop: idle,
    tick(nowMs) {
      if (t0 === null || !run) return;
      const b = breathAt(nowMs - t0);
      if (b) {
        run.update(b);
        return;
      }
      t0 = null;
      run = null;
      show(breathView(s, s.done));
      idleTimer = setTimeout(idle, DONE_MS);
    },
    running: () => t0 !== null,
  };

  button.addEventListener('click', () => {
    if (w.running()) {
      w.stop();
      return;
    }
    w.start((hooks.now ?? (() => performance.now()))());
    hooks.onStart?.();
  });
  idle();
  return w;
}
