import type { Bridge, LiveStatus, Notice, Shot, ShotEvent } from './bridge';
import { fakeAwake } from './bridge-browser-awake';
import { fakeCleaner } from './bridge-browser-cleaner';
import { fakeHome } from './bridge-browser-home';
import { fakeMedia } from './bridge-browser-media';
import { fakePrefs } from './bridge-browser-prefs';
import { fakeTimer } from './bridge-browser-timer';
import index from '../modules/index.json';
import type { Lang } from './kit/protocol';
import type { ModuleInfo, ModuleState, Page, WidgetKind } from './modules/types';
import { DEFAULT_CONFIG } from './notch/config';
import { localPointer } from './notch/local-pointer';

interface ManifestJson {
  version: string;
  entry?: string;
  icon: string;
  card?: { width: number; height: number };
  capabilities: string[];
  notifications?: { id: string; on: boolean; sound: boolean; widget?: string }[];
  widgets?: { id: string; entry: string; width: number; kind: WidgetKind }[];
  action?: { capability: string; method: string };
  permissions?: string[];
}

interface LocaleJson {
  name?: string;
  shortName?: string;
  description?: string;
  channels?: Record<string, string>;
  widgets?: Record<string, string>;
}

const manifests = import.meta.glob<ManifestJson>('../modules/*/manifest.json', { eager: true, import: 'default' });
const locales = import.meta.glob<LocaleJson>('../modules/*/locales/*.json', { eager: true, import: 'default' });
const icons = import.meta.glob<string>('../modules/*/icon.svg', { query: '?raw', eager: true, import: 'default' });
const manifestOf = (id: string) => manifests[`../modules/${id}/manifest.json`];

// The browser cannot measure a package, so every module shows this size.
const FAKE_SIZE = 140 * 1024;

export function catalog(lang: Lang, off: string[]): ModuleInfo[] {
  return (index as string[]).map(id => {
    const m = manifestOf(id);
    const t = locales[`../modules/${id}/locales/${lang}.json`] ?? {};
    const module = (m.entry !== undefined && m.card !== undefined) || m.action !== undefined;
    return {
      id, name: t.name ?? id, shortName: t.shortName ?? t.name ?? id, description: t.description ?? '',
      version: m.version, entry: m.entry ?? null, icon: m.icon, card: m.card ?? null,
      installed: true, enabled: !module || !off.includes(id),
      size: FAKE_SIZE, iconSvg: icons[`../modules/${id}/${m.icon}`] ?? '',
      channels: (m.notifications ?? []).map(c => ({ ...c, widget: c.widget ?? null, name: t.channels?.[c.id] ?? c.id })),
      widgets: (m.widgets ?? []).map(w => ({ ...w, name: t.widgets?.[w.id] ?? w.id })),
      activity: null,
      status: (m.capabilities ?? []).includes('status'),
      statusShown: true,
      action: m.action ?? null,
      permissions: m.permissions ?? [],
    };
  });
}

// Beranda as plan 5 sets it up.
export const BERANDA: Page = {
  id: 'home', name: null, icon: 'home',
  widgets: [
    { widget: 'home/date', col: 0, width: 1 }, { widget: 'home/weather', col: 1, width: 1 },
    { widget: 'home/reminders', col: 2, width: 2 },
  ],
};

// `?demo=1`: a page with the widgets Beranda leaves out.
const DEMO: Page = {
  id: 'p1', name: 'Uji', icon: 'star',
  widgets: [
    { widget: 'home/clock', col: 0, width: 1 }, { widget: 'home/prayer', col: 1, width: 1 },
    { widget: 'home/reminders', col: 2, width: 2 },
  ],
};

// Numbers that drift slowly, for looking at the System stat card.
function fakeStats() {
  const t = Date.now() / 1000;
  const wave = (period: number) => (Math.sin(t / period) + 1) / 2;
  const GiB = 1024 ** 3;
  return { cpu: 5 + 35 * wave(7), memUsed: 9.8 * GiB, memTotal: 16 * GiB, rx: 2_000_000 * wave(5), tx: 200_000 * wave(3) };
}

// A made-up screenshot: a grey window on a blue desktop, as an SVG data URL.
function fakeShot(id: number, takenMs: number): Shot {
  const kind = (['screen', 'window', 'area'] as const)[id % 3];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect width="160" height="100" fill="#6b7688"/>`
    + `<rect x="${10 + (id % 4) * 6}" y="12" width="110" height="74" rx="6" fill="#eef0f3"/></svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return { id, kind, takenMs, width: 1440, height: 900, saved: false, image: url, thumb: url };
}

// Stand-in for the native side in a normal browser (`npm run dev`).
// `?notch=1` fakes a 164 × 32 notch, `?lang=en` switches to English,
// `?off=system-stat` switches modules off, `?notice=1` sends a sample notice a
// second after loading (the n key sends another), `?missed=home.reminder` starts
// with a missed dot, `?status=18:42` shows a status beside the notch (with
// `&statusModule=keep-awake`, that module's icon),
// `?demo=1` adds a test page and `?page=p1` opens a page, `?strip=1` puts the
// Timer strip on Beranda, `?shots=<n>` starts Screenshot's history with n made-up
// shots (its take buttons add one and show the result; `?keys=mac` and `?access=0`
// show its notices), `?media=off` has nothing playing, `?media=art` gives the
// track a picture and `?media=long` very long names; the
// widgets' own switches are in bridge-browser-home.ts. Pointer and clicks come
// from localPointer().
export function browserBridge(root: HTMLElement): Bridge {
  const doc = root.ownerDocument;
  const params = new URLSearchParams(doc.defaultView?.location.search ?? '');
  const hasNotch = params.get('notch') === '1';
  let state: ModuleState = {
    lang: params.get('lang') === 'en' ? 'en' : 'id',
    modules: catalog(params.get('lang') === 'en' ? 'en' : 'id', (params.get('off') ?? '').split(',')),
    pages: [
      params.get('strip') === '1' ? { ...BERANDA, strip: 'timer/strip' } : BERANDA,
      ...(params.get('demo') === '1' ? [DEMO] : []),
    ],
    lastPage: params.get('page'),
    notch: DEFAULT_CONFIG,
    notifications: { glow: true, seconds: 3.5 },
    missed: (params.get('missed') ?? '').split(',').filter(Boolean),
    sampleStatus: false,
    accent: '#c8f04a',
    accentCustom: null,
  };
  const pointer = localPointer(root);
  const homeCall = fakeHome(params);
  const awakeCall = fakeAwake();
  const timerCall = fakeTimer();
  const mediaCall = fakeMedia(params.get('media'));
  const prefsCall = fakePrefs();
  const stateSubs = new Set<(s: ModuleState) => void>();
  const HOUR = 3600_000;
  let shots = Array.from({ length: Number(params.get('shots') ?? 0) }, (_, i) => fakeShot(i + 1, Date.now() - i * 5 * HOUR));
  const shotSubs = new Set<(e: ShotEvent) => void>();
  const shotsSubs = new Set<(list: Shot[]) => void>();
  const changed = (...events: ShotEvent[]) => {
    events.forEach(e => shotSubs.forEach(cb => cb(e)));
    shotsSubs.forEach(cb => cb(shots));
  };
  const take = async () => {
    const id = Math.max(0, ...shots.map(x => x.id)) + 1;
    const evicted = shots.slice(14).map(x => ({ phase: 'gone' as const, id: x.id }));
    shots = [fakeShot(id, Date.now()), ...shots.slice(0, 14)];
    doc.defaultView?.setTimeout(() => changed(...evicted, { phase: 'taken', id }), 400);
  };
  const noticeSubs = new Set<(n: Notice) => void>();
  const sample = () => noticeSubs.forEach(cb => cb({
    moduleId: 'home', channel: 'reminder', title: 'Kirim invoice', detail: '14.00', glow: state.notifications.glow, seconds: 3.5,
  }));
  // Pages edited in settings.html in another tab (settings/bridge-browser.ts).
  if (typeof BroadcastChannel !== 'undefined') {
    new BroadcastChannel('notching-pages').addEventListener('message', (e: MessageEvent<Page[]>) => {
      state = { ...state, pages: e.data };
      stateSubs.forEach(cb => cb(state));
    });
  }
  if (params.get('notice') === '1') {
    doc.defaultView?.setTimeout(sample, 1000);
    doc.addEventListener('keydown', e => { if (e.key === 'n') sample(); });
  }

  return {
    screenInfo: async () => ({ label: 'browser', hasNotch, notchWidth: hasNotch ? 164 : 0, notchHeight: hasNotch ? 32 : 0 }),
    setHitRects: pointer.setHitRects,
    setPanelKey: async key => console.info('setPanelKey', key),
    onPointer: pointer.onPointer,
    onResignKey: pointer.onResignKey,
    quit: async () => console.info('quit'),
    moduleState: async () => state,
    onModuleState: cb => { stateSubs.add(cb); return () => stateSubs.delete(cb); },
    setLastPage: async page => {
      state = { ...state, lastPage: page };
      stateSubs.forEach(cb => cb(state));
    },
    moduleCall: async (moduleId, capability, method, args) => {
      if (!manifestOf(moduleId)?.capabilities.includes(capability)) {
        throw new Error(`module ${moduleId} did not declare ${capability}`);
      }
      if (capability === 'system.stats' && method === 'read') return fakeStats();
      if (capability === 'home.data' || capability === 'reminders') return homeCall(capability, method, args);
      if (capability === 'awake') return awakeCall(method, args);
      if (capability === 'timer') return timerCall(method, args);
      if (capability === 'media') return mediaCall(method, args);
      // Keyboard Cleaning Mode locks nothing in a browser.
      if (capability === 'keyclean') return null;
      // A browser cannot change the screen's brightness; the lamp is only the panel's light.
      if (capability === 'lamp') return null;
      // Nothing to capture in a browser either.
      if (capability === 'screenshot') return null;
      if (capability === 'cleaner') return null;
      if (capability === 'prefs') return prefsCall(moduleId, method, args);
      throw new Error(`unknown method ${method}`);
    },
    // Vite serves the module sources directly.
    moduleUrl: (id, file) => `/modules/${id}/${file}`,
    // Preview only, not a security boundary: without allow-same-origin the
    // module's scripts from the Vite server are blocked by CORS.
    moduleSandbox: 'allow-scripts allow-same-origin',
    openSettings: async () => void doc.defaultView?.open(`/settings.html${doc.defaultView.location.search}`, 'notching-settings'),
    onNotice: cb => { noticeSubs.add(cb); return () => noticeSubs.delete(cb); },
    status: async (): Promise<LiveStatus | null> => {
      const text = params.get('status');
      return text ? { screen: 'browser', items: [{ moduleId: params.get('statusModule'), text }] } : null;
    },
    onStatus: () => () => {},
    media: async () => mediaCall.summary(),
    onMedia: cb => mediaCall.onSummary(cb),
    // The browser preview has no drag and drop to the notch: ?shelf=<n> shows n
    // made-up files, the third one missing.
    shelf: async () => ({
      items: Array.from({ length: Number(params.get('shelf') ?? 0) }, (_, i) => ({
        id: i + 1, name: ['laporan-tahunan-2026.pdf', 'foto-01.jpg', 'Desain', 'catatan.txt'][i % 4],
        folder: i % 4 === 2, state: i === 2 ? 'missing' as const : 'ready' as const, thumb: null,
      })),
    }),
    onShelf: () => () => {},
    shelfRemove: async () => {},
    shelfClear: async () => {},
    shelfStartDrag: async () => {},
    shelfDropReady: async () => {},
    onShelfDrop: () => () => {},
    onShelfDrag: () => () => {},
    shotList: async () => shots,
    shotCopy: async id => console.info('shotCopy', id),
    shotSave: async id => {
      shots = shots.map(x => (x.id === id ? { ...x, saved: true } : x));
      changed();
      return `~/Desktop/Screenshot ${id}.png`;
    },
    shotDelete: async id => {
      shots = shots.filter(x => x.id !== id);
      changed({ phase: 'gone', id });
    },
    shotTakeScreen: take,
    shotPick: take,
    shotStartDrag: async id => console.info('shotStartDrag', id),
    shotKeys: async () => {
      const k = params.get('keys') === 'mac' ? 'mac' : 'ok';
      return { screen: k, pick: k, labels: { screen: '⌘⇧3', pick: '⌘⇧4' }, custom: false };
    },
    shotPermission: async () => params.get('access') !== '0',
    openKeyboardShortcuts: async () => console.info('openKeyboardShortcuts'),
    shotTurnOffMac: async () => console.info('shotTurnOffMac'),
    openShotKeySettings: async () => console.info('openShotKeySettings'),
    openScreenRecordingSettings: async () => console.info('openScreenRecordingSettings'),
    openEditor: async id => console.info('openEditor', id),
    onShot: cb => { shotSubs.add(cb); return () => shotSubs.delete(cb); },
    // `?setup=mac` (or `other`) shows Screenshot's first-use notice a second after loading.
    onShotSetup: cb => {
      const holder = params.get('setup');
      if (holder !== 'mac' && holder !== 'other') return () => {};
      const t = setTimeout(() => cb({ holder, keys: holder === 'mac' ? '⌘⇧3 dan ⌘⇧4' : '⌘⇧4' }), 1000);
      return () => clearTimeout(t);
    },
    onShots: cb => { shotsSubs.add(cb); return () => shotsSubs.delete(cb); },
    onShotDrag: () => () => {},
    shotReady: async () => {},
    ...fakeCleaner(params),
    clearMissed: async () => {
      state = { ...state, missed: [] };
      stateSubs.forEach(cb => cb(state));
    },
  };
}
