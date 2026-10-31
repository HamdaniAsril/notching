import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { cleanStrings } from '../i18n';
import type { Lang } from '../kit/protocol';
import { renderClean } from './view';

// Same shape as CleanStateDto in src-tauri/src/keyclean_service.rs.
interface CleanState {
  on: boolean;
  presses: number;
  lang: Lang;
}

// One dim panel per screen (keyclean_dim.rs). In a normal browser,
// `?presses=2&lang=en` shows how it looks.
async function start(): Promise<void> {
  const root = document.getElementById('clean-root')!;
  let lang: Lang | null = null;
  let view: ReturnType<typeof renderClean> | null = null;
  const show = (s: CleanState) => {
    if (s.lang !== lang || !view) {
      lang = s.lang;
      document.documentElement.lang = s.lang;
      view = renderClean(root, cleanStrings(s.lang));
    }
    view.update(s.presses);
  };
  if (!('__TAURI_INTERNALS__' in window)) {
    const q = new URLSearchParams(location.search);
    show({ on: true, presses: Number(q.get('presses') ?? 0), lang: q.get('lang') === 'en' ? 'en' : 'id' });
    return;
  }
  await listen<CleanState>('notching://clean', e => show(e.payload));
  show(await invoke<CleanState>('get_clean_state'));
}

void start();
