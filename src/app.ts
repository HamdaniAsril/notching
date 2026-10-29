import type { Bridge, Notice } from './bridge';
import { hostStrings } from './i18n';
import { activeModules, EMPTY_CARD, pickCard } from './modules/cards';
import { mountFrameHost } from './modules/frame';
import type { ModuleInfo, ModuleState } from './modules/types';
import { clampConfig, type NotchConfig } from './notch/config';
import { connect } from './notch/connect';
import { NotchController, type Phase } from './notch/controller';
import { mountNotch, type NotchView } from './notch/view';

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

// One notch overlay: the controller and view from plan 1, filled with module cards.
export async function startApp(root: HTMLElement, bridge: Bridge, env: AppEnv): Promise<App> {
  const doc = root.ownerDocument;
  const [info, initial] = await Promise.all([bridge.screenInfo(), bridge.moduleState()]);
  let state: ModuleState = initial;
  let strings = hostStrings(state.lang);
  let card: ModuleInfo | null = pickCard(state, null, false);
  let lastPhase: Phase = 'idle';
  const queue: Notice[] = [];
  let showing: Notice | null = null;
  doc.documentElement.lang = state.lang;

  const controller = new NotchController({
    notch: info.hasNotch ? { width: info.notchWidth, height: info.notchHeight } : null,
    config: clampConfig(state.notch),
    card: card?.card ?? EMPTY_CARD,
    setTimer: env.setTimer,
  });
  const wiring = connect(controller, bridge, () => view.kick());
  const view = mountNotch(root, controller, {
    raf: env.raf,
    caf: env.caf,
    onHitRects: wiring.onHitRects,
    onQuit: wiring.onQuit,
    onPhase,
    onSelect,
    onMore,
  });
  const frames = mountFrameHost(view.content, {
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
  });

  // The module frame lives only while the panel is up.
  function onPhase(phase: Phase): void {
    wiring.onPhase(phase);
    if (phase === 'open') {
      // A notice clicked open shows its own module's card.
      const from = showing && activeModules(state).find(m => m.id === showing?.moduleId);
      if (from && from.id !== card?.id) {
        useCard(from);
        renderPill();
        void bridge.setLastCard(from.id);
      }
      frames.show(card, state.lang, strings);
      endNotice();
    } else if (lastPhase === 'open') {
      // Seen: the pill showed the dots while the panel was open.
      if (state.missed.length > 0) void bridge.clearMissed();
    } else if (lastPhase === 'closing' && (phase === 'idle' || phase === 'hover')) {
      frames.clear();
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
    const from = activeModules(state).find(m => m.id === next.moduleId);
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

  function renderPill(): void {
    const items = activeModules(state).map(m => ({
      id: m.id, label: m.name, icon: bridge.moduleUrl(m.id, m.icon), missed: state.missed.includes(m.id),
    }));
    view.setPill(items, card?.id ?? null, strings.settings);
    view.setMissed(state.missed.length > 0);
  }

  function useCard(next: ModuleInfo | null): void {
    card = next;
    controller.setCard(next?.card ?? EMPTY_CARD);
  }

  function onSelect(id: string): void {
    if (id === card?.id) return;
    const next = activeModules(state).find(m => m.id === id);
    if (!next) return;
    useCard(next);
    if (controller.phase === 'open') frames.show(card, state.lang, strings);
    renderPill();
    void bridge.setLastCard(id);
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
    const langChanged = next.lang !== state.lang;
    state = next;
    strings = hostStrings(next.lang);
    doc.documentElement.lang = next.lang;
    const open = controller.phase === 'open';
    const picked = pickCard(next, card?.id ?? null, open);
    const changed = picked?.id !== card?.id
      || picked?.card.width !== card?.card.width || picked?.card.height !== card?.card.height;
    if (changed) useCard(picked);
    if (open && (changed || langChanged)) frames.show(card, state.lang, strings);
    const config = clampConfig(next.notch);
    if (!sameConfig(config, controller.config)) controller.setConfig(config);
    renderPill();
    view.kick();
  });

  // An overlay whose screen went away is ordered out. It gets no animation frames
  // there, so its close never reaches 'idle'; the module must stop anyway.
  function onVisibility(): void {
    if (doc.visibilityState === 'hidden') frames.clear();
    else if (controller.phase === 'open') frames.show(card, state.lang, strings);
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
      frames.destroy();
      view.destroy();
      wiring.dispose();
    },
  };
}
