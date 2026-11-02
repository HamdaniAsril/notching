import '../../src/kit/kit.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import { everyMinute } from '../home/ticks';
import type { HomeSnapshot } from '../home/types';
import en from './locales/en.json';
import id from './locales/id.json';
import { renderAnalog } from './widgets/analog';
import { renderCalendar } from './widgets/calendar';
import { renderClockDate } from './widgets/clockdate';
import { renderWeekStrip } from './widgets/weekstrip';
import { renderYearDay } from './widgets/yearday';

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

  switch (kit.widget) {
    case 'clockdate': {
      const w = renderClockDate(root, kit.lang);
      let city: string | null = null;
      const draw = () => w.update(now(), city);
      // The city comes from Home's snapshot; a failed read keeps the last one.
      const readCity = () => void kit.call<HomeSnapshot>('home.data', 'read').then(s => {
        city = s.place?.name ?? null;
        draw();
      }, () => {});
      draw();
      readCity();
      everyMinute(setTimer, now, () => { draw(); readCity(); });
      break;
    }
    case 'analog': {
      const w = renderAnalog(root, kit.lang);
      // Redraw on each second boundary so the second hand ticks with the system clock.
      const tick = (): void => {
        const t = now();
        w.update(t);
        setTimer(tick, 1000 - t.getMilliseconds());
      };
      tick();
      break;
    }
    case 'calendar':
      drawEveryMinute(renderCalendar(root, kit.lang));
      break;
    case 'yearday':
      drawEveryMinute(renderYearDay(root, kit.lang, kit.lang === 'en' ? en : id));
      break;
    case 'weekstrip':
      drawEveryMinute(renderWeekStrip(root, kit.lang));
      break;
    default:
      root.replaceChildren();
  }
}

void start();
