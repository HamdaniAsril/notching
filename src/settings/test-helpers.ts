import { afterEach, vi } from 'vitest';
import type { ModuleState, PeekSettings, Placement } from '../modules/types';
import type { NotchConfig } from '../notch/config';
import { fakeRaf, TEST_STATE, timers } from '../notch/test-helpers';
import { mountSettings, type SettingsApp } from './shell';
import { shutFolds } from './pages/modules';
import type { ShotKeys } from '../bridge';
import { shotKeys } from '../shot/test-helpers';
import type { AppAction, AppKey, LanguageChoice, Place, PrayerMethod, Route, SettingsBridge, SettingsInfo, ShotKeyPress, ThemeChoice, UninstallPreview, UpdateInfo, AboutLink, WindowCell, WindowKey } from './types';

const CELLS: [WindowCell, string][] = [
  ['topLeft', ';'], ['top', '↑'], ['topRight', "'"], ['left', '←'], ['center', '\\'], ['right', '→'],
  ['bottomLeft', '.'], ['bottom', '↓'], ['bottomRight', '/'], ['fill', '↩'],
];

// Atur jendela's nine keys, all reaching Notching unless named otherwise.
export function windowKeys(over: Partial<Record<WindowCell, WindowKey['state']>> = {}): WindowKey[] {
  return CELLS.map(([cell, k]) => ({ cell, label: `⌃⌥${k}`, state: over[cell] ?? 'ok' }));
}

// Keep awake's and Shelf's keys, both reaching Notching unless named otherwise.
export function appKeys(over: Partial<Record<AppAction, AppKey['state']>> = {}, labels: Partial<Record<AppAction, string>> = {}): AppKey[] {
  return (['awake', 'shelf'] as const).map(action =>
    ({ action, label: labels[action] ?? (action === 'awake' ? '⌃⌥K' : '⌃⌥V'), state: over[action] ?? 'ok' }));
}

// Up to date, never checked, installable.
export const TEST_UPDATE: UpdateInfo = {
  current: '0.1.2', latest: null, available: false, page: null, size: null, checkedAt: null,
  auto: true, installable: true, phase: 'idle', progress: null, error: null,
};

export const TEST_INFO: SettingsInfo = {
  language: 'auto',
  theme: 'system',
  screen: null,
  screens: ['Built-in Retina Display', 'DELL U2723QE'],
  login: 'off',
  version: '0.1.0',
  home: { place: null, prayerMethod: 'kemenag' },
  accessibility: false,
  screenRecording: false,
  fullDiskAccess: false,
  camera: false,
  dockMinimizeToApp: false,
};

// Settings bridge whose methods are mocks; emit* plays the native side's events.
export function fakeSettingsBridge(initialState: ModuleState = TEST_STATE, initialInfo: SettingsInfo = TEST_INFO) {
  const stateSubs = new Set<(s: ModuleState) => void>();
  const infoSubs = new Set<(s: SettingsInfo) => void>();
  const goSubs = new Set<(route: string) => void>();
  const updateSubs = new Set<(u: UpdateInfo) => void>();
  let state = initialState;
  let info = initialInfo;
  let update = TEST_UPDATE;
  const bridge = {
    moduleState: vi.fn(async () => state),
    onModuleState: vi.fn((cb: (s: ModuleState) => void) => { stateSubs.add(cb); return () => { stateSubs.delete(cb); }; }),
    settings: vi.fn(async () => info),
    onSettings: vi.fn((cb: (s: SettingsInfo) => void) => { infoSubs.add(cb); return () => { infoSubs.delete(cb); }; }),
    onGo: vi.fn((cb: (route: string) => void) => { goSubs.add(cb); return () => { goSubs.delete(cb); }; }),
    setLanguage: vi.fn(async (_language: LanguageChoice) => {}),
    setTheme: vi.fn(async (_theme: ThemeChoice) => {}),
    uninstallPreview: vi.fn(async (): Promise<UninstallPreview> => ({ app: '/Applications/Notching.app', files: ['~/Library/Caches/id.web.notching'] })),
    releasePermissions: vi.fn(async () => {}),
    updateState: vi.fn(async (): Promise<UpdateInfo> => update),
    onUpdate: vi.fn((cb: (u: UpdateInfo) => void) => { updateSubs.add(cb); return () => { updateSubs.delete(cb); }; }),
    updateCheck: vi.fn(async (): Promise<UpdateInfo> => update),
    updateInstall: vi.fn(async () => {}),
    setAutoUpdate: vi.fn(async (_on: boolean) => {}),
    openReleaseNotes: vi.fn(async () => {}),
    openLink: vi.fn(async (_link: AboutLink) => {}),
    uninstallNotching: vi.fn(async () => {}),
    setNotchConfig: vi.fn(async (_config: NotchConfig) => {}),
    setAccent: vi.fn(async (_accent: string, _custom: string | null) => {}),
    setScreen: vi.fn(async (_name: string | null) => {}),
    setLaunchAtLogin: vi.fn(async (_on: boolean) => {}),
    openLoginItems: vi.fn(async () => {}),
    setModuleEnabled: vi.fn(async (_id: string, _enabled: boolean) => {}),
    uninstallModule: vi.fn(async (_id: string) => {}),
    reinstallModule: vi.fn(async (_id: string) => {}),
    quit: vi.fn(async () => {}),
    searchPlaces: vi.fn(async (_query: string): Promise<Place[]> => []),
    setPlace: vi.fn(async (_place: Place | null) => {}),
    setPrayerMethod: vi.fn(async (_method: PrayerMethod) => {}),
    setNoticeGlow: vi.fn(async (_on: boolean) => {}),
    setPanelGlass: vi.fn(async (_on: boolean) => {}),
    setShelfOpenOnDrag: vi.fn(async (_on: boolean) => {}),
    setPeekSettings: vi.fn(async (_p: PeekSettings) => {}),
    setNoticeSeconds: vi.fn(async (_seconds: number) => {}),
    setChannel: vi.fn(async (_module: string, _channel: string, _pref: { on: boolean; sound: boolean }) => {}),
    sendSampleNotice: vi.fn(async (_title: string, _detail: string) => {}),
    addPage: vi.fn(async (_name: string, _icon: string) => 'p1'),
    setPage: vi.fn(async (_id: string, _name: string | null, _icon: string, _widgets: Placement[], _strip: string | null) => {}),
    deletePage: vi.fn(async (_id: string) => {}),
    movePage: vi.fn(async (_id: string, _to: number) => {}),
    setSampleStatus: vi.fn(async (_on: boolean) => {}),
    setStatusShown: vi.fn(async (_module: string, _on: boolean) => {}),
    openAccessibility: vi.fn(async () => {}),
    openScreenRecordingSettings: vi.fn(async () => {}),
    openDockSettings: vi.fn(async () => {}),
    shotKeys: vi.fn(async (): Promise<ShotKeys> => shotKeys()),
    shotSetKey: vi.fn(async (_which: 'screen' | 'pick', _key: ShotKeyPress): Promise<ShotKeys> => shotKeys()),
    shotResetKeys: vi.fn(async (): Promise<ShotKeys> => shotKeys()),
    shotKeysHold: vi.fn(async (_hold: boolean) => {}),
    windowKeys: vi.fn(async (): Promise<WindowKey[]> => windowKeys()),
    windowSetKey: vi.fn(async (_cell: WindowCell, _key: ShotKeyPress): Promise<WindowKey[]> => windowKeys()),
    windowResetKeys: vi.fn(async (): Promise<WindowKey[]> => windowKeys()),
    appKeys: vi.fn(async (): Promise<AppKey[]> => appKeys()),
    appSetKey: vi.fn(async (_action: AppAction, _key: ShotKeyPress): Promise<AppKey[]> => appKeys()),
    appResetKeys: vi.fn(async (): Promise<AppKey[]> => appKeys()),
    openKeyboardShortcuts: vi.fn(async () => {}),
    openFullDiskAccessSettings: vi.fn(async () => {}),
    openCameraSettings: vi.fn(async () => {}),
    cleanerExclusions: vi.fn(async (): Promise<{ home: string; paths: string[] }> => ({ home: '/Users/a', paths: [] })),
    cleanerUnexclude: vi.fn(async (_path: string) => {}),
    cleanerOpenLog: vi.fn(async () => {}),
    emitModuleState: (s: ModuleState) => { state = s; stateSubs.forEach(cb => cb(s)); },
    emitSettings: (s: SettingsInfo) => { info = s; infoSubs.forEach(cb => cb(s)); },
    emitGo: (route: string) => goSubs.forEach(cb => cb(route)),
    emitUpdate: (u: UpdateInfo) => { update = u; updateSubs.forEach(cb => cb(u)); },
  };
  return bridge satisfies SettingsBridge;
}

const mounted: SettingsApp[] = [];

afterEach(() => {
  mounted.splice(0).forEach(app => app.destroy());
  shutFolds();
  document.body.innerHTML = '';
  document.documentElement.lang = '';
});

export async function mountForTest(state: ModuleState = TEST_STATE, info: SettingsInfo = TEST_INFO, start?: Route) {
  const root = document.createElement('div');
  document.body.append(root);
  const bridge = fakeSettingsBridge(state, info);
  const r = fakeRaf();
  const app = await mountSettings(root, bridge, { raf: r.raf, caf: r.caf, setTimer: timers.setTimer }, start);
  mounted.push(app);
  return { root, bridge, app, r };
}

// Lets rejected promises and their handlers run.
export const settle = () => new Promise(resolve => setTimeout(resolve, 0));

export const h1 = (root: HTMLElement) => root.querySelector('.pane h1')?.textContent;
