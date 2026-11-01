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
  // Screenshot's result and list pages (design 1 Nov §5, §6).
  shot: {
    label: string;
    kinds: Record<ShotKind, string>;
    hints: Record<ShotKind, string>;
    edit: string;
    copied: string;
    copy: string;
    save: string;
    saved: string;
    saveFailed: string; // for SAVE_FAILED_MS, then Simpan again
    delete: string;
    title: string;
    empty: string;
    macKeys: string;
    otherKeys: string;
    and: string; // between two keys
    permission: string;
    openSettings: string;
    time: string; // today: {h} and {m}
    yesterday: string;
    date: string; // before yesterday: {d} and {month}
    months: string[];
  };
  // Screenshot's editor window (§7); Salin and Simpan come from `shot`.
  // `tools` is keyed by the editor's Tool; `colors` and `widths` follow its
  // COLORS and WIDTHS.
  editor: {
    title: string;
    undo: string;
    redo: string;
    tools: Record<string, string>;
    colors: string[];
    widths: string[];
    corner: string;
    background: string;
    bg: { solid: string; gradient: string; image: string; none: string; customColor: string; gradientFrom: string; gradientTo: string; wallpaper: string; file: string; padding: string };
  };
}

type ShotKind = 'screen' | 'window' | 'area';

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
