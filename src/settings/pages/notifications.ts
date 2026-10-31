import { fill } from '../../i18n';
import type { Channel, ModuleInfo } from '../../modules/types';
import { button, el, group, head, note, row, slider, toggle } from '../controls';
import type { PageRender } from '../types';

export const NOTICE_SECONDS = { min: 2, max: 8, step: 0.5 } as const;

// Notifikasi (spec 4.4): the glow, how long a notice stays, a sample, and a show
// and a sound switch for every kind of notice the installed modules send.
export const notificationsPage: PageRender = ctx => {
  const s = ctx.strings.notifications;
  const look = ctx.state.notifications;
  const number = new Intl.NumberFormat(ctx.lang);

  const glow = toggle('notifications.glow', s.glow, look.glow,
    on => ctx.save('notifications.glow', ctx.bridge.setNoticeGlow(on)));
  const seconds = slider({
    key: 'notifications.seconds', label: s.seconds, ...NOTICE_SECONDS, value: look.seconds,
    format: v => fill(s.secondsValue, { n: number.format(v) }),
    onInput: () => {},
    onChange: v => ctx.save('notifications.seconds', ctx.bridge.setNoticeSeconds(v)),
  });
  const sample = button('notifications.sample', s.sample,
    () => void ctx.bridge.sendSampleNotice(s.sampleTitle, s.sampleDetail), true);
  const sampleStatus = toggle('notifications.sampleStatus', s.sampleStatus, ctx.state.sampleStatus,
    on => ctx.save('notifications.sampleStatus', ctx.bridge.setSampleStatus(on)));

  const page = el('div');
  page.append(
    head({ title: ctx.strings.sections.notifications, sub: s.sub }),
    group(row({ key: 'notifications.glow', label: s.glow, hint: s.glowHint, control: glow }), seconds,
      row({ key: 'notifications.sample', label: s.sampleTitle, control: sample }),
      row({ key: 'notifications.sampleStatus', label: s.sampleStatus, hint: s.sampleStatusHint, control: sampleStatus })),
  );

  const kinds = ctx.state.modules.filter(m => m.installed).flatMap(m => m.channels.map(c => kindRow(m, c)));
  page.append(el('div', 'grp-label', s.kinds));
  if (kinds.length === 0) {
    page.append(note(s.none));
    return page;
  }
  const columns = el('div', 'kinds-head mono');
  columns.append(el('span', undefined, s.show), el('span', undefined, s.sound));
  page.append(columns, group(...kinds));
  return page;

  function kindRow(m: ModuleInfo, c: Channel): HTMLElement {
    const key = `channel.${m.id}.${c.id}`;
    const set = (pref: { on: boolean; sound: boolean }) => ctx.save(key, ctx.bridge.setChannel(m.id, c.id, pref));
    const pair = el('div', 'ctl pair');
    pair.append(
      toggle(`${key}.on`, s.show, c.on, on => set({ on, sound: c.sound })),
      toggle(`${key}.sound`, s.sound, c.sound, sound => set({ on: c.on, sound }), !c.on),
    );
    return row({ key, label: c.name, hint: m.name, control: pair });
  }
};
