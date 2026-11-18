//! Fokus jendela's native side (design 18 Nov §5): ⌃⌥F and ⌃⌥⇧F, following the
//! window in use through NSWorkspace and Accessibility, the peek (a picture of
//! the window under the pointer) and the ⇧-click on the blur, letting drags
//! through, the notch icon and the permission notice.
//! Every screen has its own focus (owner, 18 Nov). The rules live in
//! focus_rules.rs, the panels in focus_layer.rs.
//!
//! While no screen's focus is on nothing listens: no observer, no monitor, no panel.

use std::cell::RefCell;
use std::ffi::c_void;
use std::ptr::NonNull;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex, OnceLock};
use std::time::{Duration, Instant};

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2::MainThreadMarker;
use objc2_app_kit::{
    NSEvent, NSEventMask, NSEventType, NSPasteboard, NSPasteboardNameDrag, NSWorkspace, NSWorkspaceActiveSpaceDidChangeNotification,
    NSWorkspaceDidActivateApplicationNotification,
};
use objc2_foundation::{NSNotification, NSObjectProtocol, NSOperationQueue, NSString};
use tauri::{AppHandle, Manager};

use crate::app_core::CoreState;
use crate::ax::{self, Cf};
use crate::focus_layer;
use crate::focus_rules::{blur_screens, window_at, windows_below, Below, Desk, Event, Layer, Win, WinId};
use crate::geometry::Rect;
use crate::peek_capture::{self, PictureSize};
use crate::shelf_watch::Watch;
use crate::status::{self, Activity};

pub const MODULE_ID: &str = "window-focus";

/// The permission notice, at most once a minute (design §7).
const NOTICE_EVERY: Duration = Duration::from_secs(60);

static APP: OnceLock<AppHandle> = OnceLock::new();
static DESK: LazyLock<Mutex<Desk>> = LazyLock::new(|| Mutex::new(Desk::default()));
static LAST_NOTICE: Mutex<Option<Instant>> = Mutex::new(None);
/// Pictures of the windows peeked at while the focus is on, in memory only.
static PICTURES: LazyLock<Mutex<HashMap<WinId, Arc<Vec<u8>>>>> = LazyLock::new(Mutex::default);
/// Bumped by every peek change, so a slow picture for an earlier one is dropped.
static PEEK_ROUND: AtomicU64 = AtomicU64::new(0);
/// NOTCHING_FOCUS_DEBUG set: every layer change goes to the log.
static DEBUG: LazyLock<bool> = LazyLock::new(|| std::env::var_os("NOTCHING_FOCUS_DEBUG").is_some());

macro_rules! debug {
    ($($arg:tt)*) => {
        if *DEBUG {
            eprintln!("notching: focus debug: {}", format!($($arg)*));
        }
    };
}


/// What is listening while some screen's focus is on. Main thread only.
#[derive(Default)]
struct Listening {
    workspace: Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>,
    monitor: Option<Retained<AnyObject>>,
    /// Accessibility observers, one per app: the active one and those of the picked windows.
    apps: Vec<(i32, ax::Observer)>,
}

thread_local! {
    static LISTENING: RefCell<Option<Listening>> = const { RefCell::new(None) };
    /// The window the peek is for, and whether its picture shows yet.
    static PEEK: RefCell<Option<(Below, bool)>> = const { RefCell::new(None) };
    static DRAG: RefCell<Watch> = RefCell::new(Watch::default());
    static DRAGGING: RefCell<bool> = const { RefCell::new(false) };
    static CLOCK: Instant = Instant::now();
}

fn now_ms() -> u64 {
    CLOCK.with(|c| c.elapsed().as_millis() as u64)
}

fn on_main(app: &AppHandle, run: impl FnOnce(&AppHandle) + Send + 'static) {
    let handle = app.clone();
    if MainThreadMarker::new().is_some() {
        run(&handle);
    } else {
        let _ = app.run_on_main_thread(move || run(&handle));
    }
}

pub fn enabled(app: &AppHandle) -> bool {
    app.state::<CoreState>().0.lock().unwrap().module(MODULE_ID).is_some_and(|e| e.installed && e.enabled)
}

fn dim(app: &AppHandle) -> f64 {
    app.state::<CoreState>().0.lock().unwrap().focus_settings().dim.alpha()
}

/// At launch: the panels' hooks.
pub fn start(app: &AppHandle) {
    let _ = APP.set(app.clone());
    focus_layer::init(focus_layer::Hooks { moved, left, clicked });
}

/// ⌃⌥F (`add` false) or ⌃⌥⇧F (`add` true) was pressed: it acts on the screen of
/// the window in use, else the pointer's. Main thread.
pub fn pressed(app: &AppHandle, add: bool) {
    if !crate::keyclean_tap::trusted(false) {
        eprintln!("notching: window focus key pressed without Accessibility");
        no_access(app);
        return;
    }
    let Some(mtm) = MainThreadMarker::new() else { return };
    let front = front_window();
    let Some(screen) = front.and_then(|w| screen_of(mtm, w)).or_else(|| pointer_screen(mtm)) else { return };
    send(app, screen, if add { Event::Add(front) } else { Event::Toggle(front) });
    finish(app);
}

/// Brings the blur in line with the tool and its settings, from any thread.
pub fn sync(app: &AppHandle) {
    on_main(app, |app| {
        if !DESK.lock().unwrap().is_on() {
            return;
        }
        if !enabled(app) {
            *DESK.lock().unwrap() = Desk::default();
        } else {
            let layers = DESK.lock().unwrap().layers();
            for (screen, layer) in layers {
                apply(app, screen, layer);
            }
        }
        finish(app);
    });
}

/// The screens changed while some focus may be on: the panels follow. Main thread.
pub fn screens_changed(app: &AppHandle) {
    let layers = DESK.lock().unwrap().layers();
    for (screen, layer) in layers {
        apply(app, screen, layer);
    }
}

/// ⌃⌥F without Accessibility: the notch says so, at most once a minute.
pub fn no_access(app: &AppHandle) {
    {
        let mut last = LAST_NOTICE.lock().unwrap();
        if last.is_some_and(|t| t.elapsed() < NOTICE_EVERY) {
            return;
        }
        *last = Some(Instant::now());
    }
    let text = |key: &str| app.state::<CoreState>().0.lock().unwrap().module_text(MODULE_ID, key).unwrap_or_default();
    if let Err(e) = crate::notify::post(app, MODULE_ID, "access", &text("notice.access.title"), &text("notice.access.detail")) {
        eprintln!("notching: the window-focus access notice was not sent: {e}");
    }
}

// ---- Windows and screens ----

fn active_pid() -> Option<i32> {
    NSWorkspace::sharedWorkspace().frontmostApplication().map(|a| a.processIdentifier())
}

/// The active app's focused window; none for the desktop or a full-screen window.
fn front_window() -> Option<Win> {
    let pid = active_pid()?;
    let window = ax::focused_window_only(&ax::app(pid)?)?;
    if ax::full_screen(&window) {
        return None;
    }
    Some(Win { id: ax::window_id(&window)?, pid })
}

/// One of the app's windows by its window server number.
fn window_element(pid: i32, id: WinId) -> Option<Cf> {
    ax::windows(&ax::app(pid)?).into_iter().find(|w| ax::window_id(w) == Some(id))
}

/// A window's frame, from the window server, else from Accessibility.
fn frame_of(w: Win) -> Option<Rect> {
    crate::notify::window_list().iter().find(|b| b.number == w.id).map(|b| b.bounds).or_else(|| window_element(w.pid, w.id).and_then(|e| ax::frame(&e)))
}

/// The screen holding most of `frame`.
fn screen_at(mtm: MainThreadMarker, frame: Rect) -> Option<usize> {
    blur_screens(&focus_layer::screens_cg(mtm), &[frame]).first().copied()
}

/// The screen a window is on.
fn screen_of(mtm: MainThreadMarker, w: Win) -> Option<usize> {
    frame_of(w).and_then(|f| screen_at(mtm, f))
}

/// The screen under the pointer.
fn pointer_screen(mtm: MainThreadMarker) -> Option<usize> {
    let (x, y) = focus_layer::pointer();
    screen_at(mtm, Rect { x, y, w: 1.0, h: 1.0 })
}

// ---- The rules and the screen ----

fn send(app: &AppHandle, screen: usize, e: Event) {
    let layer = DESK.lock().unwrap().step(screen, e);
    if let Some(layer) = layer {
        apply(app, screen, layer);
    }
}

/// One screen as the rules say. Main thread; `finish` follows.
fn apply(app: &AppHandle, screen: usize, layer: Layer) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    debug!("apply screen {screen}: {layer:?}");
    clear_peek(mtm, false);
    match layer {
        Layer::Off | Layer::Paused => focus_layer::hide_screen(mtm, screen),
        Layer::Shown { raise } => {
            listen(app);
            // A pair: both go up, the one in use last (design §5).
            if raise.len() > 1 {
                raise_all(&raise);
            }
            focus_layer::show_screen(mtm, screen, raise[0], dim(app));
        }
    }
}

/// After the screens changed: listening, the notch icon and the observers follow.
fn finish(app: &AppHandle) {
    if DESK.lock().unwrap().is_on() {
        listen(app);
        if let Err(e) = status::set_icon(app, MODULE_ID, Activity::On) {
            eprintln!("notching: window focus status: {e}");
        }
        rewatch();
    } else {
        if let Some(mtm) = MainThreadMarker::new() {
            focus_layer::hide(mtm);
        }
        let was = LISTENING.with(|l| l.borrow().is_some());
        PICTURES.lock().unwrap().clear();
        stop_listening();
        status::clear(app, MODULE_ID);
        if was {
            eprintln!("notching: window focus off");
        }
    }
}

/// Raises these picked windows, in this order.
fn raise_all(ids: &[WinId]) {
    let picked = DESK.lock().unwrap().picked_wins();
    for id in ids {
        if let Some(w) = picked.iter().find(|w| w.id == *id).and_then(|w| window_element(w.pid, w.id)) {
            ax::raise_only(&w);
        }
    }
}

// ---- Listening ----

fn listen(app: &AppHandle) {
    let started = LISTENING.with(|l| l.borrow().is_some());
    if started {
        return;
    }
    let mut listening = Listening::default();
    let center = NSWorkspace::sharedWorkspace().notificationCenter();
    // SAFETY: AppKit's notification names are static strings.
    for name in unsafe { [NSWorkspaceDidActivateApplicationNotification, NSWorkspaceActiveSpaceDidChangeNotification] } {
        let handle = app.clone();
        let block = RcBlock::new(move |_: NonNull<NSNotification>| front_changed(&handle));
        // SAFETY: the block lives as long as its observer, dropped when the mode ends.
        let observer = unsafe { center.addObserverForName_object_queue_usingBlock(Some(name), None, Some(&NSOperationQueue::mainQueue()), &block) };
        listening.workspace.push(observer);
    }
    let block = RcBlock::new(|event: NonNull<NSEvent>| {
        // SAFETY: AppKit passes a valid event for the call.
        on_mouse(unsafe { event.as_ref() });
    });
    listening.monitor = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(
        NSEventMask::LeftMouseDown | NSEventMask::LeftMouseDragged | NSEventMask::LeftMouseUp,
        &block,
    );
    LISTENING.with(|l| *l.borrow_mut() = Some(listening));
    eprintln!("notching: window focus on");
}

/// The active app or the Space changed: the screen of its window hears it; a
/// screen without focus leaves it alone (owner, 18 Nov).
fn front_changed(app: &AppHandle) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    let front = front_window();
    let screen = front.and_then(|w| screen_of(mtm, w)).or_else(|| pointer_screen(mtm));
    if let Some(screen) = screen {
        send(app, screen, Event::Front(front));
    }
    finish(app);
}

fn stop_listening() {
    let Some(listening) = LISTENING.with(|l| l.borrow_mut().take()) else { return };
    let center = NSWorkspace::sharedWorkspace().notificationCenter();
    for observer in &listening.workspace {
        // SAFETY: an observer this center returned.
        unsafe { center.removeObserver(observer.as_ref()) };
    }
    if let Some(token) = &listening.monitor {
        // SAFETY: a monitor NSEvent returned.
        unsafe { NSEvent::removeMonitor(token) };
    }
    if DRAGGING.with(|d| d.replace(false)) {
        if let Some(mtm) = MainThreadMarker::new() {
            focus_layer::pass_through(mtm, false);
        }
    }
}

/// Accessibility observers for the active app and the apps of the picked windows.
fn rewatch() {
    let (picked, mut pids) = {
        let desk = DESK.lock().unwrap();
        (desk.picked_wins(), desk.pids())
    };
    if let Some(active) = active_pid().filter(|p| !pids.contains(p)) {
        pids.insert(0, active);
    }
    LISTENING.with(|l| {
        let mut l = l.borrow_mut();
        let Some(listening) = l.as_mut() else { return };
        listening.apps.clear();
        for pid in pids {
            let (Some(observer), Some(app)) = (ax::Observer::new(pid, on_ax), ax::app(pid)) else { continue };
            for name in ["AXFocusedWindowChanged", "AXWindowCreated", "AXWindowMiniaturized"] {
                observer.watch(&app, name);
            }
            for w in picked.iter().filter(|w| w.pid == pid) {
                if let Some(element) = window_element(pid, w.id) {
                    observer.watch(&element, "AXUIElementDestroyed");
                    observer.watch(&element, "AXWindowMiniaturized");
                    observer.watch(&element, "AXMoved");
                }
            }
            listening.apps.push((pid, observer));
        }
    });
}

unsafe extern "C" fn on_ax(_observer: *const c_void, element: *const c_void, name: *const c_void, _refcon: *mut c_void) {
    let (Some(app), Some(mtm)) = (APP.get(), MainThreadMarker::new()) else { return };
    if name.is_null() {
        return;
    }
    // SAFETY: AX passes the notification's name, a CFString (toll-free bridged).
    let name = unsafe { &*(name as *const NSString) }.to_string();
    match name.as_str() {
        "AXFocusedWindowChanged" | "AXWindowCreated" => {
            let Some(element) = ax::borrowed(element) else { return };
            let Some(pid) = ax::pid_of(&element) else { return };
            if Some(pid) != active_pid() {
                return;
            }
            // The focused window, asked again when the element is the app itself.
            let id = ax::window_id(&element).or_else(|| ax::app(pid).and_then(|a| ax::focused_window_only(&a)).and_then(|w| ax::window_id(&w)));
            let Some(id) = id else { return };
            let win = Win { id, pid };
            let Some(screen) = screen_of(mtm, win) else { return };
            send(app, screen, if name == "AXWindowCreated" { Event::Created(win) } else { Event::Focused(win) });
            finish(app);
        }
        "AXMoved" => moved_window(app),
        _ => gone(app),
    }
}

/// A window closed or was minimized somewhere: every picked one no longer on screen is gone.
fn gone(app: &AppHandle) {
    let on_screen: Vec<u32> = crate::notify::window_list().iter().map(|w| w.number).collect();
    let picked = DESK.lock().unwrap().picked_wins();
    for w in picked.into_iter().filter(|w| !on_screen.contains(&w.id)) {
        let changes = DESK.lock().unwrap().gone(w.id);
        for (screen, layer) in changes {
            apply(app, screen, layer);
        }
    }
    finish(app);
}

/// A picked window moved: when it lands on another screen, its focus goes with it.
fn moved_window(app: &AppHandle) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    let picked = DESK.lock().unwrap().picked_wins();
    let mut changed = false;
    for w in picked {
        let Some(to) = screen_of(mtm, w) else { continue };
        let changes = DESK.lock().unwrap().moved(w.id, to);
        for (screen, layer) in changes {
            apply(app, screen, layer);
            changed = true;
        }
    }
    if changed {
        finish(app);
    }
}

// ---- The pointer on the blur ----

/// Windows under one screen's layer, front to back (focus_rules::windows_below).
fn below_layer(mtm: MainThreadMarker, screen: usize) -> Vec<Below> {
    let Some(panel) = focus_layer::own_window(mtm, screen) else { return Vec::new() };
    let list: Vec<(WinId, i32, i64, Rect)> = crate::notify::window_list().iter().map(|w| (w.number, w.pid, w.layer, w.bounds)).collect();
    let picked: Vec<WinId> = DESK.lock().unwrap().picked_wins().iter().map(|w| w.id).collect();
    windows_below(&list, panel, &focus_layer::own_windows(mtm), &picked)
}

/// The peek goes, at once or fading.
fn clear_peek(mtm: MainThreadMarker, fade: bool) {
    PEEK_ROUND.fetch_add(1, Ordering::SeqCst);
    if PEEK.with(|p| p.borrow_mut().take()).is_some() {
        focus_layer::hide_picture(mtm, fade);
    }
}

/// The peek follows the pointer: a picture of the topmost blurred window under
/// it, over the blur (design §4.4). Nothing moves or opens in the blur itself.
fn moved(x: f64, y: f64) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    if DRAGGING.with(|d| *d.borrow()) {
        return;
    }
    let Some(screen) = screen_at(mtm, Rect { x, y, w: 1.0, h: 1.0 }) else { return };
    let target = window_at(x, y, &below_layer(mtm, screen));
    let current = PEEK.with(|p| p.borrow().map(|(b, _)| b.id));
    if target.map(|t| t.id) == current {
        return;
    }
    debug!("peek at ({x:.0},{y:.0}) screen {screen}: {:?} -> {:?}", current, target.map(|t| t.id));
    let Some(target) = target else {
        clear_peek(mtm, true);
        return;
    };
    // Without Screen Recording there is no picture, so no peek (design §4.4).
    if !crate::shot_service::screen_access() {
        return;
    }
    let was_showing = PEEK.with(|p| p.borrow().is_some_and(|(_, shown)| shown));
    let round = PEEK_ROUND.fetch_add(1, Ordering::SeqCst) + 1;
    let cached = PICTURES.lock().unwrap().get(&target.id).cloned();
    if let Some(png) = cached {
        focus_layer::show_picture(mtm, target.frame, &png, !was_showing);
        PEEK.with(|p| *p.borrow_mut() = Some((target, true)));
        return;
    }
    // One window to the next: the old picture goes at once, the new one fades in.
    if was_showing {
        focus_layer::hide_picture(mtm, false);
    }
    PEEK.with(|p| *p.borrow_mut() = Some((target, false)));
    std::thread::spawn(move || {
        let Some(png) = peek_capture::picture(target.id, false, PictureSize::Full) else { return };
        PICTURES.lock().unwrap().insert(target.id, png.clone());
        let Some(app) = APP.get() else { return };
        let _ = app.run_on_main_thread(move || {
            if PEEK_ROUND.load(Ordering::SeqCst) != round {
                return;
            }
            let Some(mtm) = MainThreadMarker::new() else { return };
            focus_layer::show_picture(mtm, target.frame, &png, true);
            PEEK.with(|p| *p.borrow_mut() = Some((target, true)));
        });
    });
}

fn left() {
    debug!("pointer left the blur");
    if let Some(mtm) = MainThreadMarker::new() {
        clear_peek(mtm, true);
    }
}

fn clicked(x: f64, y: f64, shift: bool) {
    // A plain click on the blur does nothing (owner, 18 Nov); ⇧-click adds.
    if !shift {
        return;
    }
    let (Some(app), Some(mtm)) = (APP.get(), MainThreadMarker::new()) else { return };
    let Some(screen) = screen_at(mtm, Rect { x, y, w: 1.0, h: 1.0 }) else { return };
    // The click lands on the topmost window under it.
    let target = window_at(x, y, &below_layer(mtm, screen));
    // The desktop under the blur: nothing (design §4.4).
    let Some(target) = target else { return };
    let win = Win { id: target.id, pid: target.pid };
    send(app, screen, Event::ShiftClick(win));
    finish(app);
    if let Some(element) = ax::app(win.pid) {
        ax::set_frontmost(&element);
    }
    if let Some(window) = window_element(win.pid, win.id) {
        ax::raise(&window);
    }
}

// ---- Drags go through ----

fn drag_pasteboard() -> Retained<NSPasteboard> {
    // SAFETY: AppKit's pasteboard name is a static string.
    NSPasteboard::pasteboardWithName(unsafe { NSPasteboardNameDrag })
}

fn on_mouse(event: &NSEvent) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    match event.r#type() {
        NSEventType::LeftMouseDown => {
            let count = drag_pasteboard().changeCount();
            DRAG.with(|d| d.borrow_mut().pressed(count));
        }
        NSEventType::LeftMouseDragged => {
            let began = DRAG.with(|d| d.borrow_mut().dragged(now_ms(), || drag_pasteboard().changeCount()));
            if began {
                DRAGGING.with(|d| *d.borrow_mut() = true);
                clear_peek(mtm, false);
                focus_layer::pass_through(mtm, true);
            }
        }
        NSEventType::LeftMouseUp => {
            if DRAGGING.with(|d| d.replace(false)) {
                focus_layer::pass_through(mtm, false);
            }
        }
        _ => {}
    }
}
