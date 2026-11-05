//! Intip jendela's window pictures (design 5 Nov §8), taken only while a peek
//! panel is open, and once just before Notching minimizes a window.
//!
//! A shown window comes through ScreenCaptureKit on macOS 14 and later. A
//! minimized one, or any one that fails, comes through SkyLight's window
//! capture: not documented by Apple (the owner chose it, design §8), loaded at
//! run time so a macOS without it still opens Notching. After that the last
//! picture kept in memory; with none, the page shows the app's icon. Pictures
//! stay in memory only and are never written anywhere.

use std::ffi::c_void;
use std::sync::{mpsc, Arc, LazyLock, Mutex, Once, OnceLock};
use std::time::Duration;

use block2::RcBlock;
use objc2::AllocAnyThread;
use objc2_core_graphics::CGImage;
use objc2_foundation::{NSError, NSProcessInfo};
use objc2_screen_capture_kit::{SCContentFilter, SCScreenshotManager, SCShareableContent, SCStreamConfiguration};

use crate::peek_rules::{fit, PictureCache};

/// Twice the card's 184 × 118, for a sharp picture on a Retina screen.
const THUMB: (f64, f64) = (368.0, 236.0);
/// How long a ScreenCaptureKit picture may take.
const WAIT: Duration = Duration::from_secs(1);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PictureSize {
    /// For a card on the peek panel.
    Thumb,
    /// For peeking at the window in its place, in points.
    Full,
}

static CACHE: LazyLock<Mutex<PictureCache>> = LazyLock::new(Mutex::default);

/// A picture of window `id` as PNG, or None: the page then shows the app's icon.
pub fn picture(id: u32, minimized: bool, size: PictureSize) -> Option<Arc<Vec<u8>>> {
    let max = (size == PictureSize::Thumb).then_some(THUMB);
    let fresh = if minimized { None } else { screen_capture_kit(id, max) };
    match fresh.or_else(|| skylight(id, max)) {
        Some(png) => {
            let png = Arc::new(png);
            if size == PictureSize::Thumb {
                CACHE.lock().unwrap().put(id, png.clone());
            }
            Some(png)
        }
        None => CACHE.lock().unwrap().get(id),
    }
}

/// Keeps a picture of a window Notching is about to minimize, for when it is.
pub fn remember_before_minimize(id: u32) {
    if let Some(png) = screen_capture_kit(id, Some(THUMB)).or_else(|| skylight(id, Some(THUMB))) {
        CACHE.lock().unwrap().put(id, Arc::new(png));
    }
}

/// Drops the pictures of windows that are gone.
pub fn forget(gone: &[u32]) {
    CACHE.lock().unwrap().remove(gone);
}

fn macos_14() -> bool {
    NSProcessInfo::processInfo().operatingSystemVersion().majorVersion >= 14
}

// Waits for ScreenCaptureKit's two completion handlers, on its own queue.
fn screen_capture_kit(id: u32, max: Option<(f64, f64)>) -> Option<Vec<u8>> {
    if !macos_14() {
        return None;
    }
    let (sent, got) = mpsc::sync_channel::<Option<Vec<u8>>>(2);
    let content_done = RcBlock::new(move |content: *mut SCShareableContent, _error: *mut NSError| {
        let fail = sent.clone();
        // SAFETY: ScreenCaptureKit passes valid content or null.
        let Some(content) = (unsafe { content.as_ref() }) else {
            let _ = fail.send(None);
            return;
        };
        // SAFETY: plain property reads on the content ScreenCaptureKit gave.
        let windows = unsafe { content.windows() };
        let Some(window) = windows.iter().find(|w| unsafe { w.windowID() } == id) else {
            let _ = fail.send(None);
            return;
        };
        // SAFETY: a filter and a configuration made here for this one window.
        unsafe {
            let filter = SCContentFilter::initWithDesktopIndependentWindow(SCContentFilter::alloc(), &window);
            let frame = window.frame();
            let (w, h) = match max {
                Some((mw, mh)) => fit(frame.size.width * 2.0, frame.size.height * 2.0, mw, mh),
                None => (frame.size.width.round(), frame.size.height.round()),
            };
            let config = SCStreamConfiguration::new();
            config.setWidth(w.max(1.0) as usize);
            config.setHeight(h.max(1.0) as usize);
            config.setShowsCursor(false);
            config.setScalesToFit(true);
            let shot = fail.clone();
            let shot_done = RcBlock::new(move |image: *mut CGImage, _error: *mut NSError| {
                // A valid CGImage or null, alive for this call (inside the unsafe block above).
                let png = image.as_ref().and_then(crate::shelf_service::cg_png);
                let _ = shot.send(png);
            });
            SCScreenshotManager::captureImageWithFilter_configuration_completionHandler(&filter, &config, Some(&shot_done));
        }
    });
    // SAFETY: the completion handler lives as long as ScreenCaptureKit holds it.
    unsafe {
        SCShareableContent::getShareableContentExcludingDesktopWindows_onScreenWindowsOnly_completionHandler(
            true,
            true,
            &content_done,
        )
    };
    got.recv_timeout(WAIT).ok().flatten()
}

type ConnectionFn = unsafe extern "C" fn() -> i32;
type CaptureFn = unsafe extern "C" fn(cid: i32, ids: *const u32, count: u32, options: u32) -> *const c_void;

// kCGSCaptureIgnoreGlobalClipShape | kCGSWindowCaptureNominalResolution.
const CAPTURE_OPTIONS: u32 = (1 << 11) | (1 << 9);

static SKYLIGHT: OnceLock<Option<(ConnectionFn, CaptureFn)>> = OnceLock::new();
static SKYLIGHT_FAILED: Once = Once::new();

fn skylight_failed() {
    SKYLIGHT_FAILED.call_once(|| eprintln!("notching: window picture through SkyLight failed"));
}

fn load_skylight() -> Option<(ConnectionFn, CaptureFn)> {
    // SAFETY: dlopen and dlsym with C strings; symbols are only used through the
    // types they have had for years (as in AltTab).
    unsafe {
        let lib = libc::dlopen(c"/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight".as_ptr(), libc::RTLD_LAZY);
        if lib.is_null() {
            return None;
        }
        let find = |names: [&std::ffi::CStr; 2]| names.iter().map(|n| libc::dlsym(lib, n.as_ptr())).find(|p| !p.is_null());
        let connection = find([c"SLSMainConnectionID", c"CGSMainConnectionID"])?;
        let capture = find([c"SLSHWCaptureWindowList", c"CGSHWCaptureWindowList"])?;
        Some((std::mem::transmute::<*mut c_void, ConnectionFn>(connection), std::mem::transmute::<*mut c_void, CaptureFn>(capture)))
    }
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFArrayGetCount(array: *const c_void) -> isize;
    fn CFArrayGetValueAtIndex(array: *const c_void, index: isize) -> *const c_void;
    fn CFRelease(cf: *const c_void);
}

fn skylight(id: u32, max: Option<(f64, f64)>) -> Option<Vec<u8>> {
    let Some((connection, capture)) = *SKYLIGHT.get_or_init(load_skylight) else {
        skylight_failed();
        return None;
    };
    // SAFETY: SkyLight returns a +1 CFArray of CGImages, or null; it is released
    // once below, after its first image was encoded.
    unsafe {
        let images = capture(connection(), &id, 1, CAPTURE_OPTIONS);
        if images.is_null() {
            skylight_failed();
            return None;
        }
        let png = (CFArrayGetCount(images) > 0)
            .then(|| CFArrayGetValueAtIndex(images, 0))
            .filter(|p| !p.is_null())
            .and_then(|image| scaled_png(&*(image as *const CGImage), max));
        CFRelease(images);
        if png.is_none() {
            skylight_failed();
        }
        png
    }
}

#[repr(C)]
struct CGRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGImageGetWidth(image: *const CGImage) -> usize;
    fn CGImageGetHeight(image: *const CGImage) -> usize;
    fn CGColorSpaceCreateDeviceRGB() -> *mut c_void;
    fn CGColorSpaceRelease(space: *mut c_void);
    fn CGBitmapContextCreate(data: *mut c_void, w: usize, h: usize, bits: usize, row: usize, space: *mut c_void, info: u32) -> *mut c_void;
    fn CGContextSetInterpolationQuality(context: *mut c_void, quality: i32);
    fn CGContextDrawImage(context: *mut c_void, rect: CGRect, image: *const CGImage);
    fn CGBitmapContextCreateImage(context: *mut c_void) -> *mut CGImage;
    fn CGContextRelease(context: *mut c_void);
    fn CGImageRelease(image: *mut CGImage);
}

// kCGImageAlphaPremultipliedFirst | kCGBitmapByteOrder32Little.
const BGRA: u32 = 2 | (2 << 12);
const HIGH_QUALITY: i32 = 3;

// The image as PNG, scaled down to fit `max` first.
fn scaled_png(image: &CGImage, max: Option<(f64, f64)>) -> Option<Vec<u8>> {
    // SAFETY: plain CoreGraphics calls on a valid image; everything created here
    // is released here, once.
    unsafe {
        let (w, h) = (CGImageGetWidth(image) as f64, CGImageGetHeight(image) as f64);
        let Some((mw, mh)) = max else { return crate::shelf_service::cg_png(image) };
        let (tw, th) = fit(w, h, mw, mh);
        if (tw, th) == (w, h) || tw < 1.0 || th < 1.0 {
            return crate::shelf_service::cg_png(image);
        }
        let space = CGColorSpaceCreateDeviceRGB();
        let context = CGBitmapContextCreate(std::ptr::null_mut(), tw as usize, th as usize, 8, 0, space, BGRA);
        CGColorSpaceRelease(space);
        if context.is_null() {
            return None;
        }
        CGContextSetInterpolationQuality(context, HIGH_QUALITY);
        CGContextDrawImage(context, CGRect { x: 0.0, y: 0.0, w: tw, h: th }, image);
        let small = CGBitmapContextCreateImage(context);
        CGContextRelease(context);
        if small.is_null() {
            return None;
        }
        let png = crate::shelf_service::cg_png(&*small);
        CGImageRelease(small);
        png
    }
}
