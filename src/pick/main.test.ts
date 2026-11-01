// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';

const globalListen = vi.fn(async () => () => {});
const windowListen = vi.fn(async () => () => {});
const invoke = vi.fn(async (): Promise<unknown> => null);
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...(args as [])) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: (...args: unknown[]) => globalListen(...(args as [])) }));
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({ listen: (...args: unknown[]) => windowListen(...(args as [])) }),
}));

const { start } = await import('./main');

// Every pick panel gets its own screen's state with `emit_to`: a global listener
// would hear all of them, the last one winning.
test('a pick panel hears its own state only, then asks for it', async () => {
  document.body.innerHTML = '<div id="pick-root"></div>';
  await start();
  expect(windowListen.mock.calls.map(c => (c as unknown[])[0])).toEqual(['notching://pick']);
  expect(globalListen).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledWith('shot_pick_state');
});
