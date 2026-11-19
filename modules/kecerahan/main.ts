import '../../src/kit/kit.css';
import '../../src/kit/volt.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import en from './locales/en.json';
import id from './locales/id.json';
import { renderPage, type Screen } from './view';

// Read again now and then while the card is open, for a monitor plugged in or
// a level changed by the keys; the slider being dragged keeps its value.
export const POLL_MS = 3000;

async function start(): Promise<void> {
  const kit = await connectKit();
  const view = renderPage(document.getElementById('kc')!, kit.lang === 'en' ? en : id, {
    set: (screen, level) => void kit.call('brightness', 'set', { id: screen, level }).catch(() => {}),
  });
  const read = (): void => {
    void kit.call<Screen[]>('brightness', 'read').then(v => view.update(v), () => {}).finally(() => setTimeout(read, POLL_MS));
  };
  read();
}

void start();
