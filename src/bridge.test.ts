import { beforeEach, expect, test, vi } from 'vitest';

const globalListen = vi.fn(async () => () => {});
const windowListen = vi.fn(async () => () => {});
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: (...args: unknown[]) => globalListen(...(args as [])) }));
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({ listen: (...args: unknown[]) => windowListen(...(args as [])) }),
}));

const { tauriBridge } = await import('./bridge');

beforeEach(() => {
  globalListen.mockClear();
  windowListen.mockClear();
});

const heard = (listen: typeof globalListen) => listen.mock.calls.map(c => (c as unknown[])[0]);

// Rust sends these with `emit_to`: a global listener would hear every window's.
test('events sent to one overlay are heard on this window only', () => {
  const b = tauriBridge();
  const cb = () => {};
  b.onShot(cb);
  b.onShotDrag(cb);
  b.onShelfDrop(cb);
  b.onShelfDrag(cb);
  b.onNotice(cb);
  b.onPointer(cb);
  b.onResignKey(cb);
  expect(heard(windowListen)).toEqual([
    'notching://shot', 'notching://shot-drag', 'notching://shelf-drop', 'notching://shelf-drag',
    'notching://notice', 'notch://pointer', 'notch://resign-key',
  ]);
  expect(globalListen).not.toHaveBeenCalled();
});

// Rust broadcasts these with `app.emit`.
test('broadcasts are heard app-wide', () => {
  const b = tauriBridge();
  const cb = () => {};
  b.onShots(cb);
  b.onShelf(cb);
  b.onStatus(cb);
  b.onModuleState(cb);
  b.onMedia(cb);
  expect(heard(globalListen)).toEqual([
    'notching://shots', 'notching://shelf', 'notching://status', 'notching://module-state', 'notching://media',
  ]);
  expect(windowListen).not.toHaveBeenCalled();
});
