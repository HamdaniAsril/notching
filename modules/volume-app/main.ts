import '../../src/kit/kit.css';
import '../../src/kit/volt.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import en from './locales/en.json';
import id from './locales/id.json';
import { renderPage, type VolumeView } from './view';

// Read every second while the card is open: apps start and stop playing.
export const POLL_MS = 1000;

async function start(): Promise<void> {
  const kit = await connectKit();
  const view = renderPage(document.getElementById('va')!, kit.lang === 'en' ? en : id, {
    set: (app, level) => void kit.call('volume', 'set', { app, level }).catch(() => {}),
    request: () => void kit.call('volume', 'request').catch(() => {}),
    main: change => void kit.call('volume', 'main', change).catch(() => {}),
  });
  const read = (): void => {
    void kit.call<VolumeView>('volume', 'read').then(v => view.update(v), () => {}).finally(() => setTimeout(read, POLL_MS));
  };
  read();
}

void start();
