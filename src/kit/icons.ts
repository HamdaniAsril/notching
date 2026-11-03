// Icon paths are from Lucide (https://lucide.dev), ISC License, Copyright (c) for Lucide Contributors.
import { weatherKey } from '../../modules/home/format';

export type IconName =
  | 'sun' | 'moon' | 'cloud' | 'cloud-sun' | 'cloud-moon' | 'cloud-rain'
  | 'cloud-drizzle' | 'cloud-snow' | 'cloud-lightning' | 'cloud-fog' | 'wind' | 'timer' | 'mosque';

const svg = (body: string) =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';

export const ICONS: Record<IconName, string> = {
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'),
  moon: svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  cloud: svg('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'),
  'cloud-sun': svg('<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>'),
  'cloud-moon': svg('<path d="M10.188 8.5A6 6 0 0 1 16 4a1 1 0 0 0 6 6 6 6 0 0 1-3 5.197"/><path d="M13 16a3 3 0 1 1 0 6H7a5 5 0 1 1 4.9-6Z"/>'),
  'cloud-rain': svg('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>'),
  'cloud-drizzle': svg('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M8 19v1"/><path d="M8 14v1"/><path d="M16 19v1"/><path d="M16 14v1"/><path d="M12 21v1"/><path d="M12 16v1"/>'),
  'cloud-snow': svg('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M8 15h.01"/><path d="M8 19h.01"/><path d="M12 17h.01"/><path d="M12 21h.01"/><path d="M16 15h.01"/><path d="M16 19h.01"/>'),
  'cloud-lightning': svg('<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/>'),
  'cloud-fog': svg('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 17H7"/><path d="M17 21H9"/>'),
  wind: svg('<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>'),
  // Not in Lucide: an onion dome on a short base with a door, a finial on top.
  mosque: svg('<path d="M12 2v2"/><path d="M7 13c-4-2.5-2-6.5 5-9 7 2.5 9 6.5 5 9"/><path d="M5 13h14"/><path d="M6 13v8h12v-8"/><path d="M10 21v-3a2 2 0 0 1 4 0v3"/>'),
  timer: svg('<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>'),
};

// An <i class="ic"> holding the icon at `size` px; it takes the text color.
export function icon(name: IconName, size = 16): HTMLElement {
  const i = document.createElement('i');
  i.className = 'ic';
  i.innerHTML = ICONS[name].replace('width="24" height="24"', `width="${size}" height="${size}"`);
  return i;
}

// WMO code to icon, grouped like weatherKey; the sun is a moon at night.
export function weatherIcon(code: number, night: boolean): IconName {
  switch (weatherKey(code)) {
    case 'clear': return night ? 'moon' : 'sun';
    case 'mostlyClear': return night ? 'cloud-moon' : 'cloud-sun';
    case 'fog': return 'cloud-fog';
    case 'drizzle': return 'cloud-drizzle';
    case 'rain':
    case 'showers': return 'cloud-rain';
    case 'snow': return 'cloud-snow';
    case 'storm': return 'cloud-lightning';
    default: return 'cloud';
  }
}
