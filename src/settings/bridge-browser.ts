import type { KeyState, ShotKeys } from '../bridge';
import { BERANDA, catalog } from '../bridge-browser';
import type { Lang } from '../kit/protocol';
import { DEFAULT_PEEK, type ModuleInfo, type ModuleState, type Page } from '../modules/types';
import { DEFAULT_CONFIG } from '../notch/config';
import type { AppAction, AppKey, UpdateInfo, LanguageChoice, Place, SettingsBridge, SettingsInfo, WindowCell, WindowKey } from './types';

const city = (name: string, region: string, latitude: number, longitude: number): Place =>
  ({ name, region, country: 'Indonesia', latitude, longitude });
const PLACES = [city('Jakarta', 'Jakarta', -6.21462, 106.84513), city('Bandung', 'Jawa Barat', -6.90389, 107.61861),
  city('Surabaya', 'Jawa Timur', -7.24917, 112.75083), city('Yogyakarta', 'Yogyakarta', -7.80139, 110.36472),
  city('Makassar', 'Sulawesi Selatan', -5.14861, 119.43194), city('Medan', 'Sumatera Utara', 3.58333, 98.66667),
  city('Denpasar', 'Bali', -8.65, 115.21667)];

// Stand-in for the native side in a normal browser (`npm run dev`, /settings.html).
// Everything lives in memory; `?lang=en` starts in English. Screens and cities
// are made up; searching for "gagal" fails, to show the error. Page changes go
// to a notch open in another tab over PAGES_CHANNEL. On Izin, `?access=0`, `?fda=0` and
// `?camera=0` show Screen Recording, Full Disk Access and the camera not allowed yet.
export const PAGES_CHANNEL = 'notching-pages';

export function browserSettingsBridge(params: URLSearchParams): SettingsBridge {
  const deviceLang: Lang = params.get('lang') === 'en' ? 'en' : 'id';
  // Screenshot's keys as recorded here; labels made up from the key's code.
  let labels = { screen: '⌘⇧3', pick: '⌘⇧4' };
  let windowLabels: Partial<Record<WindowCell, string>> = {};
  const browserWindowKeys = (): WindowKey[] => ([
    ['topLeft', ';'], ['top', '↑'], ['topRight', "'"], ['left', '←'], ['center', '\\'], ['right', '→'],
    ['bottomLeft', '.'], ['bottom', '↓'], ['bottomRight', '/'], ['fill', '↩'],
  ] as const).map(([cell, k]) => ({
    cell, label: windowLabels[cell] ?? `⌃⌥${k}`, state: params.get('winkeys') === 'taken' && k === '/' ? 'other' as const : 'ok' as const,
  }));
  let appLabels: Partial<Record<AppAction, string>> = {};
  // Updates, made up: "Cek versi" finds 0.1.3, which a browser cannot install.
  let update: UpdateInfo = {
    current: '0.1.2', latest: null, available: false, page: null, size: null, checkedAt: null,
    auto: true, installable: false, phase: 'idle', progress: null, error: null,
  };
  const updateSubs = new Set<(u: UpdateInfo) => void>();
  const setUpdate = (next: UpdateInfo) => { update = next; updateSubs.forEach(cb => cb(update)); };
  // A key is off while its module is.
  const browserAppKeys = (): AppKey[] => (['awake', 'shelf'] as const).map(action => ({
    action,
    label: appLabels[action] ?? (action === 'awake' ? '⌃⌥K' : '⌃⌥V'),
    state: state.modules.find(m => m.id === (action === 'awake' ? 'keep-awake' : 'shelf'))?.enabled === false ? 'off' as const : 'ok' as const,
  }));
  const browserKeys = (k: KeyState): ShotKeys => ({ screen: k, pick: k, labels, custom: labels.screen !== '⌘⇧3' || labels.pick !== '⌘⇧4' });
  let info: SettingsInfo = {
    language: 'auto',
    theme: 'system',
    screen: null,
    screens: ['Built-in Retina Display', 'DELL U2723QE'],
    login: 'off',
    version: '0.1.0',
    home: { place: null, prayerMethod: 'kemenag' },
    accessibility: false,
    screenRecording: params.get('access') !== '0',
    fullDiskAccess: params.get('fda') !== '0',
    camera: params.get('camera') !== '0',
    dockMinimizeToApp: params.get('dockmin') === '1',
  };
  let state: ModuleState = {
    lang: deviceLang, modules: catalog(deviceLang, []), pages: [BERANDA], lastPage: null, notch: DEFAULT_CONFIG,
    notifications: { glow: true, seconds: 3.5 }, missed: [], sampleStatus: false, accent: '#c8f04a', accentCustom: null, panelGlass: true,
    shelfOpenOnDrag: true,
    peek: DEFAULT_PEEK,
    peekKeyLabel: '⌘⇥',
    macos: Number(params.get('macos') ?? 27),
  };
  const stateSubs = new Set<(s: ModuleState) => void>();
  const infoSubs = new Set<(s: SettingsInfo) => void>();

  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(PAGES_CHANNEL);
  const setState = (next: ModuleState) => { state = next; stateSubs.forEach(cb => cb(state)); };
  const setPages = (pages: Page[]) => {
    setState({ ...state, pages });
    channel?.postMessage(pages);
  };
  const setInfo = (next: SettingsInfo) => { info = next; infoSubs.forEach(cb => cb(info)); };
  const setModule = (id: string, over: Partial<ModuleInfo>) =>
    setState({ ...state, modules: state.modules.map(m => (m.id === id ? { ...m, ...over } : m)) });

  return {
    moduleState: async () => state,
    onModuleState: cb => { stateSubs.add(cb); return () => stateSubs.delete(cb); },
    settings: async () => info,
    onSettings: cb => { infoSubs.add(cb); return () => infoSubs.delete(cb); },
    onGo: () => () => {},
    setLanguage: async (language: LanguageChoice) => {
      const lang: Lang = language === 'auto' ? deviceLang : language;
      // Names follow the language; on/off and installed stay as they were.
      const names = new Map(catalog(lang, []).map(m => [m.id, m]));
      setInfo({ ...info, language });
      setState({
        ...state,
        lang,
        modules: state.modules.map(m => ({ ...m, name: names.get(m.id)!.name, description: names.get(m.id)!.description })),
      });
    },
    setNotchConfig: async notch => setState({ ...state, notch }),
    setPanelGlass: async panelGlass => setState({ ...state, panelGlass }),
    setShelfOpenOnDrag: async shelfOpenOnDrag => setState({ ...state, shelfOpenOnDrag }),
    setPeekSettings: async peek => setState({ ...state, peek }),
    switchSetKey: async () => {},
    switchResetKey: async () => setState({ ...state, peek: { ...state.peek, switcherKey: DEFAULT_PEEK.switcherKey }, peekKeyLabel: '⌘⇥' }),
    setAccent: async (accent, custom) => setState({ ...state, accent, accentCustom: custom ?? state.accentCustom }),
    // The page cannot change its own light or dark here; the app sets the window's.
    setTheme: async theme => setInfo({ ...info, theme }),
    // Made up, and nothing is ever taken from here.
    uninstallPreview: async () => ({ app: null, files: ['~/Library/Application Support/id.web.notching', '~/Library/Caches/id.web.notching'] }),
    releasePermissions: async () => console.info('releasePermissions'),
    uninstallNotching: async () => { throw 'dev'; },
    updateState: async () => update,
    onUpdate: cb => { updateSubs.add(cb); return () => updateSubs.delete(cb); },
    updateCheck: async () => {
      setUpdate({ ...update, latest: '0.1.3', available: true, page: 'https://github.com/HamdaniAsril/notching/releases', size: 6551363, checkedAt: Date.now() });
      return update;
    },
    updateInstall: async () => {
      setUpdate({ ...update, error: 'dev' });
      throw 'dev';
    },
    setAutoUpdate: async auto => setUpdate({ ...update, auto }),
    openReleaseNotes: async () => console.info('openReleaseNotes'),
    openLink: async link => console.info('openLink', link),
    setScreen: async screen => setInfo({ ...info, screen }),
    setLaunchAtLogin: async on => setInfo({ ...info, login: on ? 'on' : 'off' }),
    openLoginItems: async () => console.info('openLoginItems'),
    setModuleEnabled: async (id, enabled) => setModule(id, { enabled }),
    uninstallModule: async id => setModule(id, { installed: false, enabled: false }),
    reinstallModule: async id => setModule(id, { installed: true, enabled: true }),
    quit: async () => console.info('quit'),
    searchPlaces: async query => {
      if (query.trim().toLowerCase() === 'gagal') throw new Error('offline');
      const q = query.trim().toLowerCase();
      return q ? PLACES.filter(p => p.name.toLowerCase().startsWith(q)) : [];
    },
    setPlace: async place => setInfo({ ...info, home: { ...info.home, place } }),
    setPrayerMethod: async prayerMethod => setInfo({ ...info, home: { ...info.home, prayerMethod } }),
    setNoticeGlow: async glow => setState({ ...state, notifications: { ...state.notifications, glow } }),
    setNoticeSeconds: async seconds => setState({ ...state, notifications: { ...state.notifications, seconds } }),
    setChannel: async (module, channel, pref) => setModule(module, {
      channels: state.modules.find(m => m.id === module)!.channels.map(c => (c.id === channel ? { ...c, ...pref } : c)),
    }),
    sendSampleNotice: async (title, detail) => console.info('sendSampleNotice', title, detail),
    addPage: async (name, icon) => {
      const n = Math.max(0, ...state.pages.map(p => Number(p.id.slice(1)) || 0)) + 1;
      setPages([...state.pages, { id: `p${n}`, name, icon, widgets: [] }]);
      return `p${n}`;
    },
    setPage: async (id, name, icon, widgets, strip) =>
      setPages(state.pages.map(p => (p.id === id ? { ...p, name, icon, widgets, strip } : p))),
    deletePage: async id => setPages(state.pages.filter(p => p.id !== id)),
    setSampleStatus: async on => setState({ ...state, sampleStatus: on }),
    setStatusShown: async (id, on) => setModule(id, { statusShown: on }),
    openAccessibility: async () => {},
    openScreenRecordingSettings: async () => console.info('openScreenRecordingSettings'),
    openDockSettings: async () => console.info('openDockSettings'),
    shotKeys: async () => browserKeys(params.get('keys') === 'mac' ? 'mac' : 'ok'), // ?keys=mac
    shotSetKey: async (which, key) => {
      if (!key.cmd && !key.ctrl && !key.alt) throw 'invalid';
      const mods = `${key.ctrl ? '⌃' : ''}${key.alt ? '⌥' : ''}${key.cmd ? '⌘' : ''}${key.shift ? '⇧' : ''}`;
      labels = { ...labels, [which]: mods + key.code.replace(/^(Key|Digit)/, '') };
      return browserKeys('ok');
    },
    shotResetKeys: async () => {
      labels = { screen: '⌘⇧3', pick: '⌘⇧4' };
      return browserKeys('ok');
    },
    shotKeysHold: async hold => console.info('shotKeysHold', hold),
    // ?winkeys=taken: ⌃⌥/ is taken by another app.
    windowKeys: async () => browserWindowKeys(),
    windowSetKey: async (cell, key) => {
      const mods = `${key.ctrl ? '⌃' : ''}${key.alt ? '⌥' : ''}${key.cmd ? '⌘' : ''}${key.shift ? '⇧' : ''}`;
      const label = mods + key.code.replace(/^(Key|Digit)/, '');
      if (!mods || mods === '⇧') throw { kind: 'invalid' };
      const other = browserWindowKeys().find(k => k.label === label && k.cell !== cell);
      if (other) throw { kind: 'duplicate', cell: other.cell };
      windowLabels = { ...windowLabels, [cell]: label };
      return browserWindowKeys();
    },
    windowResetKeys: async () => {
      windowLabels = {};
      return browserWindowKeys();
    },
    appKeys: async () => browserAppKeys(),
    appSetKey: async (action, key) => {
      const mods = `${key.ctrl ? '⌃' : ''}${key.alt ? '⌥' : ''}${key.cmd ? '⌘' : ''}${key.shift ? '⇧' : ''}`;
      const label = mods + key.code.replace(/^(Key|Digit)/, '');
      if (!mods || mods === '⇧') throw { kind: 'invalid' };
      const other = browserAppKeys().find(k => k.label === label && k.action !== action);
      if (other) throw { kind: 'duplicate', action: other.action };
      appLabels = { ...appLabels, [action]: label };
      return browserAppKeys();
    },
    appResetKeys: async () => {
      appLabels = {};
      return browserAppKeys();
    },
    openKeyboardShortcuts: async () => console.info('openKeyboardShortcuts'),
    openFullDiskAccessSettings: async () => console.info('openFullDiskAccessSettings'),
    openCameraSettings: async () => console.info('openCameraSettings'),
    cleanerExclusions: async () => ({ home: '/Users/a', paths: ['/Users/a/Library/Caches/com.spotify.client'] }),
    cleanerUnexclude: async path => console.info('cleanerUnexclude', path),
    cleanerOpenLog: async () => console.info('cleanerOpenLog'),
    movePage: async (id, to) => {
      const [home, ...custom] = state.pages;
      const moving = custom.find(p => p.id === id)!;
      const rest = custom.filter(p => p.id !== id);
      rest.splice(Math.min(to, rest.length), 0, moving);
      setPages([home, ...rest]);
    },
  };
}
