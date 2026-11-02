import type { Lang } from '../../src/kit/protocol';

// A city of the Zona waktu widget: a short code, an IANA zone and its name in each language.
export interface City {
  code: string;
  tz: string;
  id: string;
  en: string;
}

export const CITIES: City[] = [
  { code: 'JKT', tz: 'Asia/Jakarta', id: 'Jakarta', en: 'Jakarta' },
  { code: 'MKS', tz: 'Asia/Makassar', id: 'Makassar', en: 'Makassar' },
  { code: 'JYP', tz: 'Asia/Jayapura', id: 'Jayapura', en: 'Jayapura' },
  { code: 'SIN', tz: 'Asia/Singapore', id: 'Singapura', en: 'Singapore' },
  { code: 'KUL', tz: 'Asia/Kuala_Lumpur', id: 'Kuala Lumpur', en: 'Kuala Lumpur' },
  { code: 'BKK', tz: 'Asia/Bangkok', id: 'Bangkok', en: 'Bangkok' },
  { code: 'HAN', tz: 'Asia/Ho_Chi_Minh', id: 'Hanoi', en: 'Hanoi' },
  { code: 'MNL', tz: 'Asia/Manila', id: 'Manila', en: 'Manila' },
  { code: 'HKG', tz: 'Asia/Hong_Kong', id: 'Hong Kong', en: 'Hong Kong' },
  { code: 'TPE', tz: 'Asia/Taipei', id: 'Taipei', en: 'Taipei' },
  { code: 'SHA', tz: 'Asia/Shanghai', id: 'Shanghai', en: 'Shanghai' },
  { code: 'TYO', tz: 'Asia/Tokyo', id: 'Tokyo', en: 'Tokyo' },
  { code: 'SEL', tz: 'Asia/Seoul', id: 'Seoul', en: 'Seoul' },
  { code: 'DAC', tz: 'Asia/Dhaka', id: 'Dhaka', en: 'Dhaka' },
  { code: 'DEL', tz: 'Asia/Kolkata', id: 'Delhi', en: 'Delhi' },
  { code: 'KHI', tz: 'Asia/Karachi', id: 'Karachi', en: 'Karachi' },
  { code: 'DXB', tz: 'Asia/Dubai', id: 'Dubai', en: 'Dubai' },
  { code: 'DOH', tz: 'Asia/Qatar', id: 'Doha', en: 'Doha' },
  { code: 'RUH', tz: 'Asia/Riyadh', id: 'Riyadh', en: 'Riyadh' },
  { code: 'MKK', tz: 'Asia/Riyadh', id: 'Mekkah', en: 'Mecca' },
  { code: 'JED', tz: 'Asia/Riyadh', id: 'Jeddah', en: 'Jeddah' },
  { code: 'IST', tz: 'Europe/Istanbul', id: 'Istanbul', en: 'Istanbul' },
  { code: 'CAI', tz: 'Africa/Cairo', id: 'Kairo', en: 'Cairo' },
  { code: 'JNB', tz: 'Africa/Johannesburg', id: 'Johannesburg', en: 'Johannesburg' },
  { code: 'MOW', tz: 'Europe/Moscow', id: 'Moskow', en: 'Moscow' },
  { code: 'BER', tz: 'Europe/Berlin', id: 'Berlin', en: 'Berlin' },
  { code: 'AMS', tz: 'Europe/Amsterdam', id: 'Amsterdam', en: 'Amsterdam' },
  { code: 'PAR', tz: 'Europe/Paris', id: 'Paris', en: 'Paris' },
  { code: 'MAD', tz: 'Europe/Madrid', id: 'Madrid', en: 'Madrid' },
  { code: 'ROM', tz: 'Europe/Rome', id: 'Roma', en: 'Rome' },
  { code: 'LON', tz: 'Europe/London', id: 'London', en: 'London' },
  { code: 'NYC', tz: 'America/New_York', id: 'New York', en: 'New York' },
  { code: 'TOR', tz: 'America/Toronto', id: 'Toronto', en: 'Toronto' },
  { code: 'CHI', tz: 'America/Chicago', id: 'Chicago', en: 'Chicago' },
  { code: 'MEX', tz: 'America/Mexico_City', id: 'Kota Meksiko', en: 'Mexico City' },
  { code: 'LAX', tz: 'America/Los_Angeles', id: 'Los Angeles', en: 'Los Angeles' },
  { code: 'SFO', tz: 'America/Los_Angeles', id: 'San Francisco', en: 'San Francisco' },
  { code: 'SAO', tz: 'America/Sao_Paulo', id: 'São Paulo', en: 'São Paulo' },
  { code: 'SYD', tz: 'Australia/Sydney', id: 'Sydney', en: 'Sydney' },
  { code: 'MEL', tz: 'Australia/Melbourne', id: 'Melbourne', en: 'Melbourne' },
  { code: 'AKL', tz: 'Pacific/Auckland', id: 'Auckland', en: 'Auckland' },
];

// The two cities shown next to local time, as codes of CITIES.
export interface ZonePrefs {
  cities: [string, string];
}

export const DEFAULT_ZONES: ZonePrefs = { cities: ['TYO', 'LON'] };

const known = (code: unknown): code is string => typeof code === 'string' && CITIES.some(c => c.code === code);

// Whatever was stored, as full settings: a known code is kept, an unknown one is the default's.
export function checkZones(raw: unknown): ZonePrefs {
  const list = (raw as { cities?: unknown } | null)?.cities;
  const pick = (i: 0 | 1) => (Array.isArray(list) && known(list[i]) ? list[i] : DEFAULT_ZONES.cities[i]);
  return { cities: [pick(0), pick(1)] };
}

export const cityByCode = (code: string): City => CITIES.find(c => c.code === code) ?? CITIES[0];

// The clock of `tz` at `now` (the machine's zone when `tz` is undefined), and its offset from
// UTC in minutes.
export function zoneTime(tz: string | undefined, now: Date): { h: number; m: number; offsetMin: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', timeZoneName: 'longOffset' }).formatToParts(now);
  const part = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  // "GMT+09:00", "GMT-03:30", or a bare "GMT".
  const off = /^GMT(?:([+−-])(\d{1,2})(?::(\d{2}))?)?$/.exec(part('timeZoneName'));
  const offsetMin = off?.[1] ? (off[1] === '+' ? 1 : -1) * (Number(off[2]) * 60 + Number(off[3] ?? 0)) : 0;
  return { h: Number(part('hour')) % 24, m: Number(part('minute')), offsetMin };
}

// Hours from the offset `from` to the offset `to` (minutes): "+2", "−7", "+5,5", with a
// Unicode minus and the decimal separator of the language.
export function diffLabel(from: number, to: number, lang: Lang): string {
  const mins = to - from;
  if (mins === 0) return '0';
  const hours = String(Math.round((Math.abs(mins) / 60) * 100) / 100);
  return `${mins < 0 ? '−' : '+'}${lang === 'id' ? hours.replace('.', ',') : hours}`;
}

// 22:00 to 05:59.
export const isNight = (h: number): boolean => h >= 22 || h < 6;
