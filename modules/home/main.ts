import '../../src/kit/kit.css';
import '../../src/kit/volt.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import en from './locales/en.json';
import id from './locales/id.json';
import { everyMinute, startTicks } from './ticks';
import { renderClock } from './widgets/clock';
import { renderDate } from './widgets/date';
import { renderPrayer } from './widgets/prayer';
import { renderReminders } from './widgets/reminders';
import { renderWeather } from './widgets/weather';

// One page for every built-in widget: the notch says which one this frame shows.
async function start(): Promise<void> {
  const kit = await connectKit();
  const root = document.getElementById('card')!;
  const strings = kit.lang === 'en' ? en : id;
  const setTimer = (fn: () => void, ms: number) => void setTimeout(fn, ms);
  const now = () => new Date();

  switch (kit.widget) {
    case 'date':
    case 'clock': {
      const w = kit.widget === 'date' ? renderDate(root, kit.lang) : renderClock(root, strings, kit.lang);
      w.update(now());
      everyMinute(setTimer, now, () => w.update(now()));
      break;
    }
    case 'weather': {
      const w = renderWeather(root, strings, kit.lang);
      startTicks(kit, s => w.update(s, now()), setTimer, now, { weather: true });
      break;
    }
    case 'prayer': {
      const w = renderPrayer(root, strings, kit.lang);
      startTicks(kit, s => w.update(s, now()), setTimer, now, { weather: false });
      break;
    }
    case 'reminders': {
      let ticks: ReturnType<typeof startTicks> | null = null;
      const w = renderReminders(root, strings, kit.lang, {
        add: async (title, day, at) => {
          await kit.call('reminders', 'add', { title, day, at });
          await ticks?.refresh();
        },
        setDone: async (reminder, done) => {
          await kit.call('reminders', 'setDone', { id: reminder, done });
          await ticks?.refresh();
        },
        expand: height => kit.expand(height),
        collapse: () => kit.collapse(),
      });
      kit.onView(full => w.setFull(full));
      ticks = startTicks(kit, s => w.update(s, now()), setTimer, now, { weather: false });
      break;
    }
    default:
      root.replaceChildren();
  }
}

void start();
