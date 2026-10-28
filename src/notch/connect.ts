import type { Bridge } from '../bridge';
import type { NotchController, Phase } from './controller';
import { OVERLAY_SIZE } from './hit';
import type { ViewDeps } from './view';

// The part of the bridge the notch's own wiring uses.
export type NotchWiring = Pick<Bridge, 'setHitRects' | 'setPanelKey' | 'onPointer' | 'onResignKey' | 'quit'>;

// Wires the controller and view to the native side.
export function connect(
  c: NotchController,
  bridge: NotchWiring,
  kick: () => void,
): Pick<ViewDeps, 'onHitRects' | 'onPhase' | 'onQuit'> & { dispose(): void } {
  let last: Phase = c.phase;

  const offPointer = bridge.onPointer(p => {
    c.pointer(p.inside, p.x - OVERLAY_SIZE.w / 2);
    kick();
  });
  const offResign = bridge.onResignKey(() => {
    c.resignKey();
    kick();
  });

  return {
    onHitRects: rects => void bridge.setHitRects(rects),
    onPhase: phase => {
      // Key status only while the panel is open, so Esc reaches it; leaving open
      // hands typing straight back to the previous app.
      if (phase === 'open') void bridge.setPanelKey(true);
      else if (last === 'open') void bridge.setPanelKey(false);
      last = phase;
    },
    onQuit: () => void bridge.quit(),
    dispose: () => {
      offPointer();
      offResign();
    },
  };
}
