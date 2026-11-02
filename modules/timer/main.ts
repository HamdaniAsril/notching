import '../../src/kit/kit.css';
import '../../src/kit/volt.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import en from './locales/en.json';
import id from './locales/id.json';
import { renderTile } from './tile';
import { renderTimer, type TimerView } from './view';

// Read once a second while the panel is open, as Keep awake does: the timer
// itself lives in the app, and the strip or page may change it from elsewhere.
export const POLL_MS = 1000;

// One page for the strip, the Timer page and the one-column tile: the notch says which this frame is.
async function start(): Promise<void> {
  const kit = await connectKit();
  const root = document.getElementById('tm')!;
  root.classList.add(kit.widget === 'strip' ? 'tm-strip' : kit.widget === 'tile' ? 'tm-tile' : 'tm-page');
  const call = (method: string, args?: unknown) => kit.call<TimerView>('timer', method, args).then(v => view.update(v), () => {});
  const act = {
    start: (minutes: number) => void call('start', { minutes }),
    pause: () => void call('pause'),
    resume: () => void call('resume'),
    stop: () => void call('stop'),
  };
  const strings = kit.lang === 'en' ? en : id;
  const view = kit.widget === 'tile' ? renderTile(root, strings, act) : renderTimer(root, strings, act, kit.widget !== 'strip');
  const read = (): void => {
    void call('read').finally(() => setTimeout(read, POLL_MS));
  };
  read();
  const frame = (): void => {
    view.tick(Date.now());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void start();
