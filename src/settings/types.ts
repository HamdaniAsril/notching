import type { SettingsStrings } from '../i18n';
import type { Lang } from '../kit/protocol';
import type { ModuleState, Placement } from '../modules/types';
import type { NotchConfig } from '../notch/config';

export type LanguageChoice = 'auto' | 'id' | 'en';

// Open at login, as macOS reports it; 'unavailable' outside the installed app.
export type LoginItem = 'on' | 'off' | 'needsApproval' | 'unavailable';

// Beranda's city; same shape as Place in src-tauri/src/settings.rs.
export interface Place {
  name: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
}

export type PrayerMethod =
  | 'kemenag' | 'singapore' | 'muslimWorldLeague' | 'egyptian' | 'karachi' | 'ummAlQura' | 'northAmerica';

export interface HomeSettingsInfo {
  place: Place | null;
  prayerMethod: PrayerMethod;
}

// Same shape as SettingsDto in src-tauri/src/settings_window.rs.
export interface SettingsInfo {
  language: LanguageChoice;
  screen: string | null; // null: every screen
  screens: string[]; // connected screens, by name
  login: LoginItem;
  version: string;
  home: HomeSettingsInfo;
}

export type SectionId = 'general' | 'look' | 'notifications' | 'pages' | 'modules' | 'permissions' | 'about';

export type Route = { page: SectionId } | { page: 'module'; id: string } | { page: 'add' } | { page: 'pageEdit'; id: string };

// What the settings window needs from the native side.
export interface SettingsBridge {
  moduleState(): Promise<ModuleState>;
  onModuleState(cb: (s: ModuleState) => void): () => void;
  settings(): Promise<SettingsInfo>;
  onSettings(cb: (s: SettingsInfo) => void): () => void;
  setLanguage(language: LanguageChoice): Promise<void>;
  setNotchConfig(config: NotchConfig): Promise<void>;
  setScreen(name: string | null): Promise<void>;
  setLaunchAtLogin(on: boolean): Promise<void>;
  openLoginItems(): Promise<void>;
  setModuleEnabled(id: string, enabled: boolean): Promise<void>;
  uninstallModule(id: string): Promise<void>;
  reinstallModule(id: string): Promise<void>;
  quit(): Promise<void>;
  searchPlaces(query: string): Promise<Place[]>; // Open-Meteo, only when asked
  setPlace(place: Place | null): Promise<void>;
  setPrayerMethod(method: PrayerMethod): Promise<void>;
  setNoticeGlow(on: boolean): Promise<void>;
  setNoticeSeconds(seconds: number): Promise<void>;
  setChannel(module: string, channel: string, pref: { on: boolean; sound: boolean }): Promise<void>;
  sendSampleNotice(title: string, detail: string): Promise<void>; // always with sound, on the screen under the cursor
  addPage(name: string, icon: string): Promise<string>; // the new page's id
  setPage(id: string, name: string | null, icon: string, widgets: Placement[]): Promise<void>; // the whole page
  deletePage(id: string): Promise<void>;
  movePage(id: string, to: number): Promise<void>; // `to` counts among the custom pages
}

export interface SettingsEnv {
  raf: (cb: (now: number) => void) => number;
  caf: (id: number) => void;
  setTimer: (fn: () => void, ms: number) => () => void;
}

export type { Lang, SettingsStrings };

// What a page gets to draw itself and act.
export interface PageContext {
  strings: SettingsStrings;
  lang: Lang;
  state: ModuleState;
  info: SettingsInfo;
  bridge: SettingsBridge;
  env: SettingsEnv;
  go(route: Route): void;
  save(key: string, pending: Promise<void>): void; // a failure shows strings.saveFailed by that setting
  onCleanup(fn: () => void): void; // runs before the page is replaced
}

export type PageRender = (ctx: PageContext, route: Route) => HTMLElement;
