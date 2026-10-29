// Shared by the widget tests: a Tuesday morning in Jakarta.
import type { HomeSnapshot, Reminder } from '../types';

export const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).getTime();
export const NOW = new Date(2026, 9, 27, 10, 18);
export const rem = (rid: number, title: string, day: string, when: number | null, done = false): Reminder =>
  ({ id: rid, title, day, at: when, done, notified: false });

export const SNAP: HomeSnapshot = {
  place: { name: 'Jakarta', region: 'Jakarta', country: 'Indonesia', latitude: -6.21462, longitude: 106.84513 },
  weather: { temp: 31.4, code: 3, min: 24.7, max: 33.2, fetchedAt: at(27, 10, 0), latitude: -6.21, longitude: 106.85 },
  prayer: {
    today: [],
    prev: { name: 'fajr', at: at(27, 4, 10) },
    next: { name: 'dhuhr', at: at(27, 11, 40) },
  },
  reminders: [
    rem(3, 'Beli kopi', '2026-10-27', null, true),
    rem(2, 'Bayar listrik', '2026-10-27', null),
    rem(1, 'Kirim invoice', '2026-10-27', at(27, 14, 0)),
  ],
};

export function host(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}
