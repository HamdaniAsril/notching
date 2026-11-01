import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { syncUnlisten, type Shot } from '../bridge';
import type { EditorBridge, EditorDoc } from './view';

// editor_commit's raw body: the edits as UTF-8, then the PNG (nothing when there
// is none). A picture of several MB goes as bytes, never as JSON.
export function commitBody(edits: string, png: Uint8Array | null): { body: Uint8Array; editsLength: number } {
  const text = new TextEncoder().encode(edits);
  const body = new Uint8Array(text.length + (png?.length ?? 0));
  body.set(text);
  if (png) body.set(png, text.length);
  return { body, editsLength: text.length };
}

// The native side: commands in src-tauri/src/editor_window.rs. The close request
// comes to this window only; the list goes to every window.
export function tauriEditorBridge(): EditorBridge {
  const win = getCurrentWebviewWindow();
  return {
    doc: () => invoke<EditorDoc | null>('editor_doc'),
    commit: async (id, edits, png, action) => {
      const { body, editsLength } = commitBody(edits, png ? new Uint8Array(await png.arrayBuffer()) : null);
      return invoke<string | null>('editor_commit', body, {
        headers: { 'Notching-Id': String(id), 'Notching-Action': action, 'Notching-Edits-Length': String(editsLength) },
      });
    },
    close: () => invoke('editor_close'),
    closing: () => invoke('editor_closing'),
    onClose: cb => syncUnlisten(win.listen('notching://editor-close', () => cb())),
    onShots: cb => syncUnlisten(listen<Shot[]>('notching://shots', e => cb(e.payload))),
  };
}

const SAMPLE = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1470" height="859"><rect width="1470" height="859" fill="#eef0f3"/>'
  + '<rect x="60" y="120" width="800" height="40" rx="20" fill="#d7dae0"/><rect x="60" y="200" width="1200" height="40" rx="20" fill="#d7dae0"/></svg>',
);

// For `npm run dev`: a sample screenshot; commits are logged.
export function browserEditorBridge(): EditorBridge {
  return {
    doc: async () => ({ id: 1, width: 2940, height: 1718, original: SAMPLE, edits: null, wallpaper: null }),
    commit: async (id, edits, png, action) => {
      console.info('editor commit', { id, edits, png, action });
      return action === 'save' ? '~/Desktop/Screenshot.png' : null;
    },
    close: async () => console.info('editor close'),
    closing: async () => {},
    onClose: () => () => {},
    onShots: () => () => {},
  };
}
