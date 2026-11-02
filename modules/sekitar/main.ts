import '../../src/kit/kit.css';
import '../../src/kit/volt.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import { everyMinute, startTicks } from '../home/ticks';
import en from './locales/en.json';
import id from './locales/id.json';
import { renderAir } from './widgets/air';
import { renderBigWeather } from './widgets/bigweather';
import { renderHourly } from './widgets/hourly';
import { renderMoon } from './widgets/moon';
import { renderSun } from './widgets/sun';

// One page for every widget of the pack: the notch says which one this frame shows.
async function start(): Promise<void> {
  const kit = await connectKit();
  const root = document.getElementById('card')!;
  const strings = kit.lang === 'en' ? en : id;
  const setTimer = (fn: () => void, ms: number) => void setTimeout(fn, ms);
  const now = () => new Date();

  switch (kit.widget) {
    case 'bigweather': {
      const w = renderBigWeather(root, strings, kit.lang);
      startTicks(kit, s => w.update(s, now()), setTimer, now, { weather: true });
      break;
    }
    case 'moon': {
      const w = renderMoon(root, strings, kit.lang);
      w.update(now());
      everyMinute(setTimer, now, () => w.update(now()));
      break;
    }
    case 'sun': {
      const w = renderSun(root, strings, kit.lang);
      startTicks(kit, s => w.update(s, now()), setTimer, now, { weather: false });
      break;
    }
    case 'hourly': {
      const w = renderHourly(root, strings, kit.lang);
      startTicks(kit, s => w.update(s, now()), setTimer, now, { weather: true });
      break;
    }
    case 'air': {
      const w = renderAir(root, strings, kit.lang);
      startTicks(kit, s => w.update(s, now()), setTimer, now, { weather: true });
      break;
    }
    default:
      root.replaceChildren();
  }
}

void start();
