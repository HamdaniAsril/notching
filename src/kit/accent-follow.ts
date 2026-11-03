import { applyAccent } from './accent';

interface AccentSource {
  get(): Promise<{ accent: string }>; // the module state, when the window opens
  on(cb: (s: { accent: string }) => void): void; // every change after
}

// The small windows (editor, clean, pick) take the accent from the module state
// like the notch does. Listening starts first, so a change while asking is kept.
// Without the state they stay in the stylesheet's Lime.
export async function followAccent(root: HTMLElement, from: AccentSource): Promise<void> {
  let heard = false;
  from.on(s => {
    heard = true;
    applyAccent(root, s.accent);
  });
  try {
    const now = await from.get();
    if (!heard) applyAccent(root, now.accent);
  } catch (e) {
    console.error('notching: no accent for this window', e);
  }
}
