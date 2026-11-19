import '../../src/kit/kit.css';
import '../../src/kit/volt.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import en from './locales/en.json';
import id from './locales/id.json';
import { type AgentsView, renderPage } from './view';

// Read once a second while the card is open: the sessions live in the app, and
// the notch removes this frame when the card closes.
export const POLL_MS = 1000;

async function start(): Promise<void> {
  const kit = await connectKit();
  const view = renderPage(document.getElementById('ag')!, kit.lang === 'en' ? en : id, {
    open: (agent, sessionId) => void kit.call('agents', 'open', { agent, id: sessionId }).catch(() => {}),
  });
  const read = (): void => {
    void kit.call<AgentsView>('agents', 'read').then(v => view.update(v), () => {}).finally(() => setTimeout(read, POLL_MS));
  };
  read();
}

void start();
