import '../../src/kit/kit.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import en from './locales/en.json';
import id from './locales/id.json';
import { renderTimer, type TimerView } from './view';

// Read once a second while the panel is open, as Keep awake does: the timer
// itself lives in the app, and the strip or page may change it from elsewhere.
export const POLL_MS = 1000;

// One page for the strip and the Timer page: the notch says which this frame is.
async function start(): Promise<void> {
  const kit = await connectKit();
  const root = document.getElementById('tm')!;
  root.classList.add(kit.widget === 'strip' ? 'tm-strip' : 'tm-page');
  const call = (method: string, args?: unknown) => kit.call<TimerView>('timer', method, args).then(v => view.update(v), () => {});
  const view = renderTimer(root, kit.lang === 'en' ? en : id, {
    start: minutes => void call('start', { minutes }),
    pause: () => void call('pause'),
    resume: () => void call('resume'),
    stop: () => void call('stop'),
  }, kit.widget !== 'strip');
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
