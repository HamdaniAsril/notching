import { startApp } from './app';
import { tauriBridge } from './bridge';
import { browserBridge } from './bridge-browser';

async function start(): Promise<void> {
  const root = document.getElementById('notch-root')!;
  const bridge = '__TAURI_INTERNALS__' in window ? tauriBridge() : browserBridge(root);
  await startApp(root, bridge, {
    raf: cb => requestAnimationFrame(cb),
    caf: id => cancelAnimationFrame(id),
    setTimer: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
  });
}

void start();
