//! Windows and Linux: one transparent overlay window at the top centre of each
//! chosen monitor. There is no notch, so the page runs in its no-notch mode.
//!
//! Outside its hit areas a window lets every click through. One polling thread
//! follows the cursor: while it is inside a hit area the window catches the mouse
//! and the page hears "notch://pointer", like the macOS pointer router sends.
//! The same thread watches the monitors and rebuilds the overlays when they change.
//!
//! Locks: no tauri call is made while the Overlays lock is held. Getters such as
//! cursor_position wait for the main thread, and the main thread takes that lock.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::thread::Thread;
use std::time::{Duration, Instant};

use tauri::{
    AppHandle, Emitter, EventTarget, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use crate::geometry::{pick_screens, Rect, OVERLAY_H, OVERLAY_W};

/// Same events as the macOS side (pointer.rs, overlay.rs).
const POINTER_EVENT: &str = "notch://pointer";
const RESIGN_KEY_EVENT: &str = "notch://resign-key";

// Cursor checks: often while it is over an overlay window, less often elsewhere.
const NEAR_POLL: Duration = Duration::from_millis(16);
const FAR_POLL: Duration = Duration::from_millis(48);
const MONITOR_POLL: Duration = Duration::from_secs(2);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenInfoDto {
    pub label: String,
    pub has_notch: bool,
    pub notch_width: f64,
    pub notch_height: f64,
}

#[derive(Clone, serde::Serialize)]
struct PointerPayload {
    inside: bool,
    x: f64,
    y: f64,
}

/// A monitor's place in the virtual desktop, physical px.
#[derive(Clone, Copy, Debug, PartialEq)]
struct MonitorGeom {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    scale: f64,
}

pub struct OverlayEntry {
    pub monitor_name: String,
    /// Hit areas in CSS px, origin at the window's top-left.
    pub css_rects: Vec<Rect>,
    monitor: MonitorGeom,
    /// The window's top-left in physical px, and its scale: CSS px = physical / scale.
    origin: (f64, f64),
    scale: f64,
    /// Cursor inside a hit area at the last check (the window then catches the
    /// mouse), and where it was in CSS px.
    inside: bool,
    last: (f64, f64),
}

/// Live overlays by window label.
#[derive(Default)]
pub struct Overlays(pub Mutex<HashMap<String, OverlayEntry>>);

/// Names of the connected monitors, each once, primary first: the choices in
/// the settings window.
#[derive(Default)]
pub struct ConnectedScreens(pub Mutex<Vec<String>>);

struct Screen {
    name: String,
    label: String,
    geom: MonitorGeom,
}

// The polling thread, woken early when hit areas change.
static POLLER: OnceLock<Thread> = OnceLock::new();

fn geom_of(m: &Monitor) -> MonitorGeom {
    let (p, s) = (m.position(), m.size());
    MonitorGeom { x: p.x, y: p.y, w: s.width, h: s.height, scale: m.scale_factor() }
}

/// Windows names monitors "\\.\DISPLAY1"; the prefix means nothing to people.
fn display_name(name: Option<&str>, index: usize) -> String {
    match name.map(|n| n.trim_start_matches("\\\\.\\").trim()) {
        Some(n) if !n.is_empty() => n.to_string(),
        _ => format!("Display {}", index + 1),
    }
}

/// "notch-" and the name with only label-safe characters, unique among `taken`.
/// From the name rather than the index, so a monitor keeps its window when
/// another one is plugged in before it.
fn unique_label(name: &str, taken: &[String]) -> String {
    let slug: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '_' { c } else { '-' }).collect();
    let base = format!("notch-{}", slug.trim_matches('-'));
    let mut label = base.clone();
    let mut n = 2;
    while taken.contains(&label) {
        label = format!("{base}-{n}");
        n += 1;
    }
    label
}

fn current_screens(app: &AppHandle) -> tauri::Result<Vec<Screen>> {
    let mut monitors = app.available_monitors()?;
    // Primary first, like NSScreen order on macOS: "first screen" fallbacks land there.
    if let Ok(Some(primary)) = app.primary_monitor() {
        let key = geom_of(&primary);
        monitors.sort_by_key(|m| geom_of(m) != key);
    }
    let mut labels: Vec<String> = Vec::new();
    let mut screens = Vec::new();
    for (i, m) in monitors.iter().enumerate() {
        let name = display_name(m.name().map(String::as_str), i);
        let label = unique_label(&name, &labels);
        labels.push(label.clone());
        screens.push(Screen { name, label, geom: geom_of(m) });
    }
    Ok(screens)
}

/// What the monitor poll compares: the set of monitors and where they are.
fn monitor_signature(app: &AppHandle) -> Option<Vec<(Option<String>, MonitorGeom)>> {
    let monitors = app.available_monitors().ok()?;
    Some(monitors.iter().map(|m| (m.name().cloned(), geom_of(m))).collect())
}

/// Window frame in physical px: overlay size at the monitor's scale, centred,
/// touching the top edge.
fn frame_px(m: MonitorGeom) -> (i32, i32, u32, u32) {
    let w = (OVERLAY_W * m.scale).round();
    let h = (OVERLAY_H * m.scale).round();
    let x = m.x + ((m.w as f64 - w) / 2.0).round() as i32;
    (x, m.y, w as u32, h as u32)
}

/// Matches overlay windows to the chosen monitors: moves the ones that stay,
/// creates the missing ones and destroys those whose monitor went away.
pub fn rebuild_overlays(app: &AppHandle) -> tauri::Result<()> {
    let screens = current_screens(app)?;
    let mut names: Vec<String> = Vec::new();
    for s in &screens {
        if !names.contains(&s.name) {
            names.push(s.name.clone());
        }
    }
    *app.state::<ConnectedScreens>().0.lock().unwrap() = names;

    // One lock at a time: the choice first, then the overlays.
    let choice = app.state::<crate::app_core::CoreState>().0.lock().unwrap().screen().map(String::from);
    let all: Vec<&str> = screens.iter().map(|s| s.name.as_str()).collect();
    let keep = pick_screens(&all, choice.as_deref());

    let overlays = app.state::<Overlays>();
    let mut kept: Vec<String> = Vec::new();
    for screen in screens.into_iter().enumerate().filter(|(i, _)| keep.contains(i)).map(|(_, s)| s) {
        kept.push(screen.label.clone());
        // A monitor that fails is skipped, not the rest after it.
        if let Err(e) = place_screen(app, &overlays, screen) {
            eprintln!("notching: overlay failed: {e}");
        }
    }

    let gone: Vec<String> = {
        let mut map = overlays.0.lock().unwrap();
        let gone = map.keys().filter(|l| !kept.contains(l)).cloned().collect::<Vec<_>>();
        map.retain(|l, _| kept.contains(l));
        gone
    };
    for label in gone {
        // destroy, not close: close is refused for overlays (see watch_window).
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.destroy();
        }
    }
    Ok(())
}

fn place_screen(app: &AppHandle, overlays: &Overlays, screen: Screen) -> tauri::Result<()> {
    let (x, y, w, h) = frame_px(screen.geom);
    // The entry goes in before the window exists, so the page's first
    // get_screen_info always finds it. Hit areas survive a move.
    let before = {
        let mut map = overlays.0.lock().unwrap();
        let before = map.get(&screen.label).map(|e| e.monitor);
        let entry = map.entry(screen.label.clone()).or_insert_with(|| OverlayEntry {
            monitor_name: screen.name.clone(),
            css_rects: Vec::new(),
            monitor: screen.geom,
            origin: (x as f64, y as f64),
            scale: screen.geom.scale,
            inside: false,
            last: (-1.0, -1.0),
        });
        entry.monitor_name = screen.name.clone();
        entry.monitor = screen.geom;
        before
    };

    let window = match app.get_webview_window(&screen.label) {
        Some(_) if before == Some(screen.geom) => return Ok(()),
        Some(window) => window,
        None => create_window(app, &screen.label, screen.geom)?,
    };
    // Physical size and position: logical ones are ambiguous across monitors
    // with different scales.
    window.set_size(PhysicalSize::new(w, h))?;
    window.set_position(PhysicalPosition::new(x, y))?;
    // Read back: the window manager has the last word on where it went.
    let origin = window.outer_position().map(|p| (p.x as f64, p.y as f64)).unwrap_or((x as f64, y as f64));
    let scale = window.scale_factor().unwrap_or(screen.geom.scale);
    if let Some(e) = overlays.0.lock().unwrap().get_mut(&screen.label) {
        e.origin = origin;
        e.scale = scale;
    }
    Ok(())
}

fn create_window(app: &AppHandle, label: &str, m: MonitorGeom) -> tauri::Result<WebviewWindow> {
    let (x, y, _, _) = frame_px(m);
    let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("Notching")
        .inner_size(OVERLAY_W, OVERLAY_H)
        // Close to the target already; place_screen sets the exact physical spot.
        .position(x as f64 / m.scale, y as f64 / m.scale)
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible_on_all_workspaces(true)
        // Shown without taking focus: a later show() on Windows would activate it.
        .visible(true)
        .focused(false);
    // Linux: the overlay takes keyboard focus only while the panel is open (set_key).
    #[cfg(not(windows))]
    let builder = builder.focusable(false);
    let window = builder.build()?;
    window.set_ignore_cursor_events(true)?;
    watch_window(app, &window);
    #[cfg(target_os = "linux")]
    allow_camera(&window);
    Ok(window)
}

// Losing focus (a click outside) closes the panel, as losing key status does on
// macOS. Alt+F4 must not take a monitor's notch away.
fn watch_window(app: &AppHandle, window: &WebviewWindow) {
    let app = app.clone();
    let label = window.label().to_string();
    window.on_window_event(move |event| match event {
        WindowEvent::Focused(false) => {
            let _ = app.emit_to(EventTarget::webview_window(&label), RESIGN_KEY_EVENT, ());
        }
        WindowEvent::CloseRequested { api, .. } => api.prevent_close(),
        _ => {}
    });
}

/// Mirror's getUserMedia: WebKitGTK ships with media streams off and denies
/// the camera unless the app answers its permission request.
#[cfg(target_os = "linux")]
fn allow_camera(window: &WebviewWindow) {
    let _ = window.with_webview(|webview| {
        use webkit2gtk::glib::prelude::*;
        use webkit2gtk::{PermissionRequestExt, SettingsExt, UserMediaPermissionRequest, WebViewExt};
        let view = webview.inner();
        if let Some(settings) = view.settings() {
            settings.set_enable_media_stream(true);
            settings.set_enable_mediasource(true);
        }
        // Camera and microphone only; anything else gets WebKit's default (deny).
        view.connect_permission_request(|_, request| {
            if request.is::<UserMediaPermissionRequest>() {
                request.allow();
                return true;
            }
            false
        });
    });
}

pub fn screen_info(window: &WebviewWindow) -> Result<ScreenInfoDto, String> {
    let label = window.label().to_string();
    if !window.state::<Overlays>().0.lock().unwrap().contains_key(&label) {
        return Err(format!("unknown overlay {label}"));
    }
    Ok(ScreenInfoDto { label, has_notch: false, notch_width: 0.0, notch_height: 0.0 })
}

/// Stores the hit areas and wakes the poller, so click-through follows a hit
/// area that grows or shrinks under a still cursor.
pub fn set_hit_rects(app: &AppHandle, window: &WebviewWindow, rects: Vec<Rect>) {
    if let Some(entry) = app.state::<Overlays>().0.lock().unwrap().get_mut(window.label()) {
        entry.css_rects = rects;
    }
    if let Some(poller) = POLLER.get() {
        poller.unpark();
    }
}

/// `true` gives the overlay keyboard focus so Esc reaches the page. `false` has
/// no "hand key status back" call off macOS, so each platform does the nearest:
/// - Windows: the window that was in front when the cursor reached the notch is
///   brought back, if one of our overlays still has the focus.
/// - Linux: the overlay stops accepting focus and, if it has it, is hidden and
///   shown again, so the window manager hands focus to the window below.
pub fn set_key(app: &AppHandle, window: &WebviewWindow, key: bool) -> Result<(), String> {
    set_key_platform(app, window, key).map_err(|e| e.to_string())
}

#[cfg(windows)]
fn set_key_platform(app: &AppHandle, window: &WebviewWindow, key: bool) -> tauri::Result<()> {
    if key {
        return window.set_focus();
    }
    app.run_on_main_thread(foreground::restore)
}

#[cfg(not(windows))]
fn set_key_platform(app: &AppHandle, window: &WebviewWindow, key: bool) -> tauri::Result<()> {
    if key {
        window.set_focusable(true)?;
        return window.set_focus();
    }
    let focused = window.is_focused().unwrap_or(false);
    window.set_focusable(false)?;
    if focused {
        window.hide()?;
        window.show()?;
        // Keep click-through as it was before the round trip.
        let inside = app.state::<Overlays>().0.lock().unwrap().get(window.label()).is_some_and(|e| e.inside);
        window.set_ignore_cursor_events(!inside)?;
    }
    Ok(())
}

/// The window in front before an overlay took focus. Plain user32 calls, which
/// Tauri links already, so no extra crate.
#[cfg(windows)]
mod foreground {
    use std::sync::atomic::{AtomicIsize, Ordering};

    #[link(name = "user32")]
    unsafe extern "system" {
        fn GetForegroundWindow() -> isize;
        fn SetForegroundWindow(hwnd: isize) -> i32;
        fn IsWindow(hwnd: isize) -> i32;
        fn GetWindowThreadProcessId(hwnd: isize, pid: *mut u32) -> u32;
    }

    static PREVIOUS: AtomicIsize = AtomicIsize::new(0);

    fn ours(hwnd: isize) -> bool {
        let mut pid = 0u32;
        // SAFETY: plain query; an invalid handle only yields pid 0.
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        pid == std::process::id()
    }

    /// Called when the cursor enters a hit area, before any click can move focus.
    pub fn remember() {
        // SAFETY: no arguments, returns a handle or 0.
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd != 0 && !ours(hwnd) {
            PREVIOUS.store(hwnd, Ordering::Relaxed);
        }
    }

    /// Only while we are in front: a click on another app already moved focus there.
    pub fn restore() {
        let previous = PREVIOUS.swap(0, Ordering::Relaxed);
        // SAFETY: handles are checked with IsWindow before use; stale ones are skipped.
        unsafe {
            let front = GetForegroundWindow();
            if previous != 0 && front != 0 && ours(front) && IsWindow(previous) != 0 {
                SetForegroundWindow(previous);
            }
        }
    }
}

/// Starts the polling thread: the cursor about 60 times a second while it is
/// over an overlay window (about 20 elsewhere), the monitors every 2 s.
pub fn start(app: AppHandle) {
    if POLLER.get().is_some() {
        return;
    }
    let spawned = std::thread::Builder::new().name("notching-overlay".into()).spawn(move || poll(app));
    match spawned {
        Ok(handle) => {
            let _ = POLLER.set(handle.thread().clone());
        }
        Err(e) => eprintln!("notching: overlay poller failed to start: {e}"),
    }
}

fn poll(app: AppHandle) {
    let mut monitors = monitor_signature(&app);
    let mut checked = Instant::now();
    loop {
        let near = route(&app);
        std::thread::park_timeout(if near { NEAR_POLL } else { FAR_POLL });
        if checked.elapsed() >= MONITOR_POLL {
            checked = Instant::now();
            watch_monitors(&app, &mut monitors);
        }
    }
}

struct Route {
    label: String,
    inside: bool,
    changed: bool,
    x: f64,
    y: f64,
}

/// Hit-tests the cursor against every overlay: flips click-through on enter and
/// exit, and sends the position to the page while inside plus once on exit.
/// Returns true when the cursor is over some overlay window.
fn route(app: &AppHandle) -> bool {
    let overlays = app.state::<Overlays>();
    if overlays.0.lock().unwrap().is_empty() {
        return false;
    }
    let Ok(p) = app.cursor_position() else { return false };

    let mut near = false;
    let mut routes = Vec::new();
    {
        let mut map = overlays.0.lock().unwrap();
        for (label, e) in map.iter_mut() {
            let x = (p.x - e.origin.0) / e.scale;
            let y = (p.y - e.origin.1) / e.scale;
            near |= (0.0..=OVERLAY_W).contains(&x) && (0.0..=OVERLAY_H).contains(&y);
            let inside = e.css_rects.iter().any(|r| r.contains(x, y));
            let changed = inside != e.inside;
            let moved = (x, y) != e.last;
            e.inside = inside;
            e.last = (x, y);
            if changed || (inside && moved) {
                routes.push(Route { label: label.clone(), inside, changed, x, y });
            }
        }
    }

    for r in routes {
        if r.changed {
            #[cfg(windows)]
            if r.inside {
                foreground::remember();
            }
            if let Some(window) = app.get_webview_window(&r.label) {
                let _ = window.set_ignore_cursor_events(!r.inside);
            }
        }
        let payload = PointerPayload { inside: r.inside, x: r.x, y: r.y };
        let _ = app.emit_to(EventTarget::webview_window(&r.label), POINTER_EVENT, payload);
    }
    near
}

/// Rebuilds the overlays when the monitors change, and otherwise keeps each
/// window's position and scale fresh for hit-testing.
fn watch_monitors(app: &AppHandle, last: &mut Option<Vec<(Option<String>, MonitorGeom)>>) {
    let now = monitor_signature(app);
    if now.is_some() && now != *last {
        *last = now;
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Err(e) = rebuild_overlays(&handle) {
                eprintln!("notching: rebuilding overlays failed: {e}");
            }
        });
        return;
    }

    let labels: Vec<String> = app.state::<Overlays>().0.lock().unwrap().keys().cloned().collect();
    for label in labels {
        let Some(window) = app.get_webview_window(&label) else { continue };
        let (Ok(p), Ok(scale)) = (window.outer_position(), window.scale_factor()) else { continue };
        if let Some(e) = app.state::<Overlays>().0.lock().unwrap().get_mut(&label) {
            e.origin = (p.x as f64, p.y as f64);
            e.scale = scale;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_device_prefix_is_dropped() {
        assert_eq!(display_name(Some("\\\\.\\DISPLAY1"), 0), "DISPLAY1");
        assert_eq!(display_name(Some("eDP-1"), 0), "eDP-1");
        assert_eq!(display_name(None, 1), "Display 2");
        assert_eq!(display_name(Some("  "), 0), "Display 1");
    }

    #[test]
    fn labels_are_safe_and_unique() {
        let taken = vec!["notch-DISPLAY1".to_string()];
        assert_eq!(unique_label("DISPLAY1", &[]), "notch-DISPLAY1");
        assert_eq!(unique_label("DISPLAY1", &taken), "notch-DISPLAY1-2");
        assert_eq!(unique_label("Dell U2720Q (DP)", &[]), "notch-Dell-U2720Q--DP");
    }

    #[test]
    fn frame_is_centred_at_the_top_in_physical_px() {
        let m = MonitorGeom { x: -1920, y: 0, w: 1920, h: 1080, scale: 1.0 };
        assert_eq!(frame_px(m), (-1440, 0, 960, 560));
        let hi = MonitorGeom { x: 1920, y: 0, w: 3840, h: 2160, scale: 2.0 };
        assert_eq!(frame_px(hi), (1920 + 960, 0, 1920, 1120));
    }
}
