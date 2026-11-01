import { invoke } from '@tauri-apps/api/core';
import type { Lang } from '../kit/protocol';
import type { ModuleState } from '../modules/types';
import { browserEditorBridge, tauriEditorBridge } from './bridge';
import { mountEditor } from './view';

// `npm run dev` shows a sample screenshot; `?lang=en` shows it in English.
async function start(): Promise<void> {
  const root = document.getElementById('editor-root')!;
  const tauri = '__TAURI_INTERNALS__' in window;
  let lang: Lang = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'id';
  if (tauri) {
    try {
      lang = (await invoke<ModuleState>('get_module_state')).lang;
    } catch (e) {
      console.error('notching: no language for the editor', e);
    }
  }
  document.documentElement.lang = lang;
  await mountEditor(root, { bridge: tauri ? tauriEditorBridge() : browserEditorBridge(), lang });
}

void start();
