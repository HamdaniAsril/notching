import { beforeEach, vi } from 'vitest';
import type { Bridge, PointerUpdate } from '../bridge';
import type { ModuleInfo, ModuleState } from '../modules/types';
import { DEFAULT_CONFIG, type NotchConfig } from './config';
import { type CardSize, NotchController } from './controller';
import type { NotchSize } from './shape';
import type { ViewDeps } from './view';

// The old placeholder card's size, so plan 1's numbers still hold.
export const TEST_CARD: CardSize = { width: 400, height: 90 };

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
    card: TEST_CARD,
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
  return { raf: r.raf, caf: r.caf, onHitRects: vi.fn(), onPhase: vi.fn(), onQuit: vi.fn(), onSelect: vi.fn() };
}

const MODULE_CARDS: Record<string, { width: number; height: number }> = {
  home: { width: 540, height: 72 },
  'system-stat': { width: 480, height: 80 },
};

// A module that is installed and on, with the real modules' card sizes.
export function moduleInfo(id: string, over: Partial<ModuleInfo> = {}): ModuleInfo {
  return {
    id, name: id, description: '', version: '1.0.0', entry: 'index.html', icon: 'icon.svg',
    card: MODULE_CARDS[id] ?? { width: 400, height: 90 }, installed: true, enabled: true, ...over,
  };
}

export const TEST_STATE: ModuleState = {
  lang: 'id',
  modules: [moduleInfo('home'), moduleInfo('system-stat')],
  lastCard: null,
};

// Bridge whose methods are mocks; emit* plays the native side's events.
export function fakeBridge(initial: ModuleState = TEST_STATE) {
  const pointer = new Set<(p: PointerUpdate) => void>();
  const resign = new Set<() => void>();
  const moduleSubs = new Set<(s: ModuleState) => void>();
  let state = initial;
  const bridge = {
    screenInfo: vi.fn(async () => ({ label: 'test', hasNotch: false, notchWidth: 0, notchHeight: 0 })),
    setHitRects: vi.fn(async () => {}),
    setPanelKey: vi.fn(async () => {}),
    onPointer: vi.fn((cb: (p: PointerUpdate) => void) => { pointer.add(cb); return () => { pointer.delete(cb); }; }),
    onResignKey: vi.fn((cb: () => void) => { resign.add(cb); return () => { resign.delete(cb); }; }),
    quit: vi.fn(async () => {}),
    moduleState: vi.fn(async () => state),
    onModuleState: vi.fn((cb: (s: ModuleState) => void) => { moduleSubs.add(cb); return () => { moduleSubs.delete(cb); }; }),
    setLastCard: vi.fn(async (_id: string) => {}),
    moduleCall: vi.fn(async (_m: string, _c: string, _method: string, _args?: unknown): Promise<unknown> => ({})),
    moduleUrl: (id: string, file: string) => `mod://${id}/${file}`,
    moduleSandbox: 'allow-scripts',
    emitPointer: (p: PointerUpdate) => pointer.forEach(cb => cb(p)),
    emitResignKey: () => resign.forEach(cb => cb()),
    emitModuleState: (s: ModuleState) => { state = s; moduleSubs.forEach(cb => cb(s)); },
  };
  return bridge satisfies Bridge;
}
