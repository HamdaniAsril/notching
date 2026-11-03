import type { ShotKeys } from '../bridge';
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
  accessibility: boolean; // macOS lets Notching lock the keyboard (Keyboard Cleaning Mode)
  screenRecording: boolean; // macOS lets Notching capture the screen (Screenshot)
  fullDiskAccess: boolean; // macOS lets Notching read every folder (Cleaner)
  camera: boolean; // macOS lets Notching use the camera (Cermin)
}

export type SectionId = 'general' | 'look' | 'notifications' | 'pages' | 'modules' | 'permissions' | 'about';

export type Route = { page: SectionId } | { page: 'module'; id: string } | { page: 'add' } | { page: 'pageEdit'; id: string };

// A key pressed while Screenshot's key is recorded: its place on the keyboard
// (KeyboardEvent.code) and the modifiers held.
export interface ShotKeyPress { code: string; cmd: boolean; ctrl: boolean; alt: boolean; shift: boolean }

// What the settings window needs from the native side.
export interface SettingsBridge {
  moduleState(): Promise<ModuleState>;
  onModuleState(cb: (s: ModuleState) => void): () => void;
  settings(): Promise<SettingsInfo>;
  onSettings(cb: (s: SettingsInfo) => void): () => void;
  onGo(cb: (route: string) => void): () => void; // a page asked for while open (parseRoute)
  setLanguage(language: LanguageChoice): Promise<void>;
  setNotchConfig(config: NotchConfig): Promise<void>;
  setAccent(accent: string, custom: string | null): Promise<void>; // custom null keeps the last custom colour
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
  setPage(id: string, name: string | null, icon: string, widgets: Placement[], strip: string | null): Promise<void>; // the whole page
  deletePage(id: string): Promise<void>;
  movePage(id: string, to: number): Promise<void>; // `to` counts among the custom pages
  setSampleStatus(on: boolean): Promise<void>; // the status beside the notch, to try its look
  setStatusShown(module: string, on: boolean): Promise<void>;
  openAccessibility(): Promise<void>; // System Settings › Privacy & Security › Accessibility
  openScreenRecordingSettings(): Promise<void>; // System Settings › Privacy & Security › Screen Recording
  shotKeys(): Promise<ShotKeys>; // how the two keys stand, for Screenshot's page
  shotSetKey(which: 'screen' | 'pick', key: ShotKeyPress): Promise<ShotKeys>; // rejects with 'invalid' or 'duplicate'
  shotResetKeys(): Promise<ShotKeys>; // back to ⌘⇧3 and ⌘⇧4
  shotKeysHold(hold: boolean): Promise<void>; // Notching's keys let go while one is recorded
  openKeyboardShortcuts(): Promise<void>; // System Settings › Keyboard › Keyboard Shortcuts › Screenshots
  openFullDiskAccessSettings(): Promise<void>; // System Settings › Privacy & Security › Full Disk Access
  openCameraSettings(): Promise<void>; // System Settings › Privacy & Security › Camera
  cleanerExclusions(): Promise<{ home: string; paths: string[] }>; // Cleaner's never-clean list; rejects when unreadable
  cleanerUnexclude(path: string): Promise<void>;
  cleanerOpenLog(): Promise<void>; // shows cleaner.log in Finder
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
