import type { Lang } from '../kit/protocol';
import en from './en.json';
import id from './id.json';

// Text drawn by the notch itself; modules carry their own.
export interface HostStrings {
  home: string; // Beranda's name
  modules: string;
  pageEmpty: string;
  noModules: string;
  loadFailed: string;
  settings: string;
  shelf: { drop: string; title: string; hint: string; empty: string; missing: string; receiving: string; clear: string; remove: string };
}

// Text of the settings window; the Indonesian file is the reference shape.
export type SettingsStrings = (typeof id)['settingsWindow'];

const STRINGS: Record<Lang, HostStrings> = { id, en };
const SETTINGS: Record<Lang, SettingsStrings> = { id: id.settingsWindow, en: en.settingsWindow };

export function hostStrings(lang: Lang): HostStrings {
  return STRINGS[lang];
}

export function settingsStrings(lang: Lang): SettingsStrings {
  return SETTINGS[lang];
}

// Text of Keyboard Cleaning Mode's dim layer.
export type CleanStrings = (typeof id)['clean'];

export function cleanStrings(lang: Lang): CleanStrings {
  return lang === 'en' ? en.clean : id.clean;
}

// "{n} terpasang" with { n: 2 } → "2 terpasang"; unknown names stay as they are.
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (all, name: string) => (name in values ? String(values[name]) : all));
}
