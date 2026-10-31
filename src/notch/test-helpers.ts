import { beforeEach, vi } from 'vitest';
import type { Bridge, LiveStatus, Notice, PointerUpdate, ShelfDrag, ShelfDrop, ShelfState } from '../bridge';
import type { ModuleInfo, ModuleState, Page, WidgetInfo } from '../modules/types';
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
  return {
    raf: r.raf, caf: r.caf, onHitRects: vi.fn(), onPhase: vi.fn(), onQuit: vi.fn(), onSelect: vi.fn(), onMore: vi.fn(),
  };
}

const MODULE_CARDS: Record<string, { width: number; height: number }> = {
  'system-stat': { width: 400, height: 80 },
};

// A module that is installed and on, with the real modules' card sizes.
export function moduleInfo(id: string, over: Partial<ModuleInfo> = {}): ModuleInfo {
  return {
    id, name: id, shortName: id, description: '', version: '1.0.0', entry: 'index.html', icon: 'icon.svg',
    card: MODULE_CARDS[id] ?? { width: 400, height: 90 }, installed: true, enabled: true, size: 0, iconSvg: '',
    channels: [], widgets: [], activity: null, status: false, statusShown: true, action: null, permissions: [], ...over,
  };
}

const widget = (id: string, name: string, width: number, kind: WidgetInfo['kind']): WidgetInfo =>
  ({ id, name, entry: 'index.html', width, kind });

// The built-in widget package, as in modules/home/manifest.json.
export function homeWidgets(over: Partial<ModuleInfo> = {}): ModuleInfo {
  return moduleInfo('home', {
    name: 'Widget bawaan', entry: null, card: null,
    widgets: [
      widget('date', 'Tanggal', 1, 'time'), widget('clock', 'Jam', 1, 'time'), widget('weather', 'Cuaca', 1, 'weather'),
      widget('prayer', 'Waktu sholat', 1, 'worship'), widget('reminders', 'Reminder', 2, 'work'),
    ],
    channels: [
      { id: 'reminder', name: 'Reminder', on: true, sound: true, widget: 'reminders' },
      { id: 'prayer', name: 'Waktu sholat', on: false, sound: false, widget: 'prayer' },
    ],
    ...over,
  });
}

// The Timer module with its strip widget, as in modules/timer/manifest.json.
export function timerInfo(over: Partial<ModuleInfo> = {}): ModuleInfo {
  return moduleInfo('timer', { name: 'Timer', shortName: 'Timer', widgets: [widget('strip', 'Timer', 4, 'work')], ...over });
}

export const BERANDA: Page = {
  id: 'home', name: null, icon: 'home',
  widgets: [
    { widget: 'home/date', col: 0, width: 1 }, { widget: 'home/weather', col: 1, width: 1 },
    { widget: 'home/reminders', col: 2, width: 2 },
  ],
};

export const TEST_STATE: ModuleState = {
  lang: 'id',
  modules: [homeWidgets(), moduleInfo('system-stat')],
  pages: [BERANDA],
  lastPage: null,
  notch: DEFAULT_CONFIG,
  notifications: { glow: true, seconds: 3.5 },
  missed: [],
  sampleStatus: false,
};

// Bridge whose methods are mocks; emit* plays the native side's events.
export function fakeBridge(initial: ModuleState = TEST_STATE) {
  const pointer = new Set<(p: PointerUpdate) => void>();
  const resign = new Set<() => void>();
  const moduleSubs = new Set<(s: ModuleState) => void>();
  const noticeSubs = new Set<(n: Notice) => void>();
  const statusSubs = new Set<(s: LiveStatus | null) => void>();
  const shelfSubs = new Set<(s: ShelfState) => void>();
  const dropSubs = new Set<(e: ShelfDrop) => void>();
  const dragSubs = new Set<(e: ShelfDrag) => void>();
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
    setLastPage: vi.fn(async (_page: string) => {}),
    moduleCall: vi.fn(async (_m: string, _c: string, _method: string, _args?: unknown): Promise<unknown> => ({})),
    moduleUrl: (id: string, file: string) => `mod://${id}/${file}`,
    moduleSandbox: 'allow-scripts',
    openSettings: vi.fn(async () => {}),
    onNotice: vi.fn((cb: (n: Notice) => void) => { noticeSubs.add(cb); return () => { noticeSubs.delete(cb); }; }),
    status: vi.fn(async (): Promise<LiveStatus | null> => null),
    onStatus: vi.fn((cb: (s: LiveStatus | null) => void) => { statusSubs.add(cb); return () => { statusSubs.delete(cb); }; }),
    clearMissed: vi.fn(async () => {}),
    shelf: vi.fn(async (_refresh: boolean): Promise<ShelfState> => ({ items: [] })),
    onShelf: vi.fn((cb: (s: ShelfState) => void) => { shelfSubs.add(cb); return () => { shelfSubs.delete(cb); }; }),
    shelfRemove: vi.fn(async (_ids: number[]) => {}),
    shelfClear: vi.fn(async () => {}),
    shelfStartDrag: vi.fn(async (_ids: number[]) => {}),
    shelfDropReady: vi.fn(async () => {}),
    onShelfDrop: vi.fn((cb: (e: ShelfDrop) => void) => { dropSubs.add(cb); return () => { dropSubs.delete(cb); }; }),
    onShelfDrag: vi.fn((cb: (e: ShelfDrag) => void) => { dragSubs.add(cb); return () => { dragSubs.delete(cb); }; }),
    emitShelf: (s: ShelfState) => shelfSubs.forEach(cb => cb(s)),
    emitShelfDrop: (e: ShelfDrop) => dropSubs.forEach(cb => cb(e)),
    emitShelfDrag: (e: ShelfDrag) => dragSubs.forEach(cb => cb(e)),
    emitNotice: (n: Notice) => noticeSubs.forEach(cb => cb(n)),
    emitStatus: (s: LiveStatus | null) => statusSubs.forEach(cb => cb(s)),
    emitPointer: (p: PointerUpdate) => pointer.forEach(cb => cb(p)),
    emitResignKey: () => resign.forEach(cb => cb()),
    emitModuleState: (s: ModuleState) => { state = s; moduleSubs.forEach(cb => cb(s)); },
  };
  return bridge satisfies Bridge;
}
