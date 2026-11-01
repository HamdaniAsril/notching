//! Dragging files out of a notch panel, main thread only: kept files out of the
//! shelf (Titipan, design 1 Nov §5), and a screenshot out of its result or list
//! (Screenshot, design 1 Nov §5, §6). The drag offers Copy alone, so Finder copies
//! even on the same disk and the original never moves. Shelf items leave the
//! shelf once a destination took them; a screenshot stays in its history.

use std::cell::{Cell, RefCell};
use std::path::PathBuf;

use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2::{define_class, msg_send, AllocAnyThread, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSApplication, NSDragOperation, NSDraggingContext, NSDraggingItem, NSDraggingSession, NSDraggingSource, NSEvent,
    NSEventModifierFlags, NSEventType, NSImage, NSWorkspace,
};
use objc2_foundation::{NSArray, NSData, NSObject, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString, NSURL};
use tauri::{AppHandle, Emitter, EventTarget, Manager};
use tauri_nspanel::ManagerExt;

use crate::geometry::css_rect_to_global;
use crate::overlay::Overlays;
use crate::shelf_service::{ShelfState, DRAG_OUT};

/// Sent to the overlay the drag started from: `left` once the cursor leaves its
/// panel, so the panel closes out of the way; `end` when the drag is over.
pub const DRAG_EVENT: &str = "notching://shelf-drag";
/// The same for a screenshot's drag.
pub const SHOT_DRAG_EVENT: &str = "notching://shot-drag";
/// The dragged previews, in points; each next one a little offset.
const IMAGE: f64 = 48.0;
const STAGGER: f64 = 8.0;

/// A file to drag, with its PNG preview if it has one.
pub type DragFile = (PathBuf, Option<Vec<u8>>);

/// What is dragged: shelf items by id, or a copy of a screenshot.
#[derive(Clone, Debug, PartialEq)]
pub enum DragOwner {
    Shelf(Vec<u64>),
    Shot,
}

impl DragOwner {
    fn event(&self) -> &'static str {
        match self {
            DragOwner::Shelf(_) => DRAG_EVENT,
            DragOwner::Shot => SHOT_DRAG_EVENT,
        }
    }
}

/// An item stays on the shelf when the drag was cancelled, or ended on one of
/// Notching's own overlays (its webview takes any drop, as Copy).
pub fn keeps_items(op: usize, on_own_overlay: bool) -> bool {
    op == 0 || on_own_overlay
}

/// The shelf items a finished drag takes off the shelf: none for a screenshot.
pub fn items_to_remove(owner: &DragOwner, op: usize, on_own_overlay: bool) -> Option<&[u64]> {
    match owner {
        DragOwner::Shelf(ids) if !keeps_items(op, on_own_overlay) => Some(ids),
        _ => None,
    }
}

pub struct DragIvars {
    app: AppHandle,
    label: String,
    owner: DragOwner,
    files: usize,
    left: Cell<bool>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "NotchingShelfDragSource"]
    #[ivars = DragIvars]
    struct DragSource;

    unsafe impl NSObjectProtocol for DragSource {}

    unsafe impl NSDraggingSource for DragSource {
        #[unsafe(method(draggingSession:sourceOperationMaskForDraggingContext:))]
        fn mask(&self, _session: &NSDraggingSession, _context: NSDraggingContext) -> NSDragOperation {
            NSDragOperation::Copy
        }

        #[unsafe(method(draggingSession:movedToPoint:))]
        fn moved(&self, _session: &NSDraggingSession, point: NSPoint) {
            let iv = self.ivars();
            if !iv.left.get() && !in_panel(&iv.app, &iv.label, point) {
                iv.left.set(true);
                let _ = iv.app.emit_to(EventTarget::webview_window(&iv.label), iv.owner.event(), serde_json::json!({ "phase": "left" }));
            }
        }

        #[unsafe(method(draggingSession:endedAtPoint:operation:))]
        fn ended(&self, _session: &NSDraggingSession, point: NSPoint, op: NSDragOperation) {
            let iv = self.ivars();
            DRAG_OUT.store(false, std::sync::atomic::Ordering::SeqCst);
            let remove = items_to_remove(&iv.owner, op.0, on_own_overlay(&iv.app, point));
            let what = if matches!(iv.owner, DragOwner::Shot) { "screenshot" } else { "shelf" };
            eprintln!("notching: {what} drag of {} item(s) ended, operation {}, kept: {}", iv.files, op.0, remove.is_none());
            if let Some(ids) = remove {
                crate::shelf_service::shelf_remove(iv.app.clone(), ids.to_vec());
            }
            let _ = iv.app.emit_to(EventTarget::webview_window(&iv.label), iv.owner.event(), serde_json::json!({ "phase": "end" }));
            // The source stays in SOURCE until the next drag replaces it: dropping
            // it here would free it while this method still runs.
        }
    }
);

impl DragSource {
    fn new(mtm: MainThreadMarker, ivars: DragIvars) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(ivars);
        unsafe { msg_send![super(this), init] }
    }
}

thread_local! {
    // The last drag's source, kept alive until the next drag starts.
    static SOURCE: RefCell<Option<Retained<DragSource>>> = const { RefCell::new(None) };
}

fn contains(r: crate::geometry::Rect, p: NSPoint) -> bool {
    p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h
}

// Over the panel (the overlay's first hit area) of overlay `label`.
fn in_panel(app: &AppHandle, label: &str, p: NSPoint) -> bool {
    let overlays = app.state::<Overlays>();
    let map = overlays.0.lock().unwrap();
    map.get(label).and_then(|e| e.css_rects.first().map(|&css| contains(css_rect_to_global(e.frame, css), p))).unwrap_or(false)
}

fn on_own_overlay(app: &AppHandle, p: NSPoint) -> bool {
    let overlays = app.state::<Overlays>();
    let map = overlays.0.lock().unwrap();
    map.values().any(|e| e.css_rects.iter().any(|&css| contains(css_rect_to_global(e.frame, css), p)))
}

/// Starts dragging these items out of the shelf from this overlay. Only items
/// whose file is there can go; none, or a drag already running, is an error.
#[tauri::command]
pub fn shelf_start_drag(app: AppHandle, window: tauri::WebviewWindow, ids: Vec<u64>) -> Result<(), String> {
    if DRAG_OUT.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("a drag is already running".into());
    }
    // A file moved away since the shelf opened is not dragged (§6).
    crate::shelf_service::refresh(&app);
    let (files, ids): (Vec<DragFile>, Vec<u64>) = {
        let shelf = app.state::<ShelfState>();
        let shelf = shelf.0.lock().unwrap();
        shelf.get(&ids).into_iter().map(|i| ((i.path.clone(), i.thumb.clone()), i.id)).unzip()
    };
    if files.is_empty() {
        return Err("nothing to drag".into());
    }
    begin_on_main(&app, window.label(), files, DragOwner::Shelf(ids))
}

/// `begin` from any thread, on the main thread. A drag that cannot start leaves
/// the way free for the next.
pub fn begin_on_main(app: &AppHandle, label: &str, files: Vec<DragFile>, owner: DragOwner) -> Result<(), String> {
    let label = label.to_string();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(e) = begin(&handle, &label, files, owner) {
            eprintln!("notching: drag out: {e}");
            DRAG_OUT.store(false, std::sync::atomic::Ordering::SeqCst);
        }
    })
    .map_err(|e| e.to_string())
}

/// Starts dragging these files out of overlay `label`'s panel, each shown by its
/// PNG preview or else its Finder icon.
pub fn begin(app: &AppHandle, label: &str, files: Vec<DragFile>, owner: DragOwner) -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or("not on the main thread")?;
    let panel = app.get_webview_panel(label).map_err(|_| format!("no overlay {label}"))?;
    let window = panel.as_panel();
    let view = window.contentView().ok_or("no content view")?;
    let in_window = window.mouseLocationOutsideOfEventStream();
    let at = view.convertPoint_fromView(in_window, None);

    // The mouse event that started it; one made up at the cursor if the webview
    // already moved on.
    let current = NSApplication::sharedApplication(mtm).currentEvent().filter(|e| {
        matches!(e.r#type(), NSEventType::LeftMouseDown | NSEventType::LeftMouseDragged)
            && e.windowNumber() == window.windowNumber()
    });
    let event = match current {
        Some(e) => e,
        None => NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
            NSEventType::LeftMouseDragged,
            in_window,
            NSEventModifierFlags::empty(),
            0.0,
            window.windowNumber(),
            None,
            0,
            1,
            1.0,
        )
        .ok_or("no mouse event")?,
    };

    let mut dragged = Vec::new();
    let count = files.len();
    for (i, (path, png)) in files.into_iter().enumerate() {
        let path = path.to_string_lossy();
        let url = NSURL::fileURLWithPath(&NSString::from_str(&path));
        let item = NSDraggingItem::initWithPasteboardWriter(NSDraggingItem::alloc(), ProtocolObject::from_ref(&*url));
        let image = png
            .and_then(|png| NSImage::initWithData(NSImage::alloc(), &NSData::with_bytes(&png)))
            .unwrap_or_else(|| NSWorkspace::sharedWorkspace().iconForFile(&NSString::from_str(&path)));
        let off = STAGGER * i as f64;
        let frame = NSRect::new(NSPoint::new(at.x - IMAGE / 2.0 + off, at.y - IMAGE / 2.0 - off), NSSize::new(IMAGE, IMAGE));
        unsafe { item.setDraggingFrame_contents(frame, Some(&*image as &AnyObject)) };
        dragged.push(item);
    }

    let source = DragSource::new(mtm, DragIvars { app: app.clone(), label: label.to_string(), owner, files: count, left: Cell::new(false) });
    DRAG_OUT.store(true, std::sync::atomic::Ordering::SeqCst);
    view.beginDraggingSessionWithItems_event_source(
        &NSArray::from_retained_slice(&dragged),
        &event,
        ProtocolObject::from_ref(&*source),
    );
    SOURCE.with(|s| *s.borrow_mut() = Some(source));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancelled_drag_keeps_items() {
        assert!(keeps_items(0, false));
    }

    #[test]
    fn accepted_drag_removes_items() {
        assert!(!keeps_items(NSDragOperation::Copy.0, false));
    }

    #[test]
    fn drop_on_own_overlay_keeps_items() {
        assert!(keeps_items(NSDragOperation::Copy.0, true));
    }

    #[test]
    fn accepted_shelf_drag_removes_its_items() {
        let owner = DragOwner::Shelf(vec![3, 5]);
        assert_eq!(items_to_remove(&owner, NSDragOperation::Copy.0, false), Some(&[3, 5][..]));
        assert_eq!(items_to_remove(&owner, 0, false), None);
        assert_eq!(items_to_remove(&owner, NSDragOperation::Copy.0, true), None);
    }

    #[test]
    fn shot_drags_never_remove_shelf_items() {
        for (op, own) in [(0, false), (NSDragOperation::Copy.0, false), (NSDragOperation::Copy.0, true)] {
            assert_eq!(items_to_remove(&DragOwner::Shot, op, own), None);
        }
    }

    #[test]
    fn each_owner_has_its_event() {
        assert_eq!(DragOwner::Shelf(vec![1]).event(), "notching://shelf-drag");
        assert_eq!(DragOwner::Shot.event(), "notching://shot-drag");
    }
}
