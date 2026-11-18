//! Fokus jendela's native side (design 18 Nov §5): ⌃⌥F and ⌃⌥⇧F, following the
//! window in use through NSWorkspace and Accessibility, the peek and the click on
//! the blur, letting drags through, the notch icon and the permission notice.
//! The rules live in focus_rules.rs, the panels in focus_layer.rs.
//!
//! While the mode is off nothing listens: no observer, no monitor, no panel.

use std::cell::RefCell;
use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::{LazyLock, Mutex, OnceLock};
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
use crate::focus_rules::{peek_target, Below, Event, Focus, Layer, Win, WinId};
use crate::shelf_watch::Watch;
use crate::status::{self, Activity};

pub const MODULE_ID: &str = "window-focus";

/// The permission notice, at most once a minute (design §7).
const NOTICE_EVERY: Duration = Duration::from_secs(60);
/// Over the desktop the window list is read at most this often while the pointer moves.
const PEEK_READ_MS: u64 = 100;

static APP: OnceLock<AppHandle> = OnceLock::new();
static FOCUS: LazyLock<Mutex<Focus>> = LazyLock::new(|| Mutex::new(Focus::default()));
static LAST_NOTICE: Mutex<Option<Instant>> = Mutex::new(None);

/// What is listening while the mode is on. Main thread only.
#[derive(Default)]
struct Listening {
    workspace: Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>,
    monitor: Option<Retained<AnyObject>>,
    /// Accessibility observers, one per app: the active one and those of the picked windows.
    apps: Vec<(i32, ax::Observer)>,
}

thread_local! {
    static LISTENING: RefCell<Option<Listening>> = const { RefCell::new(None) };
    /// The window the peek shows now.
    static PEEK: RefCell<Option<Below>> = const { RefCell::new(None) };
    /// When the window list was last read for a peek that found nothing.
    static PEEK_READ: RefCell<Option<u64>> = const { RefCell::new(None) };
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

/// ⌃⌥F (`add` false) or ⌃⌥⇧F (`add` true) was pressed. Main thread.
pub fn pressed(app: &AppHandle, add: bool) {
    if !crate::keyclean_tap::trusted(false) {
        no_access(app);
        return;
    }
    let front = front_window();
    send(app, if add { Event::Add(front) } else { Event::Toggle(front) });
}

/// Brings the blur in line with the tool and its settings, from any thread.
pub fn sync(app: &AppHandle) {
    on_main(app, |app| {
        let on = FOCUS.lock().unwrap().is_on();
        if !on {
            return;
        }
        if !enabled(app) {
            *FOCUS.lock().unwrap() = Focus::default();
            apply(app, Layer::Off);
        } else {
            let layer = FOCUS.lock().unwrap().layer();
            apply(app, layer);
        }
    });
}

/// The screens changed while the mode may be on: the panels follow. Main thread.
pub fn screens_changed(app: &AppHandle) {
    let layer = FOCUS.lock().unwrap().layer();
    if matches!(layer, Layer::Shown { .. }) {
        apply(app, layer);
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

fn send(app: &AppHandle, e: Event) {
    let layer = FOCUS.lock().unwrap().step(e);
    if let Some(layer) = layer {
        apply(app, layer);
    }
}

/// The screen as the rules say. Main thread.
fn apply(app: &AppHandle, layer: Layer) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    clear_peek(mtm);
    match layer {
        Layer::Off => {
            focus_layer::hide(mtm);
            stop_listening();
            status::clear(app, MODULE_ID);
            eprintln!("notching: window focus off");
        }
        Layer::Paused => {
            focus_layer::hide(mtm);
            listen(app);
        }
        Layer::Shown { raise } => {
            listen(app);
            let pids = FOCUS.lock().unwrap().picked_wins();
            // A pair: both go up, the one in use last (design §5).
            if raise.len() > 1 {
                for id in &raise {
                    if let Some(w) = pids.iter().find(|w| w.id == *id).and_then(|w| window_element(w.pid, w.id)) {
                        ax::raise(&w);
                    }
                }
            }
            focus_layer::show(mtm, raise[0], dim(app));
            if let Err(e) = status::set_icon(app, MODULE_ID, Activity::On) {
                eprintln!("notching: window focus status: {e}");
            }
        }
    }
    rewatch();
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
        let block = RcBlock::new(move |_: NonNull<NSNotification>| {
            send(&handle, Event::Front(front_window()));
            rewatch();
        });
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
        let focus = FOCUS.lock().unwrap();
        (focus.picked_wins(), focus.pids())
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
                }
            }
            listening.apps.push((pid, observer));
        }
    });
}

unsafe extern "C" fn on_ax(_observer: *const c_void, element: *const c_void, name: *const c_void, _refcon: *mut c_void) {
    let Some(app) = APP.get() else { return };
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
            send(app, if name == "AXWindowCreated" { Event::Created(win) } else { Event::Focused(win) });
        }
        _ => gone(app),
    }
}

/// A window closed or was minimized somewhere: every picked one no longer on screen is gone.
fn gone(app: &AppHandle) {
    let on_screen: Vec<u32> = crate::notify::window_list().iter().map(|w| w.number).collect();
    let picked = FOCUS.lock().unwrap().picked();
    for id in picked.into_iter().filter(|id| !on_screen.contains(id)) {
        send(app, Event::Gone(id));
    }
}

// ---- The pointer on the blur ----

/// Windows under the layer, front to back, without Notching's own or the picked ones.
fn below_layer(mtm: MainThreadMarker) -> Vec<Below> {
    let list = crate::notify::window_list();
    let own = focus_layer::own_windows(mtm);
    let me = std::process::id() as i32;
    let picked = FOCUS.lock().unwrap().picked();
    let Some(last_own) = list.iter().rposition(|w| own.contains(&w.number)) else { return Vec::new() };
    list[last_own + 1..]
        .iter()
        .filter(|w| w.layer == 0 && w.pid != me && !picked.contains(&w.number))
        .map(|w| Below { id: w.number, pid: w.pid, frame: w.bounds })
        .collect()
}

fn clear_peek(mtm: MainThreadMarker) {
    if PEEK.with(|p| p.borrow_mut().take()).is_some() {
        focus_layer::set_peek(mtm, None);
    }
}

fn moved(x: f64, y: f64) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    if DRAGGING.with(|d| *d.borrow()) {
        return;
    }
    if PEEK.with(|p| p.borrow().is_some_and(|b| b.frame.contains(x, y))) {
        return;
    }
    let was = PEEK.with(|p| p.borrow().is_some());
    if !was {
        let now = now_ms();
        let recent = PEEK_READ.with(|r| r.borrow().is_some_and(|t| now.saturating_sub(t) < PEEK_READ_MS));
        if recent {
            return;
        }
        PEEK_READ.with(|r| *r.borrow_mut() = Some(now));
    }
    let target = peek_target(x, y, &below_layer(mtm));
    PEEK.with(|p| *p.borrow_mut() = target);
    if target.is_some() || was {
        focus_layer::set_peek(mtm, target.map(|t| t.frame));
    }
}

fn left() {
    if let Some(mtm) = MainThreadMarker::new() {
        clear_peek(mtm);
    }
}

fn clicked(x: f64, y: f64, shift: bool) {
    let (Some(app), Some(mtm)) = (APP.get(), MainThreadMarker::new()) else { return };
    let target = PEEK.with(|p| *p.borrow()).filter(|b| b.frame.contains(x, y)).or_else(|| peek_target(x, y, &below_layer(mtm)));
    // The desktop under the blur: nothing (design §4.4).
    let Some(target) = target else { return };
    let win = Win { id: target.id, pid: target.pid };
    send(app, if shift { Event::ShiftClick(win) } else { Event::Click(win) });
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
                clear_peek(mtm);
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
