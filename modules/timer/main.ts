import '../../src/kit/kit.css';
import '../../src/kit/volt.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import { readPrefs, writePrefs } from '../../src/kit/prefs';
import en from './locales/en.json';
import id from './locales/id.json';
import { renderTile } from './tile';
import { checkPrefs, DEFAULT_PREFS, makeTicker, tikSound } from './tik';
import { renderTimer, type Sound, type TimerView } from './view';

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
  // The tik is on unless the Timer page's button turned it off; read again at each press, so
  // the strip and the tile follow a change made on the page.
  let prefs = await readPrefs(kit, DEFAULT_PREFS, checkPrefs);
  const tik = tikSound();
  const ticker = makeTicker(t => tik.play(t), () => performance.now());
  const sound: Sound = {
    prime() {
      if (prefs.sound) tik.prime();
      void readPrefs(kit, prefs, checkPrefs).then(p => { prefs = p; });
    },
    step: (from, to) => { if (prefs.sound) ticker.step(from, to); },
    on: () => prefs.sound,
    set(on) {
      prefs = { ...prefs, sound: on };
      void writePrefs(kit, prefs);
      if (on) tik.play('minute');
    },
  };
  const view = kit.widget === 'tile' ? renderTile(root, strings, act, sound) : renderTimer(root, strings, act, kit.widget !== 'strip', sound);
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
