//! Cmd+Shift+4's picker (design 1 Nov §3): one see-through panel per screen
//! showing pick.html. The window under the cursor is highlighted; a click takes
//! that window, a drag takes an area, Esc cancels. Like the dim layer's, these
//! panels are never closed, only ordered out (main thread only).

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::ptr::NonNull;
use std::sync::Mutex;
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::MainThreadMarker;
use objc2_app_kit::{NSEvent, NSEventMask, NSWindowAnimationBehavior};
use objc2_foundation::{NSPoint, NSRect, NSSize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, EventTarget, LogicalSize, Size, WebviewUrl, WebviewWindow};
use tauri_nspanel::{CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel, StyleMask};

use crate::geometry::{to_cg, Rect};
use crate::notify::{window_list, WindowBox};
use crate::screens::current_screens;
use crate::shot::{Kind, Target};
use crate::shot_service;

/// Above the dim layer (keyclean_dim::DIM_LEVEL) and the notch panels.
pub const PICK_LEVEL: i64 = 27;
/// To each pick panel as it shows: `PickState`.
pub const PICK_EVENT: &str = "notching://pick";
/// The panels are ordered out this long before the capture, so none is in it.
const PICK_SETTLE: Duration = Duration::from_millis(120);

mod panel {
    tauri_nspanel::tauri_panel! {
        panel!(PickPanel {
            config: {
                can_become_key_window: true,
                is_floating_panel: true
            }
        })
    }
}
use panel::PickPanel;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum PickMode {
    /// ⌘⇧4: click a window or drag an area.
    Both,
    /// The list page's Window button: clicks only.
    Window,
    /// The list page's Area button: drags only, no window highlight.
    Area,
}

/// What the page picked, in its panel's local points (origin top-left of that screen).
#[derive(Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum PickChoice {
    Window { number: u32 },
    Area { x: f64, y: f64, w: f64, h: f64 },
}

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
pub struct PickWindow {
    pub number: u32,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

/// One panel's picture of the screen: other apps' normal windows front to back,
/// and the cursor when it was on this screen as the picker opened.
#[derive(Serialize, Clone, PartialEq, Debug)]
pub struct PickState {
    pub mode: PickMode,
    pub windows: Vec<PickWindow>,
    pub cursor: Option<Point>,
}

struct Shown {
    screen: usize,
    /// The screen's AppKit frame, to find the panel under the cursor.
    frame: Rect,
    /// The screen's CG global frame when the picker opened; the page's points are relative to it.
    cg: Rect,
    state: PickState,
}

// The pick panels by label while the picker is up; None while it is down.
static SHOWN: Mutex<Option<HashMap<String, Shown>>> = Mutex::new(None);

thread_local! {
    // Esc and mouse-move monitors, while the picker is up (`watch_events`).
    static MONITORS: RefCell<Vec<Retained<AnyObject>>> = const { RefCell::new(Vec::new()) };
    static KEY_SCREEN: Cell<Option<usize>> = const { Cell::new(None) };
}

fn label(index: usize) -> String {
    format!("pick-{index}")
}

/// Layer-0 windows of other apps that reach into the screen with CG frame
/// `screen_cg`, front to back as given, in that screen's local points.
pub fn local_windows(windows: &[WindowBox], own_pid: i32, screen_cg: Rect) -> Vec<PickWindow> {
    let s = screen_cg;
    windows
        .iter()
        .filter(|w| w.layer == 0 && w.pid != own_pid)
        .filter(|w| w.bounds.x < s.max_x() && w.bounds.max_x() > s.x && w.bounds.y < s.max_y() && w.bounds.max_y() > s.y)
        .map(|w| PickWindow { number: w.number, x: w.bounds.x - s.x, y: w.bounds.y - s.y, w: w.bounds.w, h: w.bounds.h })
        .collect()
}

/// The capture for a choice made on the panel of the screen with CG frame `screen_cg`.
pub fn target(choice: PickChoice, screen_cg: Rect) -> (Target, Kind) {
    match choice {
        PickChoice::Window { number } => (Target::Window { number }, Kind::Window),
        PickChoice::Area { x, y, w, h } => {
            (Target::Area { rect: Rect { x: screen_cg.x + x, y: screen_cg.y + y, w, h } }, Kind::Area)
        }
    }
}

/// Opens the picker on every screen; the cursor's panel becomes key for Esc.
/// Does nothing while it is already up or the module is off. Without Screen
/// Recording access it does not open: macOS is asked and the notch says why, as
/// for a capture. Main thread only.
pub fn show(app: &AppHandle, mode: PickMode) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    // A second ⌘⇧4 while the picker is up. Only the main thread opens it, so
    // nothing can open it between this check and the end of `show`.
    if SHOWN.lock().unwrap().is_some() || !shot_service::enabled(app) {
        return;
    }
    if !shot_service::screen_access() {
        shot_service::refused(app);
        return;
    }
    let screens = current_screens(mtm);
    let primary = screens.first().map_or(0.0, |s| s.frame.h);
    let windows = window_list();
    let own = std::process::id() as i32;
    let p = NSEvent::mouseLocation();
    let cursor_screen = screens.iter().position(|s| s.frame.contains(p.x, p.y)).unwrap_or(0);
    let mut panels = Vec::new();
    let mut map = HashMap::new();
    for screen in &screens {
        let label = label(screen.index);
        let panel = match app.get_webview_panel(&label) {
            Ok(p) => p,
            Err(_) => match create(app, &label) {
                Ok(p) => p,
                Err(e) => {
                    eprintln!("notching: picker {label} failed: {e}");
                    continue;
                }
            },
        };
        let f = screen.frame;
        panel.as_panel().setFrame_display(NSRect::new(NSPoint::new(f.x, f.y), NSSize::new(f.w, f.h)), true);
        let cg = to_cg(f, primary);
        let cursor = (screen.index == cursor_screen).then(|| Point { x: p.x - f.x, y: f.max_y() - p.y });
        let state = PickState { mode, windows: local_windows(&windows, own, cg), cursor };
        map.insert(label.clone(), Shown { screen: screen.index, frame: f, cg, state: state.clone() });
        panels.push((label, panel, state));
    }
    if map.is_empty() {
        return;
    }
    *SHOWN.lock().unwrap() = Some(map);
    for (label, panel, state) in &panels {
        let _ = app.emit_to(EventTarget::webview_window(label), PICK_EVENT, state);
        panel.order_front_regardless();
    }
    if let Some((_, panel, _)) = panels.iter().find(|(l, ..)| *l == label(cursor_screen)) {
        panel.show_and_make_key();
        KEY_SCREEN.set(Some(cursor_screen));
    }
    watch_events(app, true);
}

/// Orders every pick panel out and removes the event monitors. Any thread.
pub fn hide(app: &AppHandle) {
    if MainThreadMarker::new().is_none() {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || hide(&handle));
        return;
    }
    SHOWN.lock().unwrap().take();
    watch_events(app, false);
    for index in 0..16 {
        if let Ok(panel) = app.get_webview_panel(&label(index)) {
            panel.hide();
        }
    }
}

/// ⌘⇧3 while the picker is up: it goes first, and the capture waits until it is
/// off the screen. Returns how long to wait (zero when it was not up). Main thread.
pub fn hide_for_capture(app: &AppHandle) -> Duration {
    if SHOWN.lock().unwrap().is_none() {
        return Duration::ZERO;
    }
    hide(app);
    PICK_SETTLE
}

/// Esc's key code (kVK_Escape), as keyclean_tap.rs has it.
const KEY_ESCAPE: u16 = 53;

/// The native way out, so a page that never loaded or lost its WebContent process
/// cannot leave the panels over every screen.
fn is_cancel_key(key_code: u16) -> bool {
    key_code == KEY_ESCAPE
}

// While the picker is up: Esc ends it natively, and key status follows the cursor
// from screen to screen, because WebKit tracks hover and the cursor shape only in
// the key window (moves only: a drag stays with its panel). `hide` removes every
// monitor, and it is the only way the picker ends.
fn watch_events(app: &AppHandle, on: bool) {
    MONITORS.with(|m| {
        let mut m = m.borrow_mut();
        for token in m.drain(..) {
            unsafe { NSEvent::removeMonitor(&token) };
        }
        if !on {
            KEY_SCREEN.set(None);
            return;
        }
        // Keys reach us while a pick panel is key. The event goes on to the page too,
        // whose own Esc lands on an already hidden picker. `hide` is queued rather
        // than run here, since it removes this very monitor.
        let handle = app.clone();
        let keys = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
            if is_cancel_key(unsafe { event.as_ref() }.keyCode()) {
                let app = handle.clone();
                let _ = handle.run_on_main_thread(move || hide(&app));
            }
            event.as_ptr()
        });
        let keys = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::KeyDown, &keys) };
        m.extend(keys);
        // Moves over our panels while the app is active, and the rest while it is not.
        let handle = app.clone();
        let local = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
            key_to_cursor(&handle);
            event.as_ptr()
        });
        let handle = app.clone();
        let global = RcBlock::new(move |_: NonNull<NSEvent>| key_to_cursor(&handle));
        let local = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::MouseMoved, &local) };
        let global = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(NSEventMask::MouseMoved, &global);
        m.extend(local.into_iter().chain(global));
    });
}

fn key_to_cursor(app: &AppHandle) {
    let p = NSEvent::mouseLocation();
    let screen = {
        let shown = SHOWN.lock().unwrap();
        shown.as_ref().and_then(|m| m.values().find(|s| s.frame.contains(p.x, p.y)).map(|s| s.screen))
    };
    let Some(screen) = screen.filter(|&s| KEY_SCREEN.get() != Some(s)) else { return };
    if let Ok(panel) = app.get_webview_panel(&label(screen)) {
        panel.show_and_make_key();
        KEY_SCREEN.set(Some(screen));
    }
}

fn create(app: &AppHandle, label: &str) -> tauri::Result<std::sync::Arc<dyn tauri_nspanel::Panel>> {
    let panel = PanelBuilder::<_, PickPanel>::new(app, label)
        .url(WebviewUrl::App("pick.html".into()))
        .size(Size::Logical(LogicalSize::new(800.0, 600.0)))
        .level(PanelLevel::Custom(PICK_LEVEL as i32))
        .collection_behavior(
            CollectionBehavior::new().can_join_all_spaces().stationary().ignores_cycle().full_screen_auxiliary(),
        )
        .style_mask(StyleMask::empty().borderless().nonactivating_panel())
        .transparent(true)
        .has_shadow(false)
        .no_activate(true)
        .hides_on_deactivate(false)
        .accepts_mouse_moved_events(true)
        .with_window(|w| {
            w.accept_first_mouse(true).transparent(true).decorations(false).visible(false).focused(false).skip_taskbar(true)
        })
        .build()?;
    // Gone at once when ordered out, with no fade for the settle wait to outlast.
    panel.as_panel().setAnimationBehavior(NSWindowAnimationBehavior::None);
    Ok(panel)
}

/// The list page's Window and Area buttons (Task 6).
#[tauri::command]
pub fn shot_pick(app: AppHandle, mode: PickMode) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || show(&handle, mode));
}

/// The state this panel shows, for a page that loaded after the event went out.
#[tauri::command]
pub fn shot_pick_state(window: WebviewWindow) -> Option<PickState> {
    SHOWN.lock().unwrap().as_ref()?.get(window.label()).map(|s| s.state.clone())
}

/// A click or a drag on `window`'s page: the panels go, and once they are off the
/// screen the capture is taken on a thread of its own.
#[tauri::command]
pub fn shot_pick_done(app: AppHandle, window: WebviewWindow, choice: PickChoice) {
    // Taking the state ends the pick, so a second choice from any panel is ignored.
    let Some(shown) = SHOWN.lock().unwrap().take().and_then(|mut m| m.remove(window.label())) else { return };
    hide(&app);
    let (target, kind) = target(choice, shown.cg);
    shot_service::take_after(&app, target, kind, shown.screen, PICK_SETTLE);
}

/// Esc.
#[tauri::command]
pub fn shot_pick_cancel(app: AppHandle) {
    hide(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    // A second screen left of and above the main one, as in Displays settings.
    const SIDE: Rect = Rect { x: -1920.0, y: -300.0, w: 1920.0, h: 1080.0 };
    const MAIN: Rect = Rect { x: 0.0, y: 0.0, w: 1470.0, h: 956.0 };

    fn win(number: u32, pid: i32, layer: i64, x: f64, y: f64) -> WindowBox {
        WindowBox { number, pid, layer, bounds: Rect { x, y, w: 400.0, h: 300.0 } }
    }

    #[test]
    fn windows_are_other_apps_normal_ones_in_local_points() {
        let list = [
            win(1, 9, 25, 100.0, 100.0), // menu bar item
            win(2, 1, 0, 100.0, 100.0),  // Notching's own
            win(3, 9, 0, 100.0, 50.0),
            win(4, 8, 0, -1500.0, -200.0), // on SIDE only
            win(5, 8, 0, 200.0, 80.0),
        ];
        let main = local_windows(&list, 1, MAIN);
        assert_eq!(main.iter().map(|w| w.number).collect::<Vec<_>>(), [3, 5]);
        assert_eq!(main[0], PickWindow { number: 3, x: 100.0, y: 50.0, w: 400.0, h: 300.0 });
        let side = local_windows(&list, 1, SIDE);
        assert_eq!(side, [PickWindow { number: 4, x: 420.0, y: 100.0, w: 400.0, h: 300.0 }]);
    }

    #[test]
    fn a_window_across_two_screens_shows_on_both() {
        let list = [win(6, 9, 0, -200.0, 10.0)];
        assert_eq!(local_windows(&list, 1, MAIN)[0].x, -200.0);
        assert_eq!(local_windows(&list, 1, SIDE)[0].x, 1720.0);
        // Touching an edge is not reaching in.
        assert!(local_windows(&[win(7, 9, 0, 1470.0, 0.0)], 1, MAIN).is_empty());
    }

    #[test]
    fn an_area_goes_back_to_global_points_on_any_screen() {
        let area = PickChoice::Area { x: 10.0, y: 20.0, w: 300.0, h: 200.0 };
        let (t, kind) = target(area, SIDE);
        assert_eq!(kind, Kind::Area);
        assert!(matches!(t, Target::Area { rect } if rect == Rect { x: -1910.0, y: -280.0, w: 300.0, h: 200.0 }));
        let (t, _) = target(area, MAIN);
        assert!(matches!(t, Target::Area { rect } if rect == Rect { x: 10.0, y: 20.0, w: 300.0, h: 200.0 }));
        let (t, kind) = target(PickChoice::Window { number: 42 }, SIDE);
        assert_eq!(kind, Kind::Window);
        assert!(matches!(t, Target::Window { number: 42 }));
    }

    #[test]
    fn only_esc_cancels_natively() {
        assert!(is_cancel_key(53));
        assert!(!is_cancel_key(36)); // Return
        assert!(!is_cancel_key(21)); // 4, held with ⌘⇧ to open the picker
    }

    #[test]
    fn the_page_and_the_core_agree_on_json() {
        let c: PickChoice = serde_json::from_value(serde_json::json!({ "kind": "window", "number": 7 })).unwrap();
        assert_eq!(c, PickChoice::Window { number: 7 });
        let c: PickChoice =
            serde_json::from_value(serde_json::json!({ "kind": "area", "x": 1, "y": 2, "w": 3, "h": 4 })).unwrap();
        assert_eq!(c, PickChoice::Area { x: 1.0, y: 2.0, w: 3.0, h: 4.0 });
        let m: PickMode = serde_json::from_value(serde_json::json!("area")).unwrap();
        assert_eq!(m, PickMode::Area);
        let state = PickState {
            mode: PickMode::Both,
            windows: vec![PickWindow { number: 3, x: 1.0, y: 2.0, w: 3.0, h: 4.0 }],
            cursor: Some(Point { x: 5.0, y: 6.0 }),
        };
        assert_eq!(
            serde_json::to_value(state).unwrap(),
            serde_json::json!({
                "mode": "both",
                "windows": [{ "number": 3, "x": 1.0, "y": 2.0, "w": 3.0, "h": 4.0 }],
                "cursor": { "x": 5.0, "y": 6.0 }
            })
        );
    }
}
