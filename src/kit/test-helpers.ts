import { afterEach, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

// A module window inside a jsdom iframe; what it posts to its parent lands in `posted`.
export function frameWindow() {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const win = iframe.contentWindow!;
  const posted: unknown[] = [];
  // In vitest's jsdom the test's `window` is not the iframe's parent object.
  vi.spyOn(win.parent, 'postMessage').mockImplementation(((m: unknown) => {
    posted.push(m);
  }) as typeof window.postMessage);
  return { win, posted };
}

// A message from the host (the parent window) to the module window.
export function hostSays(win: Window, data: unknown): void {
  win.dispatchEvent(new (win as typeof window).MessageEvent('message', { data, source: win.parent }));
}
