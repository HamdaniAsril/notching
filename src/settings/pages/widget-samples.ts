import type { Lang } from '../../kit/protocol';
import type { CatalogWidget } from '../../pages/layout';
import en from '../../../modules/waktu/locales/en.json';
import id from '../../../modules/waktu/locales/id.json';
import { analogSvg } from '../../../modules/waktu/widgets/analog';
import { calendarView } from '../../../modules/waktu/widgets/calendar';
import { clockDateView } from '../../../modules/waktu/widgets/clockdate';
import { weekStripView } from '../../../modules/waktu/widgets/weekstrip';
import { yearDayView } from '../../../modules/waktu/widgets/yearday';
import { zonesView } from '../../../modules/waktu/widgets/zones';
import { DEFAULT_ZONES } from '../../../modules/waktu/zones';
import type { HomeSnapshot } from '../../../modules/home/types';
import enSekitar from '../../../modules/sekitar/locales/en.json';
import idSekitar from '../../../modules/sekitar/locales/id.json';
import { airView } from '../../../modules/sekitar/widgets/air';
import { bigWeatherView } from '../../../modules/sekitar/widgets/bigweather';
import { hourlyView } from '../../../modules/sekitar/widgets/hourly';
import { moonView } from '../../../modules/sekitar/widgets/moon';
import { sunView } from '../../../modules/sekitar/widgets/sun';
import enRencana from '../../../modules/rencana/locales/en.json';
import idRencana from '../../../modules/rencana/locales/id.json';
import { nextView } from '../../../modules/rencana/widgets/next';
import { weekView } from '../../../modules/rencana/widgets/week';
import enFokus from '../../../modules/fokus/locales/en.json';
import idFokus from '../../../modules/fokus/locales/id.json';
import { breathView } from '../../../modules/fokus/widgets/breath';
import { workdayView } from '../../../modules/fokus/widgets/workday';
import { DEFAULT_WORK } from '../../../modules/fokus/work';
import enTimer from '../../../modules/timer/locales/en.json';
import idTimer from '../../../modules/timer/locales/id.json';
import { tileView } from '../../../modules/timer/tile';
import type { Reminder } from '../../../modules/home/types';
import { svgBox } from '../../kit/widget';

// Editor samples for the widget packs, drawn with the helpers the widgets use. Static, at the
// same moment as the home samples (30 Oct 2026, 09:32), not live.
const AT = new Date(2026, 9, 30, 9, 32, 15);

// The hours of the weather samples: from midnight on the 30th, dry until a rainy afternoon.
const HOURLY = Array.from({ length: 48 }, (_, i) => {
  const h = i % 24;
  const rainy = h >= 15 && h <= 18;
  return { at: new Date(2026, 9, 30, i).getTime(), temp: 26 + Math.min(h, 24 - h) / 3, code: rainy ? 61 : h >= 6 && h <= 17 ? 3 : 1, rain: rainy ? 70 : 10 };
});

// The weather the samples show: a cloudy morning in Jakarta, with the sun times of that day.
const WEATHER: HomeSnapshot = {
  place: { name: 'Jakarta', region: 'Jakarta', country: 'Indonesia', latitude: -6.21, longitude: 106.85 },
  weather: { temp: 31.4, code: 3, min: 24.7, max: 33.2, fetchedAt: AT.getTime(), latitude: -6.21, longitude: 106.85, hourly: HOURLY },
  air: { aqi: 42, fetchedAt: AT.getTime() },
  prayer: null,
  sun: { rise: new Date(2026, 9, 30, 5, 28).getTime(), set: new Date(2026, 9, 30, 17, 45).getTime(), nextRise: new Date(2026, 9, 31, 5, 28).getTime() },
  reminders: [],
};

// The reminders the Rencana samples show: two today (Friday), one on Saturday.
const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).getTime();
const REMINDERS: Reminder[] = [
  { id: 1, title: 'Kirim invoice', day: '2026-10-30', at: at(30, 14, 0), done: false, notified: false },
  { id: 2, title: 'Bayar listrik', day: '2026-10-30', at: null, done: false, notified: false },
  { id: 3, title: 'Rapat tim', day: '2026-10-31', at: at(31, 9, 0), done: false, notified: false },
];

// The sample for a pack widget, or null for one that is not a pack's.
export function packSample(w: CatalogWidget, lang: Lang): HTMLElement[] | null {
  switch (w.ref) {
    case 'waktu/clockdate':
      return [clockDateView(document.body, lang, AT, 'Jakarta')];
    case 'waktu/analog':
      return [svgBox('v-card flush wd-analog', analogSvg(AT, lang, 'Jakarta'))];
    case 'waktu/calendar':
      return [calendarView(lang === 'en' ? en : id, lang, AT)];
    case 'waktu/yearday':
      return [yearDayView(document.body, AT, lang === 'en' ? en : id)];
    case 'waktu/weekstrip':
      return [weekStripView(lang === 'en' ? en : id, lang, AT)];
    case 'waktu/zones':
      // Home and the default cities at the fixed instant: a sample is static.
      return [zonesView(lang === 'en' ? en : id, lang, DEFAULT_ZONES, AT, 'Jakarta')];
    case 'sekitar/bigweather':
      return [bigWeatherView(document.body, lang === 'en' ? enSekitar : idSekitar, WEATHER, AT)];
    case 'sekitar/moon':
      return [moonView(document.body, lang === 'en' ? enSekitar : idSekitar, AT)];
    case 'sekitar/air':
      return [airView(document.body, lang === 'en' ? enSekitar : idSekitar, WEATHER)];
    case 'sekitar/sun':
      return [sunView(lang === 'en' ? enSekitar : idSekitar, lang, WEATHER, AT)];
    case 'sekitar/hourly':
      return [hourlyView(lang === 'en' ? enSekitar : idSekitar, lang, WEATHER, AT)];
    case 'rencana/week':
      return [weekView(lang === 'en' ? enRencana : idRencana, lang, REMINDERS, AT)];
    case 'rencana/next':
      return [nextView(lang === 'en' ? enRencana : idRencana, lang, REMINDERS, AT)];
    case 'fokus/breath': {
      // The idle state: a sample is static.
      const strings = lang === 'en' ? enFokus : idFokus;
      return [breathView(strings, strings.tap)];
    }
    case 'fokus/workday':
      // Working, with the default hours: a sample is static.
      return [workdayView(lang === 'en' ? enFokus : idFokus, lang, DEFAULT_WORK, AT)];
    case 'timer/tile':
      // Idle with the 25 minutes of the last preset: a sample is static.
      return [tileView(document.body, lang === 'en' ? enTimer : idTimer, { kind: 'idle', minutes: 25 })];
    default:
      return null;
  }
}
