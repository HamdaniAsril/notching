import { COLORS, TOOLS, WIDTHS, emptyDoc, parse, type Style, type Tool } from './model';

// The editor's own settings, kept in the window's localStorage so the next
// editor opens with the tool, colour and width used last (owner, 1 Nov), and a
// new screenshot with the Sudut, Jarak and Background used last. `color` and
// `width` are places in COLORS and WIDTHS. A picture background is not kept:
// it is large, so `style` holds none in its place.
export interface Prefs {
  tool: Tool;
  color: number;
  width: number;
  style: Style;
}

export const PREFS_KEY = 'notching.editor';
export const DEFAULT_PREFS: Prefs = { tool: 'pen', color: 0, width: 1, style: emptyDoc().style };

export type PrefsStorage = Pick<Storage, 'getItem' | 'setItem'>;

const place = (v: unknown, length: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < length;

const withoutPicture = (s: Style): Style => (s.background.kind === 'image' ? { ...s, background: { kind: 'none' } } : s);

export const serializePrefs = (p: Prefs): string => JSON.stringify({ ...p, style: withoutPicture(p.style) });

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
    // Checked as edits.json's style is.
    style: withoutPicture(parse(JSON.stringify({ v: 1, shapes: [], style: r.style })).style),
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
