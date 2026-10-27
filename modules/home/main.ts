import '../../src/kit/kit.css';
import './style.css';
import { connectKit } from '../../src/kit/client';
import en from './locales/en.json';
import id from './locales/id.json';

// Stand-in until the real Home card (plan 4).
async function start(): Promise<void> {
  const kit = await connectKit();
  const strings = kit.lang === 'en' ? en : id;
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = strings.name;
  const soon = document.createElement('div');
  soon.className = 'lab';
  soon.textContent = strings.soon;
  document.getElementById('card')!.replaceChildren(title, soon);
}

void start();
