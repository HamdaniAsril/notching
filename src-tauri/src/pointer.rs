//! Cursor tracking (main thread only). Sensors (sensor.rs) say when the cursor
//! reaches a notch; while it is inside one, a global monitor follows it over other
//! apps, and a local monitor follows it over our own panels. With the cursor far
//! from every notch nothing watches the mouse, so moving it costs the app nothing.
//! The frontend hears about the cursor only while it is inside a notch's hit area,
//! plus one event when it leaves.

use std::cell::RefCell;
use std::ptr::NonNull;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSEvent, NSEventMask};
use tauri::{AppHandle, Emitter, EventTarget, Manager};

use crate::geometry::{OverlayHit, PointerRouter};
use crate::overlay::{set_mouse_moved_events, set_mouse_passthrough, Overlays};

#[derive(Clone, serde::Serialize)]
pub struct PointerPayload {
    pub inside: bool,
    pub x: f64,
    pub y: f64,
}

thread_local! {
    static ROUTER: RefCell<PointerRouter> = RefCell::new(PointerRouter::default());
    static LOCAL: RefCell<Option<Retained<AnyObject>>> = const { RefCell::new(None) };
    // Present only while the cursor is inside some notch.
    static GLOBAL: RefCell<Option<Retained<AnyObject>>> = const { RefCell::new(None) };
}

fn mask() -> NSEventMask {
    NSEventMask::MouseMoved
        | NSEventMask::LeftMouseDragged
        | NSEventMask::RightMouseDragged
        | NSEventMask::OtherMouseDragged
}

/// Moves over our own panels, once they stop being click-through.
pub fn start_pointer_monitor(app: AppHandle) {
    let local = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        reroute_now(&app);
        event.as_ptr()
    });
    let token = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(mask(), &local) };
    LOCAL.with(|l| *l.borrow_mut() = token);
}

// Moves over other apps' windows, so the cursor leaving a notch is noticed, and
// moves over our own overlays. Both only while the cursor is inside a notch.
fn watch_globally(app: &AppHandle, on: bool) {
    GLOBAL.with(|g| {
        let mut g = g.borrow_mut();
        match (on, g.is_some()) {
            (true, false) => {
                set_mouse_moved_events(app, true);
                let app = app.clone();
                let block = RcBlock::new(move |_: NonNull<NSEvent>| reroute_now(&app));
                *g = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(mask(), &block);
            }
            (false, true) => {
                set_mouse_moved_events(app, false);
                if let Some(token) = g.take() {
                    unsafe { NSEvent::removeMonitor(&token) };
                }
            }
            _ => {}
        }
    });
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
    let (routes, inside) = ROUTER.with(|r| {
        let mut r = r.borrow_mut();
        let routes = r.route(&hits, p.x, p.y);
        (routes, r.any_inside())
    });
    for route in routes {
        if route.changed {
            set_mouse_passthrough(app, &route.label, !route.inside);
            crate::sensor::set_resting(&route.label, route.inside);
        }
        let payload = PointerPayload { inside: route.inside, x: route.x, y: route.y };
        let _ = app.emit_to(EventTarget::webview_window(&route.label), "notch://pointer", payload);
    }
    watch_globally(app, inside);
}
