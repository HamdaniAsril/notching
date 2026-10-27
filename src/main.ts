import { browserBridge } from './bridge';
import { DEFAULT_CONFIG } from './notch/config';
import { NotchController, PLACEHOLDER_CARD } from './notch/controller';
import { OVERLAY_SIZE } from './notch/hit';
import { mountNotch } from './notch/view';

async function start(): Promise<void> {
  const root = document.getElementById('notch-root')!;
  const bridge = browserBridge(root);
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
  const view = mountNotch(root, c, {
    raf: cb => requestAnimationFrame(cb),
    caf: id => cancelAnimationFrame(id),
    onHitRects: rects => void bridge.setHitRects(rects),
    onPhase: () => {},
    onQuit: () => void bridge.quit(),
  });

  bridge.onPointer(p => {
    c.pointer(p.inside, p.x - OVERLAY_SIZE.w / 2);
    view.kick();
  });
  bridge.onResignKey(() => {
    c.resignKey();
    view.kick();
  });
  view.kick();
}

void start();
