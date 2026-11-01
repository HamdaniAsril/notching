import type { Bridge } from '../bridge';
import { hostStrings } from '../i18n';
import type { Lang } from '../kit/protocol';
import { SCAN_TTL_MS } from './format';
import { el } from './dom';
import { mountHome } from './home';

// What Cleaner's pages ask of the core, as the bridge has it.
export type CleanerBridge = Pick<Bridge,
  | 'cleanerOverview' | 'cleanerParts' | 'cleanerDeepScan' | 'cleanerApps' | 'cleanerAppDetail' | 'cleanerBreakdown'
  | 'cleanerRun' | 'cleanerStop' | 'cleanerCancelScans' | 'cleanerRunning' | 'cleanerReveal' | 'cleanerRevealPath'
  | 'cleanerExclude' | 'cleanerSeen' | 'openFullDiskAccessSettings' | 'onCleaner'>;

export interface CleanerDeps {
  bridge: CleanerBridge;
  lang: Lang;
  now(): number;
  resize(screen: 'home' | 'list', note: boolean): void; // the panel's size follows the screen
}

export interface CleanerView {
  shown(): void; // the panel shows Cleaner (again)
  hidden(): void; // the panel closed or went to another page
  destroy(): void;
}

// Cleaner in the notch (design 1 Nov §4–§6): one screen at a time, kept while
// the panel is away for less than 10 minutes (§4); past that, the start view
// measures again.
export function mountCleaner(box: HTMLElement, deps: CleanerDeps): CleanerView {
  const doc = box.ownerDocument;
  const strings = hostStrings(deps.lang).cleaner;
  let hiddenAt: number | null = null;
  let fresh = true;
  let note = false;

  const homeBox = el(doc, 'div', 'cl-screen');
  const home = mountHome(homeBox, {
    bridge: deps.bridge,
    lang: deps.lang,
    strings,
    onClean: () => {},
    onUninstall: () => {},
    onDisk: () => {},
    onNote: n => {
      note = n;
      deps.resize('home', note);
    },
  });

  function showHome(): void {
    box.replaceChildren(homeBox);
    deps.resize('home', note);
    home.refresh();
  }

  return {
    shown() {
      const away = hiddenAt === null ? Infinity : deps.now() - hiddenAt;
      void deps.bridge.cleanerSeen().catch(() => {});
      if (fresh || away > SCAN_TTL_MS) {
        fresh = false;
        showHome();
      }
      hiddenAt = null;
    },
    hidden() {
      hiddenAt = deps.now();
      void deps.bridge.cleanerCancelScans().catch(() => {});
    },
    destroy() {
      home.destroy();
    },
  };
}
