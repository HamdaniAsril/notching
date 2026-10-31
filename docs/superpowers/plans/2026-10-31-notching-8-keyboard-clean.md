# Keyboard Cleaning Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A built-in Keyboard Cleaning Mode: a click on its Modul tile locks the keyboard, dims every screen 90% with mockup C in the middle and shows a keyboard icon beside the notch; Esc ×5, the white tile, Cmd+Q, a 10-minute safety, sleep or screen lock end it.

**Architecture:** The mode lives in the Rust core: `keyclean.rs` (pure: Esc count with a 3 s window, 10-min safety), `keyclean_service.rs` (thread + glue: event tap, display hold, dim panels, status, notices, sleep/lock observers), `keyclean_tap.rs` (CGEventTap + Accessibility check), `keyclean_dim.rs` (one never-closed panel per screen showing `clean.html`). Manifests gain an `action`: a tile on the Modul page that calls a capability instead of opening a page. Status gains an icon-only form.

**Tech Stack:** Tauri 2, Rust (objc2, objc2-core-graphics `CGEvent`, raw FFI for `AXIsProcessTrustedWithOptions`), tauri-nspanel, vanilla TypeScript, vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-31-keyboard-clean-design.md`

## Global Constraints

- Esc: keycode 53. Five presses end the mode; a gap of 3000 ms without Esc resets the count to 0. Safety: the mode ends 600 000 ms after it started.
- Swallowed while on: every keyDown, keyUp, flagsChanged and system-defined (media, brightness, volume) event. Cmd+Q (keycode 12 with the command flag) quits Notching (`app.exit(0)`). A tap disabled by timeout or user input is re-enabled.
- Dim: every screen, black at 90 % opacity, catches clicks, never key, never closed (park = hide); the notch panels stay above it. Center (mockup C): title "Keyboard sedang dibersihkan" (en "Cleaning the keyboard"), five keys labelled `esc` (lit = white), hint "Tekan Esc 5× untuk keluar" (en "Press Esc 5× to leave").
- While on: `Activity::On` (white tile), icon-only status, a display hold (own `awake_hold::Hold`, not Keep awake's). Ends on: 5th Esc, tile click (toggle), Cmd+Q, safety, Mac sleep, screens sleep, screen lock, module switched off/uninstalled. No notice on end.
- No Accessibility permission: nothing dims; macOS prompt (`AXIsProcessTrustedWithOptions` with prompt) and a notice on channel `permission` (default on, no sound): "Izinkan Aksesibilitas" / "Agar Notching bisa mengunci keyboard" (en "Allow Accessibility" / "So Notching can lock the keyboard").
- Module id `keyboard-clean`, after `timer` in `modules/index.json`; no entry/card; `"action": {"capability": "keyclean", "method": "toggle"}`; capabilities `keyclean`, `status`, `notify`; permissions `accessibility`; name "Keyboard Cleaning Mode", shortName "Keyboard".
- Settings → Izin lists modules with permissions, Accessibility state, and a button to open System Settings › Privacy › Accessibility.
- Repo rules: `export PATH="$HOME/.cargo/bin:$PATH"` and `npm run build:modules` before cargo; never close an nspanel panel; page CSS without the frame classes `.main`, `.status`, `.card`, `.label`; commit explicit paths only.

## Review Focus

1. **Locked out** — the tap must go on every end path (Esc, tile, safety, sleep/lock, module off) and the dim with it; Cmd+Q must always quit. Device check plus `stop_ends_once` (Task 1).
2. **Esc pressed slowly** — gaps over 3 s reset the count; a 5th press after a reset is press 1. Test `a_gap_resets_the_count` (Task 1).
3. **No permission** — nothing dims, nothing is held, the tap is not created. Device check (Task 5).
4. **Second click while starting / tile clicked again** — toggles off, never two taps. Test `toggle_turns_on_then_off` (Task 1).
5. **A package without a page and without widgets** — still valid when it has an action; still refused when it has none. Test `an_action_package_needs_no_page` (Task 3).

---

### Task 1: Mode logic (`keyclean.rs`)

**Files:** Create `src-tauri/src/keyclean.rs`; modify `src-tauri/src/lib.rs`.

**Interfaces — Produces:**
- `pub const ESC_PRESSES: u8 = 5; pub const PRESS_WINDOW_MS: i64 = 3_000; pub const SAFETY_MS: i64 = 600_000; pub const WAIT_MAX_MS: i64 = 60_000;`
- `#[derive(Default)] pub struct KeyClean` (private `owner: Option<String>`, `started: i64`, `presses: u8`, `last_press: i64`).
- `toggle(&mut self, owner: &str, now: i64) -> Toggle` with `#[derive(Debug, PartialEq)] pub enum Toggle { On, Off(String) }`.
- `esc(&mut self, now: i64) -> Press` with `pub enum Press { Ignored, Count(u8), Done(String) }` (Ignored when off).
- `stop(&mut self) -> Option<String>`; `owner(&self) -> Option<&str>`; `presses(&self, now: i64) -> u8` (0 past the window).
- `step(&mut self, now: i64) -> Step` with `pub enum Step { Off, Ended(String), Reset { wait_ms: i64 }, Wait(i64) }` — `Ended` at the safety; `Reset` once when a count of ≥1 times out (presses back to 0); otherwise `Wait` until the next reset or safety (≤ WAIT_MAX_MS).

- [ ] **Step 1: failing tests** (`const T: i64 = 1_000_000_000;`): `toggle_turns_on_then_off` (On, then Off("k"), owner None); `five_esc_end_it` (Count(1..=4) then Done("k"), then Ignored); `a_gap_resets_the_count` (2 presses, +3001 ms → `presses` 0, next is Count(1); `step` at the timeout gives `Reset`, then `Wait`); `the_safety_ends_it_after_ten_minutes` (`step(T + SAFETY_MS - 1)` is Wait(1), `step(T + SAFETY_MS)` is Ended("k"), then Off); `stop_ends_once` (Some then None).
- [ ] **Step 2:** `cargo test … keyclean::` → compile errors.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** tests pass.
- [ ] **Step 5:** commit `feat(keyclean): the mode's logic in the core`.

### Task 2: Icon-only status

**Files:** `src-tauri/src/status.rs`, `src-tauri/src/app_core.rs`, `src/notch/view.ts`, tests `src/notch/view.test.ts`.

**Interfaces — Produces:** `LiveStatus::set_icon(&mut self, module: &str, activity: Activity) -> bool` (entry shows with text `""`); `AppCore::set_status_icon(&mut self, module: &str, activity: Activity) -> Result<bool, CoreError>` (same capability check as `set_status`); `pub fn status::set_icon(app, module, activity) -> Result<(), String>`. The notch view draws a status `""` as the icon alone (beside the notch: right-aligned in the tab; on a lens: a pill of padding + icon).

- [ ] **Step 1: failing tests:** Rust `an_icon_only_status_shows_with_empty_text` (`set_icon("k", On)` → `shown` = `("k", "")`; switched-off modules still skip it; `set` with text on the same module replaces it). TS `an empty status shows the icon alone` — `view.setStatus('', 'mod://k/icon.svg')` with a notch: icon `display` inline, its `x` = `notch.width / 2 + STATUS_TAB - 8 - ST_ICON`; lens: pill width `2 * 12 + 17`.
- [ ] **Step 2–4:** RED, implement, GREEN (`npx tsc --noEmit && npm test`, `cargo test`).
- [ ] **Step 5:** commit `feat(status): a status may be the module's icon alone`.

### Task 3: Tiles that run an action

**Files:** `src-tauri/src/modules/manifest.rs`, `src-tauri/src/app_core.rs` (DTO), `src/modules/types.ts`, `src/pages/route.ts`, `src/notch/page-view.ts`, `src/app.ts`, `src/bridge-browser.ts` (catalog `action`, `permissions`), `src/notch/test-helpers.ts`; tests in each.

**Interfaces — Produces:**
- Rust `#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)] pub struct TileAction { pub capability: Capability, pub method: String }`; `Manifest.action: Option<TileAction>` (`#[serde(default)]`); `parse_manifest`: a package needs a page, widgets **or** an action (`Empty` otherwise); an action whose capability is not in `capabilities`, or with an empty method, is `ManifestError::BadAction`; a page and an action together are `BadAction`.
- `ModuleInfoDto.action: Option<TileAction>` and `ModuleInfoDto.permissions: Vec<Permission>` (Permission gets `serde::Serialize`).
- TS `ModuleInfo.action: { capability: string; method: string } | null`, `ModuleInfo.permissions: string[]`; `pageModules` keeps modules with a page **or** an action (catalog order); `resolvePage('module:<id>')` stays null for an action module.
- `PageViewDeps.onAction(m: ModuleInfo)`; an action tile calls it instead of `onOpenModule`. `app.ts` `onAction`: `controller.escape(); view.kick(); bridge.moduleCall(m.id, a.capability, a.method).catch(() => {})`.

- [ ] **Step 1: failing tests:** Rust `an_action_package_needs_no_page` (manifest with only `action` + declared capability parses; undeclared capability → BadAction; entry+card+action → BadAction; nothing at all → Empty). TS `an action tile runs its action and opens no page` (page-view), `the Modul page holds modules with an action` (route `pageModules`, `viewSize`).
- [ ] **Step 2–4:** RED, implement, GREEN.
- [ ] **Step 5:** commit `feat(modules): a Modul tile may run an action instead of opening a page`.

### Task 4: Settings → Izin

**Files:** `src-tauri/src/settings_window.rs` (`SettingsDto.accessibility: bool`), `src-tauri/src/keyclean_tap.rs` (create with `pub fn trusted(prompt: bool) -> bool` and `pub fn open_accessibility_settings()`), `src-tauri/src/lib.rs` (command `open_accessibility_settings`), `src/settings/types.ts`, `bridge-tauri.ts`, `bridge-browser.ts`, `test-helpers.ts`, `src/settings/pages/info.ts`, `src/i18n/{id,en}.json`; test `src/settings/pages/info.test.ts` (create).

**Interfaces — Produces:** `SettingsInfo.accessibility: boolean`; `SettingsBridge.openAccessibility(): Promise<void>`. The page lists every installed module whose `permissions` include `accessibility`: module name, "Aksesibilitas", state "Diizinkan" / "Belum diizinkan", and a button "Buka Pengaturan Sistem" (`data-key="permissions.open"`). With no such module the old text stays. While the page is open it re-reads `settings()` every 2 s.

- [ ] **Step 1: failing tests:** `the Izin page lists modules that need Accessibility and their state`, `its button opens System Settings`, `without such modules it keeps the old note`.
- [ ] **Step 2–4:** RED, implement (`trusted` via `AXIsProcessTrustedWithOptions` with `kAXTrustedCheckOptionPrompt`; open `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility` with `/usr/bin/open`), GREEN.
- [ ] **Step 5:** commit `feat(settings): the Izin page shows modules that need Accessibility`.

### Task 5: The mode in the core: capability, tap, hold, dim, observers

**Files:** Create `src-tauri/src/keyclean_service.rs`, `src-tauri/src/keyclean_dim.rs`; extend `keyclean_tap.rs`; modify `manifest.rs` (`Capability::KeyClean` serde `"keyclean"`), `gate.rs` (`Call::KeyCleanToggle` for `toggle`), `module_commands.rs` (dispatch; `module_gone`), `lib.rs` (modules, `keyclean_service::start`, command `get_clean_state`), `Cargo.toml` (`objc2-core-graphics` feature `CGEvent`, more `objc2-app-kit`/`objc2-foundation` features as needed for `NSWorkspace`, `NSDistributedNotificationCenter`).

**Interfaces:**
- Consumes Tasks 1, 2.
- Produces `keyclean_service::{start(app), toggle(app, owner) -> Result<(), String>, stop(app), module_gone(app, id), state(app) -> CleanStateDto}`; `#[derive(serde::Serialize)] #[serde(rename_all = "camelCase")] pub struct CleanStateDto { pub on: bool, pub presses: u8, pub lang: Lang }`; event `notching://clean` carrying `CleanStateDto` to every window on each change; command `get_clean_state`.
- Gate test: `keyboard_clean_needs_its_capability` (`toggle` ok, `start` UnknownMethod, undeclared → NotDeclared).

- [ ] **Step 1:** failing gate test → RED.
- [ ] **Step 2:** implement. Toggle on: `trusted(true)` false → post `permission` notice, `Err("accessibility is not allowed")`; tap create fails → same error; else on the main thread show the dims, re-front the notch panels, take a `Hold`, `status::set_icon(owner, On)`, emit. Tap callback (main run loop): Esc → `KeyClean::esc` (emit count, or stop on Done); Cmd+Q → `app.exit(0)`; swallow everything else; re-enable on `TapDisabledByTimeout`/`ByUserInput`. Stop (every path): remove the tap, hide the dims, drop the hold, `status::clear`, emit. The thread waits on `KeyClean::step` like `timer_service`, ending at the safety and emitting a reset. Observers registered once at start: `NSWorkspaceWillSleepNotification`, `NSWorkspaceScreensDidSleepNotification`, distributed `com.apple.screenIsLocked` → `stop`.
- [ ] **Step 3:** `cargo test` GREEN; commit `feat(keyclean): the core locks the keyboard, dims the screens and holds them on`.

### Task 6: The dim page

**Files:** Create `clean.html`, `src/clean/main.ts`, `src/clean/view.ts`, `src/clean/view.test.ts`, `src/clean/clean.css`; modify `vite.config.ts` (input `clean`), `src/i18n/{id,en}.json` (`clean.title`, `clean.hint`), `src/bridge.ts`-style tiny bridge inside `src/clean/main.ts` (`invoke('get_clean_state')`, `listen('notching://clean')`).

**Interfaces — Produces:** `renderClean(root: HTMLElement, s: { title: string; hint: string }): { update(presses: number): void }` — `.kc-title`, `.kc-keys` with five `.kc-key` (`esc`; `kc-on` for the first `presses`), `.kc-hint`. Black 90 % background on `body`.

- [ ] **Step 1: failing tests:** `the dim page shows the title, five esc keys and the hint`, `keys light up with the presses and go dark on a reset`.
- [ ] **Step 2–4:** RED, implement, GREEN; `npm run build` includes `clean.html`.
- [ ] **Step 5:** commit `feat(keyclean): the dim page, choice C`.

### Task 7: The module package

**Files:** Create `modules/keyboard-clean/{manifest.json,icon.svg,locales/id.json,locales/en.json}`, `modules/keyboard-clean/icon.test.ts`; modify `modules/index.json`, `scripts/build-modules.mjs` (a package with no entry and no widgets is copied without a vite build), `src/bridge-browser.ts` (capability `keyclean` → no-op that returns null).

- [ ] **Step 1: failing test:** icon is a 24×24 line drawing; manifest parses through the browser catalog with `action` and `permissions: ['accessibility']`.
- [ ] **Step 2–4:** RED, implement, GREEN: `npx tsc --noEmit && npm test && npm run build:modules && cargo test` (`module keyboard-clean built`).
- [ ] **Step 5:** commit `feat(keyclean): the Keyboard Cleaning Mode module`.

### Task 8: Review, release, device check, notes

- [ ] Fresh whole-branch review on the most capable model; fix Important findings with RED→GREEN tests.
- [ ] Release build `npm run tauri build -- --bundles app`; run it from the worktree (backup settings first); grant Accessibility to that build.
- [ ] Device check with the owner, each item matched against logs (`pmset -g assertions` for the hold, settings.json, app log): tile turns it on; dims every screen with C; keys swallowed (type in a text editor under it); Esc ×5 with slow presses resetting; tile toggles off; Cmd+Q quits and frees the keyboard; no-permission path; sleep/lock ends it.
- [ ] Verification notes `docs/superpowers/verification/2026-10-31-notching-8-keyboard-clean.md`.
