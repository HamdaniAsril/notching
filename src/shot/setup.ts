import type { ShotSetup } from '../bridge';
import { fill, hostStrings } from '../i18n';
import { button, el, type ShotDeps } from './common';

export interface ShotSetupView {
  render(setup: ShotSetup): void;
  destroy(): void;
}

// Screenshot's first-use notice (design 3 Nov tombol §4): which keys don't reach
// Notching, and the ways out. Keys the Mac holds: turn the Mac's off (System
// Settings) or use one's own keys (Settings › Modul › Screenshot). Keys another app
// holds: only one's own keys. Either way the panel closes once the window is asked for.
export function mountShotSetup(box: HTMLElement, deps: Pick<ShotDeps, 'lang' | 'close' | 'shotTurnOffMac' | 'openShotKeySettings'>): ShotSetupView {
  const doc = box.ownerDocument;
  const s = hostStrings(deps.lang).shot.setup;
  let built = '';

  function action(text: string, run: () => Promise<void>, primary: boolean): HTMLButtonElement {
    const b = button(doc, primary ? 'shot-btn primary' : 'shot-btn', text);
    b.addEventListener('click', () => {
      run().catch(e => console.error('notching: screenshot setup', e));
      void deps.close();
    });
    return b;
  }

  return {
    render(setup) {
      const sig = JSON.stringify(setup);
      if (sig === built) return;
      built = sig;
      const mac = setup.holder === 'mac';
      const wrap = el(doc, 'div', 'shot-setup');
      const btns = el(doc, 'div', 'shot-btns');
      if (mac) btns.append(action(s.turnOff, deps.shotTurnOffMac, true));
      btns.append(action(s.own, deps.openShotKeySettings, !mac));
      wrap.append(
        el(doc, 'div', 'shot-lab', s.label),
        el(doc, 'div', 'shot-setup-title', fill(mac ? s.macTitle : s.otherTitle, { keys: setup.keys })),
        el(doc, 'div', 'shot-setup-text', mac ? s.macText : s.otherText),
        btns,
      );
      box.replaceChildren(wrap);
    },
    destroy() {
      box.replaceChildren();
    },
  };
}
