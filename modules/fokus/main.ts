import '../../src/kit/kit.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import en from './locales/en.json';
import id from './locales/id.json';
import { renderBreath } from './widgets/breath';

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
    default:
      root.replaceChildren();
  }
}

void start();
