import '../../src/kit/kit.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import en from './locales/en.json';
import id from './locales/id.json';
import { type AwakeView, renderPage } from './view';

// Read once a second while the page is open: the run itself lives in the app,
// and the notch removes this frame when the page closes.
export const POLL_MS = 1000;

async function start(): Promise<void> {
  const kit = await connectKit();
  const call = (method: string, args?: unknown) => kit.call<AwakeView>('awake', method, args).then(v => view.update(v), () => {});
  const view = renderPage(document.getElementById('ka')!, kit.lang === 'en' ? en : id, kit.lang, {
    start: minutes => void call('start', { minutes }),
    add: minutes => void call('add', { minutes }),
    stop: () => void call('stop'),
  });
  const read = (): void => {
    void call('read').finally(() => setTimeout(read, POLL_MS));
  };
  read();
}

void start();
