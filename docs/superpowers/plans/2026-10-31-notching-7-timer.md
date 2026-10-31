# Timer and Thin Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A built-in Timer module (countdown 1–60 min, pause, stop, notice when done, running status beside the notch) and a new optional "strip" slot under a page's 4-column row, where Timer's strip widget gives one-gesture access through preset buttons and a draggable orange ruler.

**Architecture:** The countdown lives in the Rust core (`timer.rs` pure logic, `timer_service.rs` thread + glue), copied from Keep awake's pattern without the power assertion, so it lasts while the panel is closed. Pages gain an optional `strip` widget ref (manifest widgets of width 4); the notch draws it under the row with a dotted line and the page editor places it. The module package `modules/timer/` has one entry that draws either the strip (`kit.widget === 'strip'`) or the module page, reads `timer.read` once a second and animates the ruler between readings.

**Tech Stack:** Tauri 2, Rust, vanilla TypeScript, vite module builds (`scripts/build-modules.mjs`), vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-31-timer-design.md` (with `2026-10-30-halaman-widget-design.md` §4–5, §7–8 and the Keep awake design for the service pattern).

## Global Constraints

- Durations: whole minutes 1–60 (`MAX_MINUTES = 60`); start outside that range is refused (`"minutes must be 1–60"`). Presets **3m, 5m, 10m, 25m**. Default (fresh launch, never started) **5** minutes; idle ruler sits at the last started minutes.
- One timer at a time; starting while running or paused replaces it. States: `idle`, `running` (wall-clock `until`), `paused` (`left` ms). Paused time is not reduced by Mac sleep.
- Ruler: 1–60, one tick per minute, longer tick every 5, small number every 10, fixed white centre mark, ticks orange `#FF6A1A` (≤ value full, > value at 35 % alpha), faded ends. Dragging changes the value in whole minutes; release after the pointer moved ≥ 3 px starts at that value; a plain click starts nothing. Dragging while running or paused restarts at the new value on release.
- Running: red dot, ruler slides back to 0 with the time left, number `m:ss` per second (`6:42`, `60:00`), buttons **Jeda** / **Stop** (paused: **Lanjut** / **Stop**). Idle: presets + ruler + dim number. Done or stopped: back to idle.
- Status beside the notch: `Activity::Running` while running or paused; text `m:ss`, seconds rounded up, refreshed every second while running, frozen while paused. ≤ 6 chars (`STATUS_MAX`).
- Notice channel `done`, default on + sound; title "Timer selesai", detail "{minutes} menit sudah habis" (en "Timer done" / "{minutes} min are up"), `{minutes}` = last started minutes. No notice on stop. Wall-clock end: a Mac that slept past it ends on the next check and still posts the notice. Notice click opens the Timer page (channel has no `widget`).
- Module switched off or uninstalled: timer stops, status cleared, no notice. State never written to disk.
- Module id `timer`, catalog order after `keep-awake`, no permissions, capabilities `timer`, `status`, `notify`; widget `strip` (width 4, kind `work`). Icon: line stopwatch.
- Strip slot: at most one per page, only Beranda and custom pages, not added to Beranda by default. Page with a present strip is `STRIP_GAP + STRIP_HEIGHT` = 20 + 40 px taller (104 → 164); strip whose package is off/away: hidden, page back to 104, ref kept. Full view of a row widget hides the strip.
- Manifest widget widths: 1, 2 or 4 (4 = strip). Old settings files without `strip` load unchanged.
- Editor: strip area under the preview row ("Strip" when empty, × to remove); strip cards span 4 cells; click places, or replaces another strip; a card already placed is disabled "Sudah dipasang". No dragging for strip cards or the strip slot.
- Repo rules: `export PATH="$HOME/.cargo/bin:$PATH"` and `npm run build:modules` before cargo; never close an nspanel panel; module/page CSS must not use the frame classes `.main`, `.status`, `.card`, `.label` (prefix `tm-`); commit explicit paths only, never `.claude/` or `.superpowers/`.

## Review Focus

1. **Mac asleep past the end** — ends at once on wake, notice once, never resumes the old remaining time. Test `a_clock_jump_past_the_end_ends_at_once` (Task 1).
2. **Module switched off/uninstalled while running or paused** — timer and status go, no notice. `module_gone` glue in Task 2; test `stop_reports_the_owner_once` (Task 1); device check.
3. **A click on the ruler without dragging** — starts nothing. Test `a click on the ruler without moving starts nothing` (Task 7).
4. **Settings files from before this plan, and a strip whose package is gone** — load and keep the ref; panel height drops back. Tests `pages_without_a_strip_still_load` (Task 3) and `a strip whose source is off is hidden and the page is not taller` (Task 4).
5. **Dragging past either end of the ruler** — clamps to 1 and 60. Test `drag minutes clamp to 1–60` (Task 7).

---

### Task 1: Timer logic (`timer.rs`)

**Files:**
- Create: `src-tauri/src/timer.rs`
- Modify: `src-tauri/src/lib.rs` (`mod timer;`)

**Interfaces:**
- Produces:
  - `pub const MAX_MINUTES: u32 = 60; pub const DEFAULT_MINUTES: u32 = 5; pub const WAIT_MAX_MS: i64 = 60_000;`
  - `pub enum TimerError { BadMinutes, NotRunning, NotPaused }`, Display: `"minutes must be 1–60"`, `"the timer is not running"`, `"the timer is not paused"`.
  - `#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)] #[serde(rename_all = "lowercase")] pub enum TimerState { Idle, Running, Paused }`
  - `#[derive(Clone, Debug, PartialEq, serde::Serialize)] #[serde(rename_all = "camelCase")] pub struct TimerDto { pub state: TimerState, pub minutes: u32, pub until: Option<i64>, pub left: Option<i64>, pub text: Option<String> }` — `minutes` the last started (or default); `until` only running; `left` ms for running and paused; `text` the status text when not idle.
  - `#[derive(Clone)] pub struct Timer` with `Default` (minutes 5, idle). Private `owner: Option<String>`, `phase` (`Idle | Running { until } | Paused { left }`), `minutes: u32`, `shown: Option<String>` (as `Awake`).
  - `Timer::start(&mut self, owner: &str, now: i64, minutes: u32) -> Result<(), TimerError>`
  - `Timer::pause(&mut self, now: i64) -> Result<(), TimerError>`; `Timer::resume(&mut self, now: i64) -> Result<(), TimerError>`
  - `Timer::stop(&mut self) -> Option<String>`; `Timer::owner(&self) -> Option<&str>`
  - `Timer::end_if_due(&mut self, now: i64) -> Option<(String, u32)>` — owner and minutes.
  - `Timer::view(&self, now: i64) -> TimerDto`
  - `#[derive(Debug, PartialEq)] pub enum Step { Off, Ended { owner: String, minutes: u32 }, Clear(String), On { owner: String, text: String, wait_ms: i64 } }`; `Timer::step(&mut self, now: i64) -> Step`
  - `pub fn status_text(left_ms: i64) -> String` — `m:ss`, seconds rounded up, at least `0:01`.

- [ ] **Step 1: Write the failing tests** (`const S: i64 = 1_000; const M: i64 = 60_000; const T: i64 = 1_000_000_000;`):

```rust
#[test] fn start_takes_1_to_60_minutes() {
    let mut t = Timer::default();
    assert_eq!(t.start("t", T, 0), Err(TimerError::BadMinutes));
    assert_eq!(t.start("t", T, 61), Err(TimerError::BadMinutes));
    assert_eq!(t.owner(), None);
    assert_eq!(t.view(T).minutes, DEFAULT_MINUTES);
    t.start("t", T, 60).unwrap();
    assert_eq!(t.view(T), TimerDto { state: TimerState::Running, minutes: 60, until: Some(T + 60 * M), left: Some(60 * M), text: Some("60:00".into()) });
}
#[test] fn starting_again_replaces_the_timer() {
    let mut t = Timer::default();
    t.start("t", T, 10).unwrap();
    t.pause(T + M).unwrap();
    t.start("t", T + M, 3).unwrap();
    assert_eq!(t.view(T + M).until, Some(T + 4 * M));
}
#[test] fn pause_keeps_what_is_left_and_resume_goes_on_from_it() {
    let mut t = Timer::default();
    assert_eq!(t.pause(T), Err(TimerError::NotRunning));
    assert_eq!(t.resume(T), Err(TimerError::NotPaused));
    t.start("t", T, 10).unwrap();
    t.pause(T + 3 * M + 18 * S).unwrap();
    // Time asleep or waiting does not count while paused.
    let v = t.view(T + 500 * M);
    assert_eq!((v.state, v.until, v.left, v.text.as_deref()), (TimerState::Paused, None, Some(6 * M + 42 * S), Some("6:42")));
    assert_eq!(t.pause(T + 500 * M), Err(TimerError::NotRunning));
    t.resume(T + 500 * M).unwrap();
    assert_eq!(t.view(T + 500 * M).until, Some(T + 500 * M + 6 * M + 42 * S));
}
#[test] fn status_text_is_minutes_and_seconds_rounded_up() {
    assert_eq!(status_text(6 * M + 42 * S), "6:42");
    assert_eq!(status_text(6 * M + 41 * S + 1), "6:42");
    assert_eq!(status_text(60 * M), "60:00");
    assert_eq!(status_text(9 * S), "0:09");
    assert_eq!(status_text(1), "0:01");
}
#[test] fn step_waits_until_the_next_second() {
    let mut t = Timer::default();
    assert_eq!(t.step(T), Step::Off);
    t.start("t", T, 5).unwrap();
    assert_eq!(t.step(T + 300), Step::On { owner: "t".into(), text: "5:00".into(), wait_ms: 700 });
    t.pause(T + 300).unwrap();
    assert_eq!(t.step(T + 300), Step::On { owner: "t".into(), text: "5:00".into(), wait_ms: WAIT_MAX_MS });
}
#[test] fn it_ends_once_at_its_time_with_its_minutes() {
    let mut t = Timer::default();
    t.start("t", T, 1).unwrap();
    assert!(matches!(t.step(T + M - 1), Step::On { wait_ms: 1, .. }));
    assert_eq!(t.step(T + M), Step::Ended { owner: "t".into(), minutes: 1 });
    assert_eq!(t.step(T + M), Step::Off);
    let v = t.view(T + M);
    assert_eq!((v.state, v.minutes, v.text), (TimerState::Idle, 1, None));
}
#[test] fn a_clock_jump_past_the_end_ends_at_once() {
    let mut t = Timer::default();
    t.start("t", T, 25).unwrap();
    assert_eq!(t.view(T + 180 * M).state, TimerState::Idle);
    assert_eq!(t.pause(T + 180 * M), Err(TimerError::NotRunning));
    assert_eq!(t.end_if_due(T + 180 * M), Some(("t".into(), 25)));
    assert_eq!(t.end_if_due(T + 180 * M), None);
}
#[test] fn a_status_shown_is_cleared_once_after_a_stop() {
    let mut t = Timer::default();
    t.start("t", T, 5).unwrap();
    assert!(matches!(t.step(T), Step::On { .. }));
    t.stop();
    assert_eq!(t.step(T), Step::Clear("t".into()));
    assert_eq!(t.step(T), Step::Off);
}
#[test] fn stop_reports_the_owner_once_and_keeps_the_minutes() {
    let mut t = Timer::default();
    assert_eq!(t.stop(), None);
    t.start("t", T, 25).unwrap();
    assert_eq!(t.stop(), Some("t".into()));
    assert_eq!(t.stop(), None);
    assert_eq!(t.view(T).minutes, 25);
}
#[test] fn errors_read_plainly() {
    assert_eq!(TimerError::BadMinutes.to_string(), "minutes must be 1–60");
    assert_eq!(TimerError::NotRunning.to_string(), "the timer is not running");
    assert_eq!(TimerError::NotPaused.to_string(), "the timer is not paused");
}
```

- [ ] **Step 2: Run to see them fail** — `export PATH="$HOME/.cargo/bin:$PATH"; npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml timer::` → compile errors (no `timer` module).
- [ ] **Step 3: Implement `timer.rs`** following `awake.rs`: `end_if_due` is the only place a due run ends; `view`, `pause` treat a due run as idle; `step` sets `shown` like `Awake::step`. Running `wait_ms = left - (secs - 1) * 1000` with `secs = ceil(left / 1000)`, capped at `WAIT_MAX_MS`.
- [ ] **Step 4: Run** the same command → all `timer::` tests PASS.
- [ ] **Step 5: Commit** — `git add src-tauri/src/timer.rs src-tauri/src/lib.rs && git commit -m "feat(timer): countdown logic in the core"`

### Task 2: Timer service, capability and gate

**Files:**
- Create: `src-tauri/src/timer_service.rs`
- Modify: `src-tauri/src/lib.rs` (`mod timer_service;`, `timer_service::start(app.handle().clone());` next to `awake_service::start`), `src-tauri/src/modules/manifest.rs` (`Capability::Timer`, serde `"timer"`), `src-tauri/src/modules/gate.rs`, `src-tauri/src/module_commands.rs`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `pub fn start(app: AppHandle)`; `pub fn read(app: &AppHandle) -> TimerDto`; `pub fn begin(app: &AppHandle, owner: &str, minutes: u32) -> Result<TimerDto, String>`; `pub fn pause(app: &AppHandle) -> Result<TimerDto, String>`; `pub fn resume(app: &AppHandle) -> Result<TimerDto, String>`; `pub fn stop(app: &AppHandle) -> TimerDto`; `pub fn module_gone(app: &AppHandle, id: &str)`.
  - Gate `Call::{TimerRead, TimerStart, TimerPause, TimerResume, TimerStop}` for capability `timer`, methods `read`, `start`, `pause`, `resume`, `stop`. `start` args `{ "minutes": u32 }`.

- [ ] **Step 1: Write the failing gate test** in `gate.rs`:

```rust
#[test]
fn the_timer_needs_its_capability() {
    let t = entry("timer", &[Capability::Timer, Capability::Status, Capability::Notify], true);
    for (method, call) in [("read", Call::TimerRead), ("start", Call::TimerStart), ("pause", Call::TimerPause),
        ("resume", Call::TimerResume), ("stop", Call::TimerStop)] {
        assert_eq!(authorize(Some(&t), "timer", "timer", method), Ok(call));
    }
    assert_eq!(authorize(Some(&t), "timer", "timer", "add"), Err(CallError::UnknownMethod("add".into())));
    let k = entry("keep-awake", &[Capability::Awake], true);
    assert!(matches!(authorize(Some(&k), "keep-awake", "timer", "start"), Err(CallError::NotDeclared { .. })));
}
```

- [ ] **Step 2: Run** `cargo test --manifest-path src-tauri/Cargo.toml gate::` → FAIL (no `Capability::Timer`).
- [ ] **Step 3: Implement** the capability, gate arms, and `timer_service.rs` as a copy of `awake_service.rs` without `Hold`: thread `"notching-timer"`; `Step::On` → `status::set(app, &owner, Activity::Running, Some(&text))`; `finish(app, owner, minutes)` clears the status and posts channel `done` with `module_text(owner, "notice.done.title")` (fallback `"Timer"`) and `module_text(owner, "notice.done.detail")` with `{minutes}` replaced; every call settles a due run first (`settle`/`after` as in Keep awake) and pokes the thread. In `module_commands.rs`: dispatch the five calls (`#[derive(serde::Deserialize)] struct TimerStartArgs { minutes: u32 }`, parsed with `parse_args(args, "timer.start")`, owner `module_id`), and call `crate::timer_service::module_gone(&app, &id)` beside each `awake_service::module_gone`.
- [ ] **Step 4: Run** `cargo test --manifest-path src-tauri/Cargo.toml` → all PASS (189 + Task 1 + this).
- [ ] **Step 5: Commit** — `git add src-tauri/src/timer_service.rs src-tauri/src/lib.rs src-tauri/src/modules/manifest.rs src-tauri/src/modules/gate.rs src-tauri/src/module_commands.rs && git commit -m "feat(timer): the core runs the timer, with status, notice and gate"`

### Task 3: The strip in pages and manifests (Rust)

**Files:**
- Modify: `src-tauri/src/pages.rs`, `src-tauri/src/modules/manifest.rs`, `src-tauri/src/app_core.rs` (`set_page`), `src-tauri/src/page_commands.rs` (`set_page`), `src-tauri/src/settings.rs` (test only)

**Interfaces:**
- Produces:
  - `pub const STRIP_WIDTH: u8 = 4;` in `pages.rs`.
  - `Page { ..., #[serde(default)] pub strip: Option<String> }` — a widget ref; `beranda()` has `None`.
  - `PageError::BadStrip`, Display `"the strip takes a strip widget"`.
  - `pages::set_page(pages, id, name, icon, widgets, strip: Option<String>, width_of)`; `AppCore::set_page(&mut self, id, name, icon, widgets, strip: Option<String>)`; command `set_page(..., widgets, strip: Option<String>)` (JS sends `strip`).
  - Manifest widgets accept `width` 1, 2 or 4.

- [ ] **Step 1: Write the failing tests**

In `pages.rs`:
```rust
fn strips(r: &str) -> Option<u8> { if r == "timer/strip" { Some(4) } else { known(r) } }
#[test]
fn a_page_takes_one_strip_widget() {
    let mut pages = vec![beranda(), custom("p1", vec![])];
    assert_eq!(set_page(&mut pages, "p1", Some("Kerja"), "dot", vec![], Some("timer/strip".into()), &strips), Ok(()));
    assert_eq!(pages[1].strip.as_deref(), Some("timer/strip"));
    // A row widget cannot be the strip, and the strip widget cannot sit in the row.
    assert_eq!(set_page(&mut pages, "p1", Some("Kerja"), "dot", vec![], Some("a/a".into()), &strips), Err(PageError::BadStrip));
    assert_eq!(set_page(&mut pages, "p1", Some("Kerja"), "dot", vec![p("timer/strip", 0, 4)], None, &strips), Err(PageError::BadLayout));
    assert_eq!(set_page(&mut pages, "p1", Some("Kerja"), "dot", vec![], Some("x/y".into()), &strips), Err(PageError::UnknownWidget("x/y".into())));
    assert_eq!(set_page(&mut pages, "home", None, "home", vec![], Some("timer/strip".into()), &strips), Ok(()));
    assert_eq!(pages[0].strip.as_deref(), Some("timer/strip"));
}
#[test]
fn a_strip_whose_source_is_gone_keeps_its_place() {
    let mut pages = vec![beranda(), Page { strip: Some("timer/strip".into()), ..custom("p1", vec![]) }];
    assert_eq!(set_page(&mut pages, "p1", Some("Kerja"), "dot", vec![], Some("timer/strip".into()), &known), Ok(()));
    assert_eq!(repair(pages.clone())[1].strip.as_deref(), Some("timer/strip"));
}
```
(Update the existing `set_page` calls in `pages.rs` and `app_core.rs` tests with a `None` strip argument, and `PageError::BadStrip` in `errors_read_plainly`.)

In `manifest.rs`: `a strip widget is 4 wide` — a manifest with `"widgets":[{"id":"strip","entry":"index.html","width":4,"kind":"work"}]` parses; width `3` gives `Err(ManifestError::BadWidget)`.

In `settings.rs`: `pages_without_a_strip_still_load` — the existing v2 fixture without `strip` loads with `strip == None` on every page, and a page with `"strip":"timer/strip"` keeps it after `load`.

- [ ] **Step 2: Run** `cargo test --manifest-path src-tauri/Cargo.toml` → FAIL to compile (new argument, field, variant).
- [ ] **Step 3: Implement**: strip check in `pages::set_page` — `Some(r)`: `width_of(r) == Some(STRIP_WIDTH)` ok, `Some(_)` → `BadStrip`, `None` → kept only if the page already had that strip, else `UnknownWidget(r)`; row widgets unchanged (a width-4 catalog widget fails `fits`). `repair` keeps `strip` as it is. Manifest check `matches!(w.width, 1 | 2 | STRIP_WIDTH)` (import from `crate::pages` or a local `4` with a comment).
- [ ] **Step 4: Run** `cargo test --manifest-path src-tauri/Cargo.toml` → PASS.
- [ ] **Step 5: Commit** — `git add src-tauri/src/pages.rs src-tauri/src/modules/manifest.rs src-tauri/src/app_core.rs src-tauri/src/page_commands.rs src-tauri/src/settings.rs && git commit -m "feat(pages): an optional strip widget under the row"`

### Task 4: The strip in the notch

**Files:**
- Modify: `src/modules/types.ts`, `src/pages/layout.ts`, `src/pages/route.ts`, `src/notch/page-view.ts`, `src/notch/pages.css`
- Test: `src/pages/layout.test.ts`, `src/pages/route.test.ts`, `src/notch/page-view.test.ts`

**Interfaces:**
- Produces:
  - `Page.strip?: string | null` (absent or null: none); `WidgetInfo.width` comment "1 or 2 columns, or 4 for a strip".
  - `layout.ts`: `export const STRIP_WIDTH = 4;` `export function stripSlot(page: Page, catalog: Map<string, CatalogWidget>): Slot | null` — null without `page.strip`; else `{ placement: { widget: page.strip, col: 0, width: 4 }, widget: catalog.get(page.strip) ?? null }`.
  - `route.ts`: `export const STRIP_GAP = 20; export const STRIP_HEIGHT = 40;` PageView custom variant gains `strip: CatalogWidget | null` (the present strip widget, from `resolvePage`/`pickPage`); `viewSize` custom base height `CUSTOM_PAGE.height + (v.strip ? STRIP_GAP + STRIP_HEIGHT : 0)`, and a full view is clamped between that base and `FULL_PAGE_MAX`; `noticeTarget` also finds a page whose `strip` is the widget.
  - `page-view.ts`: a custom page with a present strip renders `.pg-page` holding `.pg-row`, `.pg-strip-line` and `.pg-strip` (frame key `${page.id}/strip/${ref}`, height `STRIP_HEIGHT`, widget id from the catalog); `.pg-page.full` hides the line and the strip.

- [ ] **Step 1: Write the failing tests**

`route.test.ts`:
```ts
test('a page with a strip is taller, unless the strip is away', () => {
  const page: Page = { ...BERANDA, strip: 'timer/strip' };
  const timer = moduleInfo('timer', { widgets: [{ id: 'strip', name: 'Timer', entry: 'index.html', width: 4, kind: 'work' }] });
  const on = state({ pages: [page], modules: [homeWidgets(), timer] });
  expect(viewSize(pickPage(on, null, false))).toEqual({ width: 520, height: 164 });
  expect(viewSize(pickPage(on, null, false), 120)).toEqual({ width: 520, height: 164 });
  expect(viewSize(pickPage(on, null, false), 200)).toEqual({ width: 520, height: 200 });
  const off = state({ pages: [page], modules: [homeWidgets(), { ...timer, enabled: false }] });
  expect(viewSize(pickPage(off, null, false))).toEqual({ width: 520, height: 104 });
});
```
`layout.test.ts`: `stripSlot` returns null for a page without a strip, the catalog widget for `timer/strip` when its module is on, and `widget: null` with the ref kept when it is off.

`page-view.test.ts`:
```ts
test('a strip sits under the row behind a dotted line, and a full view hides it', () => {
  const { content, pv, show } = mount();
  const s = { ...TEST_STATE, pages: [{ ...BERANDA, strip: 'timer/strip' }], modules: [...TEST_STATE.modules, timerInfo()] };
  show(s);
  expect(content.querySelector('.pg-strip-line')).not.toBeNull();
  const strip = content.querySelector<HTMLElement>('.pg-strip')!;
  expect(strip.querySelector('iframe')!.style.height).toBe('40px');
  pv.expand(slots(content)[2].dataset.key!);
  expect(content.querySelector('.pg-page')!.classList.contains('full')).toBe(true);
});
test('a strip whose source is off is hidden and the page is not taller', () => {
  const { content, show } = mount();
  show({ ...TEST_STATE, pages: [{ ...BERANDA, strip: 'timer/strip' }] });
  expect(content.querySelector('.pg-strip')).toBeNull();
});
```
(`timerInfo()` is a local helper: `moduleInfo('timer', { widgets: [{ id: 'strip', name: 'Timer', entry: 'index.html', width: 4, kind: 'work' }] })`.)

- [ ] **Step 2: Run** `npx vitest run src/pages src/notch/page-view.test.ts` → FAIL.
- [ ] **Step 3: Implement.** CSS in `pages.css`: `.pg-strip-line` is the horizontal dotted line (same radial-gradient dots as `.pg-slot + .pg-slot::before`, `5px 3px repeat-x`, 3 px tall, centred in `STRIP_GAP`), `.pg-strip` is `STRIP_HEIGHT` tall; `.pg-page.full .pg-strip-line, .pg-page.full .pg-strip { display: none; }`. A page with no row widgets but a strip shows an empty 104 px row above the strip; `pageEmpty` only when both are empty. `expand`/`collapse` toggle `full` on `.pg-page` as well as the row.
- [ ] **Step 4: Run** `npx tsc --noEmit && npm test` → PASS.
- [ ] **Step 5: Commit** — `git add src/modules/types.ts src/pages/layout.ts src/pages/route.ts src/notch/page-view.ts src/notch/pages.css src/pages/layout.test.ts src/pages/route.test.ts src/notch/page-view.test.ts && git commit -m "feat(notch): a page's strip under the row"`

### Task 5: The strip in the page editor

**Files:**
- Modify: `src/settings/types.ts` (`setPage(id, name, icon, widgets, strip: string | null)`), `src/settings/bridge-tauri.ts` (sends `strip`), `src/settings/bridge-browser.ts`, `src/settings/test-helpers.ts`, `src/settings/pages/page-editor.ts`, `src/settings/pages/widget-preview.ts`, `src/settings/pages/pages.ts` (count includes the strip), `src/settings/settings.css`, `src/i18n/id.json`, `src/i18n/en.json` (`settings.pages.strip`: "Strip" / "Strip")
- Test: `src/settings/pages/page-editor.test.ts`, `src/settings/pages/pages.test.ts`

**Interfaces:**
- Consumes: Task 4 (`STRIP_WIDTH`, `stripSlot`).
- Produces: `bridge.setPage(id, name, icon, widgets, strip)`; editor `data-key`s `pageEdit.strip` (the strip area) and `pageEdit.remove.<ref>` for its ×.

- [ ] **Step 1: Write the failing tests** in `page-editor.test.ts` (with a state whose catalog has `timer/strip`, width 4):
  - `the strip area says Strip when empty and a strip card fills it` — `.ed-strip-empty` text "Strip"; clicking `[data-key="pageEdit.widget.timer/strip"]` calls `setPage('p1', 'Kerja', 'briefcase', <same widgets>, 'timer/strip')`.
  - `a placed strip shows its sample with a remove button and its card is disabled` — page with `strip: 'timer/strip'`: `.ed-strip` exists, its × calls `setPage(..., null)`, the card has `aria-disabled="true"` and "Sudah dipasang".
  - `another strip widget replaces the strip` — a second catalog strip `x/bar`: clicking it sends `strip: 'x/bar'`.
  - `row widgets still go to the row` — clicking a 1-column card sends the existing strip unchanged.
  In `pages.test.ts`: a page with two widgets and a strip lists "3 widget".
- [ ] **Step 2: Run** `npx vitest run src/settings` → FAIL.
- [ ] **Step 3: Implement.** In `preview()`, after the row cells add `.ed-strip-line` (grid row 2, columns 1 / -1) and either `.ed-strip` (grid row 3, `widgetSample`, ×, `.off` + `sourceOff` when the package is away) or `.ed-strip-empty` (`s.strip`); these classes must not be `.ed-slot`/`.ed-empty`, so `markColumns` and drags ignore them. In `widgetList()`, a card with `w.width === STRIP_WIDTH` is disabled only when `page.strip === w.ref`, clicks `save({ ...page, strip: w.ref })`, and gets no drag. `save` passes `next.strip ?? null`. `widgetSample` case `'timer/strip'`: a label "Timer", the chips `3m 5m 10m 25m` as small text and `5:00`. CSS: `.ed-widget[data-width="4"] { grid-column: span 4; }`, `.ed-shot[data-width="4"]` four cells wide and strip-height, `.ed-strip`/`.ed-strip-empty` 40 px tall (the empty one dashed like `.ed-empty`).
- [ ] **Step 4: Run** `npx tsc --noEmit && npm test` → PASS.
- [ ] **Step 5: Commit** — `git add src/settings src/i18n/id.json src/i18n/en.json && git commit -m "feat(settings): place a strip widget in the page editor"`

### Task 6: Browser stand-in for the timer

**Files:**
- Create: `src/bridge-browser-timer.ts`, `src/bridge-browser-timer.test.ts`
- Modify: `src/bridge-browser.ts` (`if (capability === 'timer') return timerCall(method, args);`)

**Interfaces:**
- Consumes: `TimerView` from Task 7's `modules/timer/view.ts` (same shape as `TimerDto`: `{ state: 'idle' | 'running' | 'paused'; minutes: number; until: number | null; left: number | null; text: string | null }`). Write the type in `modules/timer/view.ts` in this task if Task 7 is not done yet.
- Produces: `export function fakeTimer(now?: () => number): (method: string, args: unknown) => TimerView` — same rules as `timer.rs` (1–60, pause/resume, ends when due), text from a shared `formatLeft`.

- [ ] **Step 1: Write the failing test**: start 5 → running with `until = now + 300000`, text `5:00`; pause after 18 s → paused, `left` 282000, text `4:42`; resume; past the end → idle with `minutes` 5; `start` with 0 or 61 throws `minutes must be 1–60`; unknown method throws.
- [ ] **Step 2: Run** `npx vitest run src/bridge-browser-timer.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git add src/bridge-browser-timer.ts src/bridge-browser-timer.test.ts src/bridge-browser.ts modules/timer/view.ts && git commit -m "feat(timer): a stand-in for the browser preview"`

### Task 7: The Timer module package

**Files:**
- Create: `modules/timer/manifest.json`, `icon.svg`, `index.html` (`<div id="tm"></div>`), `main.ts`, `ruler.ts`, `ruler.test.ts`, `view.ts`, `view.test.ts`, `style.css`, `locales/id.json`, `locales/en.json`
- Modify: `modules/index.json` (append `"timer"`), any test that lists the bundled catalog (`grep -rn '"keep-awake"' src src-tauri/src` to find them)

**Interfaces:**
- Consumes: capability `timer` (Task 2), kit (`connectKit`, `dotText`, `BIG_PITCH`).
- Produces:
  - `manifest.json`: `{"id":"timer","version":"1.0.0","entry":"index.html","icon":"icon.svg","card":{"width":520,"height":96},"permissions":[],"capabilities":["timer","status","notify"],"notifications":[{"id":"done","on":true,"sound":true}],"widgets":[{"id":"strip","entry":"index.html","width":4,"kind":"work"}]}`
  - `ruler.ts`: `export const MIN_MINUTES = 1, MAX_MINUTES = 60, PX_PER_MINUTE = 8, DRAG_PX = 3, PRESETS = [3, 5, 10, 25];` `export function dragMinutes(start: number, dx: number): number` (round(start − dx / PX_PER_MINUTE), clamped); `export function formatLeft(ms: number): string` (as Rust `status_text`); `export function shownMinutes(v: TimerView, now: number): number` (idle: `minutes`; running: `(until − now) / 60000` floored at 0; paused: `left / 60000`).
  - `view.ts`: `export interface TimerView` (above); `export interface Actions { start(minutes: number): void; pause(): void; resume(): void; stop(): void }`; `export function renderTimer(root: HTMLElement, s: Strings, act: Actions, big: boolean): { update(v: TimerView): void; tick(now: number): void }`.
  - Locales (id): `name` "Timer", `shortName` "Timer", `description` "Hitung mundur", `widgets.strip` "Timer", `channels.done` "Timer selesai", `notice.done.title` "Timer selesai", `notice.done.detail` "{minutes} menit sudah habis", `label` "Timer", `pause` "Jeda", `resume` "Lanjut", `stop` "Stop", `ruler` "Menit". (en: "Timer", "Timer", "Countdown", "Timer", "Timer done", "Timer done", "{minutes} min are up", "Timer", "Pause", "Resume", "Stop", "Minutes".)

- [ ] **Step 1: Write the failing tests**

`ruler.test.ts`:
```ts
test('drag minutes clamp to 1–60', () => {
  expect(dragMinutes(10, -40)).toBe(15);
  expect(dragMinutes(10, 40)).toBe(5);
  expect(dragMinutes(10, 9999)).toBe(1);
  expect(dragMinutes(10, -9999)).toBe(60);
});
test('formatLeft matches the status beside the notch', () => {
  expect(formatLeft(402_000)).toBe('6:42');
  expect(formatLeft(401_001)).toBe('6:42');
  expect(formatLeft(3_600_000)).toBe('60:00');
  expect(formatLeft(1)).toBe('0:01');
});
```
`view.test.ts` (jsdom; pointer events dispatched on `.tm-ruler`):
  - `idle shows the presets, the ruler and a dim time` — `update({ state: 'idle', minutes: 5, ... })`: buttons "3m" "5m" "10m" "25m", `.tm-time` "5:00" with class `tm-dim`, no "Jeda", no `.tm-red`.
  - `a preset starts at once` — click "10m" → `act.start(10)`.
  - `dragging the ruler and letting go starts at the new value` — pointerdown x=200, pointermove x=160, pointerup → `act.start(10)` from `minutes: 5`; during the move `.tm-time` reads "10:00".
  - `a click on the ruler without moving starts nothing` — pointerdown/up at the same x (and a 2 px move) → `act.start` not called.
  - `running shows the red dot, the time left and Jeda/Stop` — running view with `until = now + 402000`, `tick(now)` → `.tm-time` "6:42", buttons "Jeda" and "Stop", no presets; click "Jeda" → `act.pause()`; "Stop" → `act.stop()`.
  - `paused shows Lanjut` — click "Lanjut" → `act.resume()`.
  - `the ruler follows the minutes shown` — the tape's `transform` is `translateX(${width / 2 - minutes * 8}px)` for the shown minutes, ticks with minute ≤ value carry `tm-on`.
  - `the big page draws the time in dots` — `big = true` adds `.tm-big` containing an `svg`.
  - `the icon is a line drawing` — `icon.svg` has `viewBox="0 0 24 24"` and `stroke`.
- [ ] **Step 2: Run** `npx vitest run modules/timer` → FAIL.
- [ ] **Step 3: Implement.** `view.ts`: the row is `[.tm-red?][.tm-lab TIMER][presets | nothing][.tm-ruler][.tm-time][Jeda/Lanjut + Stop]`; presets and buttons are rebuilt only when `state` changes; the ruler is a fixed-width window with a tape of 60 tick elements (index m = 1…60, `tm-big` every 5, a number every 10) moved by `transform`, a centre `.tm-mark`, and a mask fading both ends; `tick(now)` re-reads `shownMinutes` (skipped while dragging) and moves the tape and the number; pointer drag uses `setPointerCapture`, `dragMinutes`, and starts only when the pointer moved ≥ `DRAG_PX`. `big`: a top line with the large dot time (`dotText(formatLeft(...), BIG_PITCH)`, redrawn only when the text changes) above the same row. `main.ts`: `connectKit`, `renderTimer(root, strings, act, kit.widget !== 'strip')`, `read` every `POLL_MS = 1000` like Keep awake, and a `requestAnimationFrame` loop calling `tick(Date.now())`; each action's reply goes to `update`. `style.css`: black-panel styles with the `tm-` prefix; ticks `#FF6A1A`, dim ticks `rgba(255,106,26,.35)`, mark `#fff`, `.tm-red` `var(--red)` from kit, strip row 40 px tall.
- [ ] **Step 4: Run** `npx tsc --noEmit && npm test && npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml` → PASS (`module timer built` in the output).
- [ ] **Step 5: Commit** — `git add modules/timer modules/index.json <catalog tests touched> && git commit -m "feat(timer): the Timer module with its strip"`

### Task 8: Final checks, release build and verification notes

**Files:**
- Create: `docs/superpowers/verification/2026-10-31-notching-7-timer.md`
- Modify: `docs/superpowers/specs/2026-10-30-halaman-widget-design.md` (§5 Timer row: "Strip Timer, lihat desain 31 Oktober Timer")

- [ ] **Step 1:** `npx tsc --noEmit && npm test` and `npm run build:modules && cargo test --manifest-path src-tauri/Cargo.toml` → all pass; record counts.
- [ ] **Step 2:** Browser check (`npm run dev`): add the Timer strip to a page in the settings preview, drag the ruler, see it run; screenshot.
- [ ] **Step 3:** One fresh review of the whole branch on the most capable model; fix Important findings, list minors.
- [ ] **Step 4:** Release build `npm run tauri build -- --bundles app` (not installed to /Applications); back up `~/Library/Application Support/id.web.notching/{settings,reminders}.json` before running it.
- [ ] **Step 5:** Device check with the owner on the MacBook Air M4, each item confirmed from settings.json / logs / the status text, not from "semua cocok": add strip to Beranda; preset start; ruler drag start; click on ruler starts nothing; pause/resume; stop (no notice); done notice with sound; status beside the notch with the stopwatch icon, per second; red dot on the Modul tile; Timer page; module off while running clears the status; sleep past the end.
- [ ] **Step 6:** Write the verification notes and commit them with the halaman design edit.
