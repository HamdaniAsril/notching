import { browserSettingsBridge } from './bridge-browser';
import { tauriSettingsBridge } from './bridge-tauri';
import { mountSettings, parseRoute } from './shell';

async function start(): Promise<void> {
  const root = document.getElementById('settings-root')!;
  const bridge = '__TAURI_INTERNALS__' in window
    ? tauriSettingsBridge()
    : browserSettingsBridge(new URLSearchParams(location.search));
  await mountSettings(root, bridge, {
    raf: cb => requestAnimationFrame(cb),
    caf: id => cancelAnimationFrame(id),
    setTimer: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
  }, parseRoute(new URLSearchParams(location.search).get('route')));
}

void start();
