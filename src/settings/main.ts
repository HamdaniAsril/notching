import { browserSettingsBridge } from './bridge-browser';
import { tauriSettingsBridge } from './bridge-tauri';
import { mountSettings } from './shell';
import { platform } from '../kit/platform';

async function start(): Promise<void> {
  // The see-through glass needs macOS vibrancy; elsewhere the window is opaque.
  document.documentElement.dataset.platform = platform();
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
  });
}

void start();
