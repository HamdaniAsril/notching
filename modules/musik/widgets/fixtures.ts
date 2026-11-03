import type { NowState } from '../now';

// The sample track of the design: "Jalan Braga" by Kolektif Senja, 2:14 of 3:48, playing. `NOW`
// is the moment the reading was taken.
export const NOW = 1_800_000_000_000;
export const TRACK: NowState = {
  on: true, title: 'Jalan Braga', artist: 'Kolektif Senja', album: null,
  duration: 228, elapsed: 134, rate: 1, at: NOW, app: 'com.apple.Music', art: null,
};
export const PAUSED: NowState = { ...TRACK, rate: 0 };
export const NOTHING: NowState = { ...TRACK, title: null, artist: null, duration: null, elapsed: null, rate: 0, app: null };
export const ART = 'data:image/png;base64,iVBORw0KGgo=';

export function host(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}
