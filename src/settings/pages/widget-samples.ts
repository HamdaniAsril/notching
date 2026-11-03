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
import enHome from '../../../modules/home/locales/en.json';
import idHome from '../../../modules/home/locales/id.json';
import { clockView } from '../../../modules/home/widgets/clock';
import { dateView } from '../../../modules/home/widgets/date';
import { prayerView } from '../../../modules/home/widgets/prayer';
import { remindersView } from '../../../modules/home/widgets/reminders';
import { weatherView } from '../../../modules/home/widgets/weather';
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
import enMusik from '../../../modules/musik/locales/en.json';
import idMusik from '../../../modules/musik/locales/id.json';
import type { NowView } from '../../../modules/musik/now';
import { miniView } from '../../../modules/musik/widgets/mini';
import { playerView } from '../../../modules/musik/widgets/player';
import { stripView } from '../../../modules/musik/widgets/strip';
import enTimer from '../../../modules/timer/locales/en.json';
import idTimer from '../../../modules/timer/locales/id.json';
import { tileView } from '../../../modules/timer/tile';
import type { Reminder } from '../../../modules/home/types';
import { svgBox } from '../../kit/widget';

// Editor samples for the built-in and pack widgets, drawn with the helpers the widgets use. Static, at the
// same moment as the home samples (30 Oct 2026, 09:32), not live.
const AT = new Date(2026, 9, 30, 9, 32, 15);

// The hours of the weather samples: from midnight on the 30th, dry until a rainy afternoon.
const HOURLY = Array.from({ length: 48 }, (_, i) => {
  const h = i % 24;
  const rainy = h >= 15 && h <= 18;
  return { at: new Date(2026, 9, 30, i).getTime(), temp: 26 + Math.min(h, 24 - h) / 3, code: rainy ? 61 : h >= 6 && h <= 17 ? 3 : 1, rain: rainy ? 70 : 10 };
});

const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).getTime();

// The weather the samples show: a cloudy morning in Jakarta, with the sun times of that day.
const WEATHER: HomeSnapshot = {
  place: { name: 'Jakarta', region: 'Jakarta', country: 'Indonesia', latitude: -6.21, longitude: 106.85 },
  weather: { temp: 31.4, code: 3, min: 24.7, max: 33.2, fetchedAt: AT.getTime(), latitude: -6.21, longitude: 106.85, hourly: HOURLY },
  air: { aqi: 42, fetchedAt: AT.getTime() },
  prayer: null,
  sun: { rise: new Date(2026, 9, 30, 5, 28).getTime(), set: new Date(2026, 9, 30, 17, 45).getTime(), nextRise: new Date(2026, 9, 31, 5, 28).getTime() },
  reminders: [],
};

// What the home samples show: the weather above, Asar (15.12) as the next prayer after Zuhur,
// and four reminders for today, one done, each in the sample's language.
const HOME_TITLES = {
  id: ['Bayar listrik', 'Kirim invoice', 'Telepon ibu', 'Servis motor'],
  en: ['Pay the bill', 'Send invoice', 'Call mum', 'Service the bike'],
};
function homeSample(lang: Lang): HomeSnapshot {
  const [paid, invoice, call, service] = HOME_TITLES[lang];
  const day = '2026-10-30';
  return {
    ...WEATHER,
    prayer: { today: [], prev: { name: 'dhuhr', at: at(30, 11, 41) }, next: { name: 'asr', at: at(30, 15, 12) } },
    reminders: [
      { id: 1, title: paid, day, at: at(30, 8, 0), done: true, notified: true },
      { id: 2, title: invoice, day, at: at(30, 14, 0), done: false, notified: false },
      { id: 3, title: call, day, at: at(30, 16, 30), done: false, notified: false },
      { id: 4, title: service, day, at: null, done: false, notified: false },
    ],
  };
}

// The reminders the Rencana samples show: two today (Friday), one on Saturday.
const REMINDERS: Reminder[] = [
  { id: 1, title: 'Kirim invoice', day: '2026-10-30', at: at(30, 14, 0), done: false, notified: false },
  { id: 2, title: 'Bayar listrik', day: '2026-10-30', at: null, done: false, notified: false },
  { id: 3, title: 'Rapat tim', day: '2026-10-31', at: at(31, 9, 0), done: false, notified: false },
];

// What the Musik samples show: "Jalan Braga" by Kolektif Senja, 2:14 of 3:48, playing, with no
// artwork (the accent tile), as in the design.
const MUSIK: NowView = { empty: false, playing: true, title: 'Jalan Braga', artist: 'Kolektif Senja', art: null, position: 134, duration: 228 };

// The sample for a widget of the home and the packs, or null for one that is not.
export function packSample(w: CatalogWidget, lang: Lang): HTMLElement[] | null {
  switch (w.ref) {
    case 'home/date':
      return [dateView(lang, AT)];
    case 'home/clock':
      return [clockView(lang === 'en' ? enHome : idHome, lang, AT)];
    case 'home/weather':
      return [weatherView(lang === 'en' ? enHome : idHome, homeSample(lang), AT)];
    case 'home/prayer':
      return [prayerView(lang === 'en' ? enHome : idHome, lang, homeSample(lang), AT)];
    case 'home/reminders':
      return [remindersView(lang === 'en' ? enHome : idHome, lang, homeSample(lang).reminders, AT)];
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
      return [breathView(strings, strings.idle)];
    }
    case 'fokus/workday':
      // Working, with the default hours: a sample is static.
      return [workdayView(lang === 'en' ? enFokus : idFokus, lang, DEFAULT_WORK, AT)];
    case 'timer/tile':
      // Idle with the 25 minutes of the last preset: a sample is static.
      return [tileView(document.body, lang === 'en' ? enTimer : idTimer, { kind: 'idle', minutes: 25 })];
    case 'musik/player':
      return [playerView(lang === 'en' ? enMusik : idMusik, lang, MUSIK)];
    case 'musik/strip':
      return [stripView(lang === 'en' ? enMusik : idMusik, lang, MUSIK)];
    case 'musik/mini':
      return [miniView(lang === 'en' ? enMusik : idMusik, lang, MUSIK)];
    default:
      return null;
  }
}
