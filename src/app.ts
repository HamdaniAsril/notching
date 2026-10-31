import type { Bridge, LiveStatus, Notice } from './bridge';
import { hostStrings } from './i18n';
import type { ModuleState } from './modules/types';
import { clampConfig, type NotchConfig } from './notch/config';
import { connect } from './notch/connect';
import { NotchController, type Phase } from './notch/controller';
import { mountPageView } from './notch/page-view';
import { mountNotch, type NotchView } from './notch/view';
import { mountFrameHost } from './pages/frames';
import { MODULES_ICON, pageIconSvg } from './pages/icons';
import { missedTargets, noticeTarget, pageName, pickPage, resolvePage, type PageView, viewSize } from './pages/route';

// Notices that arrive while the panel is open wait; past this many, the oldest go.
export const NOTICE_QUEUE_MAX = 5;

export interface AppEnv {
  raf: (cb: (now: number) => void) => number;
  caf: (id: number) => void;
  setTimer: (fn: () => void, ms: number) => () => void;
}

export interface App {
  readonly controller: NotchController;
  readonly view: NotchView;
  destroy(): void;
}

// One notch overlay: the controller and view from plan 1, showing pages: Beranda,
// the custom pages, the Modul page and module pages (design 30 Oct).
export async function startApp(root: HTMLElement, bridge: Bridge, env: AppEnv): Promise<App> {
  const doc = root.ownerDocument;
  const [info, initial] = await Promise.all([bridge.screenInfo(), bridge.moduleState()]);
  let state: ModuleState = initial;
  let strings = hostStrings(state.lang);
  let page: PageView = pickPage(state, null, false);
  let lastPhase: Phase = 'idle';
  let fullHeight: number | undefined; // what the open full view asked for

  const queue: Notice[] = [];
  let showing: Notice | null = null;
  doc.documentElement.lang = state.lang;

  const controller = new NotchController({
    notch: info.hasNotch ? { width: info.notchWidth, height: info.notchHeight } : null,
    config: clampConfig(state.notch),
    card: viewSize(page),
    setTimer: env.setTimer,
  });
  const wiring = connect(controller, bridge, () => view.kick());
  const view = mountNotch(root, controller, {
    raf: env.raf,
    caf: env.caf,
    onHitRects: wiring.onHitRects,
    onQuit: wiring.onQuit,
    onPhase,
    onSelect: id => go(id),
    onMore,
  });
  const frames = mountFrameHost({
    bridge,
    setTimer: env.setTimer,
    onKey: key => {
      if (key === 'Quit') {
        wiring.onQuit();
        return;
      }
      controller.escape();
      view.kick();
    },
    onExpand: (key, height) => expand(key, height),
    onCollapse: () => collapse(),
  }, doc);
  const pages = mountPageView(view.content, {
    frames,
    moduleUrl: bridge.moduleUrl,
    onOpenModule: id => go(`module:${id}`),
    onBack: () => go('modules'),
  });

  const isOpen = () => controller.phase === 'open';

  function showPage(): void {
    if (isOpen()) pages.show(page, state, strings);
  }

  // Frames live only while the panel is up.
  function onPhase(phase: Phase): void {
    wiring.onPhase(phase);
    if (phase === 'open') {
      // A notice clicked open shows the page holding the widget that sent it.
      const target = showing && noticeTarget(state, showing.moduleId, showing.channel);
      const to = target ? resolvePage(state, target) : null;
      if (to && to.key !== page.key) {
        usePage(to);
        renderPill();
        void bridge.setLastPage(to.key);
      }
      pages.show(page, state, strings);
      endNotice();
    } else if (lastPhase === 'open') {
      // Seen: the pill showed the dots while the panel was open.
      if (state.missed.length > 0) void bridge.clearMissed();
    } else if (lastPhase === 'closing' && (phase === 'idle' || phase === 'hover')) {
      pages.clear();
      if (fullHeight !== undefined) usePage(page);
      endNotice();
      pump();
    }
    lastPhase = phase;
  }

  function endNotice(): void {
    showing = null;
    view.setNotice(null);
  }

  // Shows the next waiting notice, once the notch is at rest.
  function pump(): void {
    const phase = controller.phase;
    if (showing || queue.length === 0 || (phase !== 'idle' && phase !== 'hover')) return;
    const next = queue.shift()!;
    showing = next;
    const from = state.modules.find(m => m.id === next.moduleId && m.installed && m.enabled);
    view.setNotice({
      icon: from ? bridge.moduleUrl(from.id, from.icon) : null, title: next.title, detail: next.detail, glow: next.glow,
    });
    controller.notify(next.seconds * 1000);
    view.kick();
  }

  const offNotice = bridge.onNotice(n => {
    queue.push(n);
    if (queue.length > NOTICE_QUEUE_MAX) queue.shift();
    pump();
  });

  // The status beside the notch shows on the cursor's screen only; the view
  // hides it while a notice or the panel is up.
  const showStatus = (s: LiveStatus | null) => view.setStatus(s && s.screen === info.label ? s.text : null);
  const offStatus = bridge.onStatus(showStatus);
  showStatus(await bridge.status());

  function renderPill(): void {
    const missed = missedTargets(state);
    const items = [
      ...state.pages.map(p => ({ id: p.id, label: pageName(p, strings), svg: pageIconSvg(p.icon), missed: missed.has(p.id) })),
      { id: 'modules', label: strings.modules, svg: MODULES_ICON, missed: missed.has('modules') },
    ];
    view.setPill(items, page.kind === 'custom' ? page.key : 'modules', strings.settings);
    view.setMissed(state.missed.length > 0);
  }

  function usePage(next: PageView): void {
    page = next;
    fullHeight = undefined;
    controller.setCard(viewSize(next));
  }

  // A full view may ask for a taller page; the panel springs back when it ends.
  function expand(key: string, height?: number): void {
    const size = viewSize(page, height);
    pages.expand(key, size.height);
    if (pages.full !== key) return;
    fullHeight = height;
    controller.setCard(size);
    view.kick();
  }

  function collapse(): void {
    pages.collapse();
    if (fullHeight === undefined) return;
    fullHeight = undefined;
    controller.setCard(viewSize(page));
    view.kick();
  }

  // From the pill, a Modul tile or a back bar.
  function go(key: string): void {
    if (key === page.key) {
      collapse();
      return;
    }
    const next = resolvePage(state, key);
    if (!next) return;
    usePage(next);
    showPage();
    renderPill();
    void bridge.setLastPage(key);
    view.kick();
  }

  function onMore(): void {
    controller.escape();
    view.kick();
    void bridge.openSettings();
  }

  const sameConfig = (a: NotchConfig, b: NotchConfig) =>
    a.bounce === b.bounce && a.speed === b.speed && a.dropDepth === b.dropDepth && a.thickness === b.thickness;

  const offState = bridge.onModuleState(next => {
    state = next;
    strings = hostStrings(next.lang);
    doc.documentElement.lang = next.lang;
    const picked = pickPage(next, page.key, isOpen());
    const size = viewSize(picked, picked.key === page.key ? fullHeight : undefined);
    if (picked.key !== page.key || size.width !== controller.card.width || size.height !== controller.card.height) usePage(picked);
    else page = picked;
    // The page view keeps its frames when nothing it shows has changed.
    showPage();
    const config = clampConfig(next.notch);
    if (!sameConfig(config, controller.config)) controller.setConfig(config);
    renderPill();
    view.kick();
  });

  // An overlay whose screen went away is ordered out. It gets no animation frames
  // there, so its close never reaches 'idle'; the widgets must stop anyway.
  function onVisibility(): void {
    if (doc.visibilityState === 'hidden') pages.clear();
    else showPage();
  }
  doc.addEventListener('visibilitychange', onVisibility);

  renderPill();
  view.kick();

  return {
    controller,
    view,
    destroy(): void {
      doc.removeEventListener('visibilitychange', onVisibility);
      offState();
      offNotice();
      offStatus();
      frames.destroy();
      view.destroy();
      wiring.dispose();
    },
  };
}
