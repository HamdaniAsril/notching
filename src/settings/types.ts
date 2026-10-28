import type { SettingsStrings } from '../i18n';
import type { Lang } from '../kit/protocol';
import type { ModuleState } from '../modules/types';
import type { NotchConfig } from '../notch/config';

export type LanguageChoice = 'auto' | 'id' | 'en';

// Open at login, as macOS reports it; 'unavailable' outside the installed app.
export type LoginItem = 'on' | 'off' | 'needsApproval' | 'unavailable';

// Same shape as SettingsDto in src-tauri/src/settings_window.rs.
export interface SettingsInfo {
  language: LanguageChoice;
  screen: string | null; // null: every screen
  screens: string[]; // connected screens, by name
  login: LoginItem;
  version: string;
}

export type SectionId = 'general' | 'look' | 'notifications' | 'modules' | 'permissions' | 'about';

export type Route = { page: SectionId } | { page: 'module'; id: string } | { page: 'add' };

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
}

export interface SettingsEnv {
  raf: (cb: (now: number) => void) => number;
  caf: (id: number) => void;
  setTimer: (fn: () => void, ms: number) => () => void;
}

export type { Lang, SettingsStrings };
