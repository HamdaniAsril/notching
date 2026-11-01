import type { Bridge, LiveStatus, Notice, ShelfState, Shot } from './bridge';
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
import {
  missedTargets, noticeTarget, pageName, pickPage, resolvePage, type PageView, SHELF_KEY, SHOT_KEY, type ShotTarget, viewSize,
} from './pages/route';
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
  const [info, initial, kept, taken] = await Promise.all([
    bridge.screenInfo(), bridge.moduleState(), bridge.shelf(false), bridge.shotList().catch((): Shot[] => []),
  ]);
  let state: ModuleState = initial;
  // Titipan (design 1 Nov): the shelf, whether a file drag is over this notch,
  // whether that drag opened the panel, whether the panel closes once the pointer
  // leaves (after a drop), and the page the shelf was opened over.
  let shelf: ShelfState = kept;
  let dropping = false;
  let dragOpened = false;
  let peek = false;
  let beforeShelf: string | null = null;
  let dropHeight: number | undefined; // the open panel's height when a drag came over it
  // Screenshot (design 1 Nov §5, §6): the history, the notice lines its list
  // shows, and what waits for the panel to finish closing (a take button).
  let shots: Shot[] = taken;
  let shotNotes = 0;
  let closeWaiters: (() => void)[] = [];
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
      // Screenshot's tile opens its list, also drawn by the notch.
      if (m.action?.capability === SHOT_KEY) {
        openShot({ kind: 'shot', mode: 'list' });
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
    shot: {
      now: () => Date.now(),
      close: closeThen,
      back: () => go('modules'),
      onNotes: count => {
        if (count === shotNotes) return;
        shotNotes = count;
        if (page.kind === 'shot' && page.mode === 'list') {
          usePage(shotPage(page));
          view.kick();
        }
      },
      shotCopy: id => bridge.shotCopy(id),
      shotSave: id => bridge.shotSave(id),
      shotDelete: id => bridge.shotDelete(id),
      shotTakeScreen: () => bridge.shotTakeScreen(),
      shotPick: mode => bridge.shotPick(mode),
      shotStartDrag: id => bridge.shotStartDrag(id),
      shotKeys: () => bridge.shotKeys(),
      shotPermission: () => bridge.shotPermission(),
      openKeyboardShortcuts: () => bridge.openKeyboardShortcuts(),
      openScreenRecordingSettings: () => bridge.openScreenRecordingSettings(),
      openEditor: id => bridge.openEditor(id),
      onShot: cb => bridge.onShot(cb),
    },
  });

  const isOpen = () => controller.phase === 'open';

  const shelfOn = () => state.modules.some(m => m.id === SHELF_KEY && m.installed && m.enabled);
  const shelfPage = (): PageView => ({ kind: 'shelf', key: SHELF_KEY, shelf, dropping, height: dropping ? dropHeight : undefined });
  // The page to go back to from the shelf.
  const pageBeforeShelf = (): PageView => resolvePage(state, beforeShelf) ?? pickPage(state, null, false);

  // Shows the shelf (as the drop zone while dropping), remembering the page under it.
  function openShelf(): void {
    if (page.kind !== 'shelf') beforeShelf = page.key;
    // Its files may have moved since: check them again (§6).
    if (!dropping && isOpen()) void bridge.shelf(true);
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

  const shotOn = () => state.modules.some(m => m.id === SHOT_KEY && m.installed && m.enabled);
  const shotPage = (t: ShotTarget): PageView => (t.mode === 'result'
    ? { kind: 'shot', mode: 'result', id: t.id, key: SHOT_KEY, shots }
    : { kind: 'shot', mode: 'list', key: SHOT_KEY, shots, notes: shotNotes });

  // Screenshot's result or list. Like the shelf, never the last page.
  function openShot(t: ShotTarget): void {
    usePage(shotPage(t));
    showPage();
    renderPill();
    view.kick();
  }

  // Closes the panel; settles once it is closed, so a capture never shows it.
  // Opened again before that, the waiting step is dropped.
  function closeThen(): Promise<void> {
    if (controller.phase !== 'open' && controller.phase !== 'closing') return Promise.resolve();
    return new Promise(resolve => {
      closeWaiters.push(resolve);
      closePanel();
    });
  }

  function showPage(): void {
    if (isOpen()) pages.show(page, state, strings);
  }

  // Frames live only while the panel is up.
  function onPhase(phase: Phase): void {
    wiring.onPhase(phase);
    if (phase === 'open') {
      closeWaiters = [];
      // A notice clicked open shows the page holding the widget that sent it. A
      // screenshot just taken shows its result instead.
      const target = page.kind === 'shot' ? null : showing && noticeTarget(state, showing.moduleId, showing.channel);
      const to = typeof target === 'string' ? resolvePage(state, target) : null;
      if (target && typeof target === 'object' && shotOn()) {
        // Screenshot's notices open its list, where the fix is.
        usePage(shotPage(target));
        renderPill();
      } else if (to && to.key !== page.key) {
        usePage(to);
        renderPill();
        void bridge.setLastPage(to.key);
      } else if (dropping) {
        void bridge.shelfDropReady();
      } else if (!to && shelfOn() && shelf.items.length > 0 && page.kind !== 'shelf' && page.kind !== 'shot') {
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
      // Nor are Screenshot's pages: the next open shows the last page.
      if (page.kind === 'shot') usePage(pickPage(state, null, false));
      dropping = false;
      dragOpened = false;
      peek = false;
      if (fullHeight !== undefined) usePage(page);
      endNotice();
      pump();
      const waiting = closeWaiters;
      closeWaiters = [];
      waiting.forEach(resolve => resolve());
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
    // Module pages, the Modul page and both Screenshot pages light Modul: the list
    // is reached from there, and the result follows the same rule.
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
    const picked = onShelfPage && shelfOn() ? shelfPage()
      : page.kind === 'shot' && shotOn() ? shotPage(page)
        : pickPage(next, onShelfPage ? beforeShelf : page.key, isOpen());
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
        dropHeight = controller.card.height;
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
    dropHeight = undefined;
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

  // A capture landed on this screen: its result shows, opening the panel if
  // needed; a new one while it is open takes its place (§5).
  const offShot = bridge.onShot(e => {
    if (e.phase !== 'taken') return;
    // The list normally follows at once; ask for it should it not.
    if (!shots.some(x => x.id === e.id)) {
      bridge.shotList().then(list => {
        shots = list;
        if (page.kind === 'shot') openShot(page);
      }, () => {});
    }
    openShot({ kind: 'shot', mode: 'result', id: e.id });
    if (!isOpen()) {
      controller.click();
      view.kick();
    }
  });

  // One history for every screen.
  const offShots = bridge.onShots(list => {
    shots = list;
    if (page.kind === 'shot') openShot(page);
  });

  // A screenshot dragged out left the panel: it closes out of the way, as Titipan's.
  const offShotDrag = bridge.onShotDrag(e => {
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
      offShot();
      offShots();
      offShotDrag();
      offPeek();
      frames.destroy();
      view.destroy();
      wiring.dispose();
    },
  };
}
