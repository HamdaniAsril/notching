import type { CleanerSkip } from '../bridge';
import { type CleanerStrings, fill } from '../i18n';
import type { Lang } from '../kit/protocol';
import type { Plan } from './clean';
import { button, el } from './dom';
import { sizeText } from './format';

export interface Skipped { id?: number; label: string; reason: CleanerSkip; admin: boolean }

export interface RunDeps {
  lang: Lang;
  strings: CleanerStrings;
  onStop(): void;
  onDone(): void; // "Kembali" after the result
  onReveal?(id: number): void; // an app the Trash refused: Finder asks for the password
}

export interface RunView {
  confirm(plan: Plan, kind: 'clean' | 'uninstall', name?: string): Promise<boolean>;
  cancel(): void; // the panel went away: the open question is a no
  progress(done: number, total: number): void;
  result(freed: number, skipped: Skipped[]): void;
}

// The last question, the progress and the result (design 1 Nov §5.3, §5.4).
export function mountRun(box: HTMLElement, deps: RunDeps): RunView {
  const doc = box.ownerDocument;
  const s = deps.strings;
  const size = (b: number) => sizeText(b, deps.lang);
  let answer: ((yes: boolean) => void) | null = null;

  function settle(yes: boolean): void {
    const done = answer;
    answer = null;
    doc.removeEventListener('keydown', onKey);
    done?.(yes);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') settle(false);
  }

  function screen(...children: HTMLElement[]): void {
    const wrap = el(doc, 'div', 'cl-run');
    wrap.append(...children);
    box.replaceChildren(wrap);
  }

  return {
    confirm(plan, kind, name) {
      settle(false);
      const lines = el(doc, 'div', 'cl-plan');
      if (plan.permanent > 0) lines.append(el(doc, 'div', 'cl-pline', fill(s.confirmPermanent, { size: size(plan.permanent) })));
      if (plan.trash > 0) lines.append(el(doc, 'div', 'cl-pline', fill(s.confirmTrash, { size: size(plan.trash) })));
      lines.append(el(doc, 'div', 'lab', fill(s.confirmCount, { n: plan.count })));
      const title = el(doc, 'div', 'cl-rtitle', kind === 'uninstall' && name ? name : s.cleanTitle);
      const yes = button(doc, 'cl-go cl-yes', kind === 'uninstall' ? s.yesRemove : s.yesClean);
      const no = button(doc, 'cl-ghost cl-no', s.cancel);
      yes.addEventListener('click', () => settle(true));
      no.addEventListener('click', () => settle(false));
      const btns = el(doc, 'div', 'cl-rbtns');
      btns.append(no, yes);
      screen(title, lines, btns);
      doc.addEventListener('keydown', onKey);
      return new Promise<boolean>(resolve => { answer = resolve; });
    },
    cancel() {
      settle(false);
    },
    progress(done, total) {
      const meter = el(doc, 'div', 'cl-meter');
      const fillBar = el(doc, 'span', 'cl-meter-fill');
      fillBar.style.width = `${total > 0 ? (done / total) * 100 : 0}%`;
      meter.append(fillBar);
      const stop = button(doc, 'cl-ghost cl-stop', s.stop);
      stop.addEventListener('click', () => deps.onStop());
      screen(el(doc, 'div', 'lab', fill(s.progress, { done, total })), meter, stop);
    },
    result(freed, skipped) {
      const list = el(doc, 'div', 'cl-skips');
      for (const k of skipped) {
        const line = el(doc, 'div', 'cl-skip', `${k.label} · ${s.skips[k.reason]}`);
        if (k.admin) {
          line.append(el(doc, 'div', 'cl-detail', s.adminHint));
          if (k.id !== undefined && deps.onReveal) {
            const id = k.id;
            const reveal = button(doc, 'lab cl-note-btn', s.showInFinder);
            reveal.addEventListener('click', () => deps.onReveal?.(id));
            line.append(reveal);
          }
        }
        list.append(line);
      }
      const back = button(doc, 'cl-ghost cl-done', s.back);
      back.addEventListener('click', () => deps.onDone());
      screen(el(doc, 'div', 'cl-freed', fill(s.freed, { size: size(freed) })), list, back);
    },
  };
}
