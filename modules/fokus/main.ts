import '../../src/kit/kit.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import { readPrefs, writePrefs } from '../../src/kit/prefs';
import { everyMinute } from '../home/ticks';
import en from './locales/en.json';
import id from './locales/id.json';
import { renderBreath } from './widgets/breath';
import { renderWorkday } from './widgets/workday';
import { checkWork, DEFAULT_WORK } from './work';

// One page for every widget of the pack: the notch says which one this frame shows.
async function start(): Promise<void> {
  const kit = await connectKit();
  const root = document.getElementById('card')!;
  const strings = kit.lang === 'en' ? en : id;

  switch (kit.widget) {
    case 'breath': {
      // The frame loop runs only while a session does.
      let frame = 0;
      const loop = (t: number) => {
        w.tick(t);
        frame = w.running() ? requestAnimationFrame(loop) : 0;
      };
      const w = renderBreath(root, strings, { onStart: () => { if (!frame) frame = requestAnimationFrame(loop); } });
      break;
    }
    case 'workday': {
      const now = () => new Date();
      // Read first, so the row never shows the default hours before the saved ones.
      let prefs = await readPrefs(kit, DEFAULT_WORK, checkWork);
      const w = renderWorkday(root, strings, kit.lang, {
        save: async p => {
          await writePrefs(kit, p);
          prefs = await readPrefs(kit, p, checkWork);
          w.update(prefs, now());
        },
        expand: height => kit.expand(height),
        collapse: () => kit.collapse(),
      });
      kit.onView(full => w.setFull(full));
      w.update(prefs, now());
      everyMinute((fn, ms) => void setTimeout(fn, ms), now, () => w.update(prefs, now()));
      break;
    }
    default:
      root.replaceChildren();
  }
}

void start();
