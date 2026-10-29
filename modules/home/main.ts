import '../../src/kit/kit.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import { renderHome } from './card';
import en from './locales/en.json';
import id from './locales/id.json';
import { startTicks } from './ticks';

async function start(): Promise<void> {
  const kit = await connectKit();
  let ticks: ReturnType<typeof startTicks> | null = null;
  const card = renderHome(document.getElementById('card')!, kit.lang === 'en' ? en : id, kit.lang, {
    add: async (title, day, at) => {
      await kit.call('reminders', 'add', { title, day, at });
      await ticks?.refresh();
    },
    setDone: async (reminder, done) => {
      await kit.call('reminders', 'setDone', { id: reminder, done });
      await ticks?.refresh();
    },
  });
  ticks = startTicks(kit, s => card.update(s, new Date()), (fn, ms) => void setTimeout(fn, ms), () => new Date());
}

void start();
