// Same shapes as HomeSnapshot in src-tauri/src/home/mod.rs.

export interface Place {
  name: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
}

// `latitude`/`longitude` are the rounded coordinates the weather was fetched for.
export interface Weather {
  temp: number;
  code: number; // WMO weather code
  min: number;
  max: number;
  fetchedAt: number;
  latitude: number;
  longitude: number;
}

export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export interface PrayerTime {
  name: PrayerName;
  at: number; // ms since the epoch
}

export interface PrayerDay {
  today: PrayerTime[];
  prev: PrayerTime;
  next: PrayerTime;
}

// `day` is the local date "YYYY-MM-DD"; `at` the due time, null without one.
export interface Reminder {
  id: number;
  title: string;
  day: string;
  at: number | null;
  done: boolean;
  notified: boolean;
}

// A running module's line in the bottom row, e.g. Timer 12.30 (plan 5).
export interface MiniStatus {
  module: string;
  label: string;
  value: string;
}

export interface HomeSnapshot {
  place: Place | null;
  weather: Weather | null;
  prayer: PrayerDay | null;
  reminders: Reminder[];
  showClock: boolean;
  statuses: MiniStatus[];
}
