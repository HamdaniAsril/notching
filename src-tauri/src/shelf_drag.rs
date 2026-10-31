//! Dragging kept files out of the shelf (Titipan, design 1 Nov §5), main thread
//! only. The drag offers Copy alone, so Finder copies even on the same disk and
//! the original never moves. Items leave the shelf once a destination took them.

use std::cell::{Cell, RefCell};

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
/// The dragged previews, in points; each next one a little offset.
const IMAGE: f64 = 48.0;
const STAGGER: f64 = 8.0;

/// An item stays on the shelf when the drag was cancelled, or ended on one of
/// Notching's own overlays (its webview takes any drop, as Copy).
pub fn keeps_items(op: usize, on_own_overlay: bool) -> bool {
    op == 0 || on_own_overlay
}

pub struct DragIvars {
    app: AppHandle,
    label: String,
    ids: Vec<u64>,
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
                let _ = iv.app.emit_to(EventTarget::webview_window(&iv.label), DRAG_EVENT, serde_json::json!({ "phase": "left" }));
            }
        }

        #[unsafe(method(draggingSession:endedAtPoint:operation:))]
        fn ended(&self, _session: &NSDraggingSession, point: NSPoint, op: NSDragOperation) {
            let iv = self.ivars();
            DRAG_OUT.store(false, std::sync::atomic::Ordering::SeqCst);
            if !keeps_items(op.0, on_own_overlay(&iv.app, point)) {
                crate::shelf_service::shelf_remove(iv.app.clone(), iv.ids.clone());
            }
            let _ = iv.app.emit_to(EventTarget::webview_window(&iv.label), DRAG_EVENT, serde_json::json!({ "phase": "end" }));
            // Let go of this source later, never while one of its methods runs.
            let _ = iv.app.run_on_main_thread(|| {
                SOURCE.with(|s| s.borrow_mut().take());
            });
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
    // The running drag's source, kept alive until the drag ends.
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
    let items: Vec<(String, Option<Vec<u8>>, u64)> = {
        let shelf = app.state::<ShelfState>();
        let shelf = shelf.0.lock().unwrap();
        shelf.get(&ids).into_iter().map(|i| (i.path.to_string_lossy().into_owned(), i.thumb.clone(), i.id)).collect()
    };
    if items.is_empty() {
        return Err("nothing to drag".into());
    }
    let label = window.label().to_string();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(e) = begin(&handle, &label, items) {
            eprintln!("notching: shelf drag: {e}");
            DRAG_OUT.store(false, std::sync::atomic::Ordering::SeqCst);
        }
    })
    .map_err(|e| e.to_string())
}

fn begin(app: &AppHandle, label: &str, items: Vec<(String, Option<Vec<u8>>, u64)>) -> Result<(), String> {
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
    let ids: Vec<u64> = items.iter().map(|(_, _, id)| *id).collect();
    for (i, (path, png, _)) in items.into_iter().enumerate() {
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

    let source = DragSource::new(mtm, DragIvars { app: app.clone(), label: label.to_string(), ids, left: Cell::new(false) });
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
}
