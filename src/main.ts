import { browserBridge, tauriBridge } from './bridge';
import { DEFAULT_CONFIG } from './notch/config';
import { connect } from './notch/connect';
import { NotchController, PLACEHOLDER_CARD } from './notch/controller';
import { mountNotch } from './notch/view';

async function start(): Promise<void> {
  const root = document.getElementById('notch-root')!;
  const bridge = '__TAURI_INTERNALS__' in window ? tauriBridge() : browserBridge(root);
  const info = await bridge.screenInfo();

  const c = new NotchController({
    notch: info.hasNotch ? { width: info.notchWidth, height: info.notchHeight } : null,
    config: DEFAULT_CONFIG,
    card: PLACEHOLDER_CARD,
    setTimer: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
  });
  const h = connect(c, bridge, () => view.kick());
  const view = mountNotch(root, c, {
    raf: cb => requestAnimationFrame(cb),
    caf: id => cancelAnimationFrame(id),
    ...h,
  });
  view.kick();
}

void start();
