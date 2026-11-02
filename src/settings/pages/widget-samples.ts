import type { Lang } from '../../kit/protocol';
import type { CatalogWidget } from '../../pages/layout';
import en from '../../../modules/waktu/locales/en.json';
import id from '../../../modules/waktu/locales/id.json';
import { analogSvg } from '../../../modules/waktu/widgets/analog';
import { calendarView } from '../../../modules/waktu/widgets/calendar';
import { clockDateView } from '../../../modules/waktu/widgets/clockdate';
import { weekStripView } from '../../../modules/waktu/widgets/weekstrip';
import { yearDayView } from '../../../modules/waktu/widgets/yearday';
import type { HomeSnapshot } from '../../../modules/home/types';
import enSekitar from '../../../modules/sekitar/locales/en.json';
import idSekitar from '../../../modules/sekitar/locales/id.json';
import { bigWeatherView } from '../../../modules/sekitar/widgets/bigweather';
import { moonView } from '../../../modules/sekitar/widgets/moon';
import { svgBox } from '../../kit/widget';

// Editor samples for the widget packs, drawn with the helpers the widgets use. Static, at the
// same moment as the home samples (30 Oct 2026, 09:32), not live.
const AT = new Date(2026, 9, 30, 9, 32, 15);

// The weather the samples show: a cloudy morning in Jakarta.
const WEATHER: HomeSnapshot = {
  place: { name: 'Jakarta', region: 'Jakarta', country: 'Indonesia', latitude: -6.21, longitude: 106.85 },
  weather: { temp: 31.4, code: 3, min: 24.7, max: 33.2, fetchedAt: AT.getTime(), latitude: -6.21, longitude: 106.85 },
  prayer: null,
  reminders: [],
};

// The sample for a pack widget, or null for one that is not a pack's.
export function packSample(w: CatalogWidget, lang: Lang): HTMLElement[] | null {
  switch (w.ref) {
    case 'waktu/clockdate': {
      // The widget's own content, minus the wrapper that fills a frame.
      const view = clockDateView(document.body, lang, AT, 'Jakarta');
      return [...view.children] as HTMLElement[];
    }
    case 'waktu/analog':
      return [svgBox('ed-analog', analogSvg(AT, lang))];
    case 'waktu/calendar':
      return [calendarView(lang, AT)];
    case 'waktu/yearday':
      return [yearDayView(document.body, AT, lang === 'en' ? en : id)];
    case 'waktu/weekstrip':
      return [weekStripView(lang, AT)];
    case 'sekitar/bigweather':
      return [bigWeatherView(document.body, lang === 'en' ? enSekitar : idSekitar, WEATHER, AT)];
    case 'sekitar/moon':
      return [moonView(document.body, lang === 'en' ? enSekitar : idSekitar, AT)];
    default:
      return null;
  }
}
