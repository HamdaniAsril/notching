import { COLORS, TOOLS, WIDTHS, type Tool } from './model';

// The editor's own settings, kept in the window's localStorage so the next
// editor opens with the tool, colour and width used last (owner, 1 Nov).
// `color` and `width` are places in COLORS and WIDTHS.
export interface Prefs {
  tool: Tool;
  color: number;
  width: number;
}

export const PREFS_KEY = 'notching.editor';
export const DEFAULT_PREFS: Prefs = { tool: 'pen', color: 0, width: 1 };

export type PrefsStorage = Pick<Storage, 'getItem' | 'setItem'>;

const place = (v: unknown, length: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < length;

export const serializePrefs = (p: Prefs): string => JSON.stringify(p);

// A part that is not ours is the default, so an old or damaged value still opens.
export function parsePrefs(s: string | null): Prefs {
  let raw: unknown = null;
  try {
    raw = s ? JSON.parse(s) : null;
  } catch {
    raw = null;
  }
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFS };
  const r = raw as Record<string, unknown>;
  return {
    tool: TOOLS.includes(r.tool as Tool) ? (r.tool as Tool) : DEFAULT_PREFS.tool,
    color: place(r.color, COLORS.length) ? r.color : DEFAULT_PREFS.color,
    width: place(r.width, WIDTHS.length) ? r.width : DEFAULT_PREFS.width,
  };
}

// Storage that cannot be read or written is no reason to fail the editor.
export function readPrefs(storage: PrefsStorage | null): Prefs {
  try {
    return parsePrefs(storage?.getItem(PREFS_KEY) ?? null);
  } catch (e) {
    console.error('notching: editor settings not read', e);
    return { ...DEFAULT_PREFS };
  }
}

export function writePrefs(storage: PrefsStorage | null, p: Prefs): void {
  try {
    storage?.setItem(PREFS_KEY, serializePrefs(p));
  } catch (e) {
    console.error('notching: editor settings not kept', e);
  }
}
