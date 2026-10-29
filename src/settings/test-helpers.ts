import { afterEach, vi } from 'vitest';
import type { ModuleState } from '../modules/types';
import type { NotchConfig } from '../notch/config';
import { fakeRaf, TEST_STATE, timers } from '../notch/test-helpers';
import { mountSettings, type SettingsApp } from './shell';
import type { LanguageChoice, Place, PrayerMethod, SettingsBridge, SettingsInfo } from './types';

export const TEST_INFO: SettingsInfo = {
  language: 'auto',
  screen: null,
  screens: ['Built-in Retina Display', 'DELL U2723QE'],
  login: 'off',
  version: '0.1.0',
  home: { place: null, prayerMethod: 'kemenag' },
};

// Settings bridge whose methods are mocks; emit* plays the native side's events.
export function fakeSettingsBridge(initialState: ModuleState = TEST_STATE, initialInfo: SettingsInfo = TEST_INFO) {
  const stateSubs = new Set<(s: ModuleState) => void>();
  const infoSubs = new Set<(s: SettingsInfo) => void>();
  let state = initialState;
  let info = initialInfo;
  const bridge = {
    moduleState: vi.fn(async () => state),
    onModuleState: vi.fn((cb: (s: ModuleState) => void) => { stateSubs.add(cb); return () => { stateSubs.delete(cb); }; }),
    settings: vi.fn(async () => info),
    onSettings: vi.fn((cb: (s: SettingsInfo) => void) => { infoSubs.add(cb); return () => { infoSubs.delete(cb); }; }),
    setLanguage: vi.fn(async (_language: LanguageChoice) => {}),
    setNotchConfig: vi.fn(async (_config: NotchConfig) => {}),
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
    setNoticeSeconds: vi.fn(async (_seconds: number) => {}),
    setChannel: vi.fn(async (_module: string, _channel: string, _pref: { on: boolean; sound: boolean }) => {}),
    sendSampleNotice: vi.fn(async (_title: string, _detail: string) => {}),
    emitModuleState: (s: ModuleState) => { state = s; stateSubs.forEach(cb => cb(s)); },
    emitSettings: (s: SettingsInfo) => { info = s; infoSubs.forEach(cb => cb(s)); },
  };
  return bridge satisfies SettingsBridge;
}

const mounted: SettingsApp[] = [];

afterEach(() => {
  mounted.splice(0).forEach(app => app.destroy());
  document.body.innerHTML = '';
  document.documentElement.lang = '';
});

export async function mountForTest(state: ModuleState = TEST_STATE, info: SettingsInfo = TEST_INFO) {
  const root = document.createElement('div');
  document.body.append(root);
  const bridge = fakeSettingsBridge(state, info);
  const r = fakeRaf();
  const app = await mountSettings(root, bridge, { raf: r.raf, caf: r.caf, setTimer: timers.setTimer });
  mounted.push(app);
  return { root, bridge, app, r };
}

// Lets rejected promises and their handlers run.
export const settle = () => new Promise(resolve => setTimeout(resolve, 0));

export const h1 = (root: HTMLElement) => root.querySelector('.pane h1')?.textContent;
