import type { Bridge, LiveStatus, Notice, ShelfState } from './bridge';
import { hostStrings } from './i18n';
import type { ModuleState } from './modules/types';
import { clampConfig, type NotchConfig } from './notch/config';
import { connect } from './notch/connect';
import { NotchController, type Phase } from './notch/controller';
import { mountPageView } from './notch/page-view';
import type { CardSize } from './notch/controller';
import { LAMP_WING, mountNotch, type LampView, type NotchView } from './notch/view';
import { type FrameSpec, mountFrameHost } from './pages/frames';
import { MODULES_ICON, pageIconSvg } from './pages/icons';
import { missedTargets, noticeTarget, pageName, pickPage, resolvePage, type PageView, SHELF_KEY, viewSize } from './pages/route';
import { SHELF_ICON } from './shelf/view';

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
  const [info, initial, kept] = await Promise.all([bridge.screenInfo(), bridge.moduleState(), bridge.shelf(false)]);
  let state: ModuleState = initial;
  // Titipan (design 1 Nov): the shelf, whether a file drag is over this notch,
  // whether that drag opened the panel, whether the panel closes once the pointer
  // leaves (after a drop), and the page the shelf was opened over.
  let shelf: ShelfState = kept;
  let dropping = false;
  let dragOpened = false;
  let peek = false;
  let beforeShelf: string | null = null;
  let strings = hostStrings(state.lang);
  let page: PageView = pickPage(state, null, false);
  let lastPhase: Phase = 'idle';
  let fullHeight: number | undefined; // what the open full view asked for
  let lamp: (LampView & { key: string }) | null = null; // Cermin's lamp, on the page with this key
  let lampSeq = 0; // the latest lamp change; an older answer from the core is dropped

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
    onLamp: (spec, on, color, glow) => setLamp(spec, on, color, glow),
  }, doc);
  const pages = mountPageView(view.content, {
    frames,
    moduleUrl: bridge.moduleUrl,
    onOpenModule: id => go(`module:${id}`),
    // The panel closes first: the action may dim the screens (Keyboard Cleaning Mode).
    // Titipan's tile opens the shelf instead, which the notch draws itself.
    onAction: m => {
      if (m.action?.capability === SHELF_KEY) {
        openShelf();
        return;
      }
      controller.escape();
      view.kick();
      if (m.action) bridge.moduleCall(m.id, m.action.capability, m.action.method).catch(() => {});
    },
    onBack: () => go('modules'),
    shelf: {
      startDrag: ids => void bridge.shelfStartDrag(ids).catch(() => {}),
      remove: ids => void bridge.shelfRemove(ids),
      clear: () => void bridge.shelfClear(),
    },
  });

  const isOpen = () => controller.phase === 'open';

  const shelfOn = () => state.modules.some(m => m.id === SHELF_KEY && m.installed && m.enabled);
  const shelfPage = (): PageView => ({ kind: 'shelf', key: SHELF_KEY, shelf, dropping });
  // The page to go back to from the shelf.
  const pageBeforeShelf = (): PageView => resolvePage(state, beforeShelf) ?? pickPage(state, null, false);

  // Shows the shelf (as the drop zone while dropping), remembering the page under it.
  function openShelf(): void {
    if (page.kind !== 'shelf') beforeShelf = page.key;
    usePage(shelfPage());
    showPage();
    renderPill();
    view.kick();
  }

  function leaveShelf(): void {
    if (page.kind !== 'shelf') return;
    usePage(pageBeforeShelf());
    showPage();
    renderPill();
    view.kick();
  }

  function closePanel(): void {
    controller.escape();
    view.kick();
  }

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
      } else if (dropping) {
        void bridge.shelfDropReady();
      } else if (!to && shelfOn() && shelf.items.length > 0 && page.kind !== 'shelf') {
        // Kept files come first while there are any (§4).
        beforeShelf = page.key;
        usePage(shelfPage());
        renderPill();
      }
      if (page.kind === 'shelf') void bridge.shelf(true);
      pages.show(page, state, strings);
      endNotice();
    } else if (lastPhase === 'open') {
      // Seen: the pill showed the dots while the panel was open.
      if (state.missed.length > 0) void bridge.clearMissed();
    } else if (lastPhase === 'closing' && (phase === 'idle' || phase === 'hover')) {
      pages.clear();
      // The shelf is never the last page: the next open picks it again if it holds files.
      if (page.kind === 'shelf') usePage(pageBeforeShelf());
      dropping = false;
      dragOpened = false;
      peek = false;
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

  // The statuses beside the notch show on the cursor's screen only, each with its
  // module's icon (the sample has none); the view hides them while a notice or
  // the panel is up.
  const showStatus = (s: LiveStatus | null) => {
    const items = s && s.screen === info.label ? s.items : [];
    view.setStatus(items.map(i => {
      const m = state.modules.find(x => x.id === i.moduleId);
      return { text: i.text, icon: m ? bridge.moduleUrl(m.id, m.icon) : null };
    }));
  };
  const offStatus = bridge.onStatus(showStatus);
  showStatus(await bridge.status());

  function renderPill(): void {
    const missed = missedTargets(state);
    const shelfModule = state.modules.find(m => m.id === SHELF_KEY);
    const items = [
      ...state.pages.map(p => ({ id: p.id, label: pageName(p, strings), svg: pageIconSvg(p.icon), missed: missed.has(p.id) })),
      // Titipan's icon, only while files are kept (§4).
      ...(shelfOn() && shelf.items.length > 0
        ? [{ id: SHELF_KEY, label: shelfModule?.name ?? SHELF_KEY, svg: SHELF_ICON, missed: false }]
        : []),
      { id: 'modules', label: strings.modules, svg: MODULES_ICON, missed: missed.has('modules') },
    ];
    const active = page.kind === 'custom' || page.kind === 'shelf' ? page.key : 'modules';
    view.setPill(items, active, strings.settings);
    view.setMissed(state.missed.length > 0);
  }

  // The page's size, widened by the lamp's wings while it is lit there.
  function sized(v: PageView, full?: number): CardSize {
    const size = viewSize(v, full);
    return lamp?.key === v.key ? { ...size, width: size.width + 2 * LAMP_WING } : size;
  }

  function usePage(next: PageView): void {
    page = next;
    fullHeight = undefined;
    controller.setCard(sized(next));
  }

  // The lamp lights the panel only once the core has turned the brightness up;
  // off, or the lit frame gone, puts both back.
  function setLamp(spec: FrameSpec, on: boolean, color = '#ffffff', glow = color): void {
    const seq = ++lampSeq;
    const show = (next: LampView | null) => {
      lamp = next && { ...next, key: spec.key };
      controller.setCard(sized(page, fullHeight));
      view.setLamp(next);
      view.kick();
    };
    if (!on) {
      if (lamp) show(null);
      bridge.moduleCall(spec.moduleId, 'lamp', 'off').catch(() => {});
    } else if (lamp?.key === spec.key) {
      show({ color, glow });
    } else if (spec.key === page.key) {
      bridge.moduleCall(spec.moduleId, 'lamp', 'on').then(() => {
        if (seq === lampSeq && spec.key === page.key) show({ color, glow });
      }, () => {});
    }
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
    if (key === SHELF_KEY) {
      openShelf();
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
    if (!shelfOn()) dropping = false;
    const onShelfPage = page.kind === 'shelf';
    const picked = onShelfPage && shelfOn() ? shelfPage() : pickPage(next, onShelfPage ? beforeShelf : page.key, isOpen());
    const size = sized(picked, picked.key === page.key ? fullHeight : undefined);
    if (picked.key !== page.key || size.width !== controller.card.width || size.height !== controller.card.height) usePage(picked);
    else page = picked;
    // The page view keeps its frames when nothing it shows has changed.
    showPage();
    const config = clampConfig(next.notch);
    if (!sameConfig(config, controller.config)) controller.setConfig(config);
    renderPill();
    view.kick();
  });

  // Every screen shows the same shelf; a shelf emptied while showing leaves it.
  const offShelf = bridge.onShelf(next => {
    shelf = next;
    if (page.kind === 'shelf') {
      if (next.items.length === 0 && !dropping && isOpen()) leaveShelf();
      else {
        usePage(shelfPage());
        showPage();
      }
    }
    renderPill();
    view.kick();
  });

  // A file drag reached this notch: the drop zone opens, closing again (or going
  // back to its page) if nothing is dropped; after a drop the panel stays until
  // the pointer leaves it (§3).
  const offDrop = bridge.onShelfDrop(e => {
    if (e.phase === 'start') {
      if (!shelfOn()) return;
      dropping = true;
      peek = false;
      if (isOpen()) {
        dragOpened = false;
        openShelf();
        void bridge.shelfDropReady();
      } else {
        dragOpened = true;
        openShelf();
        controller.click();
        view.kick();
      }
      return;
    }
    if (!dropping) return;
    dropping = false;
    if (e.dropped) {
      peek = dragOpened;
      openShelf();
    } else if (dragOpened) {
      closePanel();
    } else {
      leaveShelf();
    }
    dragOpened = false;
  });

  // A drag out of the shelf left the panel: it closes out of the way (§5).
  const offDrag = bridge.onShelfDrag(e => {
    if (e.phase === 'left' && isOpen()) closePanel();
  });

  const offPeek = bridge.onPointer(p => {
    if (peek && !p.inside && isOpen()) {
      peek = false;
      closePanel();
    }
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
      offShelf();
      offDrop();
      offDrag();
      offPeek();
      frames.destroy();
      view.destroy();
      wiring.dispose();
    },
  };
}
