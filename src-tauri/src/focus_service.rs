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
use crate::focus_rules::{blur_screens, on_blurred_screen, peek_hole, peek_target, Below, Event, Focus, Layer, Win, WinId};
use crate::geometry::Rect;
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
    /// The window the peek shows now, and the blurred windows above it.
    static PEEK: RefCell<Option<(Below, Vec<Rect>)>> = const { RefCell::new(None) };
    /// The screens blurred now, so a moving window re-orders only when that changes.
    static BLURRED: RefCell<Vec<usize>> = const { RefCell::new(Vec::new()) };
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
        eprintln!("notching: window focus key pressed without Accessibility");
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

/// The screens holding the picked windows (owner, 18 Nov: other monitors stay as they are).
fn screens_for(mtm: MainThreadMarker, picked: &[Win]) -> Vec<usize> {
    let list = crate::notify::window_list();
    let frames: Vec<Rect> = picked
        .iter()
        .filter_map(|w| {
            list.iter().find(|b| b.number == w.id).map(|b| b.bounds).or_else(|| window_element(w.pid, w.id).and_then(|e| ax::frame(&e)))
        })
        .collect();
    blur_screens(&focus_layer::screens_cg(mtm), &frames)
}

/// A window's frame, from the window server, else from Accessibility.
fn frame_of(w: Win) -> Option<Rect> {
    crate::notify::window_list().iter().find(|b| b.number == w.id).map(|b| b.bounds).or_else(|| window_element(w.pid, w.id).and_then(|e| ax::frame(&e)))
}

/// Focus moves only to a window on a blurred screen (owner, 18 Nov). With no
/// window, the pointer's screen decides; with nothing blurred yet, anything goes.
fn takes_focus(frame: Option<Rect>) -> bool {
    let Some(mtm) = MainThreadMarker::new() else { return true };
    let blurred = BLURRED.with(|b| b.borrow().clone());
    if blurred.is_empty() {
        return true;
    }
    let frame = frame.unwrap_or_else(|| {
        let (x, y) = focus_layer::pointer();
        Rect { x, y, w: 1.0, h: 1.0 }
    });
    on_blurred_screen(frame, &focus_layer::screens_cg(mtm), &blurred)
}

/// A picked window moved: when it lands on another screen, the blur goes with it.
fn moved_window(app: &AppHandle) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    let (layer, picked) = {
        let focus = FOCUS.lock().unwrap();
        (focus.layer(), focus.picked_wins())
    };
    if !matches!(layer, Layer::Shown { .. }) {
        return;
    }
    let now = screens_for(mtm, &picked);
    if BLURRED.with(|b| *b.borrow() != now) {
        apply(app, layer);
    }
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
            BLURRED.with(|b| b.borrow_mut().clear());
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
            let only = screens_for(mtm, &pids);
            focus_layer::show(mtm, raise[0], dim(app), &only);
            BLURRED.with(|b| *b.borrow_mut() = only);
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
            let front = front_window();
            // A window on a screen without blur leaves the focus where it is.
            if takes_focus(front.and_then(frame_of)) {
                send(&handle, Event::Front(front));
            }
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
                    observer.watch(&element, "AXMoved");
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
            if name == "AXWindowCreated" {
                send(app, Event::Created(win));
            } else if takes_focus(frame_of(win)) {
                send(app, Event::Focused(win));
            }
        }
        "AXMoved" => moved_window(app),
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
    // Still on the visible part of the same window: nothing to redo.
    let same = PEEK.with(|p| p.borrow().as_ref().is_some_and(|(b, front)| b.frame.contains(x, y) && !front.iter().any(|f| f.contains(x, y))));
    if same {
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
    let mut below = below_layer(mtm);
    let mut at = below.iter().position(|b| b.frame.contains(x, y));
    // Covered by other blurred windows: it comes up above them, still under the
    // blur and the focused windows (owner, 18 Nov).
    if let Some(i) = at.filter(|&i| !peek_hole(below[i], &below[..i]).covers.is_empty()) {
        bring_forward(mtm, below[i]);
        below = below_layer(mtm);
        at = below.iter().position(|b| b.frame.contains(x, y));
    }
    let hole = at.map(|i| peek_hole(below[i], &below[..i]));
    PEEK.with(|p| *p.borrow_mut() = at.map(|i| (below[i], below[..i].iter().map(|b| b.frame).collect())));
    if hole.is_some() || was {
        focus_layer::set_peek(mtm, hole.as_ref());
    }
}

/// Raises `target`, then the focused windows over it, then puts the layer back
/// right below them: focused > blur > target > the rest.
fn bring_forward(mtm: MainThreadMarker, target: Below) {
    let Layer::Shown { raise } = FOCUS.lock().unwrap().layer() else { return };
    let picked = FOCUS.lock().unwrap().picked_wins();
    if let Some(w) = window_element(target.pid, target.id) {
        ax::raise_only(&w);
    }
    for id in &raise {
        if let Some(w) = picked.iter().find(|w| w.id == *id).and_then(|w| window_element(w.pid, w.id)) {
            ax::raise_only(&w);
        }
    }
    focus_layer::reorder(mtm, raise[0]);
}

fn left() {
    if let Some(mtm) = MainThreadMarker::new() {
        clear_peek(mtm);
    }
}

fn clicked(x: f64, y: f64, shift: bool) {
    let (Some(app), Some(mtm)) = (APP.get(), MainThreadMarker::new()) else { return };
    // Read afresh: the click lands on the topmost window under it.
    let target = peek_target(x, y, &below_layer(mtm));
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
