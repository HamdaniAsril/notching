import { dayKey } from '../modules/home/format';
import type { HomeSnapshot, PrayerName, PrayerTime, Reminder } from '../modules/home/types';

// Beranda's data for the browser preview (`npm run dev`), kept in memory.
// `?city=0` starts without a city; `?status=1` adds a running Timer.
export function fakeHome(params: URLSearchParams): (capability: string, method: string, args: unknown) => Promise<unknown> {
  const hasCity = params.get('city') !== '0';
  const at = (days: number, h: number, m: number) => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, h, m).getTime();
  };
  const today = dayKey(new Date());
  let nextId = 3;
  const reminders: Reminder[] = [
    { id: 1, title: 'Kirim invoice', day: today, at: at(0, 14, 0), done: false, notified: false },
    { id: 2, title: 'Bayar listrik', day: today, at: null, done: false, notified: false },
  ];

  // The Kemenag times for Jakarta on 29 October 2026, every day.
  function prayer() {
    const names: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    const hm = [[4, 10], [11, 40], [14, 53], [17, 49], [19, 0]];
    const day = (offset: number): PrayerTime[] => names.map((name, i) => ({ name, at: at(offset, hm[i][0], hm[i][1]) }));
    const all = [...day(-1), ...day(0), ...day(1)];
    const now = Date.now();
    return { today: day(0), prev: [...all].reverse().find(p => p.at <= now)!, next: all.find(p => p.at > now)! };
  }

  function snapshot(): HomeSnapshot {
    return {
      place: hasCity ? { name: 'Jakarta', region: 'Jakarta', country: 'Indonesia', latitude: -6.21462, longitude: 106.84513 } : null,
      weather: hasCity
        ? { temp: 31.4, code: 3, min: 24.7, max: 33.2, fetchedAt: Date.now(), latitude: -6.21, longitude: 106.85 }
        : null,
      prayer: hasCity ? prayer() : null,
      reminders: reminders.map(r => ({ ...r })),
      showClock: true,
      statuses: params.get('status') === '1' ? [{ module: 'timer', label: 'Timer', value: '12.30' }] : [],
    };
  }

  return async (capability, method, args) => {
    const a = (args ?? {}) as { title?: string; day?: string; at?: number | null; id?: number; done?: boolean };
    if (capability === 'home.data') return snapshot();
    if (capability === 'reminders' && method === 'add') {
      const r: Reminder = { id: nextId++, title: a.title!, day: a.day!, at: a.at ?? null, done: false, notified: false };
      reminders.push(r);
      return r;
    }
    if (capability === 'reminders' && method === 'setDone') {
      const r = reminders.find(x => x.id === a.id);
      if (!r) throw new Error(`unknown reminder ${a.id}`);
      r.done = a.done!;
      return null;
    }
    throw new Error(`unknown method ${method}`);
  };
}
