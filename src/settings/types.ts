import type { ShotKeys } from '../bridge';
import type { SettingsStrings } from '../i18n';
import type { Lang } from '../kit/protocol';
import type { ModuleState, PeekSettings, Placement } from '../modules/types';
import type { NotchConfig } from '../notch/config';

export type LanguageChoice = 'auto' | 'id' | 'en';

// The settings window's look (ThemeSetting in src-tauri/src/settings.rs).
export type ThemeChoice = 'system' | 'light' | 'dark';

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
  theme: ThemeChoice; // this window's look; the notch is black either way
  screen: string | null; // null: every screen
  screens: string[]; // connected screens, by name
  login: LoginItem;
  version: string;
  home: HomeSettingsInfo;
  accessibility: boolean; // macOS lets Notching lock the keyboard (Keyboard Cleaning Mode)
  screenRecording: boolean; // macOS lets Notching capture the screen (Screenshot)
  fullDiskAccess: boolean; // macOS lets Notching read every folder (Cleaner)
  camera: boolean; // macOS lets Notching use the camera (Cermin)
  dockMinimizeToApp: boolean; // the Dock's "Minimize windows into application icon" (Intip jendela's tip)
}

export type SectionId = 'general' | 'look' | 'notifications' | 'pages' | 'modules' | 'shortcuts' | 'permissions' | 'uninstall' | 'about' | 'whatsnew';

export type Route = { page: SectionId } | { page: 'module'; id: string } | { page: 'catalog'; id?: string } | { page: 'pageEdit'; id: string };

// A key pressed while Screenshot's key is recorded: its place on the keyboard
// (KeyboardEvent.code) and the modifiers held.
export interface ShotKeyPress { code: string; cmd: boolean; ctrl: boolean; alt: boolean; shift: boolean }

// Why the switcher's key was refused (SwitchKeyError in src-tauri/src/switch_rules.rs).
export type SwitchKeyError = { kind: 'invalid' | 'shot' | 'window' | 'app' };

// Atur jendela's keys (WindowKeyDto in src-tauri/src/win_service.rs): its cell
// of the 3×3 grid, its label ("⌃⌥Q") and whether it reaches Notching.
export type WindowCell = 'topLeft' | 'top' | 'topRight' | 'left' | 'center' | 'right' | 'bottomLeft' | 'bottom' | 'bottomRight' | 'fill';
export interface WindowKey { cell: WindowCell; label: string; state: 'ok' | 'off' | 'other' | 'shortcut' | 'mac' }
// Why a recorded key was refused (WinKeyError in src-tauri/src/win_rules.rs).
export type WindowKeyError = { kind: 'invalid' } | { kind: 'duplicate'; cell: WindowCell } | { kind: 'shot' } | { kind: 'app' } | { kind: 'peek' };

// Keep awake's and Shelf's keys on the Pintasan page (AppKeyDto in
// src-tauri/src/app_keys_service.rs).
export type AppAction = 'awake' | 'shelf';
export interface AppKey { action: AppAction; label: string; state: 'ok' | 'off' | 'other' | 'shortcut' | 'mac' }
// Why a recorded key was refused (AppKeyError in src-tauri/src/app_keys.rs).
export type AppKeyError = { kind: 'invalid' } | { kind: 'duplicate'; action: AppAction } | { kind: 'shot' } | { kind: 'window' } | { kind: 'peek' };

// What Copot Notching takes (UninstallDto in src-tauri/src/self_uninstall.rs):
// the installed app, null in a dev build, and Notching's own files, as "~/…".
export interface UninstallPreview { app: string | null; files: string[] }

// Where an update stands (UpdateDto in src-tauri/src/update_service.rs).
export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'verifying' | 'installing' | 'restarting';
export type UpdateError = 'network' | 'notFound' | 'signature' | 'copy' | 'dev' | 'busy';
export interface UpdateInfo {
  current: string;
  latest: string | null; // the latest published version, once asked for
  available: boolean; // newer than this one
  page: string | null;
  size: number | null; // bytes of its DMG
  checkedAt: number | null; // ms since 1970
  auto: boolean; // asked once a day
  installable: boolean; // the installed Notching.app, which can replace itself
  phase: UpdatePhase;
  progress: number | null; // 0 to 1 while downloading
  error: UpdateError | null;
}
export type AboutLink = 'repo' | 'license' | 'privacy';

// What the settings window needs from the native side.
export interface SettingsBridge {
  moduleState(): Promise<ModuleState>;
  onModuleState(cb: (s: ModuleState) => void): () => void;
  settings(): Promise<SettingsInfo>;
  onSettings(cb: (s: SettingsInfo) => void): () => void;
  onGo(cb: (route: string) => void): () => void; // a page asked for while open (parseRoute)
  setLanguage(language: LanguageChoice): Promise<void>;
  setTheme(theme: ThemeChoice): Promise<void>;
  setNotchConfig(config: NotchConfig): Promise<void>;
  setAccent(accent: string, custom: string | null): Promise<void>; // custom null keeps the last custom colour
  setScreen(name: string | null): Promise<void>;
  setPanelGlass(on: boolean): Promise<void>; // off: the open panel is solid black
  setShelfOpenOnDrag(on: boolean): Promise<void>; // off: Shelf opens when a drag reaches the notch
  setPeekSettings(p: PeekSettings): Promise<void>; // Intip jendela's settings, whole
  switchSetKey(key: ShotKeyPress): Promise<void>; // the switcher's key; rejects with SwitchKeyError
  switchResetKey(): Promise<void>; // back to ⌘Tab
  setLaunchAtLogin(on: boolean): Promise<void>;
  openLoginItems(): Promise<void>;
  setModuleEnabled(id: string, enabled: boolean): Promise<void>;
  uninstallModule(id: string): Promise<void>;
  reinstallModule(id: string): Promise<void>;
  quit(): Promise<void>;
  uninstallPreview(): Promise<UninstallPreview>;
  updateState(): Promise<UpdateInfo>;
  onUpdate(cb: (u: UpdateInfo) => void): () => void;
  updateCheck(): Promise<UpdateInfo>; // asks GitHub now
  updateInstall(): Promise<void>; // the latest in place of this app, then it opens again; rejects with an UpdateError
  setAutoUpdate(on: boolean): Promise<void>;
  openReleaseNotes(): Promise<void>; // the latest release's page on GitHub
  openLink(link: AboutLink): Promise<void>;
  releasePermissions(): Promise<void>; // every permission Notching was given; rejects with the reason
  uninstallNotching(): Promise<void>; // to the Trash, then Notching quits; rejects with the reason, or 'dev'
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
  openDockSettings(): Promise<void>; // System Settings › Desktop & Dock
  shotKeys(): Promise<ShotKeys>; // how the two keys stand, for Screenshot's page
  shotSetKey(which: 'screen' | 'pick', key: ShotKeyPress): Promise<ShotKeys>; // rejects with 'invalid' or 'duplicate'
  shotResetKeys(): Promise<ShotKeys>; // back to ⌘⇧3 and ⌘⇧4
  windowKeys(): Promise<WindowKey[]>; // Atur jendela's nine keys, in grid order
  windowSetKey(cell: WindowCell, key: ShotKeyPress): Promise<WindowKey[]>; // rejects with a WindowKeyError
  windowResetKeys(): Promise<WindowKey[]>; // back to the keys until changed
  appKeys(): Promise<AppKey[]>; // Keep awake's and Shelf's keys, awake first
  appSetKey(action: AppAction, key: ShotKeyPress): Promise<AppKey[]>; // rejects with an AppKeyError
  appResetKeys(): Promise<AppKey[]>; // back to ⌃⌥K and ⌃⌥V
  shotKeysHold(hold: boolean): Promise<void>; // Notching's keys (Screenshot's and Atur jendela's) let go while one is recorded
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
