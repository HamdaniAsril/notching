// Line icons for pages (design 30 Oct §3), drawn here in the pill's style:
// 24 × 24, stroked, no fill. Fixed strings, so they may go in as markup; a name
// from settings.json only ever picks one of them.
export const PAGE_ICONS: Record<string, string> = {
  home: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6.5 9.5V19h11V9.5"/>',
  star: '<path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',
  heart: '<path d="M12 19s-7-4.4-7-9.5A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 2.5C19 14.6 12 19 12 19z"/>',
  bolt: '<path d="M13 3L5.5 13H12l-1 8 7.5-10H12z"/>',
  briefcase: '<rect x="4" y="7.5" width="16" height="11" rx="2"/><path d="M9 7.5v-2h6v2M4 12.5h16"/>',
  book: '<path d="M5 18.5V5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5 1.5 1.5 0 0 0 6.5 21H19v-3"/>',
  code: '<path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5l-3 14"/>',
  chart: '<path d="M4 19h16M7 16v-4M11 16V8M15 16v-6M19 16V5"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  flag: '<path d="M6 21V4M6 4.5h11l-2 4 2 4H6"/>',
  pin: '<path d="M12 21s-6-5.3-6-10.5a6 6 0 0 1 12 0C18 15.7 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/>',
  globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.2 2.3 3.2 5 3.2 8s-1 5.7-3.2 8c-2.2-2.3-3.2-5-3.2-8s1-5.7 3.2-8z"/>',
  cloud: '<path d="M7.5 18.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17.6 9a4.8 4.8 0 0 1-.6 9.5z"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-12 14z"/><path d="M5 19l7-7"/>',
  coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5V6M12 3.5V6"/>',
  music: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  camera: '<path d="M4 8.5h3.5L9 6h6l1.5 2.5H20V18H4z"/><circle cx="12" cy="13" r="3.2"/>',
  gift: '<rect x="4" y="9" width="16" height="4" rx="1"/><path d="M5.5 13v7h13v-7M12 9v11M12 9C10.5 5.5 6.5 5.5 6.5 7.5S12 9 12 9zM12 9c1.5-3.5 5.5-3.5 5.5-1.5S12 9 12 9z"/>',
  compass: '<circle cx="12" cy="12" r="8"/><path d="M15 9l-1.8 4.2L9 15l1.8-4.2z"/>',
  dot: '<circle cx="12" cy="12" r="2.5"/>',
};

// The icon picker's order.
export const PAGE_ICON_NAMES: string[] = Object.keys(PAGE_ICONS);

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export function pageIconSvg(name: string): string {
  return svg(Object.prototype.hasOwnProperty.call(PAGE_ICONS, name) ? PAGE_ICONS[name] : PAGE_ICONS.dot);
}

// The Modul page's icon in the pill.
export const MODULES_ICON = svg(
  '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
);
