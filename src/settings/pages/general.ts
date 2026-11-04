import { fill } from '../../i18n';
import { button, el, choice, group, head, row, select, toggle } from '../controls';
import type { LanguageChoice, PageRender } from '../types';
import { sharedData } from './home';

export const generalPage: PageRender = ctx => {
  const s = ctx.strings.general;
  const { info, bridge } = ctx;

  const language = row({
    key: 'general.language',
    label: s.language,
    hint: s.languageHint,
    control: choice<LanguageChoice>('general.language', [
      { value: 'auto', label: s.languageAuto },
      { value: 'id', label: s.languageId },
      { value: 'en', label: s.languageEn },
    ], info.language, v => ctx.save('general.language', bridge.setLanguage(v))),
  });

  // A chosen screen that is not connected stays listed, so the choice is not lost.
  const missing = info.screen !== null && !info.screens.includes(info.screen);
  const screens = [
    { value: '', label: s.screenEvery },
    ...info.screens.map(name => ({ value: name, label: name })),
    ...(missing ? [{ value: info.screen!, label: fill(s.screenMissing, { name: info.screen! }) }] : []),
  ];
  const screen = row({
    key: 'general.screen',
    label: s.screen,
    hint: missing ? s.screenMissingHint : undefined,
    control: select('general.screen', screens, info.screen ?? '',
      v => ctx.save('general.screen', bridge.setScreen(v || null))),
  });

  const loginHint = { on: s.loginHint, off: s.loginHint, unavailable: s.loginUnavailable, needsApproval: s.loginNeedsApproval };
  const loginControl = el('div', 'ctl');
  if (info.login === 'needsApproval') {
    loginControl.append(button('general.loginOpen', s.loginOpen, () => ctx.save('general.login', bridge.openLoginItems())));
  }
  loginControl.append(toggle('general.login', s.login, info.login === 'on',
    on => ctx.save('general.login', bridge.setLaunchAtLogin(on)), info.login === 'unavailable'));
  const login = row({ key: 'general.login', label: s.login, hint: loginHint[info.login], control: loginControl });

  const glass = row({
    key: 'general.glass',
    label: s.glass,
    hint: s.glassHint,
    control: toggle('general.glass', s.glass, ctx.state.panelGlass,
      on => ctx.save('general.glass', bridge.setPanelGlass(on))),
  });

  const page = el('div');
  page.append(
    head({ title: ctx.strings.sections.general }),
    group(language, screen, login, glass),
    el('div', 'grp-label', s.cityPrayer),
    sharedData(ctx),
  );
  return page;
};
