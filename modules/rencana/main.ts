import '../../src/kit/kit.css';
import '../../src/kit/volt.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import { startTicks } from '../home/ticks';
import en from './locales/en.json';
import id from './locales/id.json';
import { renderNext } from './widgets/next';
import { renderWeek } from './widgets/week';

// One page for every widget of the pack: the notch says which one this frame shows.
async function start(): Promise<void> {
  const kit = await connectKit();
  const root = document.getElementById('card')!;
  const strings = kit.lang === 'en' ? en : id;
  const setTimer = (fn: () => void, ms: number) => void setTimeout(fn, ms);
  const now = () => new Date();

  switch (kit.widget) {
    case 'week': {
      const w = renderWeek(root, strings, kit.lang);
      startTicks(kit, s => w.update(s, now()), setTimer, now, { weather: false });
      break;
    }
    case 'next': {
      const w = renderNext(root, strings, kit.lang);
      startTicks(kit, s => w.update(s, now()), setTimer, now, { weather: false });
      break;
    }
    default:
      root.replaceChildren();
  }
}

void start();
