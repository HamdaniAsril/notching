import './peek.css';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { pointPeek, renderPeek, type PeekCalls, type PeekView } from './view';

// The peek card's panel (peek_service.rs): drawn from each view the native
// side sends, which tells it back its size, the pointer and the clicks.
const root = document.getElementById('peek-root')!;
const calls: PeekCalls = {
  size: (width, height) => void invoke('peek_size', { width, height }),
  pointer: inside => void invoke('peek_pointer', { inside }),
  open: id => void invoke('peek_open', { id }),
  act: (id, act) => void invoke('peek_act', { id, act }),
  hover: id => void invoke('peek_hover', { id }),
  picture: id => invoke<string | null>('peek_picture', { id, full: false }).catch(() => null),
};
const show = (v: PeekView | null) => {
  if (v) renderPeek(root, v, calls);
  else root.replaceChildren();
};
void getCurrentWebviewWindow().listen<PeekView | null>('notching://peek', e => show(e.payload));
// Where the pointer is on the card, in its points, or null off it (peek_service.rs).
void getCurrentWebviewWindow().listen<{ x: number; y: number } | null>('notching://peek-pointer', e => {
  const at = e.payload;
  pointPeek(root, at ? document.elementFromPoint(at.x, at.y) : null, calls);
});
void invoke<PeekView | null>('peek_view').then(show, () => {});
