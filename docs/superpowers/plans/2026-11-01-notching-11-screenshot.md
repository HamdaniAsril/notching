# Screenshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cmd+Shift+3 and Cmd+Shift+4 (click for a window, drag for an area) take a screenshot. The picture goes to the clipboard and opens in the notch with Salin, Simpan and Hapus. The Modul tile shows the last 15. Clicking a picture opens an editor window with pen, shapes, arrow, text, sensor, rounded corners and a background.

**Architecture:**
- **Rust core:**
  - `shot.rs` holds the pure state: history, names, the picks and the parsing.
  - `shot_service.rs` does the macOS work. It runs `/usr/sbin/screencapture`, writes the clipboard and the Desktop, and keeps a `screenshots/` folder in app data.
  - `shot_hotkey.rs` registers the keys with Carbon `RegisterEventHotKey`.
  - `shot_pick.rs` shows one see-through selection panel per screen for Cmd+Shift+4.
  - `editor_window.rs` opens one normal Tauri window, the editor.
- **Pictures reach the webviews** through a new `notchshot:` URI scheme, so they never travel as base64.
- **Pages:** the notch draws the result page and the list page itself (no iframe), like Titipan, because a drag out needs the panel's native view. The bundled `screenshot` module package gives the Modul tile, the icon, the permission row and the notice channels.

**Tech Stack:** Tauri 2, tauri-nspanel 2.1, objc2 0.6 / objc2-app-kit 0.3, hand-declared Carbon and CoreGraphics externs, `/usr/sbin/screencapture`; TypeScript, canvas 2D, vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-01-screenshot-design.md`

## Global Constraints

- Never close an nspanel panel (`NSRangeException`). Pick panels `pick-{index}` are created once and only ordered out, like `clean-{index}`. The editor is a normal `WebviewWindow` and may be closed.
- Module id `screenshot`. The name is "Screenshot" in both languages. Capability `"screenshot"`, tile action `{ "capability": "screenshot", "method": "open" }`, and a new permission `"screen-recording"`. Catalog order: after `shelf`.
- Keys: Cmd+Shift+3 (`kVK_ANSI_3` = 20) for the whole screen, and Cmd+Shift+4 (`kVK_ANSI_4` = 21) for window or area. They are registered only while the module is enabled.
- Notching never changes the Mac's own shortcut settings. It only reads them.
- History: at most **15** items, newest first. The 16th removes the oldest, together with its folder. Data goes in `<app_data_dir>/screenshots/`: `index.json` plus `<id>/original.png`, `thumb.png`, and optionally `edited.png` and `edits.json`.
- "The current image" means `edited.png` if it exists, otherwise `original.png`. Copy, Save, drag and the thumbnail always use the current image.
- Desktop file name: `Screenshot YYYY-MM-DD HH.MM.SS.png`, in both languages. A clash adds ` (2)`, ` (3)`, … before `.png`. An existing file is never overwritten.
- Capture plays the Mac shutter sound, so `screencapture` runs **without** `-x`. Window captures use `-o` (no shadow).
- Copy, exactly (id / en):
  - Result label: "Screenshot · Layar|Window|Area" / "Screenshot · Screen|Window|Area"
  - "Klik untuk edit" / "Click to edit"
  - "Tersalin ke clipboard" / "Copied to clipboard"
  - Buttons: "Salin" "Simpan" "Hapus" / "Copy" "Save" "Delete". After saving: "Tersimpan" / "Saved"
  - Take buttons: "Layar" "Window" "Area" / "Screen" "Window" "Area"
  - Hints: "⌘⇧3", "⌘⇧4 + klik", "⌘⇧4 + tarik" / "⌘⇧3", "⌘⇧4 + click", "⌘⇧4 + drag"
  - List head: "Screenshot · {n}". Empty list: "Tekan ⌘⇧3 atau ⌘⇧4 untuk screenshot pertama" / "Press ⌘⇧3 or ⌘⇧4 for your first screenshot"
  - Key taken by the Mac: "{keys} masih dipakai screenshot bawaan Mac" / "{keys} still taken by the Mac's own screenshots", with the button "Buka Pengaturan Sistem" / "Open System Settings"
  - Key taken by another app: "{key} dipakai app lain" / "{key} is taken by another app"
  - Permission: "Screenshot butuh izin Perekaman Layar" / "Screenshot needs Screen Recording access"
- Styles go through CSSOM only. Never use `style=""` markup, because the CSP forbids inline styles. Text goes in as text, never markup.
- `npm run build:modules` must run once before `cargo` in a fresh worktree.
- Commit only files you changed. Never push.

## Review Focus

1. **A key press while the Mac's shortcut is on, or with no permission, does nothing.** Notching must have warned: one notice per launch for taken keys, and a notice on every capture refused for lack of permission. No empty item is ever stored (Task 3 `refused_capture_stores_nothing`, Task 4 `conflict_notice_once_per_launch`).
2. **A capture fails or is cancelled.** Esc in the picker, a `screencapture` exit code other than 0, or a missing or empty file: nothing changes in the history or the clipboard, and no panel opens (Task 3 `failed_capture_changes_nothing`, Task 5 `esc_cancels`).
3. **A 16th screenshot, or a deletion, while the editor or the result page shows that item.** The editor closes without writing into a deleted folder, and the result page closes (Task 3 `evicted_item_closes_views`, Task 7 `commit_for_missing_item_is_refused`).
4. **The editor closes by the red button, by switching the module off, or by the app quitting.** The edits are committed first ("keep"), and nothing reaches the clipboard (Task 7 `close_request_commits_keep`).
5. **Several screens.** Cmd+Shift+3 takes the screen of the frontmost window, or the cursor's screen if there is none. The result opens on that screen's notch, or on the cursor's notch if that screen has none (Task 1 `pick_screen_*`, Task 3 `result_goes_to_capture_screen_or_cursor`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src-tauri/src/shot.rs` (create) | Pure: `History`, `ShotItem`, DTO, Desktop name, `png_size`, `pick_screen`, `capture_args`, `parse_key_conflicts` |
| `src-tauri/src/shot_service.rs` (create, macOS) | State, folder, index, capture, clipboard, thumbnails, Desktop, delete, permission, notices, commands, events, `notchshot:` responder |
| `src-tauri/src/shot_hotkey.rs` (create, macOS) | Carbon hotkeys, register/unregister, key state |
| `src-tauri/src/shot_pick.rs` (create, macOS) | Pick panels, window list with numbers, done/cancel commands |
| `src-tauri/src/editor_window.rs` (create, macOS) | One editor window: open/replace, close request, commands |
| `src-tauri/src/modules/manifest.rs`, `gate.rs`, `module_commands.rs` (modify) | `Capability::Screenshot`, `Permission::ScreenRecording`, `Call::ScreenshotOpen`, `module_gone` |
| `src-tauri/src/shelf_drag.rs` (modify) | `begin` serves shelf and screenshot drags |
| `src-tauri/src/notify.rs` (modify) | `WindowBox.number` |
| `src-tauri/src/settings_window.rs` (modify) | Dock icon kept while settings **or** editor exists; `screenRecording` in the DTO |
| `src-tauri/src/lib.rs`, `tauri.conf.json`, `capabilities/{pick,editor}.json` (modify/create) | Modules, commands, scheme, CSP `img-src … notchshot:` |
| `modules/screenshot/*` (create), `modules/index.json`, `modules/shelf/package.test.ts` (modify) | Package |
| `pick.html`, `src/pick/{geometry,main}.ts` (create) | The picker page |
| `src/shot/{result,list}.ts` (create) | The notch's result page and list page |
| `src/pages/route.ts`, `src/notch/page-view.ts`, `src/app.ts`, `src/bridge.ts`, `src/bridge-browser.ts`, `src/i18n/*` (modify) | Page kinds, events, calls, strings |
| `editor.html`, `src/editor/{model,render,view,main}.ts` (create) | The editor |
| `src/settings/pages/{info,modules}.ts` (modify) | Izin row, key notice in the module page |
| `vite.config.ts` (modify) | Inputs `pick`, `editor` |

---

### Task 1: Screenshot state (pure Rust)

**Files:**
- Create: `src-tauri/src/shot.rs` (add `mod shot;` in `lib.rs`, not macOS-gated)
- Test: in-file `#[cfg(test)]`

**Interfaces:**
- Produces:
  ```rust
  #[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)] #[serde(rename_all = "lowercase")]
  pub enum Kind { Screen, Window, Area }
  #[derive(Serialize, Deserialize, Clone, PartialEq, Debug)] #[serde(rename_all = "camelCase")]
  pub struct ShotItem { pub id: u64, pub taken_ms: i64, pub kind: Kind, pub width: u32, pub height: u32,
                        pub edited: bool, pub saved: bool, pub rev: u32 }
  pub const HISTORY_MAX: usize = 15;
  pub struct History { items: Vec<ShotItem>, next_id: u64 }      // items newest first
  impl History {
      pub fn from_index(json: &str) -> History;                    // bad JSON → empty
      pub fn to_index(&self) -> String;
      pub fn items(&self) -> &[ShotItem];
      pub fn get(&self, id: u64) -> Option<&ShotItem>;
      pub fn push(&mut self, taken_ms: i64, kind: Kind, w: u32, h: u32) -> (u64, Vec<u64>); // (new id, evicted ids)
      pub fn remove(&mut self, id: u64) -> bool;
      pub fn retain_existing(&mut self, exists: impl Fn(u64) -> bool) -> bool;
      pub fn mark_edited(&mut self, id: u64, w: u32, h: u32) -> bool;   // edited=true, saved=false, rev+=1
      pub fn mark_saved(&mut self, id: u64) -> bool;
  }
  pub fn desktop_name(local: chrono::NaiveDateTime, taken: impl Fn(&str) -> bool) -> String;
  pub fn png_size(bytes: &[u8]) -> Option<(u32, u32)>;              // from IHDR
  pub struct ScreenBox { pub frame: Rect /* CG global, top-left origin, points */ }
  pub fn pick_screen(screens: &[Rect], front_window: Option<Rect>, cursor: (f64, f64)) -> usize;
  pub enum Target { Screen { rect: Rect }, Window { number: u32 }, Area { rect: Rect } }
  pub fn capture_args(target: &Target, out: &Path) -> Vec<String>;
  #[derive(Serialize, Clone, Copy, PartialEq, Debug)] #[serde(rename_all = "lowercase")]
  pub enum KeyState { Ok, Mac, Other, Off }
  pub fn parse_key_conflicts(symbolic_hotkeys: &serde_json::Value) -> (bool, bool); // (cmd⇧3 taken, cmd⇧4 taken)
  ```
  `Rect` is the existing `geometry::Rect`. If it does not fit, define `Rect { x, y, w, h: f64 }` here.

- [ ] **Step 1: Write the failing tests:**
  - `push_puts_newest_first_and_evicts_the_16th`: 16 pushes keep 15 items, the first id is evicted, and `items()[0]` is the newest.
  - `index_round_trips_and_keeps_next_id`: after removing the newest item, ids are not reused after `from_index`.
  - `bad_index_is_empty`.
  - `retain_existing_drops_missing_folders`.
  - `mark_edited_clears_saved_and_bumps_rev`.
  - `desktop_name_formats_and_numbers_clashes`: 2026-11-01 14:02:05 gives `"Screenshot 2026-11-01 14.02.05.png"`. When that name is taken, the result is `"… (2).png"`.
  - `png_size_reads_ihdr`, using a 1×1 PNG literal. Non-PNG bytes give `None`.
  - `pick_screen_prefers_front_window_centre`: two screens, the window centre on screen 1 gives `1`.
  - `pick_screen_falls_back_to_cursor`: `None` plus the cursor on screen 1 gives `1`.
  - `capture_args_for_each_target`:
    - Screen gives `["-R","0,0,1470,956", out]`.
    - Window 42 gives `["-o","-l","42", out]`.
    - Area gives `-R` with values rounded to whole points.
    - No `-x` anywhere.
  - `parse_key_conflicts_reads_ids_28_and_30`:
    - The defaults `{"AppleSymbolicHotKeys":{"28":{"enabled":true,"value":{"parameters":[51,20,1179648]}},"30":{"enabled":true,"value":{"parameters":[52,21,1179648]}}}}` give `(true,true)`.
    - `enabled:false` gives false.
    - A missing entry counts as taken (the default is on).
    - Entry 30 rebound to another key code gives false.
- [ ] **Step 2: Run them.** Run `cd src-tauri && cargo test shot::`. Expected: FAIL (does not compile).
- [ ] **Step 3: Implement** `shot.rs`. 1179648 is Cmd+Shift (`0x120000`). Compare `parameters[1]` (key code) and `parameters[2]` (modifiers).
- [ ] **Step 4: Run them.** Run `cargo test`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: `feat(shot): screenshot history, names and picks`.

### Task 2: The module package, capability and permission

**Files:**
- Modify: `src-tauri/src/modules/manifest.rs`, `gate.rs`, `module_commands.rs` (an `Ok(Null)` arm like shelf's), `modules/index.json`, `modules/shelf/package.test.ts`, `src/bridge-browser.ts` (a `screenshot` branch that returns null), `src/pages/route.ts` (`noticeTarget`)
- Create: `modules/screenshot/{manifest.json,icon.svg,locales/id.json,locales/en.json,package.test.ts}`
- Test: `manifest.rs` / `gate.rs` tests, the package tests, `src/pages/route.test.ts`

**Interfaces:**
- Produces: `Capability::Screenshot` ("screenshot"), `Permission::ScreenRecording` (serde `"screen-recording"`), `Call::ScreenshotOpen`, and `SHOT_KEY = 'screenshot'` exported from `route.ts`.
- Manifest:
  ```json
  { "id": "screenshot", "version": "1.0.0", "icon": "icon.svg",
    "permissions": ["screen-recording"], "capabilities": ["screenshot", "notify"],
    "notifications": [{ "id": "keys", "on": true, "sound": false }, { "id": "access", "on": true, "sound": false }],
    "action": { "capability": "screenshot", "method": "open" } }
  ```
- Locales:
  - `name` and `shortName` are "Screenshot". The description is "Layar, window, atau area, langsung ke clipboard" / "Screen, window or area, straight to the clipboard".
  - `channels.keys` is "Tombol screenshot" / "Screenshot keys". `channels.access` is "Izin" / "Access".
  - `notice.keys.title`: "{keys} masih dipakai Mac" / "{keys} still taken by the Mac". `notice.keys.detail`: "Buka Screenshot untuk caranya" / "Open Screenshot to see how".
  - `notice.access.title`: "Screenshot butuh izin Perekaman Layar" / "Screenshot needs Screen Recording access". `notice.access.detail`: "Buka Screenshot untuk izinnya" / "Open Screenshot to allow it".
- The icon is a viewfinder: four corner brackets and a centre dot, `viewBox="0 0 24 24"`, stroked.

- [ ] **Step 1: Write the failing tests:**
  - `gate.rs`: `screenshot_open_is_allowed_when_declared`.
  - `manifest.rs`: `screen_recording_permission_parses`, plus the existing `repo_modules_are_valid`.
  - `modules/screenshot/package.test.ts`, mirroring the shelf test:
    - the icon has the right viewBox and stroke;
    - the catalog places screenshot last, directly after shelf;
    - `entry` and `card` are null;
    - the action matches;
    - `permissions` equals `['screen-recording']`;
    - the names match.
  - In `modules/shelf/package.test.ts`, change "shelf is last" to "shelf comes directly after mirror".
  - `route.test.ts`: `screenshot notices open the screenshot list`. `noticeTarget` gives `{ kind: 'shot', mode: 'list' }` for module `screenshot` (the type comes from Task 6, so declare the kind here).
- [ ] **Step 2: Run them.** Run `npx vitest run modules src/pages && (cd src-tauri && cargo test modules::)`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the enum variants, the gate arm `(Capability::Screenshot, "open") => Call::ScreenshotOpen`, the package, the catalog entry, the browser branch, and the `noticeTarget` case.
- [ ] **Step 4: Run them.** Run `npm test && (cd src-tauri && cargo test)`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: `feat(shot): bundled Screenshot module package`.

### Task 3: Screenshot service (macOS)

**Files:**
- Create: `src-tauri/src/shot_service.rs`
- Modify: `src-tauri/src/lib.rs` (manage the state, register the `notchshot` scheme and the commands, load in setup), `tauri.conf.json` (CSP `img-src 'self' notchmod: notchshot: data:`), `module_commands.rs` (`module_gone`)
- Test: in-file tests for the pure helpers. The macOS calls are checked on the Mac.

**Interfaces:**
- Consumes: Task 1.
- Produces:
  ```rust
  pub const SCHEME: &str = "notchshot";        // notchshot://localhost/<id>/{current,thumb}.png?v=<rev>
  pub struct ShotState(pub Mutex<History>);
  #[derive(Serialize)] #[serde(rename_all = "camelCase")]
  pub struct ShotDto { pub id: u64, pub kind: Kind, pub taken_ms: i64, pub width: u32, pub height: u32,
                       pub saved: bool, pub image: String, pub thumb: String }   // notchshot URLs with ?v=rev
  pub fn take(app: &AppHandle, target: Target, kind: Kind, screen: usize);      // spawns; never blocks main
  pub fn current_path(dir: &Path, item: &ShotItem) -> PathBuf;
  pub fn module_gone(app: &AppHandle, id: &str);
  pub fn respond(dir: &Path, path: &str) -> tauri::http::Response<Vec<u8>>;    // adds Access-Control-Allow-Origin: *
  #[tauri::command] fn shot_list(..) -> Vec<ShotDto>;
  #[tauri::command] fn shot_take_screen(window: WebviewWindow, ..) -> ();      // the panel's own screen
  #[tauri::command] fn shot_copy(id: u64) -> Result<(), String>;
  #[tauri::command] fn shot_save(id: u64) -> Result<String, String>;           // Desktop path
  #[tauri::command] fn shot_delete(id: u64) -> Result<(), String>;
  #[tauri::command] fn shot_permission() -> bool;
  #[tauri::command] fn open_screen_recording_settings();
  ```
- Events:
  - `notching://shot` goes to one overlay, with `{ phase: "taken", id }` or `{ phase: "gone", id }`.
  - `notching://shots` goes to every overlay and the editor, with `ShotDto[]` (the full list on any change).

- [ ] **Step 1: Write the failing tests** for the pure parts:
  - `respond_serves_current_and_thumb_only`: `../` is refused with 404, and so are unknown ids and other names.
  - `result_goes_to_capture_screen_or_cursor`: `fn result_screen(capture: usize, has_notch: &[bool], cursor: usize) -> usize`.
  - `failed_capture_changes_nothing` and `refused_capture_stores_nothing`: `fn accept_capture(exit_ok: bool, bytes: Option<&[u8]>) -> Option<(u32,u32)>` gives `None` for a non-zero exit, a missing file, an empty file or non-PNG data.
  - `evicted_item_closes_views`: the list of evicted ids produces one `gone` emit per id. Test it through a pure `fn gone_events(evicted: &[u64]) -> Vec<u64>`, or fold it into the push test if that is simpler.
- [ ] **Step 2: Run them.** Run `cargo test shot_service`. Expected: FAIL.
- [ ] **Step 3: Implement** `take`, on a background thread:
  1. Check permission with `CGPreflightScreenCaptureAccess`. If it is missing, call `CGRequestScreenCaptureAccess`, post the `access` notice through `notify::post` with `module_text`, and stop. Both externs are declared by hand.
  2. Run `screencapture` with `capture_args` into `<dir>/<tmp>.png`.
  3. Check the result with `accept_capture`.
  4. Push into the history. Move the file to `<id>/original.png`. Delete the evicted folders.
  5. Write a thumbnail 320 px wide.
  6. Write the PNG to `NSPasteboard.generalPasteboard` (clear, then `setData_forType` with `NSPasteboardTypePNG`).
  7. Save `index.json` atomically.
  8. Emit `gone` for the evicted ids, then `taken` to the overlay label for `result_screen`, then `shots` to everyone.

  The `Screen` target uses the screen's CG frame. `shot_save` uses `app.path().desktop_dir()` and `desktop_name` with local time, then `mark_saved`. `shot_delete` removes the folder and emits `gone` and `shots`. `module_gone("screenshot")` starts as a stub. Task 4 adds unregistering the hotkeys, and Task 7 adds closing the editor. `uninstall_module` also deletes the folder. At startup the folder is created, `from_index` loads the index, and `retain_existing` checks that each folder's `original.png` exists.
- [ ] **Step 4: Run them.** Run `npm run build:modules && cd src-tauri && cargo test && cargo build`. Expected: all pass, and it builds.
- [ ] **Step 5: Commit.** Message: `feat(shot): capture service, history folder and notchshot images`.

### Task 4: Keys

**Files:**
- Create: `src-tauri/src/shot_hotkey.rs`
- Modify: `shot_service.rs` (start: register plus the once-per-launch notice), `module_commands.rs` (`set_module_enabled` re-registers when the module comes back on), `lib.rs`
- Test: in-file tests

**Interfaces:**
- Produces:
  ```rust
  pub enum Key { Screen /* ⌘⇧3 */, Pick /* ⌘⇧4 */ }
  pub fn register(app: &AppHandle) -> [KeyState; 2];   // Ok, or Other when RegisterEventHotKey fails
  pub fn unregister();
  #[derive(Serialize)] #[serde(rename_all = "camelCase")]
  pub struct KeysDto { pub screen: KeyState, pub pick: KeyState }   // Mac wins over Ok when parse_key_conflicts says taken; Off when module disabled
  #[tauri::command] fn shot_keys(..) -> KeysDto;
  #[tauri::command] fn open_keyboard_shortcuts();      // System Settings → Keyboard → Keyboard Shortcuts
  pub fn conflict_notice_due(already_sent: bool, keys: &KeysDto) -> Option<String>; // "⌘⇧3", "⌘⇧4" or "⌘⇧3 dan ⌘⇧4"
  ```
  Read the Mac settings by running `defaults export com.apple.symbolichotkeys -`, piping that through `plutil -convert json -o - -`, and passing the result to `parse_key_conflicts`. `Key::Screen` → `take(Target::Screen{..}, Kind::Screen, pick_screen(..))`, where the front window comes from `NSWorkspace.frontmostApplication` (its pid) and the first layer-0 window of that pid in `notify::window_list()`. `Key::Pick` → `shot_pick::show(app, PickMode::Both)`. The Carbon handler runs on the main thread, so the capture must be spawned off it.

- [ ] **Step 1: Write the failing tests:**
  - `conflict_notice_once_per_launch`: `already_sent=true` gives `None`. Both keys `Mac` give `Some("⌘⇧3 dan ⌘⇧4")`. Only `Pick` `Other` gives `Some("⌘⇧4")`. All `Ok` gives `None`.
  - `mac_conflict_wins_over_registered`: a key registered `Ok` that the parse says is taken shows `Mac`.
- [ ] **Step 2: Run them.** Run `cargo test shot_hotkey`. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - Declare the Carbon externs: `RegisterEventHotKey`, `UnregisterEventHotKey`, `InstallEventHandler`, `GetApplicationEventTarget`, `GetEventParameter`, kind `kEventHotKeyPressed`, and `cmdKey | shiftKey` = `0x0100 | 0x0200`.
  - Register in setup when the module is enabled.
  - The notice uses the `keys` channel, with `notice.keys.title` filled in with the keys string.
- [ ] **Step 4: Run them.** Run `cargo test && cargo build`. Expected: all pass, and it builds.
- [ ] **Step 5: Commit.** Message: `feat(shot): Cmd+Shift+3 and 4, and a notice when the Mac still has them`.

### Task 5: The picker for window or area

**Files:**
- Create: `src-tauri/src/shot_pick.rs`, `pick.html`, `src/pick/geometry.ts`, `src/pick/main.ts`, `src-tauri/capabilities/pick.json` (windows `pick-*`, `core:default`)
- Modify: `vite.config.ts` (input `pick`), `notify.rs` (`WindowBox.number: u32` from `kCGWindowNumber`), `lib.rs`
- Test: `src/pick/geometry.test.ts`

**Interfaces:**
- Produces in Rust:
  ```rust
  #[derive(Serialize, Deserialize, Clone, Copy)] #[serde(rename_all = "lowercase")]
  pub enum PickMode { Both, Window, Area }
  pub fn show(app: &AppHandle, mode: PickMode);
  pub fn hide(app: &AppHandle);
  #[tauri::command] fn shot_pick(app, mode: PickMode);          // from the list page's Window/Area buttons
  #[tauri::command] fn shot_pick_done(app, window: WebviewWindow, choice: PickChoice);
  #[tauri::command] fn shot_pick_cancel(app);
  #[derive(Deserialize)] #[serde(tag = "kind", rename_all = "lowercase")]
  pub enum PickChoice { Window { number: u32 }, Area { x: f64, y: f64, w: f64, h: f64 } }  // panel-local points
  ```
  The `notching://pick` event goes to each pick panel with `{ mode, windows: [{ number, x, y, w, h }] }`. The windows are layer 0, not Notching's own, front to back, in that panel's local points.
- Produces in TS, in `src/pick/geometry.ts`:
  ```ts
  export const DRAG_SLOP = 4;
  export interface Box { x: number; y: number; w: number; h: number }
  export function windowAt(windows: (Box & { number: number })[], x: number, y: number): number | null;
  export function dragBox(ax: number, ay: number, bx: number, by: number): Box;
  export function isDrag(ax: number, ay: number, bx: number, by: number): boolean;   // > DRAG_SLOP
  export function finish(mode: 'both'|'window'|'area', down: {x,y}, up: {x,y}, windows): PickChoice | null;
  ```

- [ ] **Step 1: Write the failing tests** in `geometry.test.ts`:
  - `windowAt picks the front-most window under the point`.
  - `dragBox normalizes any direction`.
  - `a click in both mode picks the window`.
  - `a drag in both mode picks the area`.
  - `window mode ignores drags`: the result is null, so the picker stays open.
  - `area mode ignores clicks`.
  - `a click on no window returns null`.
  - `esc_cancels`: in the main.ts wiring, Escape calls `shot_pick_cancel`. Test it with a jsdom keydown on a fake invoke.
- [ ] **Step 2: Run them.** Run `npx vitest run src/pick`. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - **The panels:**
    - Model them on `keyclean_dim.rs`: one `pick-{index}` per screen, `PanelLevel::Custom(27)`, `can_become_key_window: true`, nonactivating, joining all spaces with full-screen auxiliary.
    - Each panel's frame is the screen frame. Panels are only ordered out.
    - `show` emits the windows and makes the panel under the cursor key.
  - **The page:**
    - A 15% black dim, with the window under the cursor cut out of it and outlined in white.
    - A white box with its size in pixels while dragging (points × `devicePixelRatio`).
    - `cursor: crosshair`.
  - **When a choice is made:** `hide` all panels, wait `PICK_SETTLE_MS = 120` so the panels leave the screen, convert to CG global coordinates, then call `shot_service::take` with `Kind::Window` or `Kind::Area`.
  - **While the picker is up,** another Cmd+Shift+4 is ignored.
- [ ] **Step 4: Run them.** Run `npx tsc --noEmit && npm test && (cd src-tauri && cargo build)`. Expected: all pass, and it builds.
- [ ] **Step 5: Commit.** Message: `feat(shot): the window-or-area picker`.

### Task 6: Result page and list page in the notch

**Files:**
- Create: `src/shot/result.ts`, `src/shot/list.ts`
- Modify: `src/pages/route.ts`, `src/notch/page-view.ts`, `src/app.ts`, `src/bridge.ts`, `src/bridge-browser.ts`, `src/i18n/{index.ts,id.json,en.json}`, `src-tauri/src/shelf_drag.rs` (+ `shot_service.rs` `shot_start_drag`)
- Test: `src/shot/result.test.ts`, `src/shot/list.test.ts`, `src/pages/route.test.ts`, `src/app.test.ts`, `shelf_drag.rs` tests

**Interfaces:**
- Consumes: Task 3 events and commands, and Task 5 `shot_pick`.
- Produces:
  - `PageView` gains `{ kind: 'shot'; mode: 'result'; id: number } | { kind: 'shot'; mode: 'list' }`.
  - `SHOT = { resultWidth: 420, resultHeight: 172, listWidth: 560, columns: 5, gap: 8, tileH: 62, label: 14, head: 22, buttons: 40, emptyH: 72 }`.
  - `viewSize`: the result is 420 × 172. The list height is `head + rows × (tileH + label) + (rows−1) × gap + 12 + buttons`, with `rows = max(1, ceil(n/5))` and at most 3, or `emptyH` instead of the rows when the list is empty.
  - `Bridge` gains:
    ```ts
    shotList(): Promise<Shot[]>; shotCopy(id: number): Promise<void>; shotSave(id: number): Promise<string>;
    shotDelete(id: number): Promise<void>; shotTakeScreen(): Promise<void>; shotPick(mode: 'window'|'area'): Promise<void>;
    shotStartDrag(id: number): Promise<void>; shotKeys(): Promise<{ screen: KeyState; pick: KeyState }>;
    shotPermission(): Promise<boolean>; openKeyboardShortcuts(): Promise<void>; openScreenRecordingSettings(): Promise<void>;
    openEditor(id: number): Promise<void>;           // Task 7 implements the command; stub until then
    onShot(cb: (e: { phase: 'taken' | 'gone'; id: number }) => void): Unlisten;
    onShots(cb: (list: Shot[]) => void): Unlisten;
    onShotDrag(cb: (e: { phase: 'left' | 'end' }) => void): Unlisten;
    ```
    `interface Shot { id; kind: 'screen'|'window'|'area'; takenMs; width; height; saved; image; thumb }`.
  - `mountShotResult(el, deps)` and `mountShotList(el, deps)`. Their deps are the bridge calls above plus `close()`, `lang` and `now()`.
  - `shelf_drag::begin(app, label, files: Vec<(PathBuf, Option<Vec<u8>>)>, owner: DragOwner)` with `enum DragOwner { Shelf(Vec<u64>), Shot }`. Only `Shelf` removes items on success. A `Shot` drag emits `notching://shot-drag`. `shot_start_drag(id)` first copies the current image to `<app_cache_dir>/shot-drag/<desktop_name>.png` and drags that file.

- [ ] **Step 1: Write the failing tests:**
  - `result.test.ts`:
    - it shows the label for each kind, "Tersalin ke clipboard" and `width × height`;
    - **Salin** calls `shotCopy` then `close`;
    - **Cmd+C** on the document does the same;
    - **Simpan** calls `shotSave`, the button reads "Tersimpan", and the panel stays open;
    - a `saved` item starts as "Tersimpan";
    - **Hapus** calls `shotDelete` then `close`;
    - a click on the image calls `openEditor` then `close`;
    - a mousedown on the image plus a move past 4 px calls `shotStartDrag`;
    - a `gone` event for the shown id calls `close`.
  - `list.test.ts`:
    - 15 shots draw 15 tiles in 5 columns, newest first, with times ("14.02", "Kemarin", "30 Okt");
    - an empty list shows the empty line;
    - **Layar** calls `close` then `shotTakeScreen`, only after the panel reports closed;
    - **Window** and **Area** call `shotPick('window'|'area')`;
    - the hover buttons call copy, save and delete;
    - a tile click opens the editor;
    - a `keys` value with `mac` shows the notice and the button calls `openKeyboardShortcuts`;
    - `other` shows the other-app line without a button;
    - `shotPermission` false shows the permission line and the button calls `openScreenRecordingSettings`.
  - `route.test.ts`: the two `viewSize` cases, with 0, 6 and 15 items.
  - `app.test.ts`:
    - `taken` while closed opens the panel on the result page;
    - `taken` while open switches the page;
    - the Screenshot tile opens the list without a core call.
  - `shelf_drag.rs`: `shot_drags_never_remove_shelf_items`, through the pure `keeps_items`-style helper.
- [ ] **Step 2: Run them.** Run `npx vitest run src/shot src/pages src/app.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Follow the mockups `notch-hasil.html` and `halaman-screenshot.html` v2:
  - Images use the DTO URLs.
  - Time labels: today shows "HH.MM" (id) or "HH:MM" (en), yesterday shows "Kemarin" / "Yesterday", anything older shows "30 Okt" / "Oct 30".
  - The list page has the "‹ Modul" back bar.
  - The result page has none.
  - Neither page adds a pill icon.
  - `onShot` `taken` → `go({kind:'shot',mode:'result',id})`, plus `controller.click()` if the panel is closed.
  - `onShotDrag` `left` → `controller.escape()`.
- [ ] **Step 4: Run them.** Run `npx tsc --noEmit && npm test && (cd src-tauri && cargo test)`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: `feat(shot): result and list pages in the notch`.

### Task 7: Editor window shell

**Files:**
- Create: `src-tauri/src/editor_window.rs`, `editor.html`, `src/editor/main.ts`, `src/editor/view.ts` (shell only), `src-tauri/capabilities/editor.json` (window `editor`, `core:default`)
- Modify: `vite.config.ts` (input `editor`), `settings_window.rs` (the Dock icon goes only when neither `settings` nor `editor` exists), `lib.rs`, `shot_service.rs`
- Test: `editor_window.rs` tests, `src/editor/view.test.ts`

**Interfaces:**
- Produces in Rust:
  ```rust
  pub const EDITOR_LABEL: &str = "editor";
  #[tauri::command] async fn open_editor(app, window: WebviewWindow, id: u64) -> Result<(), String>; // create on the caller's screen or replace
  #[derive(Serialize)] #[serde(rename_all = "camelCase")]
  pub struct EditorDoc { pub id: u64, pub width: u32, pub height: u32, pub original: String /* notchshot URL */, pub edits: Option<String>, pub wallpaper: Option<String> }
  #[tauri::command] fn editor_doc(..) -> Option<EditorDoc>;
  #[tauri::command] fn editor_commit(app, id: u64, edits: String, png: Option<Vec<u8>> /* via ipc::Request raw body + header */, action: String /* copy|save|keep */) -> Result<Option<String>, String>;
  #[tauri::command] fn editor_close(app);     // after the page committed
  pub fn request_close(app: &AppHandle);      // module gone, quit: emit notching://editor-close
  pub fn fit_size(image: (u32, u32), scale: f64, visible: (f64, f64)) -> (f64, f64);  // ≤ 80% of visible, min 640×480, plus chrome 64 top + 56 bottom + 64 left
  ```
  Rules:
  - The page commits the PNG and the edits. A `png` of `None` means the image is unedited (no shapes and no background), so `edited.png` is removed and the item goes back to the original.
  - `copy` writes the clipboard. The page then closes the window.
  - Every commit with a `png` writes `edited.png`, makes a new `thumb.png`, calls `mark_edited` (which bumps `rev`), saves the index, and emits `shots`.
  - `save` writes to the Desktop and returns the path.
  - `CloseRequested` is prevented and emits `notching://editor-close`. The page commits `keep`, then calls `editor_close`, which destroys the window.
  - `editor_commit` for an id no longer in the history returns `Err("gone")` and writes nothing.
  - The wallpaper comes from `NSWorkspace.desktopImageURLForScreen` and is served as `notchshot://localhost/wallpaper` when the path is a regular image file (png, jpg, jpeg or heic). Otherwise it is `None`.
- Produces in TS: `mountEditor(root, deps: { bridge: EditorBridge, lang })`, with `interface EditorBridge { doc(): Promise<EditorDoc|null>; commit(id, edits: string, png: Blob|null, action): Promise<string|null>; close(): Promise<void>; onClose(cb): Unlisten; onShots(cb): Unlisten }`.

- [ ] **Step 1: Write the failing tests:**
  - Rust:
    - `fit_size_caps_at_80_percent_and_keeps_aspect`;
    - `fit_size_has_a_minimum`;
    - `commit_for_missing_item_is_refused`, through a pure `fn commit_target(history, id) -> Result<..>`;
    - `dock_icon_goes_only_when_no_window_left`, through a pure `fn keep_regular(settings_open: bool, editor_open: bool) -> bool`.
  - `view.test.ts`:
    - the shell shows the size label, Salin and Simpan;
    - **Salin** commits `copy`, then closes;
    - **Cmd+C** does the same, but not while a text box is focused;
    - **Simpan** commits `save` and stays open;
    - `close_request_commits_keep`: `onClose` commits `keep`, then calls `close`;
    - a `shots` list without the doc's id calls `close` without committing.
- [ ] **Step 2: Run them.** Run `npx vitest run src/editor && (cd src-tauri && cargo test editor_window)`. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - Model the window on `open_settings`: the `OPENING` mutex, `Regular` while open, `visible(false)` until load, and black `#0b0b0c` without the frosted effect.
  - The page title is "Screenshot · {w} × {h}".
  - Undo and redo are placeholders until Task 8.
- [ ] **Step 4: Run them.** Run `npx tsc --noEmit && npm test && (cd src-tauri && cargo test && cargo build)`. Expected: all pass, and it builds.
- [ ] **Step 5: Commit.** Message: `feat(shot): the editor window`.

### Task 8: Editor tools

**Files:**
- Create: `src/editor/model.ts`
- Modify: `src/editor/view.ts`, `src/editor/render.ts` (shapes only, created here)
- Test: `src/editor/model.test.ts`, `src/editor/view.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Tool = 'select' | 'pen' | 'arrow' | 'rect' | 'ellipse' | 'line' | 'text' | 'sensor';
  export const TOOL_KEYS: Record<string, Tool> = { v:'select', p:'pen', a:'arrow', r:'rect', o:'ellipse', l:'line', t:'text', s:'sensor' };
  export const COLORS = ['#E8262E','#F5B700','#27AE60','#2F80ED','#111111','#FFFFFF'];
  export const WIDTHS = [4, 8, 14];   export const TEXT_SIZES = [24, 40, 64];   // × scale
  export function scaleFor(w: number, h: number): number;   // max(1, max(w,h) / 1500)
  export type Shape =
    | { id: number; type: 'pen'; color: string; width: number; points: [number, number][] }
    | { id: number; type: 'arrow'|'rect'|'ellipse'|'line'; color: string; width: number; x1: number; y1: number; x2: number; y2: number }
    | { id: number; type: 'text'; color: string; size: number; x: number; y: number; text: string }
    | { id: number; type: 'sensor'; x1: number; y1: number; x2: number; y2: number };
  export interface Doc { v: 1; shapes: Shape[]; style: Style }      // Style defined in Task 9; start with { corner: 0, padding: 64, background: { kind: 'none' } }
  export class History { constructor(doc: Doc); get doc(): Doc; apply(next: Doc): void; undo(): boolean; redo(): boolean; canUndo; canRedo }
  export function hitTest(shapes: Shape[], x: number, y: number, slop: number): number | null; // top-most id
  export function move(shape: Shape, dx: number, dy: number): Shape;
  export function resize(shape: Shape, handle: 'nw'|'ne'|'sw'|'se', x: number, y: number): Shape;
  export function constrain(type, x1, y1, x2, y2): [number, number];   // Shift: 45° lines, equal-sided rect/ellipse
  export function serialize(doc: Doc): string;  export function parse(s: string | null): Doc;   // bad → empty doc
  export function isBlank(doc: Doc): boolean;   // no shapes and background none and corner 0
  ```
  Coordinates are image pixels. In `render.ts`, `drawShapes(ctx, shapes, image)` draws a pen as a round-capped polyline, an arrow head of length `max(16, width × 4)` at 28°, text in Space Grotesk 600, and a sensor as a pixelate of the image region with block `max(8, 12 × scale)`, sampled from the original image.

- [ ] **Step 1: Write the failing tests:**
  - `model.test.ts`:
    - `undo and redo walk the history and a new apply clears redo`;
    - `hitTest finds the top-most shape and respects slop`;
    - `move and resize keep the type and the colour`;
    - `constrain snaps to 45 degrees and squares`;
    - `serialize round-trips and parse of junk is an empty doc`;
    - `scaleFor is 1 at 1500 px and 2 at 3000 px`;
    - `isBlank`.
  - `view.test.ts`:
    - the 8 tools are in the left bar;
    - the keys v, p, a, r, o, l, t, s pick tools;
    - Delete removes the selected shape;
    - Cmd+Z and Cmd+Shift+Z undo and redo;
    - the 6 colours and 3 widths are in the bottom bar;
    - the text tool places a text box and Enter or a click outside commits it.
- [ ] **Step 2: Run them.** Run `npx vitest run src/editor`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use the editor mockup's layout. The canvas shows the image fitted, using CSS scale. Pointer events map to image pixels.
- [ ] **Step 4: Run them.** Run `npx tsc --noEmit && npm test`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: `feat(shot): pen, shapes, arrow, text and sensor in the editor`.

### Task 9: Corners, background and export

**Files:**
- Modify: `src/editor/render.ts`, `src/editor/view.ts`, `src/editor/model.ts` (`Style`)
- Test: `src/editor/render.test.ts`, `src/editor/view.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Background =
    | { kind: 'none' }
    | { kind: 'solid'; color: string }
    | { kind: 'gradient'; from: string; to: string }          // 135°
    | { kind: 'image'; src: string; from: 'wallpaper' | 'file' };  // JPEG data URL, longest side ≤ 2 × output
  export interface Style { corner: number; padding: number; background: Background }  // corner 0–40, padding 16–160, × scale
  export const SOLIDS = ['#FFFFFF','#111111','#E8262E','#F5B700','#2F80ED'];
  export const GRADIENTS: [string, string][] = [['#FF7A18','#7A1FA2'],['#43CEA2','#185A9D'],['#F7971E','#FFD200'],['#8E9EAB','#EEF2F3'],['#232526','#414345']];
  export function outputSize(w: number, h: number, style: Style, scale: number): { w: number; h: number; ox: number; oy: number };
  export async function exportPng(image: HTMLImageElement, doc: Doc, scale: number): Promise<Blob | null>;  // null when isBlank
  ```
  Rules:
  - With a background, the output is padded by `padding × scale` on every side and the image gets a soft shadow (`0 14px 30px rgba(0,0,0,.35)` × scale).
  - Without one, the output is the image size, and rounded corners leave transparent pixels.
  - An image background is drawn to cover, with no squashing.
  - The colour pickers are `<input type="color">`, which opens the macOS colour panel and its wheel. The custom gradient uses two of them.
  - "Pilih file…" is `<input type="file" accept="image/*">`, read through `FileReader`.
  - "Wallpaper Mac" shows only when `doc.wallpaper` is set.

- [ ] **Step 1: Write the failing tests:**
  - `render.test.ts`:
    - `outputSize adds padding only with a background`;
    - `outputSize scales padding`;
    - `exportPng returns null for a blank doc`, using a stubbed canvas.
  - `view.test.ts`:
    - the Background popover lists 5 solids plus the custom picker, 5 gradients plus the custom pair, Pilih file…, and Jarak;
    - Wallpaper Mac is hidden without `wallpaper`;
    - choosing a background, corner or padding goes through `History.apply`, so undo reverts it;
    - the Sudut slider is in the bottom bar.
- [ ] **Step 2: Run them.** Run `npx vitest run src/editor`. Expected: FAIL.
- [ ] **Step 3: Implement.** `exportPng` → commit with `png` = the blob. `parse` keeps old docs without a style working by giving them the defaults.
- [ ] **Step 4: Run them.** Run `npx tsc --noEmit && npm test`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: `feat(shot): rounded corners and backgrounds in the editor`.

### Task 10: Settings — Izin row and key notice

**Files:**
- Modify: `src-tauri/src/settings_window.rs` (`SettingsDto.screen_recording: bool` from `CGPreflightScreenCaptureAccess`), `src/settings/types.ts`, `src/settings/pages/info.ts` (rows for modules whose permissions include `'screen-recording'`, polled like accessibility, with a button calling `open_screen_recording_settings`), `src/settings/pages/modules.ts` (on the Screenshot module page, the key notice from `shot_keys` and the button calling `open_keyboard_shortcuts`), `src/settings/bridge-*.ts`, `src/i18n/*`
- Test: `src/settings/pages/info.test.ts`, `src/settings/pages/modules.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `info.test.ts`: `screen recording row shows for screenshot and its state`.
  - `modules.test.ts`:
    - `screenshot page shows the Mac key notice with the System Settings button`;
    - `no status switch for screenshot`, because the manifest has no `status` capability (check that the existing logic already hides it).
- [ ] **Step 2: Run them.** Run `npx vitest run src/settings`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Run `npx tsc --noEmit && npm test && (cd src-tauri && cargo test)`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: `feat(shot): Screen Recording on the Izin page and the key notice in Settings`.

---

## After the tasks

- Run a whole-branch review, then fix what it finds.
- Build a release (`npm run tauri build`). Check the Mac in a verification note, `docs/superpowers/verification/2026-11-01-notching-11-screenshot.md`, matching every owner report against files:
  - `screenshots/index.json` and its folders;
  - the Desktop;
  - `osascript -e 'clipboard info'` for the clipboard;
  - `defaults export com.apple.symbolichotkeys` for the keys;
  - the `-R` pixel size against points × backing scale.
- Test builds need Screen Recording granted again after every rebuild.
