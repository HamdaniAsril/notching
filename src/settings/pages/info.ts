import { button, el, group, head, note, row } from '../controls';
import type { PageContext, PageRender, SettingsInfo } from '../types';

// Modules that need Accessibility (Keyboard Cleaning Mode), Screen Recording
// (Screenshot) or Full Disk Access (Cleaner), with what macOS says now and a way to System Settings. macOS gives
// no event when it changes, so the page asks again every 2 s while it is open.
// Without such modules it says so.
export const ACCESS_POLL_MS = 2000;

type PermissionStrings = PageContext['strings']['permissions'];

// One system permission a manifest can ask for, in the order the page lists them.
interface Permission {
  id: 'accessibility' | 'screen-recording' | 'full-disk-access';
  label(s: PermissionStrings): string;
  hint(s: PermissionStrings): string;
  granted(info: SettingsInfo): boolean;
  openKey: string;
  open(bridge: PageContext['bridge']): Promise<void>;
}

const PERMISSIONS: Permission[] = [
  {
    id: 'accessibility', label: s => s.accessibility, hint: s => s.accessibilityHint, granted: i => i.accessibility,
    openKey: 'permissions.open', open: b => b.openAccessibility(),
  },
  {
    id: 'screen-recording', label: s => s.screenRecording, hint: s => s.screenRecordingHint, granted: i => i.screenRecording,
    openKey: 'permissions.openScreenRecording', open: b => b.openScreenRecordingSettings(),
  },
  {
    id: 'full-disk-access', label: s => s.fullDiskAccess, hint: s => s.fullDiskAccessHint, granted: i => i.fullDiskAccess,
    openKey: 'permissions.openFullDiskAccess', open: b => b.openFullDiskAccessSettings(),
  },
];

export const permissionsPage: PageRender = ctx => {
  const s = ctx.strings.permissions;
  const page = el('div', 'perms');
  const asked = PERMISSIONS
    .map(p => ({ p, modules: ctx.state.modules.filter(m => m.installed && m.permissions.includes(p.id)) }))
    .filter(a => a.modules.length > 0);
  if (asked.length === 0) {
    page.append(head({ title: ctx.strings.sections.permissions, sub: s.sub }), note(s.note));
    return page;
  }
  const states: { state: HTMLElement; p: Permission }[] = [];
  const show = (info: SettingsInfo) => states.forEach(({ state, p }) => {
    const on = p.granted(info);
    state.textContent = on ? s.granted : s.missing;
    state.classList.toggle('on', on);
  });
  page.append(head({ title: ctx.strings.sections.permissions, sub: s.need }));
  for (const { p, modules } of asked) {
    const rows = modules.map(m => {
      const state = el('span', 'perm-state');
      states.push({ state, p });
      return row({ key: `permission.${m.id}.${p.id}`, label: `${m.name} · ${p.label(s)}`, hint: p.hint(s), control: state });
    });
    page.append(group(...rows), button(p.openKey, s.open, () => void p.open(ctx.bridge)));
  }
  show(ctx.info);
  let stop = () => {};
  const poll = () => {
    stop = ctx.env.setTimer(() => {
      ctx.bridge.settings().then(show, () => {}).finally(poll);
    }, ACCESS_POLL_MS);
  };
  poll();
  ctx.onCleanup(() => stop());
  return page;
};

export const aboutPage: PageRender = ctx => {
  const s = ctx.strings.about;
  const page = el('div');
  page.append(
    head({ title: ctx.strings.sections.about }),
    el('div', 'app-name', s.name),
    group(row({ key: 'about.version', label: s.version, control: el('span', 'mono', ctx.info.version) })),
    note(s.trust),
    note(s.later),
  );
  return page;
};
