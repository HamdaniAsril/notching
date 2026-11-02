import '../../src/kit/kit.css';
import '../../src/kit/volt.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import { readPrefs, writePrefs } from '../../src/kit/prefs';
import { everyMinute } from '../home/ticks';
import type { HomeSnapshot } from '../home/types';
import en from './locales/en.json';
import id from './locales/id.json';
import { renderAnalog } from './widgets/analog';
import { renderCalendar } from './widgets/calendar';
import { renderClockDate } from './widgets/clockdate';
import { renderWeekStrip } from './widgets/weekstrip';
import { renderYearDay } from './widgets/yearday';
import { renderZones } from './widgets/zones';
import { checkZones, DEFAULT_ZONES } from './zones';

// One page for every time widget: the notch says which one this frame shows.
async function start(): Promise<void> {
  const kit = await connectKit();
  const root = document.getElementById('card')!;
  const setTimer = (fn: () => void, ms: number) => void setTimeout(fn, ms);
  const now = () => new Date();
  // The date widgets redraw on each minute boundary, which also catches midnight.
  const drawEveryMinute = (w: { update(now: Date): void }): void => {
    w.update(now());
    everyMinute(setTimer, now, () => w.update(now()));
  };

  // Home's city for the widgets that name it; a failed read keeps the last one.
  const readCity = (apply: (city: string | null) => void) => void kit.call<HomeSnapshot>('home.data', 'read').then(
    snap => apply(snap.place?.name ?? null),
    () => {},
  );
  // Redraw on each second boundary, so the seconds hand and the seconds digits follow the system clock.
  const everySecond = (draw: (t: Date) => void): void => {
    const tick = (): void => {
      const t = now();
      draw(t);
      setTimer(tick, 1000 - t.getMilliseconds());
    };
    tick();
  };

  switch (kit.widget) {
    case 'clockdate': {
      const w = renderClockDate(root, kit.lang);
      let city: string | null = null;
      readCity(c => { city = c; });
      everyMinute(setTimer, now, () => readCity(c => { city = c; }));
      everySecond(t => w.update(t, city));
      break;
    }
    case 'analog': {
      const w = renderAnalog(root, kit.lang);
      let city: string | null = null;
      readCity(c => { city = c; });
      everyMinute(setTimer, now, () => readCity(c => { city = c; }));
      everySecond(t => w.update(t, city));
      break;
    }
    case 'calendar':
      drawEveryMinute(renderCalendar(root, kit.lang === 'en' ? en : id, kit.lang));
      break;
    case 'yearday':
      drawEveryMinute(renderYearDay(root, kit.lang, kit.lang === 'en' ? en : id));
      break;
    case 'weekstrip':
      drawEveryMinute(renderWeekStrip(root, kit.lang === 'en' ? en : id, kit.lang));
      break;
    case 'zones': {
      // Read first, so the row never shows the default cities before the saved ones.
      let prefs = await readPrefs(kit, DEFAULT_ZONES, checkZones);
      const w = renderZones(root, kit.lang === 'en' ? en : id, kit.lang, {
        save: async p => {
          await writePrefs(kit, p);
          prefs = await readPrefs(kit, p, checkZones);
          w.update(prefs, now());
        },
        expand: height => kit.expand(height),
        collapse: () => kit.collapse(),
      });
      kit.onView(full => w.setFull(full));
      readCity(c => w.setHome(c));
      everyMinute(setTimer, now, () => readCity(c => w.setHome(c)));
      drawEveryMinute({ update: at => w.update(prefs, at) });
      break;
    }
    default:
      root.replaceChildren();
  }
}

void start();
