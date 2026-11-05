import { clampConfig, type NotchConfig } from '../notch/config';
import { connect } from '../notch/connect';
import { NotchController } from '../notch/controller';
import { localPointer } from '../notch/local-pointer';
import { mountNotch } from '../notch/view';
import type { SettingsEnv } from './types';

// The preview never opens a page; this is just the panel's size if clicked.
const PREVIEW_CARD = { width: 360, height: 56 };
// The open panel is the card plus its ears, 12 px each side; it keeps 16 px from
// the box's edges, shrinking the whole preview when the box is narrower.
const PANEL_EARS = 24;
const FIT_MARGIN = 16;

export interface PreviewOptions {
  card?: { width: number; height: number }; // the opened panel's card; PREVIEW_CARD if left out
  body?: HTMLElement; // what the opened panel shows instead of the label
  glass?: boolean; // the panel's fade (Tampilan notch); on if left out
}

export interface Preview {
  readonly controller: NotchController;
  setConfig(c: NotchConfig): void;
  setGlass(on: boolean): void;
  destroy(): void;
}

// A lens without a notch, driven by the same controller and view as the real one,
// so the sliders feel exactly as they will on screen. The 960 × 560 root sits
// centred in the box without a transform, so click coordinates stay true.
export function mountPreview(box: HTMLElement, config: NotchConfig, env: SettingsEnv, label: string, opts: PreviewOptions = {}): Preview {
  const doc = box.ownerDocument;
  box.classList.add('preview');
  const root = doc.createElement('div');
  root.className = 'preview-root';
  box.append(root);

  const card = opts.card ?? PREVIEW_CARD;
  const controller = new NotchController({ notch: null, config: clampConfig(config), card, setTimer: env.setTimer });
  const pointer = localPointer(root, box);
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
  view.setGlass(opts.glass ?? true);
  if (opts.body) {
    view.content.append(opts.body);
  } else {
    const text = doc.createElement('div');
    text.className = 'preview-label';
    text.textContent = label;
    view.content.append(text);
  }
  view.kick();

  // Scaled down, never up, so the open panel fits the box (--fit in settings.css).
  const fit = () => {
    const avail = box.clientWidth;
    if (!avail) return;
    const k = Math.min(1, avail / (card.width + PANEL_EARS + 2 * FIT_MARGIN));
    box.style.setProperty('--fit', k.toFixed(4));
  };
  const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
  watch?.observe(box);
  fit();

  return {
    controller,
    setConfig(c: NotchConfig): void {
      controller.setConfig(clampConfig(c));
      view.kick();
    },
    setGlass(on: boolean): void {
      view.setGlass(on);
      view.kick();
    },
    destroy(): void {
      watch?.disconnect();
      view.destroy();
      wiring.dispose();
      pointer.dispose();
      root.remove();
    },
  };
}
