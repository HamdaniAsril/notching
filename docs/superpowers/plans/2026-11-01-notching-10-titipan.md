# Titipan (Shelf) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Files dragged to the notch are kept in a shelf ("Titipan"). Dragging them back out copies them anywhere. Every module's status shows beside the notch at once.

**Architecture:** The shelf lives in the Rust core (`shelf.rs` holds pure state, and `shelf_service.rs` does the macOS work). Every overlay shows the same shelf. The shelf page is drawn by the notch document itself, not by a module iframe, because drags need the top window's native view. A bundled `shelf` module package gives it a Modul tile, an icon, a status and the switches in Settings.

Drags in are caught natively:
- a sensor or the overlay notices the drag;
- a "catcher" panel covers the open panel and receives file URLs and file promises.

Drags out are a native `NSDraggingSession` that offers only Copy.

**Tech Stack:** Tauri 2.12, tauri-nspanel 2.1, objc2 0.6 / objc2-app-kit 0.3, objc2-quick-look-thumbnailing 0.3, base64; TypeScript + vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-01-titipan-design.md` (and §8 of `2026-10-30-halaman-widget-design.md`, now amended).

## Global Constraints

- Never close an nspanel panel (`NSRangeException`). Catcher panels are created once per overlay and only ordered out, like sensors.
- The shelf never moves, renames or deletes an original file. Drag-out offers `NSDragOperation::Copy` only.
- Nothing is written to disk except the files received into the Titipan cache folder, `<app_cache_dir>/titipan/`. That folder is emptied when the app starts and when it exits.
- Module id `shelf`. Names: "Titipan" (id) and "Shelf" (en). Capability `"shelf"`, with tile action `{ "capability": "shelf", "method": "open" }`.
- Copy, exactly:
  - "Lepas untuk menitipkan" / "Drop to keep here"
  - "Titipan · {n}" / "Shelf · {n}"
  - "Seret keluar untuk menyalin" / "Drag out to copy"
  - "Seret file ke notch untuk menitipkan" / "Drag files to the notch to keep them here"
  - "Tidak ditemukan" / "Not found"
  - "Menerima…" / "Receiving…"
  - "Kosongkan" / "Clear"
- Status text is the item count, with "99+" above 99. Activity `Running` gives the Modul tile its red dot.
- Shelf grid: 6 tiles per row, at most 3 visible rows, then the grid scrolls. Panel width 520, the same as the Modul page.
- Styles go through CSSOM only. Never use `style=""` markup, because the CSP forbids inline styles. Text goes in as text, never markup.
- Commit only files you changed. Never push.

## Review Focus

1. **A drag that passes over the notch without dropping.** The panel must close, or return to its page, and nothing is kept. Mouse-up anywhere ends drop mode, even if the catcher never saw an exit (Task 6, `drop_mode_ends_on_release`).
2. **Dragging a shelf item back onto Notching's own panel.** The item must stay on the shelf, because wry's webview accepts any drop as Copy (Task 7, `drop_on_own_overlay_keeps_items`).
3. **The original file is moved or deleted while on the shelf.** Opening the shelf shows it as "Tidak ditemukan", and it cannot be dragged (Task 3 `refresh_marks_missing`, Task 8 `missing_items_are_not_draggable`).
4. **The same file dropped twice, or a drop mixing new and known files.** No duplicates, and known items keep their place (Task 3, `add_skips_known_paths`).
5. **Shelf module switched off while items are kept, or during a drag.** The shelf empties, the status goes, and dropping no longer opens anything (Task 5 `module_gone_empties_shelf`, Task 6 `arrival_ignored_when_off`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src-tauri/src/status.rs` (modify) | Every shown status as a list, in start order |
| `src-tauri/src/shelf.rs` (create) | Pure shelf state: items, ids, dedupe, missing, receiving, status text, DTO, temp-path rule |
| `src-tauri/src/shelf_service.rs` (create, macOS) | Tauri state, commands, events, status, cache folder, thumbnails, copying temp files |
| `src-tauri/src/shelf_drop.rs` (create, macOS) | Drag-in: sensor arrival, catcher panels, file URLs and promises, release poll |
| `src-tauri/src/shelf_drag.rs` (create, macOS) | Drag-out: NSDraggingSession source |
| `src-tauri/src/modules/manifest.rs`, `gate.rs`, `module_commands.rs` (modify) | `Capability::Shelf`, `shelf.open` |
| `modules/shelf/*` (create) | manifest, icon, locales, package test |
| `src/bridge.ts`, `src/bridge-browser.ts` (modify) | Status list type, shelf calls and events |
| `src/notch/view.ts` (modify) | Several statuses with dotted separators |
| `src/shelf/view.ts` (create) | The shelf page: grid, drop zone, selection, drag start |
| `src/pages/route.ts`, `src/notch/page-view.ts` (modify) | `shelf` page kind and size |
| `src/app.ts` (modify) | Pill icon, opening to the shelf, drop mode, peek close |
| `src/i18n/*.json` (modify) | Host strings for the shelf |

---

### Task 1: Every status, as a list (core)

**Files:**
- Modify: `src-tauri/src/status.rs`, `src-tauri/src/app_core.rs:256-273`
- Test: the `#[cfg(test)]` modules in those files

**Interfaces:**
- Produces: `LiveStatus::shown(&self, off: &[String]) -> Vec<(Option<String>, String)>`, in start order.
- Produces: `StatusDto { screen: String, items: Vec<StatusItemDto> }` and `StatusItemDto { module_id: Option<String>, text: String }`, both camelCase.
- Produces: `AppCore::status_change(&mut self, screen) -> Option<Option<StatusDto>>`. It gives `None` when nothing changed, and `Some(None)` when no item shows.
- The event and `get_status` keep their names and send `StatusDto | null`.

- [ ] **Step 1: Write the failing tests.** In `status.rs` tests:
  - `shown_lists_every_entry_in_start_order`: timer "18:42", then awake "1:42", then keyclean as icon only gives `[(timer,"18:42"), (awake,"1:42"), (keyclean,"")]`.
  - `shown_skips_off_modules_and_textless_entries`.

  In `app_core.rs` tests, `status_change_sends_the_whole_list_once`: two entries give `Some(Some(dto with 2 items))`, and calling again gives `None`.

  Update the existing single-status tests to the list shape.
- [ ] **Step 2: Run them.** Run `cd src-tauri && cargo test status`. Expected: FAIL, because of the types.
- [ ] **Step 3: Implement.** `shown` filters instead of `rev().find_map`. `status_change` builds the DTO only when the list is non-empty. Update the module doc comment ("every status").
- [ ] **Step 4: Run the tests.** Run `cargo test`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: `feat(status): every module's status shows, in start order`.

### Task 2: Several statuses beside the notch (view)

**Files:**
- Modify: `src/bridge.ts` (`LiveStatus`), `src/bridge-browser.ts:168-172`, `src/app.ts:145-155`, `src/notch/view.ts`
- Test: `src/notch/view.test.ts`, `src/app.test.ts`

**Interfaces:**
- Consumes: Task 1's DTO.
- Produces: `interface LiveStatus { screen: string; items: { moduleId: string | null; text: string }[] }`.
- Produces: `NotchView.setStatus(items: StatusView[])`, where `interface StatusView { text: string; icon: string | null }` and `[]` hides the status.

- [ ] **Step 1: Write the failing tests** in `view.test.ts`:
  - `one status keeps the 76 px tab`: the existing path assertions (`M 177.00 0`) still hold for `setStatus([{ text: '18:42', icon: null }])`.
  - `several statuses widen the tab and get dotted separators`: three items give one `.st-sep` group for each gap (2), and the tab's right edge is further out than with one item.
  - `lens pill holds every status`: the `.st-pill` path is wider with two items than with one.
  - `setStatus([]) hides everything`.

  In `app.test.ts`, change `statusShown` fixtures to the list shape. Add `only this screen's list shows`.
- [ ] **Step 2: Run them.** Run `npx vitest run src/notch/view.test.ts src/app.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement in `view.ts`.**
  - Replace the single `stText` / `stIcon` with a `<g class="st-items">` that is rebuilt on `setStatus`.
  - Each item is an optional `<image>` with the white filter, `ST_ICON` 12, `ST_GAP` 5, then a `<text>`.
  - Between items, a `<g class="st-sep">` of 5 dots, `r` 0.9, 4 px apart vertically, fill `rgba(255,255,255,.4)`. A separator is 12 px wide.
  - Item width: `PILL_CHAR × text.length + iconRoom`.
  - Notch tab width: `max(STATUS_TAB, 8 + content + 8)`. Items are right-aligned so that they end at `notch.width/2 + width − 8`.
  - The lens pill's half width comes from the total content, plus `PILL_DOT` when missed.
  - `notchTabPath(notch, width, 'right')` is recomputed when the width changes.
- [ ] **Step 4: Update `app.ts` `showStatus`.** It maps items to `{ text, icon }`, with the icon as today (`bridge.moduleUrl(m.id, m.icon)`), or null for the sample. Update `bridge-browser.ts` to return the new shape.
- [ ] **Step 5: Run the tests.** Run `npx tsc --noEmit && npm test`. Expected: all pass.
- [ ] **Step 6: Commit.** Message: `feat(notch): statuses side by side with dotted separators`.

### Task 3: Shelf state (pure Rust)

**Files:**
- Create: `src-tauri/src/shelf.rs` (add `mod shelf;` in `lib.rs`, not macOS-gated)
- Test: in-file `#[cfg(test)]`

**Interfaces:**
- Produces:
  ```rust
  pub enum ItemState { Ready, Receiving, Missing }       // serde lowercase
  pub struct ShelfItem { pub id: u64, pub path: PathBuf, pub name: String, pub folder: bool,
                         pub state: ItemState, pub thumb: Option<Vec<u8>> /* PNG */ }
  pub struct Shelf { items: Vec<ShelfItem>, next_id: u64 }
  impl Shelf {
      pub fn add(&mut self, entries: Vec<NewItem>) -> Vec<u64>;      // ids of new items only
      pub fn remove(&mut self, ids: &[u64]) -> bool;
      pub fn clear(&mut self) -> bool;
      pub fn refresh(&mut self, exists: impl Fn(&Path) -> bool) -> bool; // Ready↔Missing
      pub fn set_thumb(&mut self, id: u64, png: Vec<u8>) -> bool;
      pub fn received(&mut self, id: u64, path: Option<PathBuf>) -> bool; // None: failed → removed
      pub fn get(&self, ids: &[u64]) -> Vec<&ShelfItem>;               // Ready ones only
      pub fn len(&self) -> usize;
      pub fn status_text(&self) -> Option<String>;                     // None when empty; "99+"
      pub fn dto(&self) -> ShelfDto;
  }
  pub struct NewItem { pub path: PathBuf, pub folder: bool, pub receiving: bool }
  pub struct ShelfDto { pub items: Vec<ShelfItemDto> }   // camelCase
  pub struct ShelfItemDto { pub id: u64, pub name: String, pub folder: bool, pub state: ItemState,
                            pub thumb: Option<String> /* data:image/png;base64,… */ }
  pub fn needs_copy(path: &Path) -> bool;  // under /private/var/folders or /var/folders
  ```
- Add `base64 = "0.22"` to `[dependencies]`.

- [ ] **Step 1: Write the failing tests:**
  - `add_skips_known_paths`: add a and b, then a and c. The result is `[a, b, c]`, and the second call returns only c's id.
  - `remove_and_clear`.
  - `refresh_marks_missing`: a Ready item whose path no longer exists becomes Missing. It becomes Ready again if the path comes back. Receiving items are left alone.
  - `received_promotes_or_drops`.
  - `get_returns_ready_only`.
  - `status_text`: 0 gives None, 3 gives "3", 100 gives "99+".
  - `dto_thumb_is_a_data_url`.
  - `needs_copy_for_system_temp_only`: `/private/var/folders/x/T/a.png` and `/var/folders/x/a.png` are true, and `/Users/u/Desktop/a.png` is false.
  - `name_is_the_last_component`, including for folders.
- [ ] **Step 2: Run them.** Run `cargo test shelf::`. Expected: FAIL.
- [ ] **Step 3: Implement.** Ids start at 1 and are never reused. Dedupe compares paths as given.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(shelf): shelf state in the core`.

### Task 4: The `shelf` module package and capability

**Files:**
- Create: `modules/shelf/manifest.json`, `modules/shelf/icon.svg`, `modules/shelf/locales/{id,en}.json`, `modules/shelf/package.test.ts`
- Modify: `modules/index.json` (append `"shelf"` after `"mirror"`), `src-tauri/src/modules/manifest.rs` (`Capability::Shelf`, renamed `"shelf"`), `src-tauri/src/modules/gate.rs` (`(Shelf, "open") => Call::ShelfOpen`), `src-tauri/src/module_commands.rs` (`Call::ShelfOpen => Ok(Value::Null)`)
- Test: `modules/shelf/package.test.ts`, gate tests

**Interfaces:**
- Manifest: `{ "id": "shelf", "version": "1.0.0", "icon": "icon.svg", "permissions": [], "capabilities": ["shelf", "status"], "action": { "capability": "shelf", "method": "open" } }`
- Locales: `name` "Titipan" / "Shelf"; `shortName` the same; `description` "Titipkan file di notch, salin ke mana saja" / "Keep files in the notch, copy them anywhere".
- Icon: the tray from the mockup, `viewBox="0 0 24 24"`, stroke only: `M4 13l2-8h12l2 8v6H4z M4 13h5l1 2h4l1-2h5`.

- [ ] **Step 1: Write the failing tests.**
  - `package.test.ts`, modeled on keyboard-clean: the icon is a line drawing, and the module is last in the catalog, after `mirror`.
  - In the same file, check `[entry, card, action]` equals `[null, null, { capability: 'shelf', method: 'open' }]`, `status` is true, and the id name is "Titipan".
  - Gate test: `shelf.open` is authorized for `shelf` and refused for a module without the capability.
- [ ] **Step 2: Run them.** Run `npx vitest run modules/shelf && (cd src-tauri && cargo test gate)`. Expected: FAIL.
- [ ] **Step 3: Implement.** Check that `scripts/build-modules.mjs` copies a package with no entry, as it does for keyboard-clean.
- [ ] **Step 4: Run the full tests.** Run `npm test && (cd src-tauri && cargo test)`. Expected: PASS. Existing catalog-order tests may need `shelf` appended.
- [ ] **Step 5: Commit.** Message: `feat(shelf): bundled Titipan module package`.

### Task 5: Shelf service (macOS): state, commands, events, status, thumbnails, received copies

**Files:**
- Create: `src-tauri/src/shelf_service.rs`
- Modify:
  - `src-tauri/src/lib.rs`: manage the state, register commands, `shelf_service::start` in setup, `shelf_service::quitting` on `RunEvent::Exit`.
  - `src-tauri/src/module_commands.rs`: `module_gone` is called in `set_module_enabled(false)` and `uninstall_module`.
  - `src-tauri/Cargo.toml`: `objc2-quick-look-thumbnailing = { version = "0.3", features = ["std", "block2", "QLThumbnailGenerator", "QLThumbnailRepresentation", "QLThumbnailGenerationRequest", "objc2-app-kit"] }`. Add app-kit features `NSImage`, `NSImageRep`, `NSBitmapImageRep`, `NSPasteboard`, `NSDragging`, `NSDraggingItem`, `NSDraggingSession`, `NSFilePromiseReceiver`. Add foundation features `NSURL`, `NSData`, `NSError`, `NSFileManager`.
- Test: in-file tests for the pure helpers

**Interfaces:**
- Consumes: Task 3's `Shelf`, and `status::set` / `status::clear`.
- Produces: `pub struct ShelfState(pub Mutex<Shelf>)`.
- Produces commands:
  - `shelf_state(app, refresh: bool) -> ShelfDto`. With `refresh`, it runs `refresh(Path::exists)` and emits when something changed.
  - `shelf_remove(app, ids: Vec<u64>)`.
  - `shelf_clear(app)`.
- Produces: event `notching://shelf` (broadcast, `ShelfDto`) after every change.
- Produces: `pub fn add_paths(app: &AppHandle, entries: Vec<NewItem>)`.
  - It adds the entries.
  - It sets a fallback thumb at once with `NSWorkspace::iconForFile`, on the main thread.
  - It asks QuickLook for a 128 px thumbnail and calls `set_thumb` when one arrives.
  - It copies `needs_copy` paths into the cache in a thread, calling `received` when the copy ends.
  - Then it emits and publishes the status.
- Produces: `pub fn receive_dir(app) -> PathBuf`, which is `<cache>/titipan/<unique>`.
- Produces: `pub static DRAG_OUT: AtomicBool`, which is true while a drag-out runs.
- Produces: `pub fn enabled(app) -> bool` (the shelf module is installed and on), and `pub fn module_gone(app, id)`, which clears the shelf when `id == "shelf"`.
- Produces: `pub fn start(app)`, which empties the cache folder. `pub fn quitting(app)` empties it too.
- Status: after every change, `status::set(app, "shelf", Activity::Running, Some(text))` when `status_text()` is Some, else `status::clear`.

- [ ] **Step 1: Write the failing tests for the pure helpers.**
  - `copy_target_keeps_the_name`: `<cache>/titipan/<n>/a.png`.
  - `empty_cache_dir_removes_only_titipan` uses tempfile.
  - `module_gone_empties_shelf`: logic test on a `Shelf` plus a helper `fn on_module_gone(shelf: &mut Shelf, id: &str) -> bool`.
- [ ] **Step 2: Run them.** Run `cargo test shelf_service`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - PNG: `NSImage` → `TIFFRepresentation` → `NSBitmapImageRep::imageRepWithData` → `representationUsingType_properties(PNG)`.
  - QuickLook: `QLThumbnailGenerator::sharedGenerator().generateBestRepresentationForRequest_completionHandler` with request size 128×128 at scale 2. Its completion runs off the main thread. Lock the state, set the thumb, then emit.
  - A folder is copied recursively with `std::fs`.
- [ ] **Step 4: Run the tests.** Run `cargo test && cargo build`. Expected: PASS, and it builds.
- [ ] **Step 5: Commit.** Message: `feat(shelf): shelf service, thumbnails and the cache folder`.

### Task 6: Drag in (macOS)

**Files:**
- Create: `src-tauri/src/shelf_drop.rs`
- Modify:
  - `src-tauri/src/sensor.rs`: `SensorView` registers for the dragged types `public.file-url` and the file-promise types (`NSFilePromiseReceiver::readableDraggedTypes`). It implements `draggingEntered:`, returning `Copy` after `shelf_drop::arrived(app, label)` when the shelf is on, and `None` otherwise. It also implements `performDragOperation:` as a fallback that hands the drag to `shelf_drop::accept`.
  - `src-tauri/src/lib.rs`: `.on_window_event` for `WindowEvent::DragDrop(DragDropEvent::Enter { .. })` on `notch-*` windows calls `shelf_drop::arrived`, because a drag can reach the overlay's webview first when the overlay is not click-through. wry's handler stays on, since without it WebKit would open a dropped file in the notch.
  - `src-tauri/src/commands.rs`: `set_hit_rects` re-places the catcher when drop mode is on for that label.
- Test: in-file tests for pure parts

**Interfaces:**
- Produces: `pub fn arrived(app: &AppHandle, label: &str)`.
  - When `shelf_service::enabled` and drop mode is not already on for any label, it sets drop mode for that label, emits `notching://shelf-drop` `{ phase: "start" }` to that overlay only, and starts the release poll.
  - It does nothing while a drag-out of ours is running (`shelf_service::DRAG_OUT`, an `AtomicBool` that Task 7 sets).
- Produces command `shelf_drop_ready(window)`. The page calls it once the panel is open. It places this overlay's catcher over its first hit rect, above the overlay, using `orderWindow(Above, overlay number)`.
- Produces: `notching://shelf-drop` `{ phase: "end", dropped: bool }` to that overlay, sent when drop mode ends. The catcher orders out.
- Catcher: one `NSPanel` per overlay label, created lazily and never closed. It is borderless and nonactivating, at the same level and collection behavior as the overlay, with a 1% clear background. Its view implements:
  - `draggingEntered:` and `draggingUpdated:` return `Copy`. They return `None` when `draggingSource` is non-nil, meaning our own drag.
  - `draggingExited:` ends with `dropped: false`.
  - `performDragOperation:` calls `accept(app, info)` and ends with `dropped: true`.
- `accept` reads file URLs first (`readObjectsForClasses([NSURL])`, file URLs only, `filePathURL`). Any `NSFilePromiseReceiver` items are received into `shelf_service::receive_dir`, with `NewItem.receiving = true` and a placeholder path of the promise's suggested name, then `received(id, Some(url))` in the reader block. The folder flag comes from `fs::metadata`.
- Release poll: every 150 ms while drop mode is on. When `NSEvent::pressedMouseButtons() == 0` and no `performDragOperation` came in the last 300 ms, drop mode ends with `dropped: false`.

- [ ] **Step 1: Write the failing tests** for the pure decision `fn drop_mode_step(now: DropMode, ev: DropEvent) -> (DropMode, Option<DropEnd>)`:
  - `arrival_starts_once`.
  - `arrival_ignored_when_off`.
  - `exit_ends_not_dropped`.
  - `perform_ends_dropped`.
  - `drop_mode_ends_on_release` (release with no perform).
  - `release_after_perform_is_ignored`.
- [ ] **Step 2: Run them.** Run `cargo test shelf_drop`. Expected: FAIL.
- [ ] **Step 3: Implement** the state machine and the AppKit parts around it. All AppKit work runs on the main thread (`run_on_main_thread`).
- [ ] **Step 4: Run the tests and build.** Run `cargo test && cargo build`. Expected: PASS, and it builds.
- [ ] **Step 5: Commit.** Message: `feat(shelf): drop files on the notch`.

### Task 7: Drag out (macOS)

**Files:**
- Create: `src-tauri/src/shelf_drag.rs`
- Modify: `src-tauri/src/lib.rs` (register the command)
- Test: in-file

**Interfaces:**
- Produces command `shelf_start_drag(app, window, ids: Vec<u64>) -> Result<(), String>`. Only Ready items are dragged. It returns Err if there are none, or if a drag is already running.
  - On the main thread, it builds one `NSDraggingItem` per item: an `NSURL::fileURLWithPath` writer, a frame of 48×48 at the cursor (offset 8 px per item), and contents of the PNG thumb as `NSImage::initWithData`, or the workspace icon.
  - The event is `NSApp.currentEvent` when it is a left-mouse event for this window. Otherwise it synthesizes a `LeftMouseDragged` event at the window's `mouseLocationOutsideOfEventStream`.
  - It calls `contentView.beginDraggingSessionWithItems_event_source`.
- Source class `NotchingShelfDragSource` (`define_class!`), holding the ids and the label, kept alive in a thread_local until the drag ends:
  - `draggingSession:sourceOperationMaskForDraggingContext:` returns `NSDragOperation::Copy` for both contexts.
  - `draggingSession:movedToPoint:` emits `notching://shelf-drag` `{ phase: "left" }` to the label once. It fires when the point (screen coordinates) leaves the overlay's first hit rect in global coordinates (`css_rect_to_global`).
  - `draggingSession:endedAtPoint:operation:` removes the ids when `keeps_items(op, point_inside_any_overlay_hit_rect)` is false. It then emits `{ phase: "end" }`.
- It sets `shelf_service::DRAG_OUT` when the drag starts and clears it when the drag ends.
- Pure: `fn keeps_items(op: NSDragOperation-as-u64, on_own_overlay: bool) -> bool`. It is true when `op == 0` or `on_own_overlay`.

- [ ] **Step 1: Write the failing tests:** `cancelled_drag_keeps_items`, `accepted_drag_removes_items`, and `drop_on_own_overlay_keeps_items`.
- [ ] **Step 2: Run them.** Run `cargo test shelf_drag`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and build.** Run `cargo test && cargo build`. Expected: PASS, and it builds.
- [ ] **Step 5: Commit.** Message: `feat(shelf): drag kept files out as copies`.

### Task 8: The shelf page (TS)

**Files:**
- Create: `src/shelf/view.ts`, `src/shelf/view.test.ts`, `src/shelf/shelf.css` (imported from `src/notch/notch.css` or `main.ts` like `pages.css`)
- Modify:
  - `src/bridge.ts`, `src/bridge-browser.ts`: add `shelf(refresh: boolean): Promise<ShelfState>`, `onShelf(cb)`, `shelfRemove(ids)`, `shelfClear()`, `shelfStartDrag(ids): Promise<void>`, `shelfDropReady(): Promise<void>`, `onShelfDrop(cb: (e: { phase: 'start' } | { phase: 'end'; dropped: boolean }) => void)`, `onShelfDrag(cb: (e: { phase: 'left' | 'end' }) => void)`.
  - `src/pages/route.ts`: `PageView` gains `{ kind: 'shelf'; key: 'shelf'; items: number; dropping: boolean }`; add `shelfSize(items, dropping)` to `viewSize`.
  - `src/notch/page-view.ts`: `show` for kind `shelf` mounts the shelf view.
  - `src/i18n/{id,en}.json` + `src/i18n/index.ts`: `shelf: { drop, title, hint, empty, missing, receiving, clear }`, with the exact copy from Global Constraints. `title` holds `{n}`.
- Test: `src/shelf/view.test.ts`, `src/pages/route.test.ts`

**Interfaces:**
- Produces: `interface ShelfItem { id: number; name: string; folder: boolean; state: 'ready' | 'receiving' | 'missing'; thumb: string | null }` and `interface ShelfState { items: ShelfItem[] }`.
- Produces: `mountShelfView(box: HTMLElement, deps: { strings: HostStrings['shelf']; startDrag(ids: number[]): void; remove(ids: number[]): void; clear(): void }): { render(s: ShelfState, dropping: boolean): void; destroy(): void }`.
- Produces: `middleTruncate(name: string, max = 14): string`, exported. It keeps the extension: `"laporan-tahunan-2026.pdf"` becomes `"laporan-…2026.pdf"`, and names of `max` or fewer characters are unchanged.
- Sizes:
  - `SHELF = { width: 520, head: 22, tile: 84, gap: 8, columns: 6, maxRows: 3, drop: 104, empty: 56 }`.
  - Height while dropping: `drop`. Empty: `head + empty`. Otherwise: `head + rows × tile + (rows − 1) × gap`, where `rows = min(maxRows, ceil(n / 6))`.

- [ ] **Step 1: Write the failing tests** in `view.test.ts` (jsdom):
  - `drop mode shows the drop zone only`, with text "Lepas untuk menitipkan".
  - `head shows count and hint`: "Titipan · 3" and "Seret keluar untuk menyalin".
  - `empty shelf shows the empty line`.
  - `tiles show thumb and truncated name`: the `img` has `draggable === false`, and `name.textContent` comes from `middleTruncate`.
  - `click selects; cmd-click adds; shift-click selects a range`.
  - `dragging a selected tile drags the whole selection`: pointerdown on the tile, then pointermove of 5 px, gives `startDrag([1, 2])`. 3 px does nothing.
  - `dragging an unselected tile drags only it`.
  - `missing_items_are_not_draggable`: the `.missing` class, the "Tidak ditemukan" label, and no `startDrag`.
  - `receiving items are dimmed with "Menerima…"`.
  - `× removes one, Kosongkan clears all`.

  In `route.test.ts`:
  - `shelf size by rows`: 1, 7 and 30 items give 1, 2 and 3 rows.
  - `dropping size is 104`.
- [ ] **Step 2: Run them.** Run `npx vitest run src/shelf src/pages`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Selection state lives in the view and is pruned to existing ids on each `render`.
  - Drag start uses pointer events with a 4 px threshold. It calls `preventDefault` on `dragstart` and sets `user-select: none`.
  - The grid gets `overflow-y: auto` beyond `maxRows`.
  - Tiles are 62 px wide, with a 44 px thumb box, as in the mockup.
- [ ] **Step 4: Run the tests.** Run `npx tsc --noEmit && npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(shelf): the shelf page in the notch`.

### Task 9: Wiring the shelf into the notch (TS)

**Files:**
- Modify: `src/app.ts`, `src/notch/connect.ts` (an optional `onPointer` hook)
- Test: `src/app.test.ts`

**Interfaces:**
- Consumes: Task 8's bridge calls and page kind, and Task 4's tile action.

**Behaviour to implement and test (one test each, in `app.test.ts`):**
1. `the pill shows the shelf icon only while items are kept`, between the custom pages and `modules`. It uses the module's `iconSvg`.
2. `opening the panel with items shows the shelf`. It remembers the previous page key as `beforeShelf`, and does not call `setLastPage('shelf')`.
3. `the Modul tile opens the shelf`: `onAction` with `m.action.capability === 'shelf'` calls `go('shelf')`. It does not close the panel or call the module.
4. `a drop start opens the panel in drop mode`. It calls `controller.click()` when the panel is not open, uses the shelf page with `dropping: true`, and calls `bridge.shelfDropReady()` on the next `onPhase('open')`, or at once if the panel was already open.
5. `a drop end without a drop goes back`. If the drag opened the panel, it calls `controller.escape()`. Otherwise it returns to `beforeShelf`.
6. `a drop end with a drop shows the shelf and closes when the pointer leaves` (peek): the next `onPointer({ inside: false })` while open calls `escape()`.
7. `a drag that leaves the panel closes it` (`onShelfDrag` `left`).
8. `the last item gone returns to the page before the shelf`.
9. `the shelf module switched off removes the pill icon and leaves the shelf page`.

- [ ] **Step 1: Write the nine failing tests** with the fake bridge in `src/notch/test-helpers.ts`. Extend it with the new calls and with emitters for `shelf`, `shelfDrop` and `shelfDrag`.
- [ ] **Step 2: Run them.** Run `npx vitest run src/app.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement in `app.ts`.**
  - Hold `shelf: ShelfState`.
  - `shelfOn` is true when the `shelf` module is installed and enabled.
  - `pickPage` stays as it is. The shelf choice is made in `onPhase('open')` and in the drop handlers.
  - Refresh with `bridge.shelf(true)` when the panel opens on the shelf.
- [ ] **Step 4: Run the tests.** Run `npx tsc --noEmit && npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(shelf): open the shelf from the notch, drops and the pill`.

### Task 10: Build, check on the Mac, record, merge

**Files:**
- Create: `docs/superpowers/verification/2026-11-01-notching-10-titipan.md` (format of `2026-10-31-notching-9-cermin.md`)

- [ ] **Step 1: Run everything.** Run `npx tsc --noEmit && npm test && (cd src-tauri && cargo test)`. Record the counts against the starting counts.
- [ ] **Step 2: Build a release.** Run `npm run tauri build`. Record the `.app` size. Back up settings to `~/Library/Application Support/id.web.notching/before-titipan/`.
- [ ] **Step 3: Launch the test build with stderr captured** (`Contents/MacOS/notching 2> <scratchpad>/titipan.log &`) after the owner quits the running Notching.
- [ ] **Step 4: The owner's checklist.** For each check, record evidence from files on disk, not from the report alone:
  1. Drag one file from Finder to the notch. The drop zone appears. Drop it, and the shelf shows a thumbnail. The status shows "1".
  2. Drag 3 files plus 1 folder. All are kept. Dropping a duplicate adds nothing.
  3. Switch Space, then drag an item to a Finder folder on the same disk. The copy exists, and the original still exists: compare with `shasum` and `ls` for both. The item leaves the shelf.
  4. Drag a folder out. The folder copy matches (`diff -r`).
  5. Drag over the notch and away without dropping. The panel closes, and nothing is kept.
  6. A screenshot thumbnail (Cmd+Shift+4, then drag the corner thumbnail) and a Mail or Photos item are kept. Their copies come out intact. Check `~/Library/Caches/id.web.notching/titipan/`.
  7. Move an original away while it is kept. Reopening the shelf shows "Tidak ditemukan".
  8. Timer and Keep awake running with items kept: three statuses with dotted separators.
  9. External monitor without a notch: drop on the lens, then take the item on the MacBook.
  10. Quit Notching. The cache folder is empty.
- [ ] **Step 5: Write the verification note**, with findings and builder decisions. Commit: `docs: Titipan verification on the owner's Mac`.
- [ ] **Step 6: Merge.** On the owner's go-ahead, fast-forward `main` to `feat/titipan`. Do not push.
