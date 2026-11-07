//! Notching's own glass on screen (design 7 Nov §4): a layer under the peek
//! card's or the switcher's page, where macOS's NSGlassEffectView sits
//! otherwise. It opens with the page, fades in when it comes late, and tells
//! the page when it is there, so the card takes its own colour. Main thread.

use std::cell::RefCell;
use std::collections::HashMap;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::{MainThreadMarker, Message};
use objc2_app_kit::{NSAutoresizingMaskOptions, NSPanel, NSView, NSWindowOrderingMode};
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_core_graphics::{CGColor, CGImage};
use objc2_foundation::{NSNumber, NSString, NSValue};
use objc2_quartz_core::{
    kCAMediaTimingFunctionEaseOut, CABasicAnimation, CACornerMask, CALayer, CAMediaTiming, CAMediaTimingFunction, CATransaction,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, EventTarget};

use crate::glass_rules::{GlassLook, Opening, DROP_CURVE, DROP_FROM, DROP_MS, FADE_IN_MS, LATE_FADE_MS, RISE_MS, RISE_PT};
use crate::peek_rules::GlassShape;

/// How the glass comes on screen.
pub enum Enter {
    /// The panel just appeared: the glass plays the page's opening.
    Opening(Opening),
    /// The glass, or a newer one, came after the panel: it fades in.
    Fade,
    /// The panel moved or changed size: at once.
    Now,
}

const EVENT: &str = "notching://glass";

#[derive(Serialize, Clone, Copy)]
struct GlassDto {
    own: bool,
    tint: f64,
}

thread_local! {
    // Each panel's glass layer, under its page, while Notching's own glass is up.
    static VIEWS: RefCell<HashMap<String, Retained<NSView>>> = RefCell::new(HashMap::new());
}

fn obj<T: Message>(o: Retained<T>) -> Retained<AnyObject> {
    // SAFETY: every Objective-C object is an AnyObject.
    unsafe { Retained::cast_unchecked(o) }
}

fn num(v: f64) -> Retained<AnyObject> {
    obj(NSNumber::new_f64(v))
}

fn image_obj(image: &CGImage) -> &AnyObject {
    // SAFETY: a CGImage is toll-free an Objective-C object, a layer's usual contents.
    unsafe { &*(image as *const CGImage as *const AnyObject) }
}

fn ease_out() -> Retained<CAMediaTimingFunction> {
    // SAFETY: Core Animation's own timing name.
    CAMediaTimingFunction::functionWithName(unsafe { kCAMediaTimingFunctionEaseOut })
}

fn basic(key: &str, from: &AnyObject, to: &AnyObject, ms: u64, timing: &CAMediaTimingFunction) -> Retained<CABasicAnimation> {
    let a = CABasicAnimation::animationWithKeyPath(Some(&NSString::from_str(key)));
    // SAFETY: values of the kind the key path animates.
    unsafe {
        a.setFromValue(Some(from));
        a.setToValue(Some(to));
    }
    a.setDuration(ms as f64 / 1000.0);
    a.setTimingFunction(Some(timing));
    a
}

/// Puts `image` (the panel's size) under the panel's page, as `enter` says.
pub fn show(app: &AppHandle, label: &str, panel: &NSPanel, image: &CGImage, shape: GlassShape, look: &GlassLook, enter: Enter) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    let Some(content) = panel.contentView() else { return };
    let fresh = !showing(label);
    let view = VIEWS.with(|v| {
        v.borrow_mut()
            .entry(label.to_string())
            .or_insert_with(|| {
                let view = NSView::new(mtm);
                view.setWantsLayer(true);
                view.setAutoresizingMask(NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable);
                content.addSubview_positioned_relativeTo(&view, NSWindowOrderingMode::Below, None);
                view
            })
            .clone()
    });
    view.setFrame(content.bounds());
    let Some(layer) = view.layer() else { return };
    // SAFETY: reading the layer's contents.
    let old = unsafe { layer.contents() };
    CATransaction::begin();
    CATransaction::setDisableActions(true);
    // SAFETY: a CGImage as the layer's contents.
    unsafe { layer.setContents(Some(image_obj(image))) };
    layer.setCornerRadius(shape.radius);
    layer.setMasksToBounds(true);
    // Hanging from the notch, only the bottom corners are round (y grows upward here).
    layer.setMaskedCorners(if shape.flat_top {
        CACornerMask::LayerMinXMinYCorner | CACornerMask::LayerMaxXMinYCorner
    } else {
        CACornerMask::all()
    });
    CATransaction::commit();
    match enter {
        Enter::Opening(o) => open(&layer, o, view.frame().size),
        Enter::Fade => match old.filter(|_| !fresh) {
            Some(old) => layer.addAnimation_forKey(&basic("contents", &old, image_obj(image), LATE_FADE_MS, &ease_out()), Some(&NSString::from_str("swap"))),
            None => layer.addAnimation_forKey(&basic("opacity", &num(0.0), &num(1.0), LATE_FADE_MS, &ease_out()), Some(&NSString::from_str("late"))),
        },
        Enter::Now => {}
    }
    if fresh {
        emit(app, label, true, look.tint);
    }
}

// The page's opening, played by the glass under it (peek.css, switcher.css).
fn open(layer: &CALayer, o: Opening, size: CGSize) {
    match o {
        Opening::Rise => {
            layer.addAnimation_forKey(&basic("opacity", &num(0.0), &num(1.0), RISE_MS, &ease_out()), Some(&NSString::from_str("open")));
            // CSS rises from 8 px lower; y grows upward here.
            layer.addAnimation_forKey(
                &basic("transform.translation.y", &num(-RISE_PT), &num(0.0), RISE_MS, &ease_out()),
                Some(&NSString::from_str("rise")),
            );
        }
        Opening::Fade => {
            layer.addAnimation_forKey(&basic("opacity", &num(0.0), &num(1.0), FADE_IN_MS, &ease_out()), Some(&NSString::from_str("open")));
        }
        Opening::Drop => drop_open(layer, size),
    }
}

// The switcher's drop from the notch: a mask grows from a sliver under the
// notch to the whole panel, as switcher.css's clip-path does.
fn drop_open(layer: &CALayer, size: CGSize) {
    let mask = CALayer::new();
    mask.setBackgroundColor(Some(&CGColor::new_generic_gray(0.0, 1.0)));
    mask.setAnchorPoint(CGPoint::new(0.5, 1.0));
    mask.setPosition(CGPoint::new(size.width / 2.0, size.height));
    let full = CGRect::new(CGPoint::new(0.0, 0.0), size);
    mask.setBounds(full);
    mask.setMaskedCorners(CACornerMask::LayerMinXMinYCorner | CACornerMask::LayerMaxXMinYCorner);
    mask.setCornerRadius(30.0);
    let [top, right, bottom, left] = DROP_FROM;
    let from = CGRect::new(CGPoint::new(0.0, 0.0), CGSize::new(size.width * (1.0 - left - right), size.height * (1.0 - top - bottom)));
    let [x1, y1, x2, y2] = DROP_CURVE.map(|v| v as f32);
    let curve = CAMediaTimingFunction::functionWithControlPoints(x1, y1, x2, y2);
    let owner = layer.retain();
    let done = RcBlock::new(move || {
        // SAFETY: the mask goes once the drop is over.
        unsafe { owner.setMask(None) };
    });
    CATransaction::begin();
    // SAFETY: the block lives until Core Animation has run it.
    unsafe {
        CATransaction::setCompletionBlock(Some(&done));
        layer.setMask(Some(&mask));
        let (from, full) = (NSValue::valueWithRect(from), NSValue::valueWithRect(full));
        mask.addAnimation_forKey(&basic("bounds", &from, &full, DROP_MS, &curve), Some(&NSString::from_str("drop")));
    }
    mask.addAnimation_forKey(&basic("cornerRadius", &num(14.0), &num(30.0), DROP_MS, &curve), Some(&NSString::from_str("round")));
    CATransaction::commit();
}

/// Takes the panel's own glass away, and tells the page.
pub fn clear(app: &AppHandle, label: &str) {
    let gone = VIEWS.with(|v| v.borrow_mut().remove(label));
    if let Some(view) = gone {
        view.removeFromSuperview();
        emit(app, label, false, crate::glass_draw::current_look().tint);
    }
}

pub fn showing(label: &str) -> bool {
    VIEWS.with(|v| v.borrow().contains_key(label))
}

fn emit(app: &AppHandle, label: &str, own: bool, tint: f64) {
    let _ = app.emit_to(EventTarget::webview_window(label), EVENT, GlassDto { own, tint });
}
