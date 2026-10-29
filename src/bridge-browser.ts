import type { Bridge, Notice } from './bridge';
import { fakeHome } from './bridge-browser-home';
import index from '../modules/index.json';
import type { Lang } from './kit/protocol';
import type { ModuleInfo, ModuleState } from './modules/types';
import { DEFAULT_CONFIG } from './notch/config';
import { localPointer } from './notch/local-pointer';

interface ManifestJson {
  version: string;
  entry: string;
  icon: string;
  card: { width: number; height: number };
  capabilities: string[];
  notifications?: { id: string; on: boolean; sound: boolean }[];
}

interface LocaleJson {
  name?: string;
  description?: string;
  channels?: Record<string, string>;
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
    return {
      id, name: t.name ?? id, description: t.description ?? '', version: m.version, entry: m.entry, icon: m.icon,
      card: m.card, installed: true, enabled: !off.includes(id),
      size: FAKE_SIZE, iconSvg: icons[`../modules/${id}/${m.icon}`] ?? '',
      channels: (m.notifications ?? []).map(c => ({ ...c, name: t.channels?.[c.id] ?? c.id })),
    };
  });
}

// Numbers that drift slowly, for looking at the System stat card.
function fakeStats() {
  const t = Date.now() / 1000;
  const wave = (period: number) => (Math.sin(t / period) + 1) / 2;
  const GiB = 1024 ** 3;
  return { cpu: 5 + 35 * wave(7), memUsed: 9.8 * GiB, memTotal: 16 * GiB, rx: 2_000_000 * wave(5), tx: 200_000 * wave(3) };
}

// Stand-in for the native side in a normal browser (`npm run dev`).
// `?notch=1` fakes a 164 × 32 notch, `?lang=en` switches to English and
// `?off=home,system-stat` switches modules off, `?notice=1` sends a sample notice
// a second after loading (the n key sends another) and `?missed=home` starts with
// a missed dot; Beranda's own switches are in bridge-browser-home.ts. Pointer and
// clicks come from localPointer().
export function browserBridge(root: HTMLElement): Bridge {
  const doc = root.ownerDocument;
  const params = new URLSearchParams(doc.defaultView?.location.search ?? '');
  const hasNotch = params.get('notch') === '1';
  let state: ModuleState = {
    lang: params.get('lang') === 'en' ? 'en' : 'id',
    modules: catalog(params.get('lang') === 'en' ? 'en' : 'id', (params.get('off') ?? '').split(',')),
    lastCard: null,
    notch: DEFAULT_CONFIG,
    notifications: { glow: true, seconds: 3.5 },
    missed: (params.get('missed') ?? '').split(',').filter(Boolean),
  };
  const pointer = localPointer(root);
  const homeCall = fakeHome(params);
  const stateSubs = new Set<(s: ModuleState) => void>();
  const noticeSubs = new Set<(n: Notice) => void>();
  const sample = () => noticeSubs.forEach(cb => cb({
    moduleId: 'home', title: 'Kirim invoice', detail: '14.00', glow: state.notifications.glow, seconds: 3.5,
  }));
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
    setLastCard: async id => {
      state = { ...state, lastCard: id };
      stateSubs.forEach(cb => cb(state));
    },
    moduleCall: async (moduleId, capability, method, args) => {
      if (!manifestOf(moduleId)?.capabilities.includes(capability)) {
        throw new Error(`module ${moduleId} did not declare ${capability}`);
      }
      if (capability === 'system.stats' && method === 'read') return fakeStats();
      if (capability === 'home.data' || capability === 'reminders') return homeCall(capability, method, args);
      throw new Error(`unknown method ${method}`);
    },
    // Vite serves the module sources directly.
    moduleUrl: (id, file) => `/modules/${id}/${file}`,
    // Preview only, not a security boundary: without allow-same-origin the
    // module's scripts from the Vite server are blocked by CORS.
    moduleSandbox: 'allow-scripts allow-same-origin',
    openSettings: async () => void doc.defaultView?.open(`/settings.html${doc.defaultView.location.search}`, 'notching-settings'),
    onNotice: cb => { noticeSubs.add(cb); return () => noticeSubs.delete(cb); },
    clearMissed: async () => {
      state = { ...state, missed: [] };
      stateSubs.forEach(cb => cb(state));
    },
  };
}
