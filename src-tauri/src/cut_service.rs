//! Potong file in the core (design 4 Nov, alat latar §4): a keyboard event tap
//! that only acts on ⌘X and ⌘V while Finder is in front. ⌘X becomes ⌘C and the
//! files are remembered; the next ⌘V becomes ⌘⌥V, Finder's "Move Item Here".
//! In a text field both keys stay as they are. Every other key passes untouched.
//!
//! The tap runs on a thread of its own, so typing never waits for the main
//! thread. Which app is in front is kept from AppKit's own notice, and the key
//! that types "c" from the keyboard layout, so the tap asks AppKit nothing.

use std::cell::RefCell;
use std::ffi::c_void;
use std::path::{Path, PathBuf};
use std::ptr::NonNull;
use std::sync::atomic::{AtomicI32, AtomicPtr, AtomicU16, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{ClassType, MainThreadMarker};
use objc2_app_kit::{NSPasteboard, NSWorkspace, NSWorkspaceDidActivateApplicationNotification};
use objc2_foundation::{
    NSArray, NSDistributedNotificationCenter, NSNotification, NSNotificationCenter, NSObjectProtocol, NSOperationQueue,
    NSString, NSURL,
};
use tauri::{AppHandle, Manager};

use crate::app_core::CoreState;
use crate::cut_rules::{classify, copied, fill, moved, paste_is_ours, typing, Cut, Press};

pub const MODULE_ID: &str = "cut-files";
const FINDER: &str = "com.apple.finder";
// macOS posts this when the Accessibility list changes; the trust follows a moment later.
const ACCESS_CHANGED: &str = "com.apple.accessibility.api";
const LAYOUT_CHANGED: &str = "com.apple.Carbon.TISNotifySelectedKeyboardInputSourceChanged";
const ACCESS_SETTLE: Duration = Duration::from_millis(1500);
// After ⌘C: wait for Finder to fill the clipboard, at most a second.
const COPY_EVERY: Duration = Duration::from_millis(50);
const COPY_READS: u32 = 20;
// After a move: look every half second, at most 15 seconds (§4).
const MOVE_EVERY: Duration = Duration::from_millis(500);
const MOVE_READS: u32 = 30;

// The QWERTY place of C, until the layout says otherwise.
const QWERTY_C: u16 = 8;
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
    fn CGEventKeyboardGetUnicodeString(event: *mut c_void, max: usize, actual: *mut usize, chars: *mut u16);
    fn CGEventPost(tap: u32, event: *mut c_void);
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFMachPortCreateRunLoopSource(allocator: *const c_void, port: *mut c_void, order: isize) -> *mut c_void;
    fn CFMachPortInvalidate(port: *mut c_void);
    fn CFRunLoopGetCurrent() -> *mut c_void;
    fn CFRunLoopRun();
    fn CFRunLoopStop(rl: *mut c_void);
    fn CFRunLoopAddSource(rl: *mut c_void, source: *mut c_void, mode: *const c_void);
    fn CFRunLoopRemoveSource(rl: *mut c_void, source: *mut c_void, mode: *const c_void);
    fn CFRetain(cf: *const c_void) -> *const c_void;
    fn CFRelease(cf: *const c_void);
    fn CFDataGetBytePtr(data: *const c_void) -> *const u8;
    static kCFRunLoopDefaultMode: *const c_void;
}

#[link(name = "Carbon", kind = "framework")]
unsafe extern "C" {
    fn TISCopyCurrentKeyboardLayoutInputSource() -> *const c_void;
    fn TISGetInputSourceProperty(source: *const c_void, key: *const c_void) -> *const c_void;
    fn LMGetKbdType() -> u8;
    fn UCKeyTranslate(
        layout: *const u8,
        key: u16,
        action: u16,
        modifiers: u32,
        keyboard_type: u32,
        options: u32,
        dead_key_state: *mut u32,
        max: usize,
        actual: *mut usize,
        chars: *mut u16,
    ) -> i32;
    static kTISPropertyUnicodeKeyLayoutData: *const c_void;
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
const UC_KEY_DOWN: u16 = 0; // kUCKeyActionDown
const UC_CMD: u32 = 1; // (cmdKey >> 8) & 0xFF: the layout's ⌘ table
const UC_NO_DEAD_KEYS: u32 = 1; // kUCKeyTranslateNoDeadKeysMask

static APP: OnceLock<AppHandle> = OnceLock::new();
static TAP: Mutex<Option<Tap>> = Mutex::new(None);
// The live tap's port, for re-enabling it on its own thread.
static PORT: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
// Finder's pid while it is the app in front, else 0.
static FINDER_PID: AtomicI32 = AtomicI32::new(0);
// The key that types "c" with ⌘ in the current layout.
static KEY_C: AtomicU16 = AtomicU16::new(QWERTY_C);
// The files ⌘X marked, until a ⌘V moves them or the clipboard changes (§4).
static CUT: Mutex<Option<Cut>> = Mutex::new(None);

thread_local! {
    static OBSERVERS: RefCell<Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>> = const { RefCell::new(Vec::new()) };
}

fn enabled(app: &AppHandle) -> bool {
    app.state::<CoreState>().0.lock().unwrap().module(MODULE_ID).is_some_and(|e| e.installed && e.enabled)
}

// Main thread: who is in front now.
fn note_front() {
    let pid = NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .filter(|a| a.bundleIdentifier().is_some_and(|id| id.to_string() == FINDER))
        .map_or(0, |a| a.processIdentifier());
    FINDER_PID.store(pid, Ordering::SeqCst);
}

// Main thread (the Text Input Sources calls ask for it): the key that types "c"
// with ⌘ held, in the current layout. QWERTY's place when it can't be read.
fn note_layout() {
    // SAFETY: TIS and UCKeyTranslate with checked pointers; the source is released once.
    let code = unsafe {
        let source = TISCopyCurrentKeyboardLayoutInputSource();
        if source.is_null() {
            return;
        }
        let data = TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData);
        let layout = if data.is_null() { std::ptr::null() } else { CFDataGetBytePtr(data) };
        let found = (!layout.is_null())
            .then(|| {
                (0u16..128).find(|&key| {
                    let mut dead = 0u32;
                    let mut len = 0usize;
                    let mut chars = [0u16; 4];
                    let status = UCKeyTranslate(
                        layout,
                        key,
                        UC_KEY_DOWN,
                        UC_CMD,
                        u32::from(LMGetKbdType()),
                        UC_NO_DEAD_KEYS,
                        &mut dead,
                        chars.len(),
                        &mut len,
                        chars.as_mut_ptr(),
                    );
                    status == 0 && len == 1 && (chars[0] == u16::from(b'c') || chars[0] == u16::from(b'C'))
                })
            })
            .flatten();
        CFRelease(source);
        found.unwrap_or(QWERTY_C)
    };
    KEY_C.store(code, Ordering::SeqCst);
}

fn typed_char(event: *mut c_void) -> Option<char> {
    let mut len = 0usize;
    let mut chars = [0u16; 4];
    // SAFETY: the buffer is as large as the max passed.
    unsafe { CGEventKeyboardGetUnicodeString(event, chars.len(), &mut len, chars.as_mut_ptr()) };
    (len == 1).then(|| char::from_u32(u32::from(chars[0]))).flatten()
}

// On the tap's thread. Reads only atomics, the event and the clipboard's count.
extern "C" fn on_event(_proxy: *mut c_void, kind: u32, event: *mut c_void, _info: *mut c_void) -> *mut c_void {
    if kind == DISABLED_BY_TIMEOUT || kind == DISABLED_BY_USER_INPUT {
        let port = PORT.load(Ordering::SeqCst);
        if !port.is_null() {
            // SAFETY: the port is released only on this same thread, after its run loop ends.
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
    if mark == MARK || flags & FLAG_COMMAND == 0 {
        return event;
    }
    let pid = FINDER_PID.load(Ordering::SeqCst);
    if pid == 0 {
        return event;
    }
    let press = classify(typed_char(event), keycode, flags);
    if press == Press::Other {
        return event;
    }
    if press == Press::Paste && !paste_is_ours(CUT.lock().unwrap().as_ref(), NSPasteboard::generalPasteboard().changeCount()) {
        return event;
    }
    // Held down, the key counts once.
    if !repeat {
        let Some(app) = APP.get().cloned() else { return event };
        let key = keycode as u16;
        std::thread::spawn(move || decide(&app, press, key, pid));
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

// Off the tap's thread: Finder may take a moment to answer. `key` is the key
// that was pressed, sent back as it was when Finder is being typed in.
fn decide(app: &AppHandle, press: Press, key: u16, pid: i32) {
    let finder = crate::ax::app(pid);
    let role = finder.as_ref().map_or(Err(()), crate::ax::focused_role);
    if typing(role) {
        post(key, FLAG_COMMAND);
        return;
    }
    match press {
        Press::Cut => {
            let before = NSPasteboard::generalPasteboard().changeCount();
            post(KEY_C.load(Ordering::SeqCst), FLAG_COMMAND);
            remember(app, before);
        }
        Press::Paste => {
            let folder = finder.as_ref().and_then(crate::ax::focused_window_only).and_then(|w| crate::ax::title(&w));
            let Some(cut) = CUT.lock().unwrap().take() else { return };
            post(key, FLAG_COMMAND | FLAG_OPTION);
            follow(app, cut, folder);
        }
        Press::Other => {}
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

// After the ⌘C: once the clipboard changed, what Finder put there. Nothing is
// cut when it did not change (nothing selected) or holds no files (§4).
fn remember(app: &AppHandle, before: isize) {
    for _ in 0..COPY_READS {
        std::thread::sleep(COPY_EVERY);
        let pb = NSPasteboard::generalPasteboard();
        let change = pb.changeCount();
        if change == before {
            continue;
        }
        let paths = file_paths(&pb);
        if !copied(before, change, paths.len()) {
            return;
        }
        let n = paths.len();
        *CUT.lock().unwrap() = Some(Cut { paths, change });
        eprintln!("notching: {n} files cut");
        let title = notice_title(app, "notice.cut", n, "");
        notice(app, &title, &text(app, "notice.cut.detail").unwrap_or_default());
        return;
    }
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

/// The event tap, for key downs only, on a run loop of its own thread. Dropping
/// it stops that run loop; the thread then takes the tap down itself.
struct Tap {
    run_loop: *mut c_void,
    thread: Option<std::thread::JoinHandle<()>>,
}

// SAFETY: the run loop ref is retained and only used to stop it, which
// CoreFoundation allows from any thread.
unsafe impl Send for Tap {}

struct Ptr(*mut c_void);
// SAFETY: only carried from the tap's thread back to the one that started it.
unsafe impl Send for Ptr {}

impl Tap {
    /// None when macOS refuses it (no Accessibility permission).
    fn install() -> Option<Tap> {
        let (sent, got) = std::sync::mpsc::sync_channel::<Option<Ptr>>(1);
        let thread = std::thread::Builder::new()
            .name("notching-cut-tap".into())
            .spawn(move || {
                // SAFETY: plain CoreGraphics and CoreFoundation calls with checked
                // results; everything made here is released here, once.
                unsafe {
                    let port = CGEventTapCreate(SESSION_TAP, HEAD_INSERT, FILTER, 1 << KEY_DOWN, on_event, std::ptr::null_mut());
                    if port.is_null() {
                        let _ = sent.send(None);
                        return;
                    }
                    let source = CFMachPortCreateRunLoopSource(std::ptr::null(), port, 0);
                    if source.is_null() {
                        CFMachPortInvalidate(port);
                        CFRelease(port);
                        let _ = sent.send(None);
                        return;
                    }
                    let rl = CFRunLoopGetCurrent();
                    CFRunLoopAddSource(rl, source, kCFRunLoopDefaultMode);
                    PORT.store(port, Ordering::SeqCst);
                    CGEventTapEnable(port, true);
                    let _ = sent.send(Some(Ptr(CFRetain(rl) as *mut c_void)));
                    CFRunLoopRun();
                    PORT.store(std::ptr::null_mut(), Ordering::SeqCst);
                    CGEventTapEnable(port, false);
                    CFRunLoopRemoveSource(rl, source, kCFRunLoopDefaultMode);
                    CFMachPortInvalidate(port);
                    CFRelease(source);
                    CFRelease(port);
                }
            })
            .ok()?;
        match got.recv() {
            Ok(Some(rl)) => Some(Tap { run_loop: rl.0, thread: Some(thread) }),
            _ => {
                let _ = thread.join();
                None
            }
        }
    }
}

impl Drop for Tap {
    fn drop(&mut self) {
        // SAFETY: the run loop was retained by `install` and is released once, here.
        unsafe { CFRunLoopStop(self.run_loop) };
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        // SAFETY: as above.
        unsafe { CFRelease(self.run_loop) };
    }
}

/// The tap as the tool's state and the permission say: in while the tool is on
/// and macOS allows it, out otherwise, also when the permission was taken away.
/// Safe from any thread.
pub fn sync(app: &AppHandle) {
    let wanted = enabled(app) && crate::keyclean_tap::trusted(false);
    let mut tap = TAP.lock().unwrap();
    if !wanted {
        if tap.take().is_some() {
            eprintln!("notching: cut-files tap removed");
        }
        *CUT.lock().unwrap() = None;
        return;
    }
    if tap.is_none() {
        *tap = Tap::install();
        eprintln!("notching: cut-files tap installed: {}", tap.is_some());
    }
}

fn observe(center: &NSNotificationCenter, name: &NSString, run: impl Fn() + 'static) {
    let block = RcBlock::new(move |_: NonNull<NSNotification>| run());
    // SAFETY: the block lives as long as its observer, kept for the app's life.
    let observer =
        unsafe { center.addObserverForName_object_queue_usingBlock(Some(name), None, Some(&NSOperationQueue::mainQueue()), &block) };
    OBSERVERS.with(|o| o.borrow_mut().push(observer));
}

/// At launch, on the main thread: who is in front, the layout, the tap, and
/// watches on all three, so a permission given later works without a restart.
pub fn start(app: &AppHandle) {
    let _ = APP.set(app.clone());
    if MainThreadMarker::new().is_none() {
        return;
    }
    note_front();
    note_layout();
    sync(app);
    let workspace = NSWorkspace::sharedWorkspace().notificationCenter();
    // SAFETY: AppKit's notification name is a static string.
    observe(&workspace, unsafe { NSWorkspaceDidActivateApplicationNotification }, note_front);
    let distributed = NSDistributedNotificationCenter::defaultCenter();
    observe(&distributed, &NSString::from_str(LAYOUT_CHANGED), note_layout);
    let handle = app.clone();
    observe(&distributed, &NSString::from_str(ACCESS_CHANGED), move || {
        let handle = handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(ACCESS_SETTLE);
            sync(&handle);
        });
    });
}
