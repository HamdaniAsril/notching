import { beforeEach, vi } from 'vitest';
import type { Bridge, PointerUpdate } from '../bridge';
import { DEFAULT_CONFIG, type NotchConfig } from './config';
import { NotchController, PLACEHOLDER_CARD } from './controller';
import type { NotchSize } from './shape';
import type { ViewDeps } from './view';

interface PendingTimer { at: number; fn: () => void }

// Fake setTimer: callbacks run only when a test advances the clock.
export const timers = {
  now: 0,
  pending: [] as PendingTimer[],
  setTimer: (fn: () => void, ms: number): (() => void) => {
    const entry = { at: timers.now + ms, fn };
    timers.pending.push(entry);
    return () => { timers.pending = timers.pending.filter(t => t !== entry); };
  },
  advance(ms: number): void {
    const end = timers.now + ms;
    for (;;) {
      const due = timers.pending.filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers.pending = timers.pending.filter(t => t !== due);
      timers.now = due.at;
      due.fn();
    }
    timers.now = end;
  },
  reset(): void { timers.now = 0; timers.pending = []; },
};

beforeEach(() => timers.reset());

export function ctl(notch: NotchSize | null, override: Partial<NotchConfig> = {}): NotchController {
  return new NotchController({
    notch,
    config: { ...DEFAULT_CONFIG, ...override },
    card: PLACEHOLDER_CARD,
    setTimer: timers.setTimer,
  });
}

export function frames(c: NotchController, n: number): void {
  for (let i = 0; i < n; i++) c.frame(1 / 60);
}

export function runUntilNear(c: NotchController): void {
  for (let i = 0; i < 600 && !c.contentVisible; i++) c.frame(1 / 60);
  if (!c.contentVisible) throw new Error('panel never got near its open size');
}

// Fake requestAnimationFrame: frames run only when a test asks for them.
export function fakeRaf() {
  let queue = new Map<number, (now: number) => void>();
  let nextId = 1;
  let now = 0;
  return {
    raf: (cb: (now: number) => void): number => { queue.set(nextId, cb); return nextId++; },
    caf: (id: number): void => { queue.delete(id); },
    runAll(maxFrames: number): void {
      for (let i = 0; i < maxFrames && queue.size > 0; i++) {
        const due = [...queue.values()];
        queue = new Map();
        now += 1000 / 60;
        for (const cb of due) cb(now);
      }
    },
    pending: (): number => queue.size,
  };
}

export function deps(r: ReturnType<typeof fakeRaf>): ViewDeps {
  return { raf: r.raf, caf: r.caf, onHitRects: vi.fn(), onPhase: vi.fn(), onQuit: vi.fn() };
}

// Bridge whose methods are mocks; emit* plays the native side's events.
export function fakeBridge() {
  const pointer = new Set<(p: PointerUpdate) => void>();
  const resign = new Set<() => void>();
  const bridge = {
    screenInfo: vi.fn(async () => ({ label: 'test', hasNotch: false, notchWidth: 0, notchHeight: 0 })),
    setHitRects: vi.fn(async () => {}),
    setPanelKey: vi.fn(async () => {}),
    onPointer: vi.fn((cb: (p: PointerUpdate) => void) => { pointer.add(cb); return () => { pointer.delete(cb); }; }),
    onResignKey: vi.fn((cb: () => void) => { resign.add(cb); return () => { resign.delete(cb); }; }),
    quit: vi.fn(async () => {}),
    emitPointer: (p: PointerUpdate) => pointer.forEach(cb => cb(p)),
    emitResignKey: () => resign.forEach(cb => cb()),
  };
  return bridge satisfies Bridge;
}
