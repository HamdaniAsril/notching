import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { followAccent } from './accent-follow';

// followAccent fed by the core: the module state, and its broadcast to every
// window, heard on this window only (the rule for events in src/bridge.ts).
export function followCoreAccent(root: HTMLElement = document.documentElement): Promise<void> {
  return followAccent(root, {
    get: () => invoke<{ accent: string }>('get_module_state'),
    on: cb => { void getCurrentWebviewWindow().listen<{ accent: string }>('notching://module-state', e => cb(e.payload)); },
  });
}
