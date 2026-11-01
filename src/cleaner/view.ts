import type { Bridge, CleanerOutcome } from '../bridge';
import { hostStrings } from '../i18n';
import type { Lang } from '../kit/protocol';
import { mountClean, type Plan } from './clean';
import { el } from './dom';
import { SCAN_TTL_MS } from './format';
import { mountHome } from './home';
import { mountRun, type Skipped } from './run';
import { mountUninstall } from './uninstall';

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

type Screen = 'home' | 'clean' | 'uninstall' | 'run';

// Cleaner in the notch (design 1 Nov §4–§6): one screen at a time, kept while
// the panel is away for less than 10 minutes (§4); past that, the start view
// measures again. A run goes on in the core whatever the panel does; its
// progress and result come as events.
export function mountCleaner(box: HTMLElement, deps: CleanerDeps): CleanerView {
  const doc = box.ownerDocument;
  const s = hostStrings(deps.lang).cleaner;
  let hiddenAt: number | null = null;
  let fresh = true;
  let note = false;
  let screen: Screen = 'home';
  let running = false;
  let labels = (_id: number) => '';
  let back: () => void = () => showHome();

  const homeBox = el(doc, 'div', 'cl-screen');
  const cleanBox = el(doc, 'div', 'cl-screen');
  const runBox = el(doc, 'div', 'cl-screen');
  const uninstallBox = el(doc, 'div', 'cl-screen');

  const home = mountHome(homeBox, {
    bridge: deps.bridge,
    lang: deps.lang,
    strings: s,
    onClean: () => showClean(),
    onUninstall: () => showUninstall(),
    onDisk: () => {},
    onNote: n => {
      note = n;
      if (screen === 'home') deps.resize('home', note);
    },
  });

  const clean = mountClean(cleanBox, {
    bridge: deps.bridge,
    lang: deps.lang,
    strings: s,
    get fda() { return !note; },
    back: () => showHome(),
    clean: (scanId, ids, plan) => void ask(scanId, ids, plan, null, 'clean'),
  });

  const uninstall = mountUninstall(uninstallBox, {
    bridge: deps.bridge,
    lang: deps.lang,
    strings: s,
    back: () => showHome(),
    remove: (scanId, ids, plan, appId, name) => void ask(scanId, ids, plan, appId, 'uninstall', name),
  });

  const run = mountRun(runBox, {
    lang: deps.lang,
    strings: s,
    onStop: () => void deps.bridge.cleanerStop().catch(() => {}),
    onDone: () => showHome(),
    onReveal: id => void deps.bridge.cleanerReveal(id).catch(() => {}),
  });

  function show(next: Screen, child: HTMLElement): void {
    screen = next;
    box.replaceChildren(child);
    deps.resize(next === 'home' ? 'home' : 'list', note);
  }

  function showHome(): void {
    show('home', homeBox);
    home.refresh();
  }

  function showClean(refresh = true): void {
    back = () => showClean(false);
    show('clean', cleanBox);
    if (refresh) clean.refresh();
  }

  function showUninstall(): void {
    back = () => show('uninstall', uninstallBox);
    show('uninstall', uninstallBox);
    uninstall.refresh();
  }

  // The last question, then the run; a scan past its time is scanned again (§5.3).
  async function ask(scanId: number, ids: number[], plan: Plan, appId: number | null, kind: 'clean' | 'uninstall', name?: string): Promise<void> {
    const backTo = back;
    show('run', runBox);
    if (!(await run.confirm(plan, kind, name))) {
      if (screen === 'run' && !running) backTo();
      return;
    }
    labels = kind === 'clean' ? id => clean.label(id) : id => uninstall.label(id);
    try {
      running = true;
      run.progress(0, ids.length);
      await deps.bridge.cleanerRun(scanId, ids, appId);
    } catch (e) {
      running = false;
      if (e === 'stale') {
        if (kind === 'clean') showClean(true);
        else backTo();
      } else {
        const why = e === 'exclusions' ? s.exclusionsBroken : e === 'busy' ? s.busy : String(e);
        run.result(0, []);
        runBox.querySelector('.cl-skips')?.append(el(doc, 'div', 'cl-skip', why));
      }
    }
  }

  const off = deps.bridge.onCleaner(e => {
    if (e.phase === 'progress') {
      if (running && screen === 'run') run.progress(e.done, e.total);
      return;
    }
    running = false;
    const skipped: Skipped[] = e.outcomes
      .filter((o): o is CleanerOutcome & { skip: NonNullable<CleanerOutcome['skip']> } => o.skip !== null)
      .map(o => ({ id: o.id, label: labels(o.id), reason: o.skip, admin: o.detail === 'admin' }));
    show('run', runBox);
    run.result(e.freed, skipped);
  });

  return {
    shown() {
      const away = hiddenAt === null ? Infinity : deps.now() - hiddenAt;
      hiddenAt = null;
      void deps.bridge.cleanerSeen().catch(() => {});
      if (fresh || (away > SCAN_TTL_MS && !running)) {
        fresh = false;
        showHome();
        return;
      }
      if (screen === 'clean') {
        deps.bridge.cleanerRunning(clean.scan()).then(ids => clean.inUse(ids), () => {});
      }
      if (screen === 'uninstall') uninstall.revisit();
    },
    hidden() {
      hiddenAt = deps.now();
      run.cancel();
      void deps.bridge.cleanerCancelScans().catch(() => {});
    },
    destroy() {
      off();
      home.destroy();
      clean.destroy();
      uninstall.destroy();
    },
  };
}
