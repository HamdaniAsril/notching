//! Fokus jendela's blur (design 18 Nov §5): one plain panel per screen at the
//! normal window level, holding macOS's own behind-window blur and a thin dark
//! layer, ordered right below the focused window. A peek opens a hole in both
//! over the window under the cursor: its top third clear, then fading back to
//! blur. Main thread only. Like the sensors, the panels are never closed, only
//! ordered out.

use std::cell::RefCell;
use std::sync::OnceLock;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::{define_class, msg_send, AllocAnyThread, MainThreadMarker, MainThreadOnly, Message};
use objc2_app_kit::{
    NSAppearance, NSAppearanceCustomization, NSAppearanceNameDarkAqua, NSAutoresizingMaskOptions, NSBackingStoreType, NSColor,
    NSEvent, NSEventModifierFlags, NSPanel, NSResponder, NSTrackingArea, NSTrackingAreaOptions, NSView, NSVisualEffectBlendingMode,
    NSVisualEffectMaterial, NSVisualEffectState, NSVisualEffectView, NSWindowCollectionBehavior, NSWindowOrderingMode,
    NSWindowStyleMask,
};
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_core_graphics::CGColor;
use objc2_foundation::{NSObject, NSPoint, NSRect, NSSize};
use objc2_core_graphics::CGMutablePath;
use objc2_quartz_core::{kCAFillRuleEvenOdd, CALayer, CAShapeLayer, CATransaction};

use crate::focus_rules::{PeekHole, PEEK_FADE_MS};
use crate::geometry::{to_cg, Rect};
use crate::screens::current_screens;

/// NSNormalWindowLevel: the layer sits among the apps' windows.
const NORMAL_LEVEL: isize = 0;

/// What the layer tells the service, in CG points (top-left of the main screen).
pub struct Hooks {
    pub moved: fn(f64, f64),
    pub left: fn(),
    pub clicked: fn(f64, f64, bool),
}

static HOOKS: OnceLock<Hooks> = OnceLock::new();

pub fn init(hooks: Hooks) {
    let _ = HOOKS.set(hooks);
}

/// The pointer in CG points.
pub fn pointer() -> (f64, f64) {
    let p = NSEvent::mouseLocation();
    (p.x, PRIMARY_H.with(|h| h.get()) - p.y)
}

define_class!(
    #[unsafe(super(NSView, NSResponder, NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "NotchingFocusView"]
    struct FocusView;

    impl FocusView {
        // The first click on the blur counts, though Notching is not active.
        #[unsafe(method(acceptsFirstMouse:))]
        fn accepts_first_mouse(&self, _event: Option<&NSEvent>) -> bool {
            true
        }

        #[unsafe(method(mouseMoved:))]
        fn mouse_moved(&self, _event: &NSEvent) {
            if let Some(h) = HOOKS.get() {
                let (x, y) = pointer();
                (h.moved)(x, y);
            }
        }

        #[unsafe(method(mouseExited:))]
        fn mouse_exited(&self, _event: &NSEvent) {
            if let Some(h) = HOOKS.get() {
                (h.left)();
            }
        }

        // A click moves focus and goes no further (design §4.5).
        #[unsafe(method(mouseDown:))]
        fn mouse_down(&self, event: &NSEvent) {
            if let Some(h) = HOOKS.get() {
                let (x, y) = pointer();
                (h.clicked)(x, y, event.modifierFlags().contains(NSEventModifierFlags::Shift));
            }
        }

        // Scrolling and the other buttons do nothing on the blur (design §4.5).
        #[unsafe(method(rightMouseDown:))]
        fn right_mouse_down(&self, _event: &NSEvent) {}

        #[unsafe(method(otherMouseDown:))]
        fn other_mouse_down(&self, _event: &NSEvent) {}

        #[unsafe(method(scrollWheel:))]
        fn scroll_wheel(&self, _event: &NSEvent) {}
    }
);

/// One screen's panel.
struct Slot {
    panel: Retained<NSPanel>,
    blur: Retained<NSVisualEffectView>,
    dark: Retained<NSView>,
    /// The screen in Cocoa points.
    screen: Rect,
    shown: bool,
}

thread_local! {
    static SLOTS: RefCell<Vec<Slot>> = const { RefCell::new(Vec::new()) };
    /// The main screen's height, to turn Cocoa points into CG ones.
    static PRIMARY_H: std::cell::Cell<f64> = const { std::cell::Cell::new(0.0) };
}

fn ns_rect(r: Rect) -> NSRect {
    NSRect::new(NSPoint::new(r.x, r.y), NSSize::new(r.w, r.h))
}

fn cg_rect(x: f64, y: f64, w: f64, h: f64) -> CGRect {
    CGRect::new(CGPoint::new(x, y), CGSize::new(w.max(0.0), h.max(0.0)))
}

fn new_slot(mtm: MainThreadMarker) -> Slot {
    let panel = NSPanel::initWithContentRect_styleMask_backing_defer(
        NSPanel::alloc(mtm),
        NSRect::ZERO,
        NSWindowStyleMask::Borderless | NSWindowStyleMask::NonactivatingPanel,
        NSBackingStoreType::Buffered,
        false,
    );
    unsafe { panel.setReleasedWhenClosed(false) };
    panel.setLevel(NORMAL_LEVEL);
    // Every Space, out of Mission Control and the window cycle (design §4.6).
    panel.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces | NSWindowCollectionBehavior::Transient | NSWindowCollectionBehavior::IgnoresCycle,
    );
    panel.setHidesOnDeactivate(false);
    panel.setHasShadow(false);
    panel.setOpaque(false);
    // 1% black: a peek hole still catches the click, so it never reaches the
    // window below (design §4.5), and cannot be seen.
    panel.setBackgroundColor(Some(&NSColor::colorWithWhite_alpha(0.0, 0.01)));
    panel.setIgnoresMouseEvents(false);

    let view: Retained<FocusView> = unsafe { msg_send![FocusView::alloc(mtm), init] };
    view.setWantsLayer(true);
    let area = unsafe {
        NSTrackingArea::initWithRect_options_owner_userInfo(
            NSTrackingArea::alloc(),
            NSRect::ZERO,
            NSTrackingAreaOptions::MouseMoved
                | NSTrackingAreaOptions::MouseEnteredAndExited
                | NSTrackingAreaOptions::ActiveAlways
                | NSTrackingAreaOptions::InVisibleRect,
            Some(&view),
            None,
        )
    };
    view.addTrackingArea(&area);

    let fill = NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable;
    let blur = NSVisualEffectView::new(mtm);
    blur.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
    blur.setMaterial(NSVisualEffectMaterial::FullScreenUI);
    blur.setState(NSVisualEffectState::Active);
    // SAFETY: a constant AppKit defines.
    if let Some(dark) = NSAppearance::appearanceNamed(unsafe { NSAppearanceNameDarkAqua }) {
        blur.setAppearance(Some(&dark));
    }
    blur.setWantsLayer(true);
    blur.setAutoresizingMask(fill);
    view.addSubview(&blur);

    let dark = NSView::new(mtm);
    dark.setWantsLayer(true);
    if let Some(layer) = dark.layer() {
        layer.setBackgroundColor(Some(&CGColor::new_generic_gray(0.0, 1.0)));
        layer.setOpacity(0.0);
    }
    dark.setAutoresizingMask(fill);
    view.addSubview(&dark);

    panel.setContentView(Some(&view));
    Slot { panel, blur, dark, screen: Rect { x: 0.0, y: 0.0, w: 0.0, h: 0.0 }, shown: false }
}

/// The screens now, in CG points, in the order `show` takes them.
pub fn screens_cg(mtm: MainThreadMarker) -> Vec<Rect> {
    let screens = current_screens(mtm);
    let h = screens.first().map_or(0.0, |s| s.frame.h);
    screens.iter().map(|s| to_cg(s.frame, h)).collect()
}

/// A panel on each screen in `only` (indices of screens_cg), ordered right below
/// `window`; the other screens stay as they are. `dim` is Dim::alpha().
pub fn show(mtm: MainThreadMarker, window: u32, dim: f64, only: &[usize]) {
    let screens = current_screens(mtm);
    if let Some(main) = screens.first() {
        PRIMARY_H.with(|h| h.set(main.frame.h));
    }
    SLOTS.with(|slots| {
        let mut slots = slots.borrow_mut();
        while slots.len() < screens.len() {
            slots.push(new_slot(mtm));
        }
        for (i, slot) in slots.iter_mut().enumerate() {
            let Some(screen) = screens.get(i).filter(|_| only.contains(&i)) else {
                clear_masks(slot);
                slot.panel.orderOut(None);
                slot.shown = false;
                continue;
            };
            slot.screen = screen.frame;
            let size = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(screen.frame.w, screen.frame.h));
            slot.panel.setFrame_display(ns_rect(screen.frame), false);
            if let Some(content) = slot.panel.contentView() {
                content.setFrame(size);
            }
            slot.blur.setFrame(size);
            slot.dark.setFrame(size);
            if let Some(layer) = slot.dark.layer() {
                CATransaction::begin();
                CATransaction::setDisableActions(true);
                layer.setOpacity(dim as f32);
                CATransaction::commit();
            }
            slot.panel.orderWindow_relativeTo(NSWindowOrderingMode::Below, window as isize);
            slot.shown = true;
        }
    });
}

/// The shown panels go right below `window` again, nothing else changes.
pub fn reorder(_mtm: MainThreadMarker, window: u32) {
    SLOTS.with(|slots| {
        for slot in slots.borrow().iter().filter(|s| s.shown) {
            slot.panel.orderWindow_relativeTo(NSWindowOrderingMode::Below, window as isize);
        }
    });
}

pub fn hide(_mtm: MainThreadMarker) {
    SLOTS.with(|slots| {
        for slot in slots.borrow_mut().iter_mut() {
            clear_masks(slot);
            slot.panel.orderOut(None);
            slot.shown = false;
        }
    });
}

/// While a drag runs, every mouse event goes through to the windows below.
pub fn pass_through(_mtm: MainThreadMarker, on: bool) {
    SLOTS.with(|slots| {
        for slot in slots.borrow().iter() {
            slot.panel.setIgnoresMouseEvents(on);
        }
    });
}

/// The layer's own window numbers, to skip in the window list.
pub fn own_windows(_mtm: MainThreadMarker) -> Vec<u32> {
    SLOTS.with(|slots| slots.borrow().iter().filter(|s| s.shown).map(|s| s.panel.windowNumber() as u32).collect())
}

fn clear_masks(slot: &Slot) {
    for layer in [slot.blur.layer(), slot.dark.layer()].into_iter().flatten() {
        // SAFETY: the layer is the view's own; dropping its mask shows it whole.
        unsafe { layer.setMask(None) };
    }
}

/// Opens a peek hole (CG points), or closes it, fading over PEEK_FADE_MS.
pub fn set_peek(_mtm: MainThreadMarker, hole: Option<&PeekHole>) {
    let h = PRIMARY_H.with(|h| h.get());
    SLOTS.with(|slots| {
        for slot in slots.borrow().iter().filter(|s| s.shown) {
            let s = slot.screen;
            // A CG rect in this screen's view points (Cocoa: y up).
            let local = |r: Rect| {
                let c = to_cg(r, h);
                Rect { x: c.x - s.x, y: c.y - s.y, ..c }
            };
            let here = hole.filter(|hole| {
                let o = local(hole.open);
                o.x < s.w && o.max_x() > 0.0 && o.y < s.h && o.max_y() > 0.0
            });
            for layer in [slot.blur.layer(), slot.dark.layer()].into_iter().flatten() {
                match here {
                    Some(hole) => {
                        let covers: Vec<Rect> = hole.covers.iter().map(|&c| local(c)).collect();
                        open_hole(&layer, s.w, s.h, local(hole.open), &covers, hole.radius);
                    }
                    None => close_hole(&layer),
                }
            }
        }
    });
}

/// The mask: opaque everywhere but `whole`, a window-shaped hole where `covers`
/// stay opaque; a cover over the hole fades out, and stays the last sublayer for
/// close_hole.
fn open_hole(layer: &CALayer, w: f64, h: f64, whole: Rect, covers: &[Rect], radius: f64) {
    let black = CGColor::new_generic_gray(0.0, 1.0);
    let mask = CALayer::new();
    mask.setFrame(cg_rect(0.0, 0.0, w, h));
    // Everything but the hole, whose corners round like a window's.
    let path = CGMutablePath::new();
    // SAFETY: a fresh path and no transform.
    unsafe {
        CGMutablePath::add_rect(Some(&path), std::ptr::null(), cg_rect(0.0, 0.0, w, h));
        CGMutablePath::add_rounded_rect(Some(&path), std::ptr::null(), cg_rect(whole.x, whole.y, whole.w, whole.h), radius, radius);
    }
    let outside = CAShapeLayer::new();
    outside.setFrame(cg_rect(0.0, 0.0, w, h));
    outside.setPath(Some(&path));
    // SAFETY: a constant Core Animation defines.
    outside.setFillRule(unsafe { kCAFillRuleEvenOdd });
    outside.setFillColor(Some(&black));
    mask.addSublayer(&outside);
    for c in covers {
        let block = CALayer::new();
        block.setFrame(cg_rect(c.x, c.y, c.w, c.h));
        block.setBackgroundColor(Some(&black));
        mask.addSublayer(&block);
    }
    let cover = CALayer::new();
    cover.setFrame(cg_rect(whole.x, whole.y, whole.w, whole.h));
    cover.setBackgroundColor(Some(&black));
    mask.addSublayer(&cover);

    CATransaction::begin();
    CATransaction::setDisableActions(true);
    // SAFETY: the view's own layer takes a fresh mask.
    unsafe { layer.setMask(Some(&mask)) };
    CATransaction::commit();
    CATransaction::begin();
    CATransaction::setAnimationDuration(PEEK_FADE_MS as f64 / 1000.0);
    cover.setOpacity(0.0);
    CATransaction::commit();
}

/// The hole fills back in, then the mask goes.
fn close_hole(layer: &CALayer) {
    let Some(mask) = layer.mask() else { return };
    // SAFETY: the mask is the one open_hole made; its last sublayer is the cover.
    let Some(cover) = (unsafe { mask.sublayers() }).and_then(|s| s.lastObject()) else { return };
    let owner = layer.retain();
    let done = RcBlock::new(move || {
        // SAFETY: the hole is filled; the whole blur shows again.
        unsafe { owner.setMask(None) };
    });
    CATransaction::begin();
    CATransaction::setAnimationDuration(PEEK_FADE_MS as f64 / 1000.0);
    // SAFETY: the block lives until Core Animation has run it.
    unsafe { CATransaction::setCompletionBlock(Some(&done)) };
    cover.setOpacity(1.0);
    CATransaction::commit();
}
