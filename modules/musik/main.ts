import '../../src/kit/kit.css';
import '../../src/kit/volt.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import en from './locales/en.json';
import id from './locales/id.json';
import { NO_MEDIA, type Command, type NowState } from './now';
import { renderMini } from './widgets/mini';
import { renderPlayer } from './widgets/player';
import { renderStrip } from './widgets/strip';

// Read once a second, as Timer does: the helper lives in the app and the player may be changed
// from outside. Between reads the position runs on the widget's own clock.
export const POLL_MS = 1000;
const TICK_MS = 500;

// One page for the three widgets of the pack: the notch says which one this frame shows.
async function start(): Promise<void> {
  const kit = await connectKit();
  const root = document.getElementById('card')!;
  const strings = kit.lang === 'en' ? en : id;
  const act = { command: (word: Command) => void kit.call('media', 'command', word).catch(() => {}) };

  const view =
    kit.widget === 'strip' ? renderStrip(root, strings, kit.lang, act)
    : kit.widget === 'mini' ? renderMini(root, strings, kit.lang, act)
    : kit.widget === 'player' ? renderPlayer(root, strings, kit.lang, act)
    : null;
  if (!view) return;

  const read = (): void => {
    // A core that does not answer reads as nothing playing, never as an error.
    void kit.call<NowState>('media', 'now').then(s => view.update(s), () => view.update(NO_MEDIA)).finally(() => setTimeout(read, POLL_MS));
  };
  read();
  setInterval(view.tick, TICK_MS);
}

void start();
