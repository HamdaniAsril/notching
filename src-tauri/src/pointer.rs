//! Global cursor tracking (main thread only). AppKit event monitors call back on
//! mouse moves; no polling. The frontend hears about the cursor only while it is
//! inside a notch's hit area, plus one event when it leaves.

use std::cell::RefCell;
use std::ptr::NonNull;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSEvent, NSEventMask};
use tauri::{AppHandle, Emitter, EventTarget, Manager};

use crate::geometry::{OverlayHit, PointerRouter};
use crate::overlay::{set_mouse_passthrough, Overlays};

#[derive(Clone, serde::Serialize)]
pub struct PointerPayload {
    pub inside: bool,
    pub x: f64,
    pub y: f64,
}

thread_local! {
    static ROUTER: RefCell<PointerRouter> = RefCell::new(PointerRouter::default());
    // Monitor tokens; dropping them would not remove the monitors, but keeping them
    // makes the lifetime explicit.
    static MONITORS: RefCell<Vec<Retained<AnyObject>>> = const { RefCell::new(Vec::new()) };
}

pub fn start_pointer_monitor(app: AppHandle) {
    let mask = NSEventMask::MouseMoved | NSEventMask::LeftMouseDragged;

    // Moves over other apps' windows.
    let global_app = app.clone();
    let global = RcBlock::new(move |_: NonNull<NSEvent>| reroute_now(&global_app));
    let global_token = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(mask, &global);

    // Moves over our own panels, once they stop being click-through.
    let local_app = app;
    let local = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        reroute_now(&local_app);
        event.as_ptr()
    });
    let local_token = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(mask, &local) };

    MONITORS.with(|m| m.borrow_mut().extend(global_token.into_iter().chain(local_token)));
}

/// Routes the current cursor position to the overlays: flips click-through when the
/// cursor enters or leaves a hit area, and sends the position to that overlay.
pub fn reroute_now(app: &AppHandle) {
    let p = NSEvent::mouseLocation();
    let hits: Vec<OverlayHit> = app
        .state::<Overlays>()
        .0
        .lock()
        .unwrap()
        .iter()
        .map(|(label, e)| OverlayHit { label: label.clone(), frame: e.frame, css_rects: e.css_rects.clone() })
        .collect();
    let routes = ROUTER.with(|r| r.borrow_mut().route(&hits, p.x, p.y));
    for route in routes {
        if route.changed {
            set_mouse_passthrough(app, &route.label, !route.inside);
        }
        let payload = PointerPayload { inside: route.inside, x: route.x, y: route.y };
        let _ = app.emit_to(EventTarget::webview_window(&route.label), "notch://pointer", payload);
    }
}
