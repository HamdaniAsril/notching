//! Notching's own glass (design 7 Nov §4, §6): a still picture of one screen,
//! without the panel's own windows, taken just before the card or the switcher
//! shows and kept while it is open. Only with Screen Recording already given,
//! checked first so nothing ever asks for it. Memory only; dropped when the
//! panel hides, never written anywhere.

use std::ptr::NonNull;
use std::sync::{Arc, LazyLock, Mutex, Once};
use std::time::Instant;

use block2::RcBlock;
use objc2::AllocAnyThread;
use objc2_app_kit::NSWorkspace;
use objc2_core_foundation::CFRetained;
use objc2_core_graphics::CGImage;
use objc2_foundation::{NSArray, NSError, NSProcessInfo};
use objc2_screen_capture_kit::{SCContentFilter, SCScreenshotManager, SCShareableContent, SCStreamConfiguration, SCWindow};
use tauri::AppHandle;

use crate::geometry::Rect;
use crate::glass_rules::{own_possible, Slot, Snap, GIVE_UP};
use crate::peek_rules::Material;

/// Whose picture: the peek card's or the switcher's.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Owner {
    Card,
    Switcher,
}

/// One screen as it was: `screen` in CG points (top-left of the main screen),
/// `scale` its pixels per point.
pub struct Snapshot {
    pub screen: Rect,
    pub scale: f64,
    pub image: CFRetained<CGImage>,
}

// SAFETY: a CGImage never changes once made, and Core Graphics lets any thread read it.
unsafe impl Send for Snapshot {}
// SAFETY: as above.
unsafe impl Sync for Snapshot {}

#[derive(Default)]
struct Held {
    slot: Slot,
    ticket: u64,
    picture: Option<Arc<Snapshot>>,
}

static HELD: LazyLock<[Mutex<Held>; 2]> = LazyLock::new(Default::default);
static FAILED: Once = Once::new();

fn held(owner: Owner) -> &'static Mutex<Held> {
    &HELD[owner as usize]
}

fn failed(why: &str) {
    FAILED.call_once(|| eprintln!("notching: no glass picture: {why}"));
}

/// Whether Notching's own glass can be drawn now for `material`.
pub fn can_draw(material: Material) -> bool {
    let major = NSProcessInfo::processInfo().operatingSystemVersion().majorVersion as i64;
    let reduce = NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceTransparency();
    own_possible(material, crate::shot_service::screen_access(), reduce, major)
}

/// Starts a picture of `screen` without the windows in `exclude`, unless this
/// panel has that screen's picture already or coming; `ready` runs on the
/// main thread once it is kept.
pub fn begin(app: &AppHandle, owner: Owner, screen: Rect, exclude: Vec<u32>, ready: fn(&AppHandle, Owner)) {
    if !crate::shot_service::screen_access() {
        return;
    }
    let ticket = {
        let mut h = held(owner).lock().unwrap();
        let Some(ticket) = h.slot.begin(screen, false) else { return };
        h.ticket = ticket;
        ticket
    };
    take(app.clone(), owner, ticket, screen, exclude, ready);
}

/// A new picture of the last screen, when what is behind has changed (a
/// window button, the Dock settling); the old one stays until it comes.
pub fn retake(app: &AppHandle, owner: Owner, exclude: Vec<u32>, ready: fn(&AppHandle, Owner)) {
    if !crate::shot_service::screen_access() {
        return;
    }
    let (ticket, screen) = {
        let mut h = held(owner).lock().unwrap();
        let Some(screen) = h.slot.screen() else { return };
        let Some(ticket) = h.slot.begin(screen, true) else { return };
        h.ticket = ticket;
        (ticket, screen)
    };
    take(app.clone(), owner, ticket, screen, exclude, ready);
}

pub fn snapshot(owner: Owner) -> Option<Arc<Snapshot>> {
    held(owner).lock().unwrap().picture.clone()
}

pub fn state(owner: Owner) -> Snap {
    held(owner).lock().unwrap().slot.state()
}

/// The panel hid: its picture goes, and one on its way is dropped.
pub fn forget(owner: Owner) {
    let mut h = held(owner).lock().unwrap();
    h.slot.forget();
    h.picture = None;
}

/// After GIVE_UP with still no picture, this opening keeps today's look.
pub fn give_up_later(_app: &AppHandle, owner: Owner) {
    let ticket = held(owner).lock().unwrap().ticket;
    std::thread::spawn(move || {
        std::thread::sleep(GIVE_UP);
        let mut h = held(owner).lock().unwrap();
        h.slot.give_up(ticket);
        if h.slot.state() == Snap::Failed && h.picture.is_none() {
            failed("none within a second");
        }
    });
}

// Keeps the picture if it is still the one waited for, then says so on the main thread.
fn finish(app: &AppHandle, owner: Owner, ticket: u64, picture: Option<Snapshot>, ready: fn(&AppHandle, Owner)) {
    let kept = {
        let mut h = held(owner).lock().unwrap();
        let kept = h.slot.finish(ticket, picture.is_some());
        if kept {
            h.picture = picture.map(Arc::new);
        }
        kept
    };
    if kept {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || ready(&handle, owner));
    }
}

// The screen's content, then its picture, through ScreenCaptureKit's two
// completion handlers on its own queue.
fn take(app: AppHandle, owner: Owner, ticket: u64, screen: Rect, exclude: Vec<u32>, ready: fn(&AppHandle, Owner)) {
    let started = Instant::now();
    let content_done = RcBlock::new(move |content: *mut SCShareableContent, _error: *mut NSError| {
        let app = app.clone();
        // SAFETY: ScreenCaptureKit passes valid content or null.
        let Some(content) = (unsafe { content.as_ref() }) else {
            failed("no screen content");
            finish(&app, owner, ticket, None, ready);
            return;
        };
        let (cx, cy) = (screen.x + screen.w / 2.0, screen.y + screen.h / 2.0);
        // SAFETY: plain property reads on the content ScreenCaptureKit gave.
        let display = unsafe { content.displays() }.iter().find(|d| {
            let f = unsafe { d.frame() };
            cx >= f.origin.x && cx <= f.origin.x + f.size.width && cy >= f.origin.y && cy <= f.origin.y + f.size.height
        });
        let Some(display) = display else {
            failed("no display under the panel");
            finish(&app, owner, ticket, None, ready);
            return;
        };
        // SAFETY: as above.
        let skip: Vec<_> = unsafe { content.windows() }.iter().filter(|w| exclude.contains(&unsafe { w.windowID() })).collect();
        let skip = NSArray::<SCWindow>::from_retained_slice(&skip);
        // SAFETY: a filter and a configuration made here for this one display.
        unsafe {
            let filter = SCContentFilter::initWithDisplay_excludingWindows(SCContentFilter::alloc(), &display, &skip);
            let frame = display.frame();
            let scale = SCShareableContent::infoForFilter(&filter).pointPixelScale() as f64;
            let scale = if scale > 0.0 { scale } else { 2.0 };
            let config = SCStreamConfiguration::new();
            config.setWidth((frame.size.width * scale).round().max(1.0) as usize);
            config.setHeight((frame.size.height * scale).round().max(1.0) as usize);
            config.setShowsCursor(false);
            let shot_screen = Rect { x: frame.origin.x, y: frame.origin.y, w: frame.size.width, h: frame.size.height };
            let shot_app = app.clone();
            let shot_done = RcBlock::new(move |image: *mut CGImage, _error: *mut NSError| {
                let Some(image) = NonNull::new(image) else {
                    failed("ScreenCaptureKit gave no image");
                    finish(&shot_app, owner, ticket, None, ready);
                    return;
                };
                // A valid CGImage for this call (inside the unsafe block above), retained to keep it.
                let image = CFRetained::retain(image);
                eprintln!(
                    "notching: glass picture {}x{} px in {} ms ({owner:?})",
                    CGImage::width(Some(&image)),
                    CGImage::height(Some(&image)),
                    started.elapsed().as_millis()
                );
                finish(&shot_app, owner, ticket, Some(Snapshot { screen: shot_screen, scale, image }), ready);
            });
            SCScreenshotManager::captureImageWithFilter_configuration_completionHandler(&filter, &config, Some(&shot_done));
        }
    });
    // SAFETY: the completion handler lives as long as ScreenCaptureKit holds it.
    unsafe {
        SCShareableContent::getShareableContentExcludingDesktopWindows_onScreenWindowsOnly_completionHandler(false, true, &content_done)
    };
}
