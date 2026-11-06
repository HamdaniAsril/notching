import { fill } from '../../i18n';
import { isTool } from '../../modules/types';
import { button, el, group, head, row } from '../controls';
import type { AppAction, AppKey, AppKeyError, PageContext, PageRender } from '../types';
import { recorder, redraw, screenshotKeys, toolFold } from './modules';

// The keys until changed.
const DEFAULT_LABELS: Record<AppAction, string> = { awake: '⌃⌥K', shelf: '⌃⌥V' };
const MODULE_OF: Record<AppAction, string> = { awake: 'keep-awake', shelf: 'shelf' };
// Its module's name when the module is not even installed.
const MODULE_NAME: Record<AppAction, string> = { awake: 'Keep awake', shelf: 'Shelf' };

// Keep awake's and Shelf's keys (owner, 4 Nov): each recorded by clicking it and
// pressing new ones, as Screenshot's are. A key whose module is off says so.
function appKeys(ctx: PageContext): HTMLElement {
  const s = ctx.strings.shortcuts;
  const names: Record<AppAction, string> = { awake: s.awake, shelf: s.shelf };
  const box = el('div', 'app-keys');
  let keys: AppKey[] | null = null;
  let gone = false;
  const rec = recorder<AppAction, AppKey[]>(ctx, box, {
    save: (action, key) => ctx.bridge.appSetKey(action, key),
    saved: next => { keys = next; },
    refused: (_action, reason) => {
      const r = reason as AppKeyError | undefined;
      if (r?.kind === 'duplicate') return fill(s.duplicate, { row: names[r.action] });
      return r?.kind === 'shot' ? s.shot : r?.kind === 'window' ? s.window : r?.kind === 'peek' ? s.peek : s.invalid;
    },
    draw: () => draw(),
    gone: () => gone,
  });

  function hint(k: AppKey, on: boolean): string {
    if (on && rec.error()) return rec.error();
    if (k.state === 'off') {
      const m = ctx.state.modules.find(x => x.id === MODULE_OF[k.action]);
      return fill(s.off, { name: m?.name ?? MODULE_NAME[k.action] });
    }
    if (k.state === 'other' || k.state === 'shortcut') return s[k.state];
    return k.action === 'awake' ? s.awakeNote : '';
  }

  function keyRow(k: AppKey): HTMLElement {
    const key = `shortcuts.${k.action}`;
    const on = rec.at() === k.action;
    const cap = button(key, on ? s.recording : k.label, () => (on ? undefined : rec.start(k.action)));
    cap.classList.add('keycap');
    cap.classList.toggle('recording', on);
    const r = row({ key, label: names[k.action], hint: hint(k, on) || undefined, control: cap });
    if ((on && rec.error()) || k.state === 'other' || k.state === 'shortcut') r.querySelector('small')?.classList.add('err');
    return r;
  }

  function draw(): void {
    if (gone || !keys) return;
    const parts: HTMLElement[] = [el('div', 'grp-label', s.apps), group(...keys.map(keyRow))];
    if (keys.some(k => k.label !== DEFAULT_LABELS[k.action])) {
      const foot = el('div', 'shot-keys-foot');
      foot.append(button('shortcuts.reset', s.reset, () => {
        rec.stop();
        ctx.bridge.appResetKeys().then(next => {
          keys = next;
          draw();
        }, () => {});
      }));
      parts.push(foot);
    }
    redraw(box, parts);
  }

  ctx.onCleanup(() => {
    gone = true;
    rec.stop();
  });
  ctx.bridge.appKeys().then(next => {
    keys = next;
    draw();
  }, () => {});
  return box;
}

// Pintasan (owner, 4 Nov): every key Notching listens for. Keep awake's and
// Shelf's keys, Screenshot's two (also on its own page), and the background
// tools, which open their pages from here.
export const shortcutsPage: PageRender = ctx => {
  const s = ctx.strings.shortcuts;
  const page = el('div');
  page.append(head({ title: ctx.strings.sections.shortcuts, sub: s.sub }), appKeys(ctx));
  if (ctx.state.modules.some(m => m.id === 'screenshot' && m.installed)) page.append(screenshotKeys(ctx, s.screenshot));
  const tools = ctx.state.modules.filter(m => m.installed && isTool(m));
  // Each folds open here instead of opening a page.
  if (tools.length) page.append(el('div', 'grp-label', s.tools), group(...tools.flatMap(m => toolFold(ctx, m))));
  return page;
};
