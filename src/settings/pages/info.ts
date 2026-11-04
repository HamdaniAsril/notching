import { button, el, group, head, note, row } from '../controls';
import type { PageContext, PageRender, SettingsInfo } from '../types';

// Modules that need Accessibility (Keyboard Cleaning Mode), Screen Recording
// (Screenshot), Full Disk Access (Cleaner) or the camera (Cermin): one card, a row
// per permission with the modules that use it, what macOS says now and a way to
// System Settings, as the city row on Umum has its state and button. macOS gives
// no event when it changes, so the page asks again every 2 s while it is open.
// Without such modules it says so.
export const ACCESS_POLL_MS = 2000;

type PermissionStrings = PageContext['strings']['permissions'];

// One system permission a manifest can ask for, in the order the page lists them.
interface Permission {
  id: 'accessibility' | 'screen-recording' | 'full-disk-access' | 'camera';
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
  {
    id: 'camera', label: s => s.camera, hint: s => s.cameraHint, granted: i => i.camera,
    openKey: 'permissions.openCamera', open: b => b.openCameraSettings(),
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
    state.lastChild!.textContent = on ? s.granted : s.missing;
    state.classList.toggle('on', on);
  });
  page.append(head({ title: ctx.strings.sections.permissions, sub: s.need }));
  const rows = asked.map(({ p, modules }) => {
    const state = el('span', 'perm-state');
    state.append(el('i', 'perm-dot'), el('span'));
    states.push({ state, p });
    const ctl = el('div', 'ctl');
    ctl.append(state, button(p.openKey, s.open, () => void p.open(ctx.bridge)));
    const hint = `${modules.map(m => m.name).join(', ')} · ${p.hint(s)}`;
    return row({ key: `permission.${p.id}`, label: p.label(s), hint, control: ctl });
  });
  page.append(group(...rows));
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
