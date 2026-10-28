import { browserSettingsBridge } from './bridge-browser';
import { mountSettings } from './shell';

async function start(): Promise<void> {
  const root = document.getElementById('settings-root')!;
  const bridge = browserSettingsBridge(new URLSearchParams(location.search));
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
