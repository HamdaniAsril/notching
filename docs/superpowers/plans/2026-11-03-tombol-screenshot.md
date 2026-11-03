# Screenshot: first-use notice and keys of one's own — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first time Screenshot's keys don't reach Notching, the notch opens a notice offering "turn off the Mac's" (opens System Settings, then watches) or "use my own keys" (opens Settings → Modul → Screenshot, where both keys can be re-recorded).

**Architecture:** The keys move from constants into `settings.json` (`shotKeys`, `shotNotice`). A new AppKit-free `shot_keys.rs` owns combos, labels, the key table and the Mac-shortcut check; `shot_hotkey.rs` registers from settings, decides the launch notice (first or small), sends the first one to the cursor's overlay and watches after "turn off". The notch gets a third Screenshot view, `setup`; Settings gets a recorder in the Screenshot module page and can be opened at a route.

**Tech Stack:** Rust (Tauri 2, Carbon hot keys, objc2), vanilla TypeScript, vitest + jsdom, cargo test.

**Spec:** `docs/superpowers/specs/2026-11-03-tombol-screenshot-design.md` (extends `2026-11-01-screenshot-design.md` §4).

## Global Constraints

- Never close an nspanel; only hide, move or reload it.
- Default keys stay ⌘⇧3 (kVK 20) and ⌘⇧4 (kVK 21) with ⌘⇧; labels keep the existing order, so the defaults still read "⌘⇧3" / "⌘⇧4" (modifier order ⌃ ⌥ ⌘ ⇧).
- A recordable combo: at least one of ⌘ ⌃ ⌥, plus one of A–Z, 0–9, `- = [ ] \ ; ' , . / \``, F1–F12. Shift optional.
- The first notice shows once ever (`shotNotice` true after it opens, or after a first check that finds nothing taken).
- After "Matikan bawaan Mac": read the Mac's shortcuts every 2 s for at most 10 minutes.
- Uninstalling Screenshot resets the keys to the defaults; switching it off keeps them.
- Copy (id / en) as in spec §7. Commit with the repo's configured noreply author; don't change git config.

## Review Focus

- Recording while Notching's own ⌘⇧4 is registered → must not open the picker (hold released during recording; Settings window closing mid-record must re-register). Test in Task 6 (`hold` released on cancel) and Task 3 (`settings_closed` re-registers).
- A recorded combo equal to the other row's → refused with "Sudah dipakai untuk …", recording continues. Test in Task 1 (`set_key` duplicate) and Task 6.
- A combo the Mac's ⌘⇧5 (id 184, absent from the plist) holds → "shortcut" state, not "ok". Test in Task 1.
- The first check finds nothing taken → no notice now or ever. Test in Task 3 (`launch_notice` Settle).
- Owner already on the build (settings without the new fields) → defaults, notice shows once. Test in Task 2 (lenient load).

---

### Task 1: Combos, labels and the Mac-shortcut check (`shot_keys.rs`)

**Files:**
- Create: `src-tauri/src/shot_keys.rs` (register `mod shot_keys;` in `lib.rs`)
- Modify: `src-tauri/src/shot.rs` — `KeyState` gains `Shortcut` (`"shortcut"`); `parse_key_conflicts` moves to `shot_keys::mac_holds` (update its test)

**Interfaces — Produces:**
- `pub const CMD: u32 = 0x0100; SHIFT = 0x0200; OPTION = 0x0800; CONTROL = 0x1000;` (Carbon)
- `#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)] #[serde(rename_all="camelCase")] pub struct Combo { pub code: u32, pub mods: u32 }`
- `pub struct ShotKeys { pub screen: Combo, pub pick: Combo }` (same derives, `Default` = 20/21 with CMD|SHIFT), `impl ShotKeys { pub fn is_default(&self) -> bool }`
- `pub fn label(c: Combo) -> String` — "⌘⇧3", "⌃⇧S", "⌥F5"
- `pub fn from_web(code: &str, cmd: bool, ctrl: bool, alt: bool, shift: bool) -> Option<Combo>` — `KeyboardEvent.code` → combo; None when not recordable
- `#[derive(Clone, Copy, PartialEq, Debug)] pub enum Which { Screen, Pick }` with serde lowercase
- `#[derive(Debug, PartialEq)] pub enum SetKeyError { Invalid, Duplicate }` (serialize as "invalid" / "duplicate")
- `pub fn set_key(keys: ShotKeys, which: Which, combo: Option<Combo>) -> Result<ShotKeys, SetKeyError>` (None = Invalid)
- `#[derive(Clone, Copy, PartialEq, Debug)] pub enum MacHold { Free, Screenshot, Shortcut }`
- `pub fn mac_holds(symbolic_hotkeys: &serde_json::Value, combo: Combo) -> MacHold`

- [ ] **Step 1: Write failing tests** in `shot_keys.rs`:
  - `labels_read_like_the_mac`: `label(ShotKeys::default().screen) == "⌘⇧3"`, pick `"⌘⇧4"`, `Combo{code:1, mods:CONTROL|SHIFT}` → `"⌃⇧S"`, `Combo{code:0x60, mods:OPTION}` → `"⌥F5"`, `Combo{code:0x2C, mods:CMD|OPTION}` → `"⌥⌘/"`.
  - `from_web_needs_cmd_ctrl_or_option`: `from_web("KeyS", false, true, false, true) == Some(Combo{code:1, mods:CONTROL|SHIFT})`; `from_web("Digit3", true,false,false,true)` = default screen; `from_web("KeyS", false,false,false,true) == None`; `from_web("ShiftLeft", true,..) == None`; `from_web("Space", true,..) == None`; `from_web("F12", false,false,true,false) == Some(Combo{code:0x6F, mods:OPTION})`.
  - `set_key_refuses_the_other_rows_combo`: setting pick to the default screen combo → `Err(Duplicate)`; setting screen to its own current combo → Ok unchanged; `None` → `Err(Invalid)`; a new combo → Ok with only that row changed.
  - `mac_holds_screenshot_keys_and_their_defaults`: port the existing `parse_key_conflicts` cases (ids 28/30 enabled → Screenshot; disabled → Free; missing → Screenshot; rebound elsewhere → Free); `Combo{code:23 (5), mods:CMD|SHIFT}` with `{}` → Screenshot (id 184 default); with 184 disabled → Free; `Combo{20, CONTROL|CMD|SHIFT}` with `{}` → Screenshot (id 29).
  - `mac_holds_other_enabled_shortcuts`: `{"AppleSymbolicHotKeys":{"64":{"enabled":true,"value":{"parameters":[32,49,1048576]}}}}` vs `Combo{49, CMD}` → Shortcut; same entry `enabled:false` → Free; `Combo{1, CONTROL|SHIFT}` with `{}` → Free.
- [ ] **Step 2:** `cd src-tauri && cargo test shot_keys` — FAIL (module missing).
- [ ] **Step 3: Implement.** One `const KEYS: &[(u32, &str, &str)]` table of (kVK, web code, label) for the recordable keys (kVK values: A 0x00 S 0x01 D 0x02 F 0x03 H 0x04 G 0x05 Z 0x06 X 0x07 C 0x08 V 0x09 B 0x0B Q 0x0C W 0x0D E 0x0E R 0x0F Y 0x10 T 0x11 1 0x12 2 0x13 3 0x14 4 0x15 6 0x16 5 0x17 = 0x18 9 0x19 7 0x1A - 0x1B 8 0x1C 0 0x1D ] 0x1E O 0x1F U 0x20 [ 0x21 I 0x22 P 0x23 L 0x25 J 0x26 ' 0x27 K 0x28 ; 0x29 \ 0x2A , 0x2B / 0x2C N 0x2D M 0x2E . 0x2F ` 0x32 F1 0x7A F2 0x78 F3 0x63 F4 0x76 F5 0x60 F6 0x61 F7 0x62 F8 0x64 F9 0x65 F10 0x6D F11 0x67 F12 0x6F). Mac shortcut flags are NSEvent's (shift 0x20000, ctrl 0x40000, option 0x80000, cmd 0x100000); convert from Carbon before comparing. Screenshot ids with their defaults: 28 (20, ⌘⇧), 29 (20, ⌃⌘⇧), 30 (21, ⌘⇧), 31 (21, ⌃⌘⇧), 184 (23, ⌘⇧); a missing entry or one without parameters is its default and on. Any other entry counts only when `enabled` is true and its parameters match.
- [ ] **Step 4:** `cargo test shot_keys shot::` — PASS.
- [ ] **Step 5: Commit** `feat(shot): combos, labels and the Mac shortcut check for Screenshot's keys`

### Task 2: The keys and the notice flag in settings

**Files:**
- Modify: `src-tauri/src/settings.rs` (fields + lenient load + tests), `src-tauri/src/app_core.rs` (accessors/setters + uninstall reset + tests)

**Interfaces — Produces:**
- `Settings.shot_keys: ShotKeys` (`shotKeys`, lenient → default), `Settings.shot_notice: bool` (`shotNotice`, lenient → false)
- `AppCore::shot_keys(&self) -> ShotKeys`, `AppCore::set_shot_keys(&mut self, keys: ShotKeys) -> Result<(), CoreError>`, `AppCore::shot_notice(&self) -> bool`, `AppCore::set_shot_notice(&mut self) -> Result<(), CoreError>`
- `AppCore::uninstall("screenshot")` also resets `shot_keys` to default.

- [ ] **Step 1: Failing tests:** `settings.rs` `shot_keys_default_and_read_leniently` (missing → default + false; `{"shotKeys":{"screen":{"code":1,"mods":4608},"pick":{"code":21,"mods":768}},"shotNotice":true}` round-trips; `"shotKeys":"x"` → default and the other fields kept). `app_core.rs` `shot_keys_save_and_uninstall_resets_them` (set → reopen → kept; `set_enabled("screenshot", false)` keeps; `uninstall("screenshot")` → default) and `shot_notice_is_saved`.
- [ ] **Step 2:** `cargo test settings:: app_core::` — FAIL.
- [ ] **Step 3:** Implement following the `accent` fields' pattern.
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5: Commit** `feat(settings): Screenshot's keys and its first notice in settings.json`

### Task 3: Hot keys from settings; first notice, watch, hold (`shot_hotkey.rs`)

**Files:**
- Modify: `src-tauri/src/shot_hotkey.rs`, `src-tauri/src/lib.rs` (new commands), `src-tauri/src/settings_window.rs` (call `shot_hotkey::settings_closed` on Destroyed), `modules/screenshot/locales/{id,en}.json`

**Interfaces — Consumes:** Task 1, Task 2. **Produces:**
- `KeysDto { screen, pick: KeyState, labels: KeyLabels { screen: String, pick: String }, custom: bool }` (camelCase JSON: `{"screen":"mac","pick":"ok","labels":{"screen":"⌘⇧3","pick":"⌘⇧4"},"custom":false}`)
- `combine(enabled, registered: [KeyState;2], mac: [MacHold;2]) -> [KeyState;2]` (Screenshot → Mac, Shortcut → Shortcut, Free → registered)
- `enum Launch { Nothing, Settle, First(Holder, String), Small(Holder, String) }`; `pub fn launch_notice(notice_shown: bool, sent: bool, states: [KeyState;2], labels: [&str;2], lang: Lang) -> Launch` — `Shortcut` counts as `Holder::Mac`. `conflict_notice_due` folds into it.
- `pub fn freed(watched: [bool;2], now: [KeyState;2]) -> bool` — every watched key is no longer Mac/Shortcut.
- Event `notching://shot-setup` to one overlay: `{ "holder": "mac" | "other", "keys": "⌘⇧3 dan ⌘⇧4" }`
- Commands: `shot_turn_off_mac()` (opens System Settings, starts the watch; one watcher at a time), `shot_keys_hold(hold: bool)`, `shot_set_key(which: Which, code: String, cmd, ctrl, alt, shift: bool) -> Result<KeysDto, SetKeyError>`, `shot_reset_keys() -> KeysDto`. `shot_keys` returns the new DTO.
- Locale keys: `notice.freed.title` ("{keys} sekarang untuk Notching" / "{keys} now go to Notching").

- [ ] **Step 1: Failing tests:**
  - `launch_notice_first_then_small`: not shown + Mac,Mac → `First(Mac,"⌘⇧3 dan ⌘⇧4")`; shown + Mac,Ok → `Small(Mac,"⌘⇧3")`; shown + sent → `Nothing`; not shown + Ok,Ok → `Settle`; not shown + Off,Off → `Nothing` (module off: decide later); not shown + Ok,Other → `First(Other,"⌘⇧4")`; custom labels: labels `["⌃⇧S","⌃⇧A"]`, Shortcut,Ok → `First(Mac,"⌃⇧S")`. Keep the existing mixed/plural cases on this function.
  - `freed_waits_for_every_watched_key`: `freed([true,true],[Ok,Mac]) == false`, `freed([true,false],[Ok,Mac]) == true`, `freed([true,true],[Ok,Other]) == true`.
  - Update `mac_conflict_wins_over_registered`, `json_is_camel_case_lowercase` to the new shapes; `notice_titles_are_in_the_module_locales` also checks `notice/freed/title` has `{keys}`.
- [ ] **Step 2:** `cargo test shot_hotkey` — FAIL.
- [ ] **Step 3: Implement.** `register` reads `core.shot_keys()`; `Key::code/label` go. `notice_if_due` uses `launch_notice`: `Settle` → `set_shot_notice`; `First` → emit `notching://shot-setup` to the overlay under the cursor (reuse `shot_service::result_label` logic with the cursor's screen — make a `pub fn cursor_label(app, mtm) -> String` there), then `set_shot_notice` and count as sent; `Small` → the existing post. `shot_set_key`/`shot_reset_keys` save through `CoreState`, re-register on the main thread (`run_on_main_thread`) and return `keys()`. `shot_keys_hold(true)` unregisters; `false` re-registers when enabled; `settings_closed(app)` = hold false. Watch: an `AtomicBool` guard; a thread records which keys are Mac/Shortcut, then every 2 s for 300 reads checks `freed`, posts `notice.freed.title` with those keys' labels on channel `keys` and stops. Log one line per step (`notching: screenshot keys …`) for the Mac check.
- [ ] **Step 4:** `cargo test` (whole crate) — PASS; `cargo clippy --all-targets` clean.
- [ ] **Step 5: Commit** `feat(shot): keys from settings, the first-use notice, and a watch after turning the Mac's off`

### Task 4: Settings opens at a route

**Files:**
- Modify: `src-tauri/src/settings_window.rs` (`open_settings_at(app, window, route: String)`: as `open_settings`, with `settings.html?route=<route>` for a new window, else emit `notching://settings-go` with the route to it), `lib.rs`; `src/settings/main.ts`, `src/settings/shell.ts` (+ test), `src/settings/types.ts`, `bridge-tauri.ts`, `bridge-browser.ts`, `test-helpers.ts`

**Interfaces — Produces:**
- TS `export function parseRoute(s: string | null): Route | null` in `shell.ts`: `'module:screenshot'` → `{page:'module', id:'screenshot'}`, a top page id (`'general'`, `'modules'`, …) → `{page}`, anything else → null.
- `mountSettings(root, bridge, env, start?: Route)`; `SettingsBridge.onGo(cb: (route: string) => void): () => void`.

- [ ] **Step 1: Failing tests** in `shell.test.ts`: `parseRoute` cases above; `mountSettings(..., {page:'module', id:'screenshot'})` shows the Screenshot module page; a fake `onGo('module:screenshot')` moves there; `onGo('nope')` changes nothing.
- [ ] **Step 2:** `npx vitest run src/settings/shell.test.ts` — FAIL.
- [ ] **Step 3:** Implement; `main.ts` passes `parseRoute(new URLSearchParams(location.search).get('route'))`. Keep the Rust duplication with `open_settings` small (share a private `fn open(app, window, route: Option<&str>)`).
- [ ] **Step 4:** vitest + `cargo test settings_window` PASS.
- [ ] **Step 5: Commit** `feat(settings): open at a page, from the notch`

### Task 5: The notch's setup view and the keys in the list

**Files:**
- Create: `src/shot/setup.ts`, `src/shot/setup.test.ts`
- Modify: `src/bridge.ts` (+ `bridge-browser.ts`), `src/shot/common.ts`, `src/shot/keys.ts`, `src/shot/list.ts` (+ test), `src/pages/route.ts` (+ test), `src/notch/page-view.ts`, `src/app.ts` (+ test), `src/i18n/{id,en}.json`, `src/notch/pages.css` (or wherever `.shot-*` lives)

**Interfaces — Produces:**
- `KeyState = 'ok' | 'mac' | 'shortcut' | 'other' | 'off'`; `ShotKeys { screen; pick; labels: { screen: string; pick: string }; custom: boolean }`
- `ShotSetup = { holder: 'mac' | 'other'; keys: string }`; bridge: `onShotSetup(cb)`, `shotTurnOffMac()`, `openShotKeySettings()` (= `open_settings_at('module:screenshot')`)
- `ShotTarget` gains `{ kind:'shot'; mode:'setup'; setup: ShotSetup }`; `SHOT.setupWidth = 420`, `SHOT.setupHeight = 132`
- `mountShotSetup(box, deps): { render(setup: ShotSetup): void; destroy(): void }`
- `keyNotices` returns `{ mac, shortcut, other }` using `keys.labels`; hints become templates `"{key}"`, `"{key} + klik"`, `"{key} + tarik"`, empty `"Tekan {screen} atau {pick} untuk screenshot pertama"`.
- Strings (`shot.setup.*`, `shot.shortcutKeys`) per spec §7.

- [ ] **Step 1: Failing tests:**
  - `setup.test.ts`: holder mac → title `"⌘⇧3 dan ⌘⇧4 masih dipakai Mac"`, sentence, two buttons; primary "Matikan bawaan Mac" calls `shotTurnOffMac` then `close`; "Pakai tombol sendiri" calls `openShotKeySettings` then `close`; holder other → only "Pakai tombol sendiri" (primary) and the other-app sentence; English strings.
  - `list.test.ts`: with `labels {screen:'⌃⇧S', pick:'⌃⇧A'}` the hints read `⌃⇧S`, `⌃⇧A + klik`, `⌃⇧A + tarik` and the empty line names both; a `shortcut` key shows "… dipakai pintasan Mac" with the System Settings button.
  - `route.test.ts`: the setup view's size is 420 × 132.
  - `app.test.ts`: an `onShotSetup` event opens the panel on the setup view; a capture taken meanwhile replaces it with the result.
- [ ] **Step 2:** `npx vitest run src/shot src/pages src/app.test.ts` — FAIL.
- [ ] **Step 3:** Implement; the setup view styles reuse `.shot-lab`, `.shot-btn`, `.shot-btn.primary` (accent). The list fetches keys once (it already does) and re-renders the hint lines when they come back.
- [ ] **Step 4:** `npm test` PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(notch): Screenshot's first-use notice, and the keys it really uses`

### Task 6: The recorder in Settings → Modul → Screenshot

**Files:**
- Modify: `src/settings/pages/modules.ts` (+ `modules.test.ts`), `src/settings/types.ts`, `bridge-tauri.ts`, `bridge-browser.ts`, `test-helpers.ts`, `src/settings/settings.css`, `src/settings/search.ts` (+ test, so "tombol"/"shortcut" finds the page), `src/i18n/{id,en}.json`

**Interfaces — Consumes:** Task 3 commands. **Produces:** `SettingsBridge.shotSetKey(which, e: {code, cmd, ctrl, alt, shift}): Promise<ShotKeys>` (rejects with `'invalid' | 'duplicate'`), `shotResetKeys(): Promise<ShotKeys>`, `shotKeysHold(hold: boolean): Promise<void>`.

- [ ] **Step 1: Failing tests** (`modules.test.ts`, screenshot page):
  - two rows "Seluruh layar" / "Window atau area" with buttons showing the labels;
  - click → text "Tekan tombol…", `shotKeysHold(true)`; a keydown `{code:'KeyS', ctrlKey, shiftKey}` → `shotSetKey('screen', {code:'KeyS', ctrl:true, shift:true, cmd:false, alt:false})`, the row shows the returned label, `shotKeysHold(false)`;
  - a lone modifier keydown is ignored; a rejection `'invalid'` shows "Pakai ⌘, ⌃, atau ⌥ dengan satu tombol" and keeps recording; `'duplicate'` shows "Sudah dipakai untuk Window atau area";
  - Escape → cancelled, label unchanged, `shotKeysHold(false)`, no `shotSetKey`; window `blur` cancels too;
  - "Kembalikan ke ⌘⇧3 dan ⌘⇧4" only when `custom`, calls `shotResetKeys`;
  - per-row notes: `mac` → "Dipakai screenshot bawaan Mac" + System Settings button, `shortcut` → "Dipakai pintasan Mac", `other` → "Dipakai app lain".
- [ ] **Step 2:** `npx vitest run src/settings` — FAIL.
- [ ] **Step 3:** Implement; the keydown listener is on `document` in the capture phase with `preventDefault` + `stopPropagation` while recording, and removed after.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, `cargo test` PASS.
- [ ] **Step 5: Commit** `feat(settings): record Screenshot's keys in Modul → Screenshot`

### Task 7: The System Settings address, and the whole check

- [ ] **Step 1:** Build a test build (`npm run tauri build -- --debug` or the repo's usual command), tell the owner first that Screen Recording must be granted again.
- [ ] **Step 2:** On the Mac, with a fresh `shotNotice: false`, try: the notice appears once; "Matikan bawaan Mac" opens System Settings (try `x-apple.systempreferences:com.apple.Keyboard-Settings.extension?Shortcuts` and deeper anchors; keep the deepest that works); after switching the Mac's off, "… sekarang untuk Notching" arrives; "Pakai tombol sendiri" opens Settings at Modul → Screenshot; record ⌃⇧S and use it.
- [ ] **Step 3:** Confirm against `~/Library/Application Support/id.web.notching/settings.json` and the log lines.
- [ ] **Step 4:** Spec: record what was seen, update spec §5 with the address used. Commit `docs: the owner's trial of Screenshot's keys`.
