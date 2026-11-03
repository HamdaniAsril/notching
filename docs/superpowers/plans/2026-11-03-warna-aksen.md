# Warna aksen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Volt accent (Lime) can be changed in Pengaturan → Tampilan to one of 8 presets or a custom colour, and every surface follows at once.

**Architecture:** Rust keeps `accent` and `accentCustom` in `Settings` and sends them in `ModuleState`. One pure TS function turns a hex into the accent tokens; `applyAccent` writes them as CSS variables on a document root. The notch page, Settings, the small windows and every module iframe (through a new `notching:accent` host message) call it. Hard-coded lime in CSS and TS becomes those variables.

**Tech Stack:** Tauri 2 (Rust), TypeScript vanilla, Vitest + jsdom, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-11-03-warna-aksen-design.md`

## Global Constraints

- Default accent `#c8f04a`. For Lime every token stays exactly as today: acc `#c8f04a`, hi `#d6f56e`, soft `#1d260b`, deep `#4c6b12`, deep-hi `#5a7d17`, deep-soft `rgba(76, 107, 18, 0.13)`, on-acc `#0f1404`.
- Presets, in this order: Lime `#c8f04a`, Citrus `#ffd23f`, Mango `#ff8a3d`, Peach `#ffa07a`, Blossom `#ff6fa8`, Lavender `#b18cff`, Sky `#5ac8fa`, Mint `#3ee6c4`. Names are the same in both languages and are never shown as text (tooltip and aria-label only).
- Dark guard: acc must reach ≥ 6 : 1 on `#000`. Pale guard first: HSL saturation < 0.45 → 0.45 (pure grey takes Lime's hue), lightness > 0.80 → 0.80. Presets pass through both unchanged.
- deep ≥ 5.5 : 1 on `#fff`; on-acc ≥ 4.5 : 1 on acc.
- `--v-danger` never changes. Volt's olive greys (`--v-ink`, `--v-muted`, `--fg`, `--g1..g3` …) never change.
- No `color-mix()` (macOS 13 WebKit lacks it): translucent accent is `rgba(var(--v-acc-rgb), a)`.
- Never close an nspanel; changing the accent only rewrites CSS variables, nothing reloads.
- Commits use the repo's configured noreply email; do not touch git config. No push.

## Review Focus

1. A module frame created after the accent changed (page switch, new widget) must start in the new colour: `init` carries the current accent. Test in Task 3.
2. A hand-edited `settings.json` with `"accent": "red"` or `"accent": 5` must load as Lime without losing other fields. Test in Task 2.
3. Settings in light mode must use the deep shade, not the bright accent, for `--acc`. Test in Task 6 (CSS assertion on the rule text).
4. Picking a preset after a custom colour must keep the custom swatch's colour. Test in Task 6.
5. The Settings preview notch and widget samples live in the Settings document, so they follow the Settings root, not a separate path. Covered by Task 6 applying tokens to the Settings root; check by eye in Task 8.

---

### Task 1: The accent palette

**Files:**
- Create: `src/kit/accent.ts`, `src/kit/accent.test.ts`
- Modify: `src/kit/volt-tokens.css`

**Interfaces:**
- Produces:
  - `DEFAULT_ACCENT = '#c8f04a'`
  - `ACCENT_PRESETS: readonly { name: string; hex: string }[]` (the 8 above, in order)
  - `normalizeHex(v: unknown): string | null` — `#rgb`/`#rrggbb`, any case → lowercase `#rrggbb`; else null
  - `interface AccentPalette { acc; hi; soft; deep; deepHi; deepSoft; onAcc; rgb: string }` — all strings; `rgb` is `"200, 240, 74"`
  - `accentPalette(hex: string): AccentPalette` — invalid input → Lime's palette
  - `applyAccent(root: HTMLElement, hex: string): void` — sets on `root.style`: `--v-acc`, `--v-acc-hi`, `--v-acc-soft`, `--v-acc-deep`, `--v-acc-deep-hi`, `--v-acc-deep-soft`, `--v-on-acc`, `--v-acc-rgb`
  - `contrast(a: string, b: string): number` (WCAG ratio, exported for tests)

- [ ] **Step 1: Write the failing tests** in `src/kit/accent.test.ts`:
  - `lime keeps today's tokens`: `accentPalette('#C8F04A')` deep-equals `{ acc: '#c8f04a', hi: '#d6f56e', soft: '#1d260b', deep: '#4c6b12', deepHi: '#5a7d17', deepSoft: 'rgba(76, 107, 18, 0.13)', onAcc: '#0f1404', rgb: '200, 240, 74' }`.
  - `presets pass unchanged`: for every preset, `accentPalette(p.hex).acc === p.hex`.
  - `dark picks are lightened`: for `#1a237e`, `#000000`, `#3b0a0a`: `contrast(acc, '#000000') >= 6`.
  - `pale picks get colour`: for `#ffffff`, `#cccccc`, `#f0f0f5`: acc HSL saturation ≥ 0.44 and lightness ≤ 0.81; and `acc !== '#ffffff'`.
  - `deep reads on white` and `on-acc reads on acc`: for every preset plus `#1a237e`, `#ffffff`: `contrast(deep, '#ffffff') >= 5.5`, `contrast(onAcc, acc) >= 4.5`.
  - `bad input is lime`: `accentPalette('red').acc === '#c8f04a'`; `normalizeHex('#ABC') === '#aabbcc'`; `normalizeHex('#12345') === null`; `normalizeHex(5) === null`.
  - `applyAccent writes the variables`: on a jsdom `document.documentElement` with `#ff8a3d`, `style.getPropertyValue('--v-acc') === '#ff8a3d'` and `--v-acc-rgb` is `'255, 138, 61'`.

- [ ] **Step 2: Run** `npx vitest run src/kit/accent.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement `src/kit/accent.ts`.** Lime returns the constants above. Any other colour:
  1. Pale guard in HSL, as in Global Constraints. When saturation is 0, use Lime's hue (≈ 74°).
  2. Dark guard: mix toward white in 0.04 steps until contrast with black is ≥ 6.
  3. `hi` = mix(acc, white, 0.25); `soft` = acc × 0.15; `onAcc` = acc × 0.08.
  4. `deep` = mix(acc, black, t), with t going up in 0.02 steps until contrast with white is ≥ 5.5.
  5. `deepHi` = mix(deep, white, 0.1); `deepSoft` = `rgba(r, g, b, 0.13)` of deep.

  Channels round to integers, and the output is lowercase hex.

- [ ] **Step 4: Add the defaults** to `:root` in `src/kit/volt-tokens.css`, next to the others: `--v-acc-hi: #d6f56e; --v-acc-deep-hi: #5a7d17; --v-acc-deep-soft: rgba(76, 107, 18, 0.13); --v-acc-rgb: 200, 240, 74;`.

- [ ] **Step 5: Run** `npx vitest run src/kit/accent.test.ts` — PASS.

- [ ] **Step 6: Commit** `feat(kit): the accent palette and applyAccent`

### Task 2: Accent in the core (Rust)

**Files:**
- Modify: `src-tauri/src/settings.rs` (fields, default, lenient read, tests), `src-tauri/src/app_core.rs` (`set_accent`, `ModuleStateDto`, tests), `src-tauri/src/settings_window.rs` (command), `src-tauri/src/lib.rs` (register)

**Interfaces:**
- Produces:
  - `Settings.accent: String` (default `"#c8f04a"`) and `Settings.accent_custom: Option<String>` (default None). Serde camelCase: `accent`, `accentCustom`.
  - `pub fn normalize_accent(s: &str) -> Option<String>`, in `settings.rs`. Same rules as TS `normalizeHex`.
  - `AppCore::set_accent(&mut self, accent: String, custom: Option<String>) -> Result<(), CoreError>`. An invalid `accent` gives `Err(CoreError::Invalid("accent".into()))`. `Some(custom)` replaces the custom colour (an invalid one gives `Invalid`). `None` keeps it.
  - `ModuleStateDto.accent: String`, `ModuleStateDto.accent_custom: Option<String>`.
  - Tauri command `set_accent(accent: String, custom: Option<String>)`, which follows `set_notch_config`'s `change(...)` pattern.

- [ ] **Step 1: Write the failing tests.**
  - In `settings.rs` tests:
    - `accent_defaults_to_lime`: `Settings::default().accent == "#c8f04a"`.
    - `old_file_reads_lime`: JSON without `accent` gives Lime.
    - `bad_accent_reads_lime_and_keeps_the_rest`: `{"accent":"red","language":"en"}` gives Lime and `language == En`; `{"accent":5}` gives Lime.
    - `accent_is_normalised_on_read`: `"#ABCDEF"` gives `"#abcdef"`.
  - In `app_core.rs` tests:
    - `set_accent_saves_and_shows_in_state`: after `set_accent("#ff8a3d", None)`, `module_state().accent == "#ff8a3d"`.
    - `set_accent_keeps_custom_when_none`: set `("#123456", Some("#123456"))`, then `("#c8f04a", None)`; `accent_custom == Some("#123456")`.
    - `set_accent_rejects_bad_hex`: `set_accent("nope", None)` is `Err(Invalid)` and the accent is unchanged.

- [ ] **Step 2: Run** `cd src-tauri && cargo test accent`. Expected: FAIL (compile errors).

- [ ] **Step 3: Implement.**
  - Write `lenient_accent` and `lenient_accent_custom` deserializers on top of `lenient_or` plus `normalize_accent`.
  - Add the fields to `Default`.
  - Fill the DTO in `module_state()`.
  - Add the command and register it in `lib.rs`'s handler list.
  - Settings file version stays the same, because the field is additive.

- [ ] **Step 4: Run** `cd src-tauri && cargo test`. Expected: all PASS.

- [ ] **Step 5: Commit** `feat(core): the accent setting and set_accent`

### Task 3: Module frames follow the accent

**Files:**
- Modify: `src/kit/protocol.ts`, `src/kit/protocol.test.ts`, `src/kit/client.ts`, `src/kit/client.test.ts`, `src/pages/frames.ts`, `src/pages/frames.test.ts`

**Interfaces:**
- Consumes: `applyAccent`, `normalizeHex` (Task 1).
- Produces:
  - `HostMessage` `notching:init` gets an optional `accent?: string`. New variant: `{ type: 'notching:accent'; accent: string }`. `isHostMessage` accepts it only when `normalizeHex(accent)` is non-null.
  - `Kit.accent: string` and `Kit.onAccent(cb: (hex: string) => void): void`.
  - `FrameHost.setAccent(hex: string): void`, which posts to every live frame and is used by each later `init`.

- [ ] **Step 1: Write the failing tests.**
  - protocol: `notching:accent` with `'#ff8a3d'` is valid; with `'red'` it is not; `init` with a bad `accent` is invalid.
  - client: on `init` with `accent: '#ff8a3d'`, the frame document's `--v-acc` is `#ff8a3d` and `kit.accent === '#ff8a3d'`. A later `notching:accent` `'#5ac8fa'` updates `--v-acc` and calls the `onAccent` callbacks. `init` without `accent` leaves the CSS default and `kit.accent === '#c8f04a'`.
  - frames: after `setAccent('#b18cff')`, a newly created frame's init message has `accent: '#b18cff'`, and an already-ready frame gets `{ type: 'notching:accent', accent: '#b18cff' }`.

- [ ] **Step 2: Run** `npx vitest run src/kit src/pages/frames.test.ts`. Expected: new tests FAIL.

- [ ] **Step 3: Implement.** The client applies the accent to `win.document.documentElement` before it resolves. `notching:accent` is handled next to `notching:view`. In `frames.ts`, `let accent = DEFAULT_ACCENT`, and `init` always includes it.

- [ ] **Step 4: Run** `npx vitest run`. Expected: all PASS.

- [ ] **Step 5: Commit** `feat(kit): module frames get the accent and its changes`

### Task 4: The notch page

**Files:**
- Modify: `src/modules/types.ts` (`ModuleState.accent: string; accentCustom: string | null`), `src/bridge-browser.ts` and every ModuleState fixture `tsc` flags, `src/app.ts`, `src/app.test.ts`, `src/notch/view.ts`, `src/notch/view.test.ts`, `src/notch/pages.css`, `src/notch/notch.css` (check only)

**Interfaces:**
- Consumes: `applyAccent` (Task 1), `FrameHost.setAccent` (Task 3), `ModuleStateDto` fields (Task 2).

- [ ] **Step 1: Write the failing tests.**
  - `app.test.ts`: with an initial state of `accent: '#ff6fa8'`, `document.documentElement.style.getPropertyValue('--v-acc') === '#ff6fa8'`. A module-state update to `'#3ee6c4'` changes it and posts `notching:accent` to a live frame.
  - `view.test.ts`: replace the three `#C8F04A` assertions.
    - Bars and the missed dot use `style.fill === 'var(--v-acc)'`, not a `fill` attribute.
    - The cover gradient stops use `style.stopColor` `var(--v-acc)` and `var(--v-acc-deep)`.

- [ ] **Step 2: Run** `npx vitest run src/app.test.ts src/notch/view.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `app.ts`: call `applyAccent(doc.documentElement, state.accent)` and `frames.setAccent(state.accent)` at start and in `onModuleState`.
  - `view.ts`: drop `ACC`/`ACC_DEEP` and set the colours through `style` with the variables.
  - `pages.css`: the lamp's `--v-acc: #4c6b12` becomes `var(--v-acc-deep)`. `#c8f04a66` becomes `rgba(var(--v-acc-rgb), 0.4)`, `#c8f04a80` becomes `rgba(var(--v-acc-rgb), 0.5)`, and `#d6f56e` becomes `var(--v-acc-hi)`.

- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit`. Expected: PASS, no type errors.

- [ ] **Step 5: Commit** `feat(notch): the notch, its ears and the music waves follow the accent`

### Task 5: Modules and widgets

**Files:**
- Modify: `modules/waktu/widgets/analog.ts` and `analog.test.ts`, `modules/fokus/style.css`, any other `modules/**` file the sweep finds

- [ ] **Step 1: Write the failing test.** In `analog.test.ts`, the pin and the second hand use `style.fill`/`style.stroke` of `'var(--v-acc)'` instead of the `#c8f04a` attribute.

- [ ] **Step 2: Run** `npx vitest run modules/waktu`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `analog.ts` stops using `ACCENT` and sets the colour through style.
  - `fokus/style.css`: `rgba(200, 240, 74, a)` becomes `rgba(var(--v-acc-rgb), a)`.
  - Run `grep -rniE "c8f04a|4c6b12|1d260b|0f1404|d6f56e|200, ?240, ?74" modules` and convert each hit the same way, using `--v-acc-deep` for `#4c6b12`.

- [ ] **Step 4: Run** `npx vitest run` and `npm run build:modules`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(modules): widgets and modules draw with the accent variables`

### Task 6: Settings: tokens and the Warna aksen group

**Files:**
- Modify:
  - `src/settings/settings.css`
  - `src/settings/shell.ts` (apply the accent)
  - `src/settings/types.ts`, `bridge-tauri.ts`, `bridge-browser.ts` (`setAccent`)
  - `src/settings/controls.ts`, `controls.test.ts` (`swatches`)
  - `src/settings/pages/look.ts`, `look.test.ts`
  - `src/settings/search.ts`, `search.test.ts`
  - `src/i18n/id.json`, `en.json`
- Test: the files above, plus `src/settings/test-helpers.ts` fixtures

**Interfaces:**
- Consumes: `ACCENT_PRESETS`, `accentPalette`, `applyAccent`, `DEFAULT_ACCENT` (Task 1).
- Produces:
  - `SettingsBridge.setAccent(accent: string, custom: string | null): Promise<void>`, which calls `invoke('set_accent', { accent, custom })`.
  - `swatches(o: { key: string; label: string; options: { value: string; name: string; color: string }[]; value: string | null; custom: { name: string; color: string | null; onInput(hex: string): void; onChange(hex: string): void }; onPick(hex: string): void }): HTMLElement`. It returns a `row(...)` containing a `role="radiogroup"` with one `role="radio"` button per option, plus a last radio that wraps `<input type="color">`. The buttons use a roving tabindex, ArrowLeft and ArrowRight move between them and pick, and `aria-label` and `title` are set to `name`.
- i18n keys:
  - `look.accent` = "Warna aksen" / "Accent colour"
  - `look.accentCustom` = "Warna sendiri" / "Custom colour"
  - `keywords.accent` = "warna aksen tema hijau lime accent colour color theme"

- [ ] **Step 1: Write the failing tests.**
  - `controls.test.ts`:
    - 9 radios are created.
    - The radio whose value equals `value` has `aria-checked="true"`.
    - ArrowRight from the first radio calls `onPick` with the second colour.
    - An `input` event on the colour input calls `onInput`, and a `change` event calls `onChange`.
    - When `value` matches no preset, the custom radio is checked.
  - `look.test.ts`:
    - Clicking the Mango swatch calls `bridge.setAccent('#ff8a3d', null)`.
    - With state `accent: '#123456', accentCustom: '#123456'`, the custom swatch is checked.
    - With `accent: '#c8f04a', accentCustom: '#123456'`, Lime is checked and the custom swatch's colour shows `accentPalette('#123456').acc`.
    - A custom `change` to `'#224466'` calls `setAccent('#224466', '#224466')`.
    - Reset calls `setAccent('#c8f04a', null)` along with `setNotchConfig(DEFAULT_CONFIG)`.
  - `search.test.ts`: searching "aksen" and "accent" finds `look.accent`.
  - `shell.test.ts`: on start and on every module-state update, the Settings root's `--v-acc` follows `state.accent`.
  - CSS check, in `look.test.ts` or a small `settings-css.test.ts` that reads the file:
    - The `prefers-color-scheme: light` block sets `--acc: var(--v-acc-deep)`.
    - No `c8f04a` or `200, 240, 74` is left in `settings.css`.

- [ ] **Step 2: Run** `npx vitest run src/settings src/i18n`. Expected: new tests FAIL.

- [ ] **Step 3: Implement.**
  - In `settings.css`, dark `:root` uses `--acc: var(--v-acc); --acc-hi: var(--v-acc-hi); --acc-soft: var(--v-acc-soft); --on-acc: var(--v-on-acc)`.
  - The light block uses `--acc: var(--v-acc-deep); --acc-hi: var(--v-acc-deep-hi); --acc-soft: var(--v-acc-deep-soft); --on-acc: #fff`.
  - `rgba(200, 240, 74, a)` becomes `rgba(var(--v-acc-rgb), a)`.
  - Style the swatches with new class names, for example `.swatches`, `.swatch`, and `.swatch.on` with a ring outside the dot.
  - Size them 28–32 px to match the controls. The custom swatch has a conic rainbow ring with the chosen colour inside.
  - Put the group under the preview and above the sliders. During custom `input`, `applyAccent` goes on the Settings root only. On `change`, the accent is saved.

- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(settings): Warna aksen in Tampilan; Settings follows the accent`

### Task 7: The small windows

**Files:**
- Create: `src/kit/accent-follow.ts`, `src/kit/accent-follow.test.ts`
- Modify: `src/editor/main.ts`, `src/editor/editor.css` (`#d6f56e` → `var(--v-acc-hi)`), `src/clean/main.ts`, `src/pick/main.ts`

**Interfaces:**
- Consumes: `applyAccent` (Task 1).
- Produces: `followAccent(root: HTMLElement, deps: { get(): Promise<{ accent: string }>; on(cb: (s: { accent: string }) => void): void }): Promise<void>`. It applies the accent once from `get()`, then again on every `on` callback. If `get()` fails, it keeps the CSS default.

- [ ] **Step 1: Write the failing test.** It checks that a fake `get` resolving to `'#5ac8fa'` sets `--v-acc`, that a later `on` callback with `'#ffd23f'` updates it, and that a rejected `get` leaves the style empty.

- [ ] **Step 2: Run** `npx vitest run src/kit/accent-follow.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement it, then wire it in each `main.ts`.** Use `get: () => invoke('get_module_state')` and `on: cb => listen('notching://module-state', e => cb(e.payload))`. The editor already reads the module state, so reuse that call there.

- [ ] **Step 4: Run** `npx vitest run`, `npx tsc --noEmit` and `npm run build`. Expected: PASS.

- [ ] **Step 5: Commit** `feat: the editor, clean and pick windows follow the accent`

### Task 8: Sweep, full check, owner trial

- [ ] **Step 1: Sweep.** Run `grep -rniE "c8f04a|4c6b12|1d260b|0f1404|d6f56e|5a7d17|200, ?240, ?74" src modules --include='*.ts' --include='*.css'`. The only hits allowed are `src/kit/accent.ts`, `src/kit/volt-tokens.css` and tests that pin Lime.

- [ ] **Step 2: Run the full check.** Run `npx vitest run`, `npx tsc --noEmit`, `cd src-tauri && cargo test`, and `npm run build`. Expected: all green.

- [ ] **Step 3: Whole-branch review**, with a fresh reviewer.

- [ ] **Step 4: Owner trial.**
  - Tell the owner first that an unsigned test build means granting macOS permissions again.
  - Build, then ask the owner to try:
    - Mango and Sky, plus one dark custom colour,
    - notch, status dot, music waves, a widget page, Timer or Fokus, Cermin's lamp, and Settings in dark and light mode.
  - Confirm by reading `accent` and `accentCustom` in the app's `settings.json` before recording a pass.

- [ ] **Step 5: Merge.** With the owner's permission, merge `feat/warna-aksen` into `main`. No push.
