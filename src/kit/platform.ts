// Which OS the webview runs on, read from the user agent (WKWebView says
// Macintosh, WebView2 says Windows, webkitgtk says Linux). Unknown counts as Linux.
export type Platform = 'macos' | 'windows' | 'linux';

export function platform(): Platform {
  const ua = typeof navigator === 'undefined' ? '' : `${navigator.userAgent} ${navigator.platform ?? ''}`;
  if (/Macintosh|Mac OS X|MacIntel|MacPPC/i.test(ua)) return 'macos';
  if (/Windows|Win32|Win64/i.test(ua)) return 'windows';
  return 'linux';
}

export const isMac = (): boolean => platform() === 'macos';

// The label of the command key: the Mac's, or Ctrl elsewhere.
export const modKeyLabel = (): string => (isMac() ? '⌘' : 'Ctrl');

// Whether the platform's command key is down: Cmd on a Mac, Ctrl elsewhere.
export const hasMod = (e: { metaKey: boolean; ctrlKey: boolean }): boolean => (isMac() ? e.metaKey : e.ctrlKey);

// Whether the modifier that is not the command key is down (Ctrl on a Mac, Meta elsewhere).
export const hasOtherMod = (e: { metaKey: boolean; ctrlKey: boolean }): boolean => (isMac() ? e.ctrlKey : e.metaKey);

// Where a custom scheme's files are served from: Tauri maps `scheme://localhost` on
// macOS and Linux, and `http://scheme.localhost` on Windows.
export const schemeUrl = (scheme: string, path: string): string =>
  platform() === 'windows' ? `http://${scheme}.localhost/${path}` : `${scheme}://localhost/${path}`;
