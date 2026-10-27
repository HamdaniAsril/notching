import '../../src/kit/kit.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import { renderCard } from './card';
import en from './locales/en.json';
import id from './locales/id.json';
import { startPolling } from './poll';

async function start(): Promise<void> {
  const kit = await connectKit();
  const view = renderCard(document.getElementById('card')!, kit.lang === 'en' ? en : id);
  startPolling(kit, s => view.update(s, kit.lang), (fn, ms) => void setTimeout(fn, ms));
}

void start();
