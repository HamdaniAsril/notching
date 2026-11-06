//! Clicking an app's Dock icon (Intip jendela, design 5 Nov §6): a session
//! event tap for the left button, on a thread of its own, that holds back a
//! press on the icon of a running app with windows. A short click then
//! minimizes or brings back all its windows. A drag (rearranging the Dock) or a
//! long press (the Dock's menu) gets the press replayed and goes on as the
//! Dock's own. Presses anywhere else pass at once: the icon under the pointer
//! comes from the Dock watch (peek_dock.rs), so nothing is asked of any app.

use std::ffi::c_void;
use std::sync::atomic::{AtomicPtr, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use crate::peek_rules::{click_plan, plain_click, ClickPlan, DockPress, PressAction, PressEvent, LONG_PRESS_MS};

// Marks the presses Notching posts, so the tap lets them through: "ncpk".
const MARK: i64 = 0x6e63_706b;

#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
struct CGPoint {
    x: f64,
    y: f64,
}

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
    fn CGEventGetLocation(event: *mut c_void) -> CGPoint;
    fn CGEventGetFlags(event: *mut c_void) -> u64;
    fn CGEventCreateMouseEvent(source: *const c_void, kind: u32, at: CGPoint, button: u32) -> *mut c_void;
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
    static kCFRunLoopDefaultMode: *const c_void;
}

const SESSION_TAP: u32 = 1; // kCGSessionEventTap
const HEAD_INSERT: u32 = 0; // kCGHeadInsertEventTap
const FILTER: u32 = 0; // kCGEventTapOptionDefault: may drop events
const LEFT_DOWN: u32 = 1;
const LEFT_UP: u32 = 2;
const LEFT_DRAGGED: u32 = 6;
const LEFT_BUTTON: u32 = 0;
const DISABLED_BY_TIMEOUT: u32 = 0xFFFF_FFFE;
const DISABLED_BY_USER_INPUT: u32 = 0xFFFF_FFFF;
const FIELD_USER_DATA: u32 = 42; // kCGEventSourceUserData

static TAP: Mutex<Option<Tap>> = Mutex::new(None);
static PORT: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
static PRESS: Mutex<DockPress> = Mutex::new(DockPress::new());
// Where the press being held went down, to replay it there.
static HELD: Mutex<CGPoint> = Mutex::new(CGPoint { x: 0.0, y: 0.0 });
static START: LazyLock<Instant> = LazyLock::new(Instant::now);

fn now_ms() -> u64 {
    START.elapsed().as_millis() as u64
}

// Posts a marked left-button event at `at`, for the Dock.
fn post(kind: u32, at: CGPoint) {
    // SAFETY: a fresh event from no source, released once after posting.
    unsafe {
        let event = CGEventCreateMouseEvent(std::ptr::null(), kind, at, LEFT_BUTTON);
        if event.is_null() {
            return;
        }
        CGEventSetIntegerValueField(event, FIELD_USER_DATA, MARK);
        CGEventPost(SESSION_TAP, event);
        CFRelease(event);
    }
}

// After LONG_PRESS_MS a press still held is the Dock's long press.
fn start_timer() {
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_millis(LONG_PRESS_MS));
        if PRESS.lock().unwrap().on(PressEvent::Timer { ms: now_ms() }) == PressAction::Replay {
            post(LEFT_DOWN, *HELD.lock().unwrap());
        }
    });
}

// Off the tap's thread: Accessibility may take a moment.
fn act(pid: i32, at: CGPoint) {
    let windows = crate::peek_windows::app_windows(pid);
    let plan = click_plan(pid, &windows, crate::peek_windows::front_pid());
    eprintln!("notching: dock click on pid {pid}: {plan:?}");
    match plan {
        ClickPlan::MinimizeAll(ids) => {
            // Pictures first, side by side, so the windows then go down together.
            crate::peek_capture::remember_all_before_minimize(&ids, Duration::from_millis(600));
            for id in ids {
                crate::peek_windows::minimize(pid, id);
            }
        }
        ClickPlan::ShowAll(ids) => crate::peek_windows::show_all(pid, &ids),
        // No window after all: the Dock's own click.
        ClickPlan::Pass => {
            post(LEFT_DOWN, at);
            post(LEFT_UP, at);
        }
    }
}

extern "C" fn on_event(_proxy: *mut c_void, kind: u32, event: *mut c_void, _info: *mut c_void) -> *mut c_void {
    if kind == DISABLED_BY_TIMEOUT || kind == DISABLED_BY_USER_INPUT {
        let port = PORT.load(Ordering::SeqCst);
        if !port.is_null() {
            // SAFETY: the port is released only on this same thread, after its run loop ends.
            unsafe { CGEventTapEnable(port, true) };
        }
        return event;
    }
    // SAFETY: `event` is the CGEventRef the tap was handed.
    let (mark, at, flags) =
        unsafe { (CGEventGetIntegerValueField(event, FIELD_USER_DATA), CGEventGetLocation(event), CGEventGetFlags(event)) };
    if mark == MARK {
        return event;
    }
    let ev = match kind {
        LEFT_DOWN => {
            let item = crate::peek_dock::hovered_at(at.x, at.y);
            if item.is_some() {
                crate::peek_service::hide();
            }
            // ⌃⌘⌥⇧-clicks stay the Dock's (its menu, Show in Finder, hide others).
            let on_app =
                item.and_then(|i| i.pid).filter(|&pid| plain_click(flags) && crate::peek_windows::has_windows(pid));
            PressEvent::Down { on_app, at: (at.x, at.y), ms: now_ms() }
        }
        LEFT_DRAGGED => PressEvent::Dragged { at: (at.x, at.y) },
        LEFT_UP => PressEvent::Up { ms: now_ms() },
        _ => return event,
    };
    let action = PRESS.lock().unwrap().on(ev);
    match action {
        PressAction::Pass => event,
        PressAction::Swallow => {
            if kind == LEFT_DOWN {
                *HELD.lock().unwrap() = at;
                start_timer();
            }
            std::ptr::null_mut()
        }
        PressAction::Replay => {
            post(LEFT_DOWN, *HELD.lock().unwrap());
            event
        }
        PressAction::Act(pid) => {
            let held = *HELD.lock().unwrap();
            std::thread::spawn(move || act(pid, held));
            std::ptr::null_mut()
        }
    }
}

/// The event tap, for the left button only, on a run loop of its own thread.
/// Dropping it stops that run loop; the thread then takes the tap down itself.
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
        let mask = (1u64 << LEFT_DOWN) | (1u64 << LEFT_UP) | (1u64 << LEFT_DRAGGED);
        let thread = std::thread::Builder::new()
            .name("notching-peek-tap".into())
            .spawn(move || {
                // SAFETY: plain CoreGraphics and CoreFoundation calls with checked
                // results; everything made here is released here, once.
                unsafe {
                    let port = CGEventTapCreate(SESSION_TAP, HEAD_INSERT, FILTER, mask, on_event, std::ptr::null_mut());
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

/// The tap in while `want` (the tool on, its Dock click Notching's, and
/// Accessibility given), out otherwise. Safe from any thread.
pub fn sync(want: bool) {
    let mut tap = TAP.lock().unwrap();
    if !want {
        if tap.take().is_some() {
            eprintln!("notching: dock click tap removed");
        }
        *PRESS.lock().unwrap() = DockPress::new();
        return;
    }
    if tap.is_none() {
        *tap = Tap::install();
        eprintln!("notching: dock click tap installed: {}", tap.is_some());
    }
}
