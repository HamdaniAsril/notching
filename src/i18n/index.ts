import type { Lang } from '../kit/protocol';
import en from './en.json';
import id from './id.json';
import macosNames from './macos-names.json';

// Text drawn by the notch itself; modules carry their own.
export interface HostStrings {
  home: string; // Beranda's name
  modules: string;
  pageN: string; // a widget page with no name of its own: {n}, its place
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
    copyFailed: string; // the editor's Salin, likewise
    delete: string;
    title: string;
    empty: string;
    macKeys: string;
    otherKeys: string;
    otherKeysMany: string; // two keys at once: "are taken" in English
    shortcutKeys: string; // keys another of the Mac's shortcuts holds
    // The first-use notice (design 3 Nov tombol §4); the titles take {keys}.
    setup: { label: string; macTitle: string; otherTitle: string; macText: string; otherText: string; turnOff: string; own: string };
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
  cleaner: CleanerStrings;
}

type ShotKind = 'screen' | 'window' | 'area';

// Cleaner's notch pages (design 1 Nov); the Indonesian file is the reference shape.
export type CleanerStrings = (typeof id)['cleaner'];

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

// Text of Intip jendela's peek panel (design 5 Nov §9).
export type PeekStrings = (typeof id)['peek'];

export function peekStrings(lang: Lang): PeekStrings {
  return lang === 'en' ? en.peek : id.peek;
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

// A system permission Notching asks for, by its {placeholder} in the language files.
export type SystemPermission = keyof typeof macosNames;

// What System Settings › Privacy & Security calls each permission on macOS
// `macos` (its major version), in `lang`. macOS 27 renamed Accessibility and
// macOS 15 Screen Recording; macos-names.json is shared with the core's notices.
export function systemNames(lang: Lang, macos: number): Record<SystemPermission, string> {
  // Newest first; an unknown version gets the oldest name.
  const pick = (p: SystemPermission) => {
    const names = macosNames[p];
    return (names.find(n => macos >= n.from) ?? names[names.length - 1])[lang];
  };
  return { accessibility: pick('accessibility'), screenRecording: pick('screenRecording'), fullDiskAccess: pick('fullDiskAccess'), camera: pick('camera') };
}
