# Alat latar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two background tools (Potong file, Atur jendela) as a new "tool" kind of module, managed in Settings, with feedback only through notch notices.

**Architecture:** Manifest gets `"tool": "<capability>"`. Tools count as modules for on/off/uninstall but get no notch tile. Atur jendela registers nine Carbon hot keys and moves the focused window through the Accessibility API. Potong file runs a session event tap that only reacts to ⌘X/⌘V while Finder is frontmost; Finder focus is checked off the main thread and the key is re-posted (marked) as itself, ⌘C, or ⌘⌥V.

**Tech Stack:** Rust (Tauri 2, objc2, raw Carbon/CoreGraphics/ApplicationServices FFI), TypeScript without framework, vitest, cargo test.

**Spec:** `docs/superpowers/specs/2026-11-04-alat-latar-design.md`

## Global Constraints

- CPU 0.0% when idle: no polling, no timers while nothing is pressed.
- ⌘X/⌘V outside Finder, and in a Finder text field, reach the app unchanged.
- nspanel panels are never closed.
- Package ids `cut-files` and `window-keys`; names "Potong file"/"Cut files", "Atur jendela"/"Arrange windows"; copy as in spec §8.
- Commit with the repo's noreply email; no push.

## Review Focus

1. Finder renaming a file while ⌘X/⌘V pressed → text cut/paste as usual (pure rule `is_text_role` test in Task 4).
2. Clipboard changed after the cut (copy elsewhere) → ⌘V pastes normally (`paste_is_ours` test in Task 4).
3. Window bigger than the visible area when centred → top-left of visible frame (Task 3 test).
4. Window on a second screen with a different origin / negative coordinates → stays on that screen (Task 3 test).
5. Accessibility revoked while running → tap fails to install; nothing swallowed (Task 5: install returns None, `Tap` not kept).

---

### Task 1: Tool kind in manifest, store DTO and gate

**Files:** Modify `src-tauri/src/modules/manifest.rs`, `src-tauri/src/modules/gate.rs` (tests' `Manifest` literal), `src-tauri/src/modules/store.rs` (tests), `src-tauri/src/app_core.rs` (`ModuleInfoDto.tool`).

**Interfaces — Produces:** `Capability::Cut` (`"cut"`), `Capability::Windows` (`"windows"`); `Manifest.tool: Option<Capability>`; `Manifest::is_module()` true for tools; `Manifest::is_tool()`; `ModuleInfoDto.tool: bool` (JSON `tool`).

- [ ] Tests: `a_tool_package_needs_no_page_or_action` (parses `{"tool":"cut","capabilities":["cut","notify"]}`, `is_module()` and `is_tool()` true); tool with page, with action, or capability not listed → `ManifestError::BadAction`; store `a_tool_can_be_switched_off_and_uninstalled`.
- [ ] Implement; `Empty` check accepts a tool. Run `cargo test` in `src-tauri`; commit.

### Task 2: Shared Carbon hot key FFI

**Files:** Create `src-tauri/src/carbon_keys.rs`; modify `src-tauri/src/shot_hotkey.rs` to import from it.

**Produces:** `pub` extern fns `GetApplicationEventTarget, InstallEventHandler, RegisterEventHotKey, UnregisterEventHotKey, GetEventParameter`, structs `EventHotKeyID`, `EventTypeSpec`, consts `EVENT_CLASS_KEYBOARD, EVENT_HOT_KEY_PRESSED, PARAM_DIRECT_OBJECT, TYPE_HOT_KEY_ID, NO_ERR, EVENT_NOT_HANDLED`, and `pub fn hot_key_id(event) -> Option<EventHotKeyID>`.

- [ ] Move only; `cargo test` stays green; commit.

### Task 3: Window placement rules (pure)

**Files:** Create `src-tauri/src/win_rules.rs`.

**Produces:** `enum Cell { TopLeft, Top, TopRight, Left, Center, Right, BottomLeft, Bottom, BottomRight }`, `Cell::from_code(u32) -> Option<Cell>` (Q 0x0C … C 0x08), `Cell::ALL`, `fn place(cell, window: Rect, visible: Rect) -> Rect` (top-left coordinates, `geometry::Rect {x,y,w,h}`), `fn screen_for(window: Rect, screens: &[Rect]) -> usize`, `fn flip(appkit: Rect, primary_height: f64) -> Rect`.

- [ ] Tests: halves and quarters on `visible = {0,25,1440,875}` with odd sizes (right/bottom get the remainder, halves tile exactly); centre keeps size; centre of a larger window → visible origin; `screen_for` picks largest overlap incl. a screen at x = −1920, none overlapping → 0; `flip` of a screen above the primary.
- [ ] Implement, `cargo test win_rules`, commit.

### Task 4: Cut rules (pure)

**Files:** Create `src-tauri/src/cut_rules.rs`.

**Produces:** `enum Press { Cut, Paste, Other }`, `fn classify(keycode: i64, flags: u64) -> Press` (exact ⌘ only among ⌘⇧⌃⌥; X = 7, V = 9); `fn is_text_role(role: &str) -> bool`; `struct Cut { paths: Vec<PathBuf>, change: isize }`; `fn paste_is_ours(cut: Option<&Cut>, change_now: isize) -> bool`; `fn moved(paths: &[PathBuf], exists: impl Fn(&Path) -> bool) -> usize`; `fn cut_title(n, lang)`, `fn moved_title(n, folder, lang)` as fallbacks when locale text is missing (locale text with `{n}`/`{folder}` preferred; English plural picks `title`/`titleOne`).

- [ ] Tests for each, including ⌘⇧X and ⌘⌥V → Other, caps lock bit ignored, changed clipboard → not ours. Commit.

### Task 5: Potong file service

**Files:** Create `src-tauri/src/ax.rs` (focused element role, focused window, title, position/size get/set, trusted check reuse from `keyclean_tap`), `src-tauri/src/cut_service.rs`; modules `modules/cut-files/{manifest.json,icon.svg,locales/id.json,locales/en.json,package.test.ts}`, `modules/index.json`.

**Produces:** `cut_service::start(app)`, `module_changed(app, id)`, `retry(app)` (try the tap again: called from settings open and the `com.apple.accessibility.api` distributed notice), `MODULE_ID = "cut-files"`.

- Tap: session, head insert, default option, mask key down only; marked events (`kCGEventSourceUserData` = magic) pass; re-enable on timeout. Callback: classify → Other passes; frontmost not Finder passes; Paste passes unless `paste_is_ours`; else swallow and spawn the decision thread (AX role with 0.25 s messaging timeout) which posts the right key to `kCGSessionEventTap`.
- After ⌘C: sleep 0.3 s, read pasteboard on the main thread (`changeCount`, file URLs), store `Cut`, notice `notice.cut`.
- After ⌘⌥V: folder title, then the bounded check (0.5 s × 30), notice `notice.moved`.
- Manifest: `{"id":"cut-files","tool":"cut","permissions":["accessibility"],"capabilities":["cut","notify"],"notifications":[{"id":"moves","on":true,"sound":false}]}`.
- [ ] Package test (catalog order, tool, permissions), `cargo build`, commit.

### Task 6: Atur jendela service

**Files:** Create `src-tauri/src/win_service.rs`; modules `modules/window-keys/*`; `modules/index.json`.

**Produces:** `win_service::start(app)`, `module_changed(app, id)`, command `window_keys() -> WindowKeysDto { keys: Vec<WindowKeyDto { cell, label, state }> }` where state is `KeyState` (`ok|off|other|shortcut`), `MODULE_ID = "window-keys"`.

- Signature `ncwa`; handler on press: frontmost pid + screen frames read on main, AX work on a thread; untrusted → notice `notice.access` at most once per 60 s.
- [ ] Package test, `cargo build`, commit.

### Task 7: Hooks and commands

**Files:** `src-tauri/src/lib.rs`, `module_commands.rs`, `settings_window.rs`.

- set_enabled/uninstall/reinstall call `cut_service::module_changed` and `win_service::module_changed`; enabling a tool without Accessibility prompts (`keyclean_tap::trusted(true)`); settings open calls `cut_service::retry`. Register `win_service::window_keys`. Commit.

### Task 8: Settings UI

**Files:** `src/modules/types.ts` (`tool: boolean`, `isTool`), `src/pages/route.ts` (no tiles for tools), `src/settings/pages/catalog.ts` (filter `tool`, label), `src/settings/pages/modules.ts` (Alat group, tool pages), `src/settings/search.ts` (unchanged behaviour), bridges (`windowKeys`), `src/i18n/{id,en}.json`, `src/bridge-browser.ts` fixtures, CSS for the 3×3 grid; tests next to each.

- [ ] Tests: catalog chips `all, module, tool, widgets`, tool card kind "ALAT"; Modul page shows group "Alat"; notch tile list excludes tools; Potong file page shows ⌘X/⌘V rows and permission row; Atur jendela page shows nine caps and a taken key's hint. `npm test`, commit.

### Task 9: Verify and document

- [ ] `npm test`, `cargo test`, `npm run tauri build`; install test build, owner test, verification doc `docs/superpowers/verification/2026-11-04-alat-latar.md`; restore v0.1.2 in /Applications. Commit.
