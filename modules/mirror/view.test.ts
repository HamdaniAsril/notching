// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import id from './locales/id.json';
import { renderMirror } from './view';

afterEach(() => { document.body.innerHTML = ''; });

function mount() {
  const root = document.createElement('div');
  document.body.append(root);
  let on = true;
  const sound = { prime: vi.fn(), step: vi.fn(), on: () => on, set: vi.fn((v: boolean) => { on = v; }) };
  renderMirror(root, id, { lamp: vi.fn(), nextCamera: vi.fn() }, sound);
  const [zoom, light] = [...root.querySelectorAll<HTMLElement>('.cm-ruler')];
  const pointer = (box: HTMLElement, type: string, x: number) => box.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true }));
  return { root, sound, zoom, light, pointer };
}

test('the zoom ruler tiks as Timer does: primed on press, a step for each tick passed', () => {
  const { sound, zoom, pointer } = mount();
  pointer(zoom, 'pointerdown', 200);
  expect(sound.prime).toHaveBeenCalledOnce();
  pointer(zoom, 'pointermove', 186); // 14 px left: one tick, 1.0× to 1.1×
  expect(sound.step).toHaveBeenLastCalledWith(10, 11);
  pointer(zoom, 'pointermove', 130); // 70 px: to 1.5×, past a long tick
  expect(sound.step).toHaveBeenLastCalledWith(11, 15);
  expect(zoom.getAttribute('aria-valuenow')).toBe('15');
});

test('the light ruler tiks too, and a click alone is quiet', () => {
  const { sound, light, pointer } = mount();
  pointer(light, 'pointerdown', 200);
  pointer(light, 'pointermove', 202);
  pointer(light, 'pointerup', 202);
  expect(sound.step).not.toHaveBeenCalled();
  pointer(light, 'pointerdown', 200);
  pointer(light, 'pointermove', 190); // 10 px left: 4500K to 4400K
  expect(sound.step).toHaveBeenCalledWith(20, 21);
});

test('a ruler held at its end makes no more tiks', () => {
  const { sound, zoom, pointer } = mount();
  pointer(zoom, 'pointerdown', 200);
  pointer(zoom, 'pointermove', 400); // right: below 1.0×, stays at the end
  expect(sound.step).not.toHaveBeenCalled();
});

test("Timer's speaker sits at the end of the chips and turns the tik off and on", () => {
  const { root, sound } = mount();
  const speaker = root.querySelector<HTMLButtonElement>('.cm-chips > .cm-sound')!;
  expect(speaker).toBe(root.querySelector('.cm-chips')!.lastElementChild);
  expect(speaker.getAttribute('aria-label')).toBe('Bunyi penggaris');
  expect(speaker.getAttribute('aria-pressed')).toBe('true');
  speaker.click();
  expect(sound.set).toHaveBeenLastCalledWith(false);
  expect(speaker.getAttribute('aria-pressed')).toBe('false');
  expect(speaker.classList.contains('cm-off')).toBe(true);
  speaker.click();
  expect(sound.set).toHaveBeenLastCalledWith(true);
});
