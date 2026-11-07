import './switcher.css';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { pointSwitcher, renderSwitcher, type SwitchCalls, type SwitchView } from './switcher';
import { setOwnGlass } from './view';

// The switcher's panel (switch_service.rs): drawn from each view the native
// side sends, which tells it back its size, the pointer and the clicks.
const root = document.getElementById('switcher-root')!;
const calls: SwitchCalls = {
  size: (width, height) => void invoke('switch_size', { width, height }),
  pointer: inside => void invoke('switch_pointer', { inside }),
  pick: (index, win) => void invoke('switch_pick', { index, win }),
  open: (index, win) => void invoke('switch_open', { index, win }),
  act: (index, win, act) => void invoke('switch_act', { index, win, act }),
  picture: id => invoke<string | null>('switch_picture', { id }).catch(() => null),
};
const show = (v: SwitchView | null) => {
  if (v) renderSwitcher(root, v, calls);
  else root.replaceChildren();
};
const win = getCurrentWebviewWindow();
void win.listen<SwitchView | null>('notching://switch', e => show(e.payload));
void win.listen<{ x: number; y: number } | null>('notching://switch-pointer', e => {
  const at = e.payload;
  pointSwitcher(root, at ? document.elementFromPoint(at.x, at.y) : null, calls);
});
// Notching's own glass came under the switcher, or went (glass_view.rs).
void win.listen<{ own: boolean; tint: number }>('notching://glass', e => setOwnGlass(root, e.payload.own, e.payload.tint));
void invoke<SwitchView | null>('switch_view').then(show, () => {});
