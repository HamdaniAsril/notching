// Same shapes as HomeSnapshot in src-tauri/src/home/mod.rs.

export interface Place {
  name: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
}

// One forecast hour: `at` ms since the epoch, `rain` the chance of rain in percent.
export interface Hour {
  at: number;
  temp: number;
  code: number;
  rain: number;
}

// `latitude`/`longitude` are the rounded coordinates the weather was fetched for. `hourly` is up
// to 48 hours from midnight today, and missing in a cache older than the hours.
export interface Weather {
  temp: number;
  code: number; // WMO weather code
  min: number;
  max: number;
  fetchedAt: number;
  latitude: number;
  longitude: number;
  hourly?: Hour[];
}

// The US air quality index now, 0 to 500; only for the chosen city.
export interface Air {
  aqi: number;
  fetchedAt: number;
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

// Sunrise and sunset of today and the next sunrise, ms since the epoch.
export interface SunDay {
  rise: number;
  set: number;
  nextRise: number;
}

export interface HomeSnapshot {
  place: Place | null;
  weather: Weather | null;
  air: Air | null;
  prayer: PrayerDay | null;
  sun: SunDay | null;
  reminders: Reminder[];
}
