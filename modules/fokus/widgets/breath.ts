import { el } from '../../../src/kit/widget';
import { breathAt, CYCLES, PHASE_S, type Breath, type Phase } from '../breath';

export interface BreathStrings {
  phases: Record<Phase, string>; // "Tarik napas", "Tahan", "Buang napas"
  idle: string; // the name when idle
  rounds: string; // "{s} detik · {n} putaran"
  roundOf: string; // "{left} detik · {cycle} dari {n}"
  done: string;
}

const CORE_MIN = 20;
const CORE_SPAN = 30;
const DONE_MS = 3000;

// The three circles: the outer haze (60 px), the glow (40 px) and the core (`core` px, the
// breath) on top.
function ringsView(core: number): { box: HTMLElement; core: HTMLElement } {
  const box = el('div', 'wd-br-rings');
  const c = el('i', 'wd-br-core');
  c.style.width = c.style.height = `${core}px`;
  const outer = el('i', 'wd-br-ring out');
  outer.style.width = outer.style.height = '60px';
  const mid = el('i', 'wd-br-ring mid');
  mid.style.width = mid.style.height = '40px';
  box.append(outer, mid, c);
  return { box, core: c };
}

const sessionText = (s: BreathStrings) => s.rounds.replace('{s}', String(PHASE_S)).replace('{n}', String(CYCLES));

// The name and a line of detail under the circles.
function caption(): { box: HTMLElement; title: HTMLElement; detail: HTMLElement } {
  const box = el('div', 'wd-br-caption');
  const title = el('div', 'wd-br-title');
  const detail = el('div', 'wd-br-detail');
  box.append(title, detail);
  return { box, title, detail };
}

// Idle, or done when `text` is the done message: the name and the length of a session. Also
// what the editor's sample draws.
export function breathView(s: BreathStrings, text: string): HTMLElement {
  const w = el('div', 'v-card flush wd-breath');
  const c = caption();
  c.title.textContent = text;
  c.detail.textContent = sessionText(s);
  w.append(ringsView(CORE_MIN).box, c.box);
  return w;
}

interface Running {
  view: HTMLElement;
  update(b: Breath): void;
}

// The running view is built once and updated every frame: the core size each time, the
// text only when it changes.
function runningView(s: BreathStrings): Running {
  const w = el('div', 'v-card flush wd-breath');
  const rings = ringsView(CORE_MIN);
  const c = caption();
  w.append(rings.box, c.box);
  let shown = '';
  return {
    view: w,
    update(b) {
      const d = CORE_MIN + CORE_SPAN * b.scale;
      rings.core.style.width = rings.core.style.height = `${d}px`;
      const key = `${b.phase} ${b.left} ${b.cycle}`;
      if (key === shown) return;
      shown = key;
      c.title.textContent = s.phases[b.phase];
      c.detail.textContent = s.roundOf.replace('{left}', String(b.left)).replace('{cycle}', String(b.cycle)).replace('{n}', String(CYCLES));
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
    show(breathView(s, s.idle));
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
