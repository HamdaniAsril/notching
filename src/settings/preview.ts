import { clampConfig, type NotchConfig } from '../notch/config';
import { connect } from '../notch/connect';
import { NotchController } from '../notch/controller';
import { localPointer } from '../notch/local-pointer';
import { mountNotch } from '../notch/view';
import type { SettingsEnv } from './types';

// The preview never opens a page; this is just the panel's size if clicked.
const PREVIEW_CARD = { width: 360, height: 56 };

export interface Preview {
  readonly controller: NotchController;
  setConfig(c: NotchConfig): void;
  destroy(): void;
}

// A lens without a notch, driven by the same controller and view as the real one,
// so the sliders feel exactly as they will on screen. The 960 × 560 root sits
// centred in the box without a transform, so click coordinates stay true.
export function mountPreview(box: HTMLElement, config: NotchConfig, env: SettingsEnv, label: string): Preview {
  const doc = box.ownerDocument;
  box.classList.add('preview');
  const root = doc.createElement('div');
  root.className = 'preview-root';
  box.append(root);

  const controller = new NotchController({ notch: null, config: clampConfig(config), card: PREVIEW_CARD, setTimer: env.setTimer });
  const pointer = localPointer(root);
  const wiring = connect(controller, { ...pointer, setPanelKey: async () => {}, quit: async () => {} }, () => view.kick());
  const view = mountNotch(root, controller, {
    raf: env.raf,
    caf: env.caf,
    onHitRects: wiring.onHitRects,
    onPhase: wiring.onPhase,
    onQuit: () => {},
    onSelect: () => {},
    onMore: () => {},
  });
  view.setPill([], null, label);
  const text = doc.createElement('div');
  text.className = 'preview-label';
  text.textContent = label;
  view.content.append(text);
  view.kick();

  return {
    controller,
    setConfig(c: NotchConfig): void {
      controller.setConfig(clampConfig(c));
      view.kick();
    },
    destroy(): void {
      view.destroy();
      wiring.dispose();
      pointer.dispose();
      root.remove();
    },
  };
}
