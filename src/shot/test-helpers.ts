import { vi } from 'vitest';
import type { Shot, ShotEvent, ShotKeys } from '../bridge';
import type { Lang } from '../kit/protocol';

// A screenshot as the core sends it, its pictures at their notchshot: URLs.
export const shot = (id: number, over: Partial<Shot> = {}): Shot => ({
  id, kind: 'window', takenMs: 0, width: 1440, height: 900, saved: false,
  image: `notchshot://localhost/${id}/current.png?v=0`, thumb: `notchshot://localhost/${id}/thumb.png?v=0`, ...over,
});

// Deps for both Screenshot pages, as mocks; emitShot plays the core's event.
export function fakeShotDeps(over: { lang?: Lang; now?: () => number } = {}) {
  const subs = new Set<(e: ShotEvent) => void>();
  return {
    lang: over.lang ?? 'id' as Lang,
    now: over.now ?? (() => 0),
    close: vi.fn(async () => {}),
    back: vi.fn(() => {}),
    onNotes: vi.fn((_n: number) => {}),
    shotCopy: vi.fn(async (_id: number) => {}),
    shotSave: vi.fn(async (_id: number) => '/Users/x/Desktop/Screenshot.png'),
    shotDelete: vi.fn(async (_id: number) => {}),
    shotTakeScreen: vi.fn(async () => {}),
    shotPick: vi.fn(async (_mode: 'window' | 'area') => {}),
    shotStartDrag: vi.fn(async (_id: number) => {}),
    shotKeys: vi.fn(async (): Promise<ShotKeys> => ({ screen: 'ok', pick: 'ok' })),
    shotPermission: vi.fn(async () => true),
    openKeyboardShortcuts: vi.fn(async () => {}),
    openScreenRecordingSettings: vi.fn(async () => {}),
    openEditor: vi.fn(async (_id: number) => {}),
    onShot: vi.fn((cb: (e: ShotEvent) => void) => { subs.add(cb); return () => { subs.delete(cb); }; }),
    emitShot: (e: ShotEvent) => subs.forEach(cb => cb(e)),
  };
}
