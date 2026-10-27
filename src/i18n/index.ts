import type { Lang } from '../kit/protocol';
import en from './en.json';
import id from './id.json';

// Text drawn by the notch itself; modules carry their own.
export interface HostStrings {
  emptyTitle: string;
  emptyHint: string;
  loadFailed: string;
  settings: string;
}

const STRINGS: Record<Lang, HostStrings> = { id, en };

export function hostStrings(lang: Lang): HostStrings {
  return STRINGS[lang];
}
