import { fill } from '../../i18n';
import { formatBytes } from '../../kit/format';
import logoDark from '../assets/logo-dark.png';
import logoLight from '../assets/logo-light.png';
import { button, el, group, head, note, row, toggle } from '../controls';
import { icon } from '../icons';
import type { AboutLink, PageContext, PageRender, UpdateInfo } from '../types';

// "4 Nov 2026, 14.05", in the window's language.
function when(ms: number, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(ms);
}

// The wordmark in the device's light or dark (brand kit: always an image).
function logo(): HTMLElement {
  const p = el('picture', 'about-logo');
  const dark = document.createElement('source');
  dark.media = '(prefers-color-scheme: dark)';
  dark.srcset = logoDark;
  const img = document.createElement('img');
  img.src = logoLight;
  img.alt = 'Notching';
  img.draggable = false;
  p.append(dark, img);
  return p;
}

// The update rows: the switch, then where things stand with its buttons.
// Redrawn from each state the native side sends.
function updateRows(ctx: PageContext): HTMLElement {
  const s = ctx.strings.about;
  const box = el('div', 'about-update');
  let u: UpdateInfo | null = null;

  function status(info: UpdateInfo): { label: string; hint: string; err: boolean } {
    const busy = info.phase !== 'idle';
    if (info.phase === 'checking') return { label: s.checking, hint: '', err: false };
    if (info.phase === 'downloading') {
      const percent = info.progress === null ? '' : `${Math.round(info.progress * 100)}%`;
      return { label: fill(s.downloading, { version: info.latest ?? '', percent }), hint: '', err: false };
    }
    if (busy) return { label: s[info.phase as 'verifying' | 'installing' | 'restarting'], hint: '', err: false };
    const checked = info.checkedAt === null ? s.neverChecked : fill(s.checkedAt, { when: when(info.checkedAt, ctx.lang) });
    const error = info.error ? s.errors[info.error] : '';
    if (info.available && info.latest) {
      const size = info.size === null ? '' : formatBytes(info.size, ctx.lang);
      const hint = error || (info.installable ? fill(s.availableHint, { size }) : s.errors.dev);
      return { label: fill(s.available, { version: info.latest }), hint, err: !!error };
    }
    if (info.latest && !error) return { label: s.upToDate, hint: `${fill(s.current, { version: info.current })} · ${checked}`, err: false };
    return { label: fill(s.current, { version: info.current }), hint: error || checked, err: !!error };
  }

  function draw(): void {
    if (!u) return;
    const info = u;
    const busy = info.phase !== 'idle';
    const auto = row({
      key: 'about.auto', label: s.auto, hint: s.autoHint,
      control: toggle('about.auto', s.auto, info.auto, on => ctx.save('about.auto', ctx.bridge.setAutoUpdate(on))),
    });
    const st = status(info);
    const ctl = el('div', 'ctl');
    if (info.available && !busy) {
      ctl.append(button('about.notes', s.notes, () => void ctx.bridge.openReleaseNotes()));
      const install = button('about.install', s.install, () => {
        ctx.bridge.updateInstall().catch(() => {});
      }, true);
      install.disabled = !info.installable;
      ctl.append(install);
    } else {
      const check = button('about.check', s.check, () => {
        ctx.bridge.updateCheck().then(next => { u = next; draw(); }, () => {});
      });
      check.disabled = busy;
      ctl.append(check);
    }
    const state = row({ key: 'about.update', label: st.label, hint: st.hint || undefined, control: ctl });
    if (st.err) state.querySelector('small')?.classList.add('err');
    if (info.phase === 'downloading' && info.progress !== null) {
      const bar = el('div', 'about-progress');
      const fillEl = el('i');
      fillEl.style.width = `${Math.round(info.progress * 100)}%`;
      bar.append(fillEl);
      state.append(bar);
    }
    state.classList.toggle('available', info.available && !busy);
    box.replaceChildren(el('div', 'grp-label', s.update), group(auto, state));
  }

  ctx.onCleanup(ctx.bridge.onUpdate(next => { u = next; draw(); }));
  ctx.bridge.updateState().then(next => { u = next; draw(); }, () => {});
  return box;
}

function linkRow(ctx: PageContext, link: AboutLink, label: string): HTMLElement {
  const r = row({ key: `about.link.${link}`, label, control: icon('chev') });
  r.classList.add('about-link');
  r.setAttribute('role', 'link');
  r.tabIndex = 0;
  const open = () => void ctx.bridge.openLink(link);
  r.addEventListener('click', open);
  r.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  return r;
}

// Tentang (owner, 4 Nov): the wordmark, the tagline and the version; updates;
// a few links; the promise.
export const aboutPage: PageRender = ctx => {
  const s = ctx.strings.about;
  const page = el('div');
  const hero = el('div', 'about-hero');
  hero.dataset.row = 'about.version';
  hero.append(logo(), el('p', 'about-tagline', s.tagline), el('span', 'version', fill(s.version, { version: ctx.info.version })));
  page.append(
    head({ title: ctx.strings.sections.about }),
    hero,
    updateRows(ctx),
    el('div', 'grp-label', s.links),
    group(linkRow(ctx, 'repo', s.repo), linkRow(ctx, 'license', s.license), linkRow(ctx, 'privacy', s.privacy)),
    note(s.trust),
  );
  return page;
};
