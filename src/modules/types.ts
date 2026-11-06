import type { Lang } from '../kit/protocol';
import type { NotchConfig } from '../notch/config';
import type { CardSize } from '../notch/controller';

// A module's notification channel with the person's switches (ChannelDto).
export interface Channel {
  id: string;
  name: string;
  on: boolean;
  sound: boolean;
  widget: string | null; // the widget that sends it: a click opens the page holding it
}

export type WidgetKind = 'time' | 'weather' | 'worship' | 'work' | 'media';

// A widget a package offers (WidgetDto), 1 or 2 of a page's 4 columns wide, or
// 4 for a strip under the row (design 31 Oct, Timer §3).
export interface WidgetInfo {
  id: string;
  name: string;
  entry: string;
  width: number;
  kind: WidgetKind;
}

// A widget on a page; `widget` is "<package>/<widget>".
export interface Placement {
  widget: string;
  col: number;
  width: number;
}

// Same shape as Page in src-tauri/src/pages.rs; Beranda's name is null.
export interface Page {
  id: string;
  name: string | null;
  icon: string;
  widgets: Placement[];
  strip?: string | null; // a strip widget's "<package>/<widget>"; absent or null: none
}

// White tile while on, a red dot while running (design 30 Oct §7).
export type Activity = 'on' | 'running';

// Same shape as ModuleStateDto in src-tauri/src/app_core.rs.
export interface ModuleInfo {
  id: string;
  name: string;
  shortName: string; // for the Modul page's tiles
  description: string;
  version: string;
  entry: string | null; // null with card: a package of widgets only, not a module
  icon: string;
  card: CardSize | null;
  installed: boolean;
  enabled: boolean;
  size: number; // bytes of the original package
  iconSvg: string; // the icon file's SVG text
  channels: Channel[];
  widgets: WidgetInfo[];
  activity: Activity | null;
  status: boolean; // declares "status": may show a status beside the notch
  statusShown: boolean; // its status switch in Pengaturan
  action: TileAction | null; // its Modul tile runs this instead of opening a page
  tool: boolean; // a background tool: no tile and no page in the notch (design 4 Nov, alat latar §6)
  permissions: string[]; // system permissions it needs: 'accessibility', 'camera', 'location', 'screen-recording'
  category: ModuleCategory; // its group on Pengaturan's Modul page
}

// The Modul page's groups, in order (owner, 4 Nov). Same values as Category in
// src-tauri/src/modules/manifest.rs; a manifest without one is a utility.
export const MODULE_CATEGORIES = ['utilities', 'energy', 'window', 'app-management', 'files', 'apps'] as const;
export type ModuleCategory = typeof MODULE_CATEGORIES[number];

// A call to one of the module's own capabilities (design 31 Oct, Keyboard Cleaning Mode §7).
export interface TileAction {
  capability: string;
  method: string;
}

// A module with a page of its own.
export const hasPage = (m: ModuleInfo): boolean => m.entry !== null && m.card !== null;

// A module the person sees as one, with a tile on the Modul page: it has a page
// or a tile action. Anything else is a package of widgets only.
export const isModule = (m: ModuleInfo): boolean => hasPage(m) || m.action !== null || m.tool;

// A background tool (design 4 Nov, alat latar): switched on and off like a
// module, but with no tile on the notch's Modul page.
export const isTool = (m: ModuleInfo): boolean => m.tool;

export interface ModuleState {
  lang: Lang;
  modules: ModuleInfo[];
  pages: Page[]; // Beranda first, then the custom pages
  lastPage: string | null; // a page id, 'modules' or 'module:<id>'
  notch: NotchConfig;
  notifications: { glow: boolean; seconds: number };
  missed: string[]; // "<module>.<channel>" of notices nobody saw, oldest first
  sampleStatus: boolean; // the sample status from Notifikasi is showing
  accent: string; // "#rrggbb", the Volt accent picked in Tampilan
  accentCustom: string | null; // the last custom colour, kept while a preset is chosen
  panelGlass: boolean; // the open panel fades toward its bottom; false: solid black
  shelfOpenOnDrag: boolean; // Shelf opens as soon as a file drag starts anywhere
  peek: PeekSettings; // Intip jendela (design 5 Nov §4)
  peekKeyLabel: string; // its switcher key as shown ("⌘⇥")
}

// Intip jendela's settings on Pintasan (design 5 Nov §4).
export interface PeekSettings {
  dock: boolean; // peek from the Dock
  dockClick: 'toggle' | 'mac'; // a Dock icon click minimizes or brings back every window, or is macOS's own
  card: 'system' | 'light' | 'dark';
  material: 'solid' | 'glass';
  minimized: boolean; // minimized windows shown too, marked
  switcher: boolean; // the window switcher, on its key
  switcherKey: { code: number; mods: number }; // a macOS key code and Carbon modifiers; ⌘Tab unless changed
  layout: 'windows' | 'apps';
  place: 'center' | 'notch';
}

export const DEFAULT_PEEK: PeekSettings = {
  dock: true, dockClick: 'toggle', card: 'system', material: 'solid', minimized: true,
  switcher: true, switcherKey: { code: 48, mods: 0x0100 }, layout: 'windows', place: 'center',
};

// Beranda's package: always installed, so the Katalog leaves it out (design 4 Nov §3).
export const CORE_PACKAGE = 'home';

// What the Katalog offers: every module and widget package but Beranda's.
export const inCatalog = (m: ModuleInfo): boolean =>
  m.id !== CORE_PACKAGE && (isModule(m) || m.widgets.length > 0);
