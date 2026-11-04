//! Potong file in the core (design 4 Nov, alat latar §4): a keyboard event tap
//! that only acts on ⌘X and ⌘V while Finder is in front. ⌘X becomes ⌘C and the
//! files are remembered; the next ⌘V becomes ⌘⌥V, Finder's "Move Item Here".
//! In a text field both keys stay as they are. Every other key passes untouched.

use std::cell::RefCell;
use std::ffi::c_void;
use std::path::{Path, PathBuf};
use std::ptr::NonNull;
use std::sync::atomic::{AtomicPtr, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{ClassType, MainThreadMarker};
use objc2_app_kit::{NSPasteboard, NSWorkspace};
use objc2_foundation::{NSArray, NSDistributedNotificationCenter, NSNotification, NSObjectProtocol, NSOperationQueue, NSString, NSURL};
use tauri::{AppHandle, Manager};

use crate::app_core::CoreState;
use crate::cut_rules::{classify, fill, is_text_role, moved, paste_is_ours, Cut, Press};

pub const MODULE_ID: &str = "cut-files";
const FINDER: &str = "com.apple.finder";
// macOS posts this when the Accessibility list changes; the trust follows a moment later.
const ACCESS_CHANGED: &str = "com.apple.accessibility.api";
const ACCESS_SETTLE: Duration = Duration::from_millis(1500);
// Finder has copied the files by then.
const COPY_SETTLE: Duration = Duration::from_millis(300);
// After a move: look every half second, at most 15 seconds (§4).
const MOVE_EVERY: Duration = Duration::from_millis(500);
const MOVE_READS: u32 = 30;
const AX_TIMEOUT: f32 = 0.25;

const KEY_C: u16 = 8;
const KEY_V: u16 = 9;
const KEY_X: u16 = 7;
const FLAG_COMMAND: u64 = 0x0010_0000;
const FLAG_OPTION: u64 = 0x0008_0000;
// Marks the keys Notching sends, so the tap lets them through: "ncut".
const MARK: i64 = 0x6e63_7574;

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGEventTapCreate(
        tap: u32,
        place: u32,
        options: u32,
        events: u64,
        callback: extern "C" fn(*mut c_void, u32, *mut c_void, *mut c_void) -> *mut c_void,
        user_info: *mut c_void,
    ) -> *mut c_void;
    fn CGEventTapEnable(tap: *mut c_void, enable: bool);
    fn CGEventGetIntegerValueField(event: *mut c_void, field: u32) -> i64;
    fn CGEventSetIntegerValueField(event: *mut c_void, field: u32, value: i64);
    fn CGEventGetFlags(event: *mut c_void) -> u64;
    fn CGEventSetFlags(event: *mut c_void, flags: u64);
    fn CGEventCreateKeyboardEvent(source: *const c_void, key: u16, down: bool) -> *mut c_void;
    fn CGEventPost(tap: u32, event: *mut c_void);
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFMachPortCreateRunLoopSource(allocator: *const c_void, port: *mut c_void, order: isize) -> *mut c_void;
    fn CFMachPortInvalidate(port: *mut c_void);
    fn CFRunLoopGetMain() -> *mut c_void;
    fn CFRunLoopAddSource(rl: *mut c_void, source: *mut c_void, mode: *const c_void);
    fn CFRunLoopRemoveSource(rl: *mut c_void, source: *mut c_void, mode: *const c_void);
    fn CFRelease(cf: *const c_void);
    static kCFRunLoopCommonModes: *const c_void;
}

const SESSION_TAP: u32 = 1; // kCGSessionEventTap
const HEAD_INSERT: u32 = 0; // kCGHeadInsertEventTap
const FILTER: u32 = 0; // kCGEventTapOptionDefault: may drop events
const KEY_DOWN: u32 = 10;
const DISABLED_BY_TIMEOUT: u32 = 0xFFFF_FFFE;
const DISABLED_BY_USER_INPUT: u32 = 0xFFFF_FFFF;
const FIELD_AUTOREPEAT: u32 = 8; // kCGKeyboardEventAutorepeat
const FIELD_KEYCODE: u32 = 9; // kCGKeyboardEventKeycode
const FIELD_USER_DATA: u32 = 42; // kCGEventSourceUserData

static APP: OnceLock<AppHandle> = OnceLock::new();
static TAP: Mutex<Option<Tap>> = Mutex::new(None);
static PORT: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
// The files ⌘X marked, until a ⌘V moves them or the clipboard changes (§4).
static CUT: Mutex<Option<Cut>> = Mutex::new(None);

thread_local! {
    static OBSERVER: RefCell<Option<Retained<ProtocolObject<dyn NSObjectProtocol>>>> = const { RefCell::new(None) };
}

fn enabled(app: &AppHandle) -> bool {
    app.state::<CoreState>().0.lock().unwrap().module(MODULE_ID).is_some_and(|e| e.installed && e.enabled)
}

fn change_count() -> isize {
    NSPasteboard::generalPasteboard().changeCount()
}

// Main thread: Finder's pid when Finder is the app in front.
fn finder_in_front() -> Option<i32> {
    let front = NSWorkspace::sharedWorkspace().frontmostApplication()?;
    let finder = front.bundleIdentifier().is_some_and(|id| id.to_string() == FINDER);
    finder.then(|| front.processIdentifier())
}

extern "C" fn on_event(_proxy: *mut c_void, kind: u32, event: *mut c_void, _info: *mut c_void) -> *mut c_void {
    if kind == DISABLED_BY_TIMEOUT || kind == DISABLED_BY_USER_INPUT {
        let port = PORT.load(Ordering::SeqCst);
        if !port.is_null() {
            // SAFETY: the port lives until the tap is dropped, which clears PORT first.
            unsafe { CGEventTapEnable(port, true) };
        }
        return event;
    }
    if kind != KEY_DOWN {
        return event;
    }
    // SAFETY: `event` is the CGEventRef the tap was handed.
    let (keycode, flags, mark, repeat) = unsafe {
        (
            CGEventGetIntegerValueField(event, FIELD_KEYCODE),
            CGEventGetFlags(event),
            CGEventGetIntegerValueField(event, FIELD_USER_DATA),
            CGEventGetIntegerValueField(event, FIELD_AUTOREPEAT) != 0,
        )
    };
    let press = classify(keycode, flags);
    if press == Press::Other || mark == MARK {
        return event;
    }
    let Some(pid) = finder_in_front() else { return event };
    if press == Press::Paste && !paste_is_ours(CUT.lock().unwrap().as_ref(), change_count()) {
        return event;
    }
    // Held down, the key counts once.
    if !repeat {
        let Some(app) = APP.get().cloned() else { return event };
        std::thread::spawn(move || decide(&app, press, pid));
    }
    std::ptr::null_mut()
}

/// Sends a key down and up, marked as Notching's, to the app in front.
fn post(key: u16, flags: u64) {
    for down in [true, false] {
        // SAFETY: a fresh event from no source, released once after posting.
        unsafe {
            let event = CGEventCreateKeyboardEvent(std::ptr::null(), key, down);
            if event.is_null() {
                return;
            }
            CGEventSetFlags(event, flags);
            CGEventSetIntegerValueField(event, FIELD_USER_DATA, MARK);
            CGEventPost(SESSION_TAP, event);
            CFRelease(event);
        }
    }
}

// Off the main thread: Finder may take a moment to answer.
fn decide(app: &AppHandle, press: Press, pid: i32) {
    let finder = crate::ax::app(pid, AX_TIMEOUT);
    let typing = finder.as_ref().and_then(crate::ax::focused_role).is_some_and(|r| is_text_role(&r));
    match (press, typing) {
        (Press::Cut, true) => post(KEY_X, FLAG_COMMAND),
        (Press::Paste, true) => post(KEY_V, FLAG_COMMAND),
        (Press::Cut, false) => {
            post(KEY_C, FLAG_COMMAND);
            std::thread::sleep(COPY_SETTLE);
            remember(app);
        }
        (Press::Paste, false) => {
            let folder = finder.as_ref().and_then(crate::ax::focused_window).and_then(|w| crate::ax::title(&w));
            let Some(cut) = CUT.lock().unwrap().take() else { return };
            post(KEY_V, FLAG_COMMAND | FLAG_OPTION);
            follow(app, cut, folder);
        }
        (Press::Other, _) => {}
    }
}

fn file_paths(pb: &NSPasteboard) -> Vec<PathBuf> {
    let classes = NSArray::from_slice(&[NSURL::class()]);
    // SAFETY: NSURL is a class the pasteboard can read; no options.
    let Some(items) = (unsafe { pb.readObjectsForClasses_options(&classes, None) }) else { return Vec::new() };
    items
        .iter()
        .filter_map(|item| item.downcast::<NSURL>().ok())
        .filter(|url| url.isFileURL())
        .filter_map(|url| url.filePathURL().and_then(|u| u.path()))
        .map(|p| PathBuf::from(p.to_string()))
        .collect()
}

// After the ⌘C: what Finder put on the clipboard, read on the main thread.
fn remember(app: &AppHandle) {
    let (done, wait) = std::sync::mpsc::sync_channel(1);
    let sent = app.run_on_main_thread(move || {
        let pb = NSPasteboard::generalPasteboard();
        let _ = done.send((pb.changeCount(), file_paths(&pb)));
    });
    let Ok((change, paths)) = sent.map_err(|e| e.to_string()).and_then(|()| wait.recv().map_err(|e| e.to_string())) else {
        return;
    };
    if paths.is_empty() {
        return;
    }
    let n = paths.len();
    *CUT.lock().unwrap() = Some(Cut { paths, change });
    eprintln!("notching: {n} files cut");
    let title = notice_title(app, "notice.cut", n, "");
    notice(app, &title, &text(app, "notice.cut.detail").unwrap_or_default());
}

// After the ⌘⌥V: how many files left their place, then one notice.
fn follow(app: &AppHandle, cut: Cut, folder: Option<String>) {
    let exists = |p: &Path| p.symlink_metadata().is_ok();
    let mut gone = 0;
    for _ in 0..MOVE_READS {
        std::thread::sleep(MOVE_EVERY);
        gone = moved(&cut.paths, exists);
        if gone == cut.paths.len() {
            break;
        }
    }
    eprintln!("notching: {gone} of {} cut files moved", cut.paths.len());
    if gone == 0 {
        return;
    }
    let folder = folder.or_else(|| text(app, "notice.desktop")).unwrap_or_else(|| "Desktop".into());
    let title = notice_title(app, "notice.moved", gone, &folder);
    notice(app, &title, "");
}

fn text(app: &AppHandle, key: &str) -> Option<String> {
    app.state::<CoreState>().0.lock().unwrap().module_text(MODULE_ID, key)
}

fn notice_title(app: &AppHandle, key: &str, n: usize, folder: &str) -> String {
    let lang = app.state::<CoreState>().0.lock().unwrap().lang();
    fill(text(app, &format!("{key}.title")), text(app, &format!("{key}.titleOne")), n, folder, lang)
}

fn notice(app: &AppHandle, title: &str, detail: &str) {
    if let Err(e) = crate::notify::post(app, MODULE_ID, "moves", title, detail) {
        eprintln!("notching: the cut-files notice was not sent: {e}");
    }
}

/// The event tap on the main run loop, for key downs only.
struct Tap {
    port: *mut c_void,
    source: *mut c_void,
}

// SAFETY: the port and source are only added to and removed from the main run
// loop, which CoreFoundation allows from any thread.
unsafe impl Send for Tap {}

impl Tap {
    /// None when macOS refuses it (no Accessibility permission).
    fn install() -> Option<Tap> {
        // SAFETY: plain CoreGraphics and CoreFoundation calls with checked results.
        unsafe {
            let port = CGEventTapCreate(SESSION_TAP, HEAD_INSERT, FILTER, 1 << KEY_DOWN, on_event, std::ptr::null_mut());
            if port.is_null() {
                return None;
            }
            let source = CFMachPortCreateRunLoopSource(std::ptr::null(), port, 0);
            if source.is_null() {
                CFMachPortInvalidate(port);
                CFRelease(port);
                return None;
            }
            PORT.store(port, Ordering::SeqCst);
            CFRunLoopAddSource(CFRunLoopGetMain(), source, kCFRunLoopCommonModes);
            CGEventTapEnable(port, true);
            Some(Tap { port, source })
        }
    }
}

impl Drop for Tap {
    fn drop(&mut self) {
        let _ = PORT.compare_exchange(self.port, std::ptr::null_mut(), Ordering::SeqCst, Ordering::SeqCst);
        // SAFETY: both were created by `install` and are released once, here.
        unsafe {
            CGEventTapEnable(self.port, false);
            CFRunLoopRemoveSource(CFRunLoopGetMain(), self.source, kCFRunLoopCommonModes);
            CFMachPortInvalidate(self.port);
            CFRelease(self.source);
            CFRelease(self.port);
        }
    }
}

/// The tap as the tool's state and the permission say: in while the tool is on
/// and macOS allows it, out otherwise. Safe from any thread.
pub fn sync(app: &AppHandle) {
    let on = enabled(app);
    let mut tap = TAP.lock().unwrap();
    if !on {
        if tap.take().is_some() {
            eprintln!("notching: cut-files tap removed");
        }
        *CUT.lock().unwrap() = None;
        return;
    }
    if tap.is_none() && crate::keyclean_tap::trusted(false) {
        *tap = Tap::install();
        eprintln!("notching: cut-files tap installed: {}", tap.is_some());
    }
}

/// At launch, on the main thread: the tap, and a watch on the Accessibility list
/// so a permission given later takes effect without a restart.
pub fn start(app: &AppHandle) {
    let _ = APP.set(app.clone());
    sync(app);
    if MainThreadMarker::new().is_none() {
        return;
    }
    let handle = app.clone();
    let block = RcBlock::new(move |_: NonNull<NSNotification>| {
        let handle = handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(ACCESS_SETTLE);
            sync(&handle);
        });
    });
    let center = NSDistributedNotificationCenter::defaultCenter();
    // SAFETY: the block lives as long as its observer, kept for the app's life.
    let observer = unsafe {
        center.addObserverForName_object_queue_usingBlock(
            Some(&NSString::from_str(ACCESS_CHANGED)),
            None,
            Some(&NSOperationQueue::mainQueue()),
            &block,
        )
    };
    OBSERVER.with(|o| *o.borrow_mut() = Some(observer));
}
