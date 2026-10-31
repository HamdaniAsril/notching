# Keep awake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A built-in Keep awake module: keep the screen on and the Mac awake for 1 h, 2 h, a typed number of minutes or with no limit, extendable by +15/+30/+60 minutes, shown as a white tile and a status beside the notch, with a notice when it ends.

**Architecture:** The timing and the macOS power assertion live in the Rust core (`awake.rs` pure logic, `awake_hold.rs` the IOKit assertion, `awake_service.rs` the thread and the glue), because a module page is unloaded when the panel closes. The module page (`modules/keep-awake/`) only reads the state once a second while open and sends `start` / `add` / `stop` through the existing capability gate under a new `awake` capability. The service reports `Activity::On` with the remaining time through `status::set`, which is also where deferred minor 6 (status not recomputed on module off/uninstall or for a new overlay) gets fixed.

**Tech Stack:** Tauri 2, Rust (IOKit via FFI, objc2-foundation `NSString` toll-free bridged to `CFStringRef`), vanilla TypeScript module package built by `scripts/build-modules.mjs`, vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-31-keep-awake-design.md` (and `2026-10-30-halaman-widget-design.md` §7–8 for the tile and the status).

## Global Constraints

- Screen stays on and the Mac stays awake while on: assertion type `PreventUserIdleDisplaySleep`. One assertion at a time.
- Durations: buttons 60 and 120 minutes and no limit; typed 1–1440 minutes; adds +15, +30, +60; remaining time never above 1440 minutes (24 h).
- Clicking the big box: off → start 60 minutes; on → stop.
- Status text: ≥ 60 min left "h:mm" (`1:42`, `24:00`); under 60 "Nm" (`42m`); no limit `∞`; minutes rounded up; refreshed per minute, not per second. At most 6 characters (`STATUS_MAX`).
- End time is wall-clock milliseconds; a Mac that slept past the end ends at once on the next check (≤ 60 s after waking) and still posts the notice.
- Notice channel `done`, default on with sound; texts "Keep awake selesai" / "Mac kembali tidur seperti biasa" (en: "Keep awake ended" / "Your Mac sleeps as usual again"). No notice on a manual stop.
- The hold is released on stop, end, module switched off or uninstalled, and quit. State is never written to disk; a fresh launch is always off.
- If the assertion cannot be created, Keep awake stays off and the call fails.
- Module id `keep-awake`, catalog order after `system-stat`, no permissions, capabilities `awake`, `status`, `notify`.
- Repo rules: `export PATH="$HOME/.cargo/bin:$PATH"` and `npm run build:modules` before cargo; never close an nspanel panel; mockup/page CSS must not use the frame classes `.main`, `.status`, `.card`, `.label`; commit explicit paths only.

## Review Focus

1. **Module switched off or uninstalled while on** — the hold must go and the status with it. Owned by Task 3 (`module_gone` glue); checked on the device with `pmset -g assertions`.
2. **Mac asleep past the end** — must end at once on wake, not resume the old remaining time. Test `a_clock_jump_past_the_end_ends_at_once` in Task 1.
3. **Repeated + clicks** — never above 24 h. Test `add_extends_and_stops_at_24_hours` in Task 1.
4. **Typed nonsense** (`0`, `1441`, empty, `abc`, `1.5`) — nothing starts. Test `typed minutes start on Enter only when they are 1–1440` in Task 4.
5. **Starting again while on** (e.g. from a second overlay's page) — replaces the end time and keeps a single assertion. Test `starting again replaces the end` in Task 1; single assertion in Task 3's `start` (only takes a hold when none is held).

---

### Task 1: Keep awake logic (`awake.rs`)

**Files:**
- Create: `src-tauri/src/awake.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod awake;`)

**Interfaces:**
- Produces:
  - `pub const MAX_MINUTES: u32 = 1440;`
  - `pub enum AwakeError { BadMinutes, Off, NoEnd }` with `Display` ("minutes must be 1–1440", "keep awake is off", "keep awake has no end")
  - `#[derive(Default)] pub struct Awake` (private fields: `owner: Option<String>`, `until: Option<Until>` where `enum Until { Forever, At(i64) }`)
  - `Awake::start(&mut self, owner: &str, now: i64, minutes: Option<u32>) -> Result<(), AwakeError>` — `None` is no limit; replaces any running one.
  - `Awake::add(&mut self, now: i64, minutes: u32) -> Result<(), AwakeError>` — capped at `now + MAX_MINUTES` minutes; `Off` when off, `NoEnd` when no limit; minutes must be 1–1440.
  - `Awake::stop(&mut self) -> Option<String>` — the owner if it was on.
  - `Awake::owner(&self) -> Option<&str>`
  - `Awake::view(&self, now: i64) -> AwakeDto`
  - `Awake::step(&mut self, now: i64) -> Step`
  - `#[derive(Clone, Debug, PartialEq, serde::Serialize)] #[serde(rename_all = "camelCase")] pub struct AwakeDto { pub on: bool, pub until: Option<i64>, pub forever: bool, pub text: Option<String> }` — `until` only for a timed run; `text` is the status text when on.
  - `#[derive(Debug, PartialEq)] pub enum Step { Off, Ended(String), On { owner: String, text: String, wait_ms: i64 } }`
  - `pub fn status_text(remaining_ms: i64) -> String`
  - `pub const FOREVER_TEXT: &str = "∞";` and `pub const WAIT_MAX_MS: i64 = 60_000;`

- [ ] **Step 1: Write the failing tests** in `awake.rs` `mod tests` (`const M: i64 = 60_000;`, `const T: i64 = 1_000_000_000;`):

```rust
#[test] fn start_takes_1_to_1440_minutes_or_no_limit() {
    let mut a = Awake::default();
    assert_eq!(a.start("k", T, Some(0)), Err(AwakeError::BadMinutes));
    assert_eq!(a.start("k", T, Some(1441)), Err(AwakeError::BadMinutes));
    assert_eq!(a.owner(), None);
    assert!(a.start("k", T, Some(1)).is_ok());
    assert!(a.start("k", T, Some(1440)).is_ok());
    assert!(a.start("k", T, None).is_ok());
    assert_eq!(a.owner(), Some("k"));
}
#[test] fn starting_again_replaces_the_end() {
    let mut a = Awake::default();
    a.start("k", T, Some(120)).unwrap();
    a.start("k", T, Some(60)).unwrap();
    assert_eq!(a.view(T).until, Some(T + 60 * M));
}
#[test] fn add_extends_and_stops_at_24_hours() {
    let mut a = Awake::default();
    a.start("k", T, Some(20)).unwrap();
    a.add(T, 30).unwrap();
    assert_eq!(a.view(T).until, Some(T + 50 * M));
    a.add(T, 1440).unwrap();
    assert_eq!(a.view(T).until, Some(T + 1440 * M));
    assert_eq!(a.view(T).text.as_deref(), Some("24:00"));
}
#[test] fn add_needs_a_timed_run() {
    let mut a = Awake::default();
    assert_eq!(a.add(T, 15), Err(AwakeError::Off));
    a.start("k", T, None).unwrap();
    assert_eq!(a.add(T, 15), Err(AwakeError::NoEnd));
}
#[test] fn status_text_rounds_minutes_up() {
    assert_eq!(status_text(102 * M), "1:42");
    assert_eq!(status_text(60 * M), "1:00");
    assert_eq!(status_text(59 * M + 1_000), "1:00");
    assert_eq!(status_text(42 * M), "42m");
    assert_eq!(status_text(30_000), "1m");
    assert_eq!(status_text(1440 * M), "24:00");
}
#[test] fn view_follows_the_state() {
    let mut a = Awake::default();
    assert_eq!(a.view(T), AwakeDto { on: false, until: None, forever: false, text: None });
    a.start("k", T, None).unwrap();
    assert_eq!(a.view(T), AwakeDto { on: true, until: None, forever: true, text: Some("∞".into()) });
    a.start("k", T, Some(102)).unwrap();
    assert_eq!(a.view(T), AwakeDto { on: true, until: Some(T + 102 * M), forever: false, text: Some("1:42".into()) });
}
#[test] fn step_waits_until_the_text_changes() {
    let mut a = Awake::default();
    assert_eq!(a.step(T), Step::Off);
    a.start("k", T, Some(103)).unwrap();
    // 102.5 minutes left: "1:43" until 102 minutes are left.
    assert_eq!(a.step(T + 30_000), Step::On { owner: "k".into(), text: "1:43".into(), wait_ms: 30_000 });
    a.start("k", T, None).unwrap();
    assert_eq!(a.step(T), Step::On { owner: "k".into(), text: "∞".into(), wait_ms: WAIT_MAX_MS });
}
#[test] fn it_ends_once_at_its_time() {
    let mut a = Awake::default();
    a.start("k", T, Some(1)).unwrap();
    assert!(matches!(a.step(T + M - 1), Step::On { wait_ms: 1, .. }));
    assert_eq!(a.step(T + M), Step::Ended("k".into()));
    assert_eq!(a.step(T + M), Step::Off);
    assert!(!a.view(T + M).on);
}
#[test] fn a_clock_jump_past_the_end_ends_at_once() {
    let mut a = Awake::default();
    a.start("k", T, Some(60)).unwrap();
    assert_eq!(a.step(T + 180 * M), Step::Ended("k".into()));
}
#[test] fn stop_reports_the_owner_once() {
    let mut a = Awake::default();
    assert_eq!(a.stop(), None);
    a.start("k", T, Some(60)).unwrap();
    assert_eq!(a.stop(), Some("k".into()));
    assert_eq!(a.stop(), None);
}
```

- [ ] **Step 2: Run to see them fail**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml awake::`
Expected: compile errors (no `Awake`).

- [ ] **Step 3: Implement** `awake.rs` with the interfaces above. `step`: off → `Off`; `At(t)` with `now >= t` → clear and `Ended(owner)`; otherwise `On` with `text = status_text(t - now)` and `wait_ms = rem - (ceil_minutes - 1) * 60_000` (clamped to `WAIT_MAX_MS`); `Forever` → `FOREVER_TEXT`, `WAIT_MAX_MS`. `status_text`: `m = ceil(ms / 60_000)` (at least 1); `m >= 60` → `format!("{}:{:02}", m / 60, m % 60)`, else `format!("{m}m")`.

- [ ] **Step 4: Run the tests to see them pass** (same command). Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/awake.rs src-tauri/src/lib.rs
git commit -m "feat(awake): keep awake timing: start, add up to 24 h, end on the wall clock"
```

### Task 2: The macOS power assertion (`awake_hold.rs`)

**Files:**
- Create: `src-tauri/src/awake_hold.rs`
- Modify: `src-tauri/src/lib.rs` (`#[cfg(target_os = "macos")] mod awake_hold;`)

**Interfaces:**
- Produces: `pub struct Hold(u32);` with `pub fn take() -> Option<Hold>` and `impl Drop for Hold` (releases). `pub const HOLD_NAME: &str = "Notching keep awake";`

- [ ] **Step 1: Write the failing test**

```rust
// The assertion shows in pmset under this process until dropped.
#[test]
fn a_hold_shows_in_pmset_until_dropped() {
    let mine = |out: &str| out.lines().any(|l| l.contains(&format!("pid {}(", std::process::id())) && l.contains(HOLD_NAME));
    let pmset = || String::from_utf8(std::process::Command::new("pmset").args(["-g", "assertions"]).output().unwrap().stdout).unwrap();
    let hold = Hold::take().expect("assertion");
    assert!(mine(&pmset()));
    drop(hold);
    assert!(!mine(&pmset()));
}
```

- [ ] **Step 2: Run to see it fail.** `cargo test --manifest-path src-tauri/Cargo.toml awake_hold::` → compile error.

- [ ] **Step 3: Implement.** `#[link(name = "IOKit", kind = "framework")] extern "C" { fn IOPMAssertionCreateWithName(t: *const c_void, level: u32, name: *const c_void, id: *mut u32) -> i32; fn IOPMAssertionRelease(id: u32) -> i32; }`. Type `"PreventUserIdleDisplaySleep"`, level `255` (`kIOPMAssertionLevelOn`), name `HOLD_NAME`; strings are `objc2_foundation::NSString::from_str(..)` passed as `Retained::as_ptr(&s).cast()` (toll-free bridged). Non-zero return → `None`. One comment line saying why `PreventUserIdleDisplaySleep` (the owner chose screen on, spec §2).

- [ ] **Step 4: Run to see it pass.** Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/awake_hold.rs src-tauri/src/lib.rs
git commit -m "feat(awake): a power assertion that keeps the screen on, released on drop"
```

### Task 3: The `awake` capability, the service, and the status fix

**Files:**
- Modify: `src-tauri/src/modules/manifest.rs` (`Capability::Awake`, serde `"awake"`)
- Modify: `src-tauri/src/modules/gate.rs` (calls + tests)
- Create: `src-tauri/src/awake_service.rs` (macOS-only module like `notify`)
- Modify: `src-tauri/src/module_commands.rs` (route calls; `module_gone` + status publish on switch-off/uninstall/reinstall)
- Modify: `src-tauri/src/status.rs` (`publish` becomes `pub`; drop the three `#[allow(dead_code)]`)
- Modify: `src-tauri/src/overlay.rs` (`rebuild_overlays` ends with `crate::status::publish(app)`)
- Modify: `src-tauri/src/lib.rs` (`mod awake_service;`, `awake_service::start(app.handle().clone())` after `home::schedule::start`)

**Interfaces:**
- Consumes: Task 1 `Awake`, `AwakeDto`, `Step`; Task 2 `Hold::take`; `status::set/clear/publish`; `notify::post`; `AppCore::module_text`.
- Produces:
  - `Call::AwakeRead`, `Call::AwakeStart`, `Call::AwakeAdd`, `Call::AwakeStop` for `("awake", "read"|"start"|"add"|"stop")`.
  - `awake_service::start(app: AppHandle)`; `read(app: &AppHandle) -> AwakeDto`; `turn_on(app: &AppHandle, owner: &str, minutes: Option<u32>) -> Result<AwakeDto, String>`; `extend(app: &AppHandle, minutes: u32) -> Result<AwakeDto, String>`; `turn_off(app: &AppHandle) -> AwakeDto`; `module_gone(app: &AppHandle, id: &str)`.
  - JS call shapes: `read` → `AwakeDto`; `start` `{ minutes: number | null }` → `AwakeDto`; `add` `{ minutes: number }` → `AwakeDto`; `stop` → `AwakeDto`.
  - Notice texts from the module locale: keys `notice.done.title`, `notice.done.detail`.

- [ ] **Step 1: Write the failing gate test** in `gate.rs`:

```rust
#[test]
fn keep_awake_needs_its_capability() {
    let k = entry("keep-awake", &[Capability::Awake, Capability::Status, Capability::Notify], true);
    assert_eq!(authorize(Some(&k), "keep-awake", "awake", "read"), Ok(Call::AwakeRead));
    assert_eq!(authorize(Some(&k), "keep-awake", "awake", "start"), Ok(Call::AwakeStart));
    assert_eq!(authorize(Some(&k), "keep-awake", "awake", "add"), Ok(Call::AwakeAdd));
    assert_eq!(authorize(Some(&k), "keep-awake", "awake", "stop"), Ok(Call::AwakeStop));
    assert_eq!(authorize(Some(&k), "keep-awake", "awake", "hold"), Err(CallError::UnknownMethod("hold".into())));
    let stat = entry("system-stat", &[Capability::SystemStats], true);
    assert!(matches!(authorize(Some(&stat), "system-stat", "awake", "start"), Err(CallError::NotDeclared { .. })));
}
```

- [ ] **Step 2: Run to see it fail.** `cargo test --manifest-path src-tauri/Cargo.toml gate::` → compile error.

- [ ] **Step 3: Implement the capability and the gate arms.** Run the gate tests → pass.

- [ ] **Step 4: Implement `awake_service.rs`.** State `AwakeState(Mutex<Service>)` with `Service { awake: Awake, hold: Option<Hold> }`, plus a poke signal like `home::schedule` (`Arc<(Mutex<bool>, Condvar)>`). Rules:
  - `turn_on`: try `Awake::start` on a clone first (bad minutes → `Err`, nothing held); take a `Hold` only when none is held (failure → `Err("the Mac did not allow staying awake")`, stays off); commit; poke; return `view(now)`.
  - `extend`: `Awake::add`, poke, return view.
  - `turn_off`: `stop()`, drop the hold, `status::clear(app, owner)`, poke, return view. No notice.
  - `module_gone(id)`: `turn_off` only when `owner() == Some(id)`.
  - Thread `notching-awake`: each round takes `step(now)` under the lock, then with no lock held: `Ended(owner)` → drop hold, `status::clear`, `notify::post(app, &owner, "done", title, detail)` with texts from `module_text(&owner, "notice.done.title" / ".detail")`; `On { owner, text, wait_ms }` → `status::set(app, &owner, Activity::On, Some(&text))` (log an error with `eprintln!("notching: …")`), then wait `wait_ms` or a poke; `Off` → wait `WAIT_MAX_MS` or a poke.
  - Wall-clock now: `chrono::Local::now().timestamp_millis()`.

- [ ] **Step 5: Route the calls in `module_call`** (`StartArgs { minutes: Option<u32> }`, `ExtendArgs { minutes: u32 }`, both through `parse_args`), passing `&module_id` as owner to `turn_on`. In `set_module_enabled` (when `!enabled`) and `uninstall_module`, call `awake_service::module_gone(&app, &id)` after the change; in those two and `reinstall_module`, call `status::publish(&app)` after the change (deferred minor 6). `rebuild_overlays` ends with `crate::status::publish(app)`.

- [ ] **Step 6: Build and run the whole Rust suite.**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all pass, no `dead_code` warnings for `Activity::On`, `status::set`, `status::clear`.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/modules/manifest.rs src-tauri/src/modules/gate.rs src-tauri/src/awake_service.rs src-tauri/src/module_commands.rs src-tauri/src/status.rs src-tauri/src/overlay.rs src-tauri/src/lib.rs
git commit -m "feat(awake): the awake capability, a service thread with status and notice, status recomputed on module changes"
```

### Task 4: The Keep awake module page (`modules/keep-awake/`)

**Files:**
- Create: `modules/keep-awake/{manifest.json, icon.svg, index.html, main.ts, view.ts, view.test.ts, style.css, locales/id.json, locales/en.json}`
- Modify: `modules/index.json` → `["home", "system-stat", "keep-awake"]`
- Create: `src/bridge-browser-awake.ts` (+ `src/bridge-browser-awake.test.ts`); Modify: `src/bridge-browser.ts` (route `awake` calls to it; document `?awake=…` not needed)

**Interfaces:**
- Consumes: Task 3 call shapes; `connectKit` from `src/kit/client.ts`.
- Produces: `export interface AwakeView { on: boolean; until: number | null; forever: boolean; text: string | null }`; `export interface Actions { start(minutes: number | null): void; add(minutes: number): void; stop(): void }`; `export type Strings = typeof import('./locales/id.json')`; `export function renderPage(root: HTMLElement, s: Strings, lang: Lang, act: Actions): { update(v: AwakeView): void }`; `export function endClock(until: number, lang: Lang): string`; `export const POLL_MS = 1000`.
- `manifest.json`: `{"id":"keep-awake","version":"1.0.0","entry":"index.html","icon":"icon.svg","card":{"width":440,"height":104},"permissions":[],"capabilities":["awake","status","notify"],"notifications":[{"id":"done","on":true,"sound":true}]}`
- `locales/id.json`: `name` "Keep awake", `shortName` "Awake", `description` "Mac tetap menyala", `off` "Mati", `startFor` "Nyalakan selama", `hour1` "1 jam", `hour2` "2 jam", `minutes` "menit", `boxHint` "Klik kotak: 1 jam", `until` "Menyala sampai {time}", `forever` "Menyala tanpa batas", `stopHint` "Klik kotak untuk mematikan", `add15` "+15 m", `add30` "+30 m", `add60` "+1 jam", `channels.done` "Keep awake selesai", `notice.done.title` "Keep awake selesai", `notice.done.detail` "Mac kembali tidur seperti biasa". `en.json` the same keys: "Keep awake", "Awake", "Keeps your Mac awake", "Off", "Keep on for", "1 hr", "2 hrs", "min", "Click the box: 1 hr", "On until {time}", "On with no limit", "Click the box to turn off", "+15 m", "+30 m", "+1 hr", "Keep awake ended", "Keep awake ended", "Your Mac sleeps as usual again".
- Look (mockup B, `docs/superpowers/specs/2026-10-31-keep-awake-mockups/page-layout.html`): a 96 × 96 box (`button`, radius 22, `rgba(255,255,255,.08)`; white with black text when on, `aria-pressed`) holding a 26 px line icon (the sun from the mockup, same as `icon.svg`) and a Space Mono label — "Mati" when off, the status text when on (15 px); to its right a column with a `.lab` heading, a row of pill buttons, and a `.lab` hint. Off: heading `startFor`, buttons `hour1` `hour2` `∞` and a number field + `minutes`, hint `boxHint`. On with an end: heading `until` with `endClock`, buttons `add15` `add30` `add60`, hint `stopHint`. No limit: heading `forever`, no buttons, hint `stopHint`. Class names prefixed `ka-`.

- [ ] **Step 1: Write the failing tests** in `view.test.ts` (jsdom; strings from `locales/id.json`; `act = { start: vi.fn(), add: vi.fn(), stop: vi.fn() }`; `OFF = { on: false, until: null, forever: false, text: null }`; `at1520 = new Date(2026, 9, 31, 15, 20).getTime()`):

```ts
test('off shows Mati, the start buttons and the hint, but no add buttons')
  // box text 'Mati', aria-pressed 'false'; text contains '1 jam', '2 jam', '∞', 'menit', 'Klik kotak: 1 jam'; no '+15 m'
test('clicking the box when off starts one hour')        // act.start called with 60
test('the duration buttons start 60, 120 and no limit')  // start(60), start(120), start(null)
test('typed minutes start on Enter only when they are 1–1440')
  // '45' + Enter → start(45) and the field empties; '0', '1441', '', 'abc', '1.5' + Enter → no call; '45' without Enter → no call
test('on with an end shows the time left, the end clock and the add buttons')
  // update({ on: true, until: at1520, forever: false, text: '1:42' }): box '1:42', aria-pressed 'true',
  // text contains 'Menyala sampai 15.20' and 'Klik kotak untuk mematikan'; '+15 m'/'+30 m'/'+1 jam' call add(15/30/60); no '2 jam'
test('clicking the box when on stops')                    // act.stop called, act.start not
test('no limit shows ∞ and no add buttons')               // text '∞', 'Menyala tanpa batas', no '+15 m'
test('the end clock follows the language')               // endClock(at1520,'id') === '15.20', endClock(at1520,'en') === '15:20'
```

and in `src/bridge-browser-awake.test.ts`: `test('the browser stand-in starts, adds and stops like the app')` — `start {minutes: 60}` → `on`, `until ≈ now + 3_600_000`, text `'1:00'`; `add {minutes: 15}` → text `'1:15'`; `stop` → `on false`; `start {minutes: null}` → `forever`, text `'∞'`.

- [ ] **Step 2: Run to see them fail.** `npx vitest run modules/keep-awake src/bridge-browser-awake.test.ts` → module not found.

- [ ] **Step 3: Implement** `view.ts`, `style.css`, the locales, `icon.svg` (stroke `#000`, like system-stat's), `manifest.json`, `index.html` (copy of system-stat's with `<div id="ka"></div>`), and `main.ts`: `connectKit`, `renderPage`, read at once and every `POLL_MS` (after each answer, like `modules/system-stat/poll.ts`), actions call `kit.call('awake', …)` and pass the returned `AwakeView` to `update`. The number field must not lose what is being typed when the poll updates the page (only rebuild the right column when `on`/`forever` changes). `bridge-browser-awake.ts`: `fakeAwake(): (method: string, args: unknown) => AwakeView` using `Date.now()` with the same text rules (h:mm / Nm / ∞, minutes rounded up, 24 h cap); `bridge-browser.ts` routes `capability === 'awake'` to it.

- [ ] **Step 4: Run the web suite and the module build.**

Run: `npx tsc --noEmit && npm test && npm run build:modules`
Expected: all pass; "module keep-awake built".

- [ ] **Step 5: Look at it in the browser** (`npm run dev`, open `/?notch=1`, open the panel, Modul → Keep awake): off, 1 jam, +15 m, ∞ and back off all match mockup B; Modul tile shows "Awake".

- [ ] **Step 6: Commit**

```bash
git add modules/keep-awake modules/index.json src/bridge-browser-awake.ts src/bridge-browser-awake.test.ts src/bridge-browser.ts
git commit -m "feat(keep-awake): the module page from mockup B, and a browser stand-in"
```

### Task 5: Full check and device run prep

**Files:** none new (fixes only, each with its own failing test first).

- [ ] **Step 1: Full suites.**

Run: `npx tsc --noEmit && npm test` and `export PATH="$HOME/.cargo/bin:$PATH" && npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all pass (web above 335, Rust above 174).

- [ ] **Step 2: Dev run on this Mac.** Back up `~/Library/Application Support/id.web.notching/{settings,reminders}.json`, make sure no other Notching runs, `npm run tauri dev`. Start 1 minute via the typed field, check `pmset -g assertions` lists `Notching keep awake` (`PreventUserIdleDisplaySleep`), wait for the end: notice "Keep awake selesai", the assertion is gone, the tile is grey and the status beside the notch is gone. Start ∞, switch the module off in Pengaturan → Modul: the assertion and the status go at once.

- [ ] **Step 3: Commit any fixes** with their tests, explicit paths only.
