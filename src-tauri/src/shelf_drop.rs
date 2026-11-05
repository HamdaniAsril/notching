//! Dropping files on the notch (Titipan, design 1 Nov §3), main thread only.
//!
//! A file drag reaches a notch first through its sensor (sensor.rs), or through
//! the overlay's own webview when the overlay already catches the mouse. Either
//! way that overlay goes into drop mode: its page opens the shelf's drop zone,
//! then calls `shelf_drop_ready`, and a catcher panel covers the open panel to
//! receive the drop. The catcher reads file URLs, and file promises (Mail,
//! Photos) that it receives into the Titipan folder. A poll ends drop mode when
//! the mouse button is up or the cursor stays away, whatever AppKit reported.
//!
//! With "open while dragging" on (owner, 5 Nov), a file drag starting anywhere
//! opens the shelf at once (shelf_watch.rs). That drop mode stays while the
//! button is down, wherever the cursor goes, and follows the drag to another
//! screen's notch.
//!
//! Like the overlays and sensors, catchers are never closed, only ordered out.

use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::ptr::NonNull;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{Bool, ProtocolObject};
use objc2::{define_class, msg_send, ClassType, MainThreadMarker, MainThreadOnly, Message};
use objc2_app_kit::{
    NSBackingStoreType, NSColor, NSDragOperation, NSDraggingInfo, NSEvent, NSFilePromiseReceiver, NSPanel,
    NSPasteboardTypeFileURL, NSResponder, NSView, NSWindowCollectionBehavior, NSWindowOrderingMode,
    NSWindowStyleMask,
};
use objc2_foundation::{NSArray, NSDictionary, NSError, NSObject, NSOperationQueue, NSPoint, NSRect, NSSize, NSString, NSURL};
use tauri::{AppHandle, Emitter, EventTarget, Manager};
use tauri_nspanel::ManagerExt;

use crate::geometry::{css_rect_to_global, Rect};
use crate::overlay::Overlays;
use crate::shelf::NewItem;
use crate::shelf_service::{self, DRAG_OUT};

/// Sent to the one overlay in drop mode.
pub const DROP_EVENT: &str = "notching://shelf-drop";
const POLL: Duration = Duration::from_millis(150);
/// Polls in a row with the button up or the cursor away before drop mode ends:
/// long enough for AppKit to hand over a drop that is on its way.
const AWAY_TICKS: u32 = 3;
// NSStatusWindowLevel, the overlays' level.
const STATUS_LEVEL: isize = 25;

#[derive(Clone, Debug, PartialEq)]
pub enum DropMode {
    Off,
    /// `anywhere`: opened when the drag started, not when it reached the notch.
    On { label: String, away: u32, anywhere: bool },
}

#[derive(Clone, Debug, PartialEq)]
pub enum DropEvent {
    /// A file drag reached this overlay's notch or panel.
    Arrived { label: String, enabled: bool, dragging_out: bool },
    /// A file drag started anywhere; `label`: the notch of the screen it started on.
    Started { label: String, enabled: bool, dragging_out: bool },
    /// The drag left the catcher; `inside`: the cursor is still over the overlay's
    /// notch or panel (the catcher moved under it), which is left to the poll.
    Exited { inside: bool },
    /// Files were dropped.
    Performed,
    /// The poll: is the button still down, is the cursor over the notch or panel?
    Tick { pressed: bool, inside: bool },
}

#[derive(Clone, Debug, PartialEq)]
pub enum Effect {
    None,
    Start(String),
    End { label: String, dropped: bool },
    /// The drag went to another screen's notch: close one, open the other.
    Move { from: String, to: String },
}

pub fn drop_mode_step(now: DropMode, ev: DropEvent) -> (DropMode, Effect) {
    match (now, ev) {
        (DropMode::Off, DropEvent::Arrived { label, enabled: true, dragging_out: false }) => {
            (DropMode::On { label: label.clone(), away: 0, anywhere: false }, Effect::Start(label))
        }
        (DropMode::Off, DropEvent::Started { label, enabled: true, dragging_out: false }) => {
            (DropMode::On { label: label.clone(), away: 0, anywhere: true }, Effect::Start(label))
        }
        (DropMode::On { label: from, anywhere: true, .. }, DropEvent::Arrived { label: to, enabled: true, dragging_out: false })
            if from != to =>
        {
            (DropMode::On { label: to.clone(), away: 0, anywhere: true }, Effect::Move { from, to })
        }
        // Opened from anywhere: leaving the catcher is not leaving; the poll decides.
        (on @ DropMode::On { anywhere: true, .. }, DropEvent::Exited { .. }) => (on, Effect::None),
        (on @ DropMode::On { .. }, DropEvent::Exited { inside: true }) => (on, Effect::None),
        (DropMode::On { label, .. }, DropEvent::Exited { inside: false }) => {
            (DropMode::Off, Effect::End { label, dropped: false })
        }
        (DropMode::On { label, .. }, DropEvent::Performed) => (DropMode::Off, Effect::End { label, dropped: true }),
        (DropMode::On { label, away, anywhere }, DropEvent::Tick { pressed, inside }) => {
            if pressed && (inside || anywhere) {
                (DropMode::On { label, away: 0, anywhere }, Effect::None)
            } else if away + 1 >= AWAY_TICKS {
                (DropMode::Off, Effect::End { label, dropped: false })
            } else {
                (DropMode::On { label, away: away + 1, anywhere }, Effect::None)
            }
        }
        (now, _) => (now, Effect::None),
    }
}

static APP: OnceLock<AppHandle> = OnceLock::new();

thread_local! {
    static MODE: RefCell<DropMode> = const { RefCell::new(DropMode::Off) };
    // Catcher panels by overlay label, and where the one in use sits (global).
    static CATCHERS: RefCell<HashMap<String, Retained<NSPanel>>> = RefCell::new(HashMap::new());
    static CATCHER_RECT: RefCell<Option<Rect>> = const { RefCell::new(None) };
}

pub fn init(app: &AppHandle) {
    let _ = APP.set(app.clone());
}

fn step(app: &AppHandle, ev: DropEvent) {
    let effect = MODE.with(|m| {
        let now = m.borrow().clone();
        let (next, effect) = drop_mode_step(now, ev);
        *m.borrow_mut() = next;
        effect
    });
    match effect {
        Effect::None => {}
        Effect::Start(label) => {
            let _ = app.emit_to(EventTarget::webview_window(&label), DROP_EVENT, serde_json::json!({ "phase": "start" }));
            start_poll(app);
        }
        Effect::End { label, dropped } => end(app, &label, dropped),
        Effect::Move { from, to } => {
            end(app, &from, false);
            let _ = app.emit_to(EventTarget::webview_window(&to), DROP_EVENT, serde_json::json!({ "phase": "start" }));
        }
    }
}

fn end(app: &AppHandle, label: &str, dropped: bool) {
    hide_catcher();
    let _ = app.emit_to(
        EventTarget::webview_window(label),
        DROP_EVENT,
        serde_json::json!({ "phase": "end", "dropped": dropped }),
    );
}

fn mode_label() -> Option<String> {
    MODE.with(|m| match &*m.borrow() {
        DropMode::On { label, .. } => Some(label.clone()),
        DropMode::Off => None,
    })
}

/// A file drag reached the notch or panel of overlay `label`.
pub fn arrived(app: &AppHandle, label: &str) {
    let enabled = shelf_service::enabled(app);
    let dragging_out = DRAG_OUT.load(std::sync::atomic::Ordering::SeqCst);
    step(app, DropEvent::Arrived { label: label.to_string(), enabled, dragging_out });
}

/// A file drag started anywhere, over the screen whose notch is `label`.
pub fn started(app: &AppHandle, label: &str) {
    let enabled = shelf_service::enabled(app);
    let dragging_out = DRAG_OUT.load(std::sync::atomic::Ordering::SeqCst);
    step(app, DropEvent::Started { label: label.to_string(), enabled, dragging_out });
}

// Polls the button and cursor until drop mode ends.
fn start_poll(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(POLL);
        let (tx, rx) = std::sync::mpsc::channel();
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            let on = mode_label().is_some();
            if on {
                let pressed = NSEvent::pressedMouseButtons() & 1 == 1;
                let p = NSEvent::mouseLocation();
                step(&handle, DropEvent::Tick { pressed, inside: inside(&handle, p) });
            }
            let _ = tx.send(mode_label().is_some());
        });
        if !rx.recv().unwrap_or(false) {
            break;
        }
    });
}

fn contains(r: Rect, p: NSPoint) -> bool {
    p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h
}

// Over the catcher, or over the overlay's hit areas while the panel opens.
fn inside(app: &AppHandle, p: NSPoint) -> bool {
    if CATCHER_RECT.with(|c| c.borrow().is_some_and(|r| contains(r, p))) {
        return true;
    }
    let Some(label) = mode_label() else { return false };
    let overlays = app.state::<Overlays>();
    let map = overlays.0.lock().unwrap();
    map.get(&label).is_some_and(|e| e.css_rects.iter().any(|&css| contains(css_rect_to_global(e.frame, css), p)))
}

/// The page shows the drop zone: the catcher covers the panel from now on.
#[tauri::command]
pub fn shelf_drop_ready(app: AppHandle, window: tauri::WebviewWindow) {
    let label = window.label().to_string();
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || resync(&handle, &label));
}

/// Places the catcher over the panel (the overlay's first hit area) while this
/// overlay is in drop mode; set_hit_rects calls it as the panel grows.
pub fn resync(app: &AppHandle, label: &str) {
    if mode_label().as_deref() != Some(label) {
        return;
    }
    let Some(mtm) = MainThreadMarker::new() else { return };
    let (frame, first) = {
        let overlays = app.state::<Overlays>();
        let map = overlays.0.lock().unwrap();
        match map.get(label) {
            Some(e) => (e.frame, e.css_rects.first().copied()),
            None => return,
        }
    };
    let (Some(css), Ok(overlay)) = (first, app.get_webview_panel(label)) else { return };
    let rect = css_rect_to_global(frame, css);
    let number = overlay.as_panel().windowNumber();
    CATCHERS.with(|c| {
        let mut c = c.borrow_mut();
        let panel = c.entry(label.to_string()).or_insert_with(|| new_catcher(mtm));
        panel.setFrame_display(NSRect::new(NSPoint::new(rect.x, rect.y), NSSize::new(rect.w, rect.h)), false);
        panel.orderWindow_relativeTo(NSWindowOrderingMode::Above, number);
    });
    CATCHER_RECT.with(|c| *c.borrow_mut() = Some(rect));
}

fn hide_catcher() {
    CATCHERS.with(|c| c.borrow().values().for_each(|p| p.orderOut(None)));
    CATCHER_RECT.with(|c| *c.borrow_mut() = None);
}

/// The types a sensor or catcher takes: file URLs and file promises.
pub fn dragged_types() -> Retained<NSArray<NSString>> {
    let mut types: Vec<Retained<NSString>> = vec![unsafe { NSPasteboardTypeFileURL }.retain()];
    types.extend(NSFilePromiseReceiver::readableDraggedTypes().iter());
    NSArray::from_retained_slice(&types)
}

define_class!(
    #[unsafe(super(NSView, NSResponder, NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "NotchingShelfCatcherView"]
    struct CatcherView;

    impl CatcherView {
        #[unsafe(method(draggingEntered:))]
        fn dragging_entered(&self, info: &ProtocolObject<dyn NSDraggingInfo>) -> NSDragOperation {
            operation(info)
        }

        #[unsafe(method(draggingUpdated:))]
        fn dragging_updated(&self, info: &ProtocolObject<dyn NSDraggingInfo>) -> NSDragOperation {
            operation(info)
        }

        #[unsafe(method(draggingExited:))]
        fn dragging_exited(&self, _info: Option<&ProtocolObject<dyn NSDraggingInfo>>) {
            if let Some(app) = APP.get() {
                let inside = inside(app, NSEvent::mouseLocation());
                step(app, DropEvent::Exited { inside });
            }
        }

        #[unsafe(method(performDragOperation:))]
        fn perform_drag_operation(&self, info: &ProtocolObject<dyn NSDraggingInfo>) -> Bool {
            Bool::new(perform(info))
        }
    }
);

/// Copy for a file drag from elsewhere; nothing for our own drag out.
pub fn operation(info: &ProtocolObject<dyn NSDraggingInfo>) -> NSDragOperation {
    if info.draggingSource().is_some() || DRAG_OUT.load(std::sync::atomic::Ordering::SeqCst) {
        NSDragOperation::None
    } else {
        NSDragOperation::Copy
    }
}

/// Keeps what was dropped on a sensor or catcher; true if anything was taken.
pub fn perform(info: &ProtocolObject<dyn NSDraggingInfo>) -> bool {
    let Some(app) = APP.get() else { return false };
    if operation(info) == NSDragOperation::None || !shelf_service::enabled(app) {
        return false;
    }
    let taken = accept(app, info);
    if mode_label().is_some() {
        step(app, DropEvent::Performed);
    }
    taken
}

fn new_catcher(mtm: MainThreadMarker) -> Retained<NSPanel> {
    let panel = NSPanel::initWithContentRect_styleMask_backing_defer(
        NSPanel::alloc(mtm),
        NSRect::ZERO,
        NSWindowStyleMask::Borderless | NSWindowStyleMask::NonactivatingPanel,
        NSBackingStoreType::Buffered,
        false,
    );
    unsafe { panel.setReleasedWhenClosed(false) };
    panel.setLevel(STATUS_LEVEL);
    panel.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle
            | NSWindowCollectionBehavior::FullScreenAuxiliary,
    );
    panel.setHidesOnDeactivate(false);
    panel.setHasShadow(false);
    panel.setOpaque(false);
    // As with the sensors: 1% black catches the drag and cannot be seen.
    panel.setBackgroundColor(Some(&NSColor::colorWithWhite_alpha(0.0, 0.01)));
    panel.setIgnoresMouseEvents(false);
    let view: Retained<CatcherView> = unsafe { msg_send![CatcherView::alloc(mtm), init] };
    view.registerForDraggedTypes(&dragged_types());
    panel.setContentView(Some(&view));
    panel
}

fn file_paths(info: &ProtocolObject<dyn NSDraggingInfo>) -> Vec<PathBuf> {
    let pb = info.draggingPasteboard();
    let classes = NSArray::from_slice(&[NSURL::class()]);
    let Some(items) = (unsafe { pb.readObjectsForClasses_options(&classes, None) }) else { return Vec::new() };
    items
        .iter()
        .filter_map(|item| item.downcast::<NSURL>().ok())
        .filter(|url| url.isFileURL())
        .filter_map(|url| url.filePathURL().and_then(|u| u.path()))
        .map(|p| PathBuf::from(p.to_string()))
        .collect()
}

fn entries(paths: Vec<PathBuf>) -> Vec<NewItem> {
    paths.into_iter().map(|path| NewItem { folder: path.is_dir(), path, receiving: false }).collect()
}

// File URLs when the drag has them; file promises otherwise.
fn accept(app: &AppHandle, info: &ProtocolObject<dyn NSDraggingInfo>) -> bool {
    let paths = file_paths(info);
    if !paths.is_empty() {
        shelf_service::add_paths(app, entries(paths));
        return true;
    }
    let pb = info.draggingPasteboard();
    let classes = NSArray::from_slice(&[NSFilePromiseReceiver::class()]);
    let Some(receivers) = (unsafe { pb.readObjectsForClasses_options(&classes, None) }) else { return false };
    let mut taken = false;
    for receiver in receivers.iter().filter_map(|r| r.downcast::<NSFilePromiseReceiver>().ok()) {
        taken |= receive(app, &receiver);
    }
    taken
}

// Each promised file is kept at once, dimmed, and becomes ready as its source
// writes it into a folder of its own.
fn receive(app: &AppHandle, receiver: &NSFilePromiseReceiver) -> bool {
    let dir = shelf_service::receive_dir();
    if let Err(e) = std::fs::create_dir_all(&dir) {
        eprintln!("notching: shelf receive: {e}");
        return false;
    }
    let names: Vec<String> = receiver.fileNames().iter().map(|n| n.to_string()).collect();
    let placeholders: Vec<NewItem> =
        names.iter().map(|n| NewItem { path: dir.join(n), folder: false, receiving: true }).collect();
    let ids = shelf_service::add_paths(app, if placeholders.is_empty() {
        vec![NewItem { path: dir.join("…"), folder: false, receiving: true }]
    } else {
        placeholders
    });
    let waiting = Mutex::new(VecDeque::from(ids));
    let app = app.clone();
    let reader = RcBlock::new(move |url: NonNull<NSURL>, err: *mut NSError| {
        let Some(id) = waiting.lock().unwrap().pop_front() else { return };
        // SAFETY: AppKit passes a valid URL and a valid error or nil.
        let url = unsafe { url.as_ref() };
        let path = (err.is_null()).then(|| url.path()).flatten().map(|p| PathBuf::from(p.to_string()));
        shelf_service::received(&app, id, path);
    });
    let dest = NSURL::fileURLWithPath(&NSString::from_str(&dir.to_string_lossy()));
    unsafe {
        receiver.receivePromisedFilesAtDestination_options_operationQueue_reader(
            &dest,
            &NSDictionary::new(),
            &NSOperationQueue::mainQueue(),
            &reader,
        )
    };
    true
}

/// A drop that reached the overlay's webview instead of the catcher (the panel
/// was not ready yet): file URLs only.
pub fn dropped_on_overlay(app: &AppHandle, label: &str, paths: Vec<PathBuf>) {
    if mode_label().as_deref() != Some(label) || paths.is_empty() || !shelf_service::enabled(app) {
        return;
    }
    shelf_service::add_paths(app, entries(paths));
    step(app, DropEvent::Performed);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arrive(label: &str, enabled: bool) -> DropEvent {
        DropEvent::Arrived { label: label.into(), enabled, dragging_out: false }
    }

    fn on(label: &str) -> DropMode {
        DropMode::On { label: label.into(), away: 0, anywhere: false }
    }

    fn started(label: &str) -> DropEvent {
        DropEvent::Started { label: label.into(), enabled: true, dragging_out: false }
    }

    fn anywhere(label: &str) -> DropMode {
        DropMode::On { label: label.into(), away: 0, anywhere: true }
    }

    #[test]
    fn arrival_starts_once() {
        let (m, e) = drop_mode_step(DropMode::Off, arrive("notch-0", true));
        assert_eq!((m.clone(), e), (on("notch-0"), Effect::Start("notch-0".into())));
        // Another screen's notch while one is open changes nothing.
        assert_eq!(drop_mode_step(m, arrive("notch-1", true)), (on("notch-0"), Effect::None));
    }

    #[test]
    fn arrival_ignored_when_off() {
        assert_eq!(drop_mode_step(DropMode::Off, arrive("notch-0", false)), (DropMode::Off, Effect::None));
        let ours = DropEvent::Arrived { label: "notch-0".into(), enabled: true, dragging_out: true };
        assert_eq!(drop_mode_step(DropMode::Off, ours), (DropMode::Off, Effect::None));
    }

    #[test]
    fn exit_inside_is_left_to_the_poll() {
        // The catcher moved under a drag still over the panel: not a leave.
        assert_eq!(drop_mode_step(on("notch-0"), DropEvent::Exited { inside: true }), (on("notch-0"), Effect::None));
    }

    #[test]
    fn exit_ends_not_dropped() {
        assert_eq!(
            drop_mode_step(on("notch-0"), DropEvent::Exited { inside: false }),
            (DropMode::Off, Effect::End { label: "notch-0".into(), dropped: false })
        );
    }

    #[test]
    fn perform_ends_dropped() {
        assert_eq!(
            drop_mode_step(on("notch-0"), DropEvent::Performed),
            (DropMode::Off, Effect::End { label: "notch-0".into(), dropped: true })
        );
    }

    #[test]
    fn drop_mode_ends_on_release() {
        let up = DropEvent::Tick { pressed: false, inside: true };
        let (m, e) = drop_mode_step(on("notch-0"), up.clone());
        assert_eq!(e, Effect::None);
        let (m, e) = drop_mode_step(m, up.clone());
        assert_eq!(e, Effect::None);
        assert_eq!(drop_mode_step(m, up), (DropMode::Off, Effect::End { label: "notch-0".into(), dropped: false }));
    }

    #[test]
    fn drop_mode_ends_when_the_cursor_stays_away() {
        let away = DropEvent::Tick { pressed: true, inside: false };
        let back = DropEvent::Tick { pressed: true, inside: true };
        let (m, _) = drop_mode_step(on("notch-0"), away.clone());
        let (m, _) = drop_mode_step(m, away.clone());
        // Coming back in time starts the count again.
        let (m, e) = drop_mode_step(m, back);
        assert_eq!((m.clone(), e), (on("notch-0"), Effect::None));
        let (m, _) = drop_mode_step(m, away.clone());
        let (m, _) = drop_mode_step(m, away.clone());
        assert_eq!(drop_mode_step(m, away).1, Effect::End { label: "notch-0".into(), dropped: false });
    }

    #[test]
    fn release_after_perform_is_ignored() {
        let (m, _) = drop_mode_step(on("notch-0"), DropEvent::Performed);
        assert_eq!(drop_mode_step(m.clone(), DropEvent::Tick { pressed: false, inside: false }), (DropMode::Off, Effect::None));
        assert_eq!(drop_mode_step(m, DropEvent::Exited { inside: false }), (DropMode::Off, Effect::None));
    }

    #[test]
    fn a_file_drag_anywhere_opens_the_shelf_at_once() {
        assert_eq!(drop_mode_step(DropMode::Off, started("notch-1")), (anywhere("notch-1"), Effect::Start("notch-1".into())));
    }

    #[test]
    fn a_drag_anywhere_is_ignored_when_shelf_is_off_or_it_is_our_own() {
        let off = DropEvent::Started { label: "notch-0".into(), enabled: false, dragging_out: false };
        assert_eq!(drop_mode_step(DropMode::Off, off), (DropMode::Off, Effect::None));
        let ours = DropEvent::Started { label: "notch-0".into(), enabled: true, dragging_out: true };
        assert_eq!(drop_mode_step(DropMode::Off, ours), (DropMode::Off, Effect::None));
        // Already open for a drag: nothing more.
        assert_eq!(drop_mode_step(on("notch-0"), started("notch-1")), (on("notch-0"), Effect::None));
    }

    #[test]
    fn a_drag_from_anywhere_stays_open_while_the_button_is_down() {
        // Far from the notch, and leaving the catcher: still open.
        let far = DropEvent::Tick { pressed: true, inside: false };
        let mut m = anywhere("notch-0");
        for _ in 0..10 {
            let (next, e) = drop_mode_step(m, far.clone());
            assert_eq!(e, Effect::None);
            m = next;
        }
        assert_eq!(drop_mode_step(m.clone(), DropEvent::Exited { inside: false }), (m, Effect::None));
    }

    #[test]
    fn a_drag_from_anywhere_closes_when_let_go_elsewhere() {
        let up = DropEvent::Tick { pressed: false, inside: false };
        let (m, e) = drop_mode_step(anywhere("notch-0"), up.clone());
        assert_eq!(e, Effect::None);
        let (m, _) = drop_mode_step(m, up.clone());
        assert_eq!(drop_mode_step(m, up), (DropMode::Off, Effect::End { label: "notch-0".into(), dropped: false }));
        assert_eq!(
            drop_mode_step(anywhere("notch-0"), DropEvent::Performed),
            (DropMode::Off, Effect::End { label: "notch-0".into(), dropped: true })
        );
    }

    #[test]
    fn a_drag_from_anywhere_moves_to_the_notch_it_reaches() {
        assert_eq!(
            drop_mode_step(anywhere("notch-0"), arrive("notch-1", true)),
            (anywhere("notch-1"), Effect::Move { from: "notch-0".into(), to: "notch-1".into() })
        );
        // Its own notch: nothing to do.
        assert_eq!(drop_mode_step(anywhere("notch-0"), arrive("notch-0", true)), (anywhere("notch-0"), Effect::None));
    }
}
