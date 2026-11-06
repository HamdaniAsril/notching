//! Which Dock icon the pointer is on (Intip jendela, design 5 Nov §6, §8): an
//! Accessibility observer on the Dock's icon list, told by the Dock itself when
//! the icon under the pointer changes. Nothing is polled. A restarted Dock
//! (`killall Dock`, a Dock setting changed) is followed through the workspace's
//! launch notices. Main thread, except `hovered_at` and `dock_pid`.

use std::cell::{Cell, RefCell};
use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::Mutex;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2_app_kit::{NSRunningApplication, NSWorkspace, NSWorkspaceDidLaunchApplicationNotification};
use objc2_foundation::{NSNotification, NSObjectProtocol, NSOperationQueue, NSString};

use crate::ax::{self, Cf, Observer};
use crate::geometry::Rect;

const DOCK: &str = "com.apple.dock";
const APP_ITEM: &str = "AXApplicationDockItem";

/// An app's icon in the Dock. `pid` is None when the app is not running.
/// `frame` is in global CG points (origin top-left of the main screen).
#[derive(Clone, Debug, PartialEq)]
pub struct DockItem {
    pub pid: Option<i32>,
    pub name: String,
    pub frame: Rect,
}

static DOCK_PID: AtomicI32 = AtomicI32::new(0);
// The app icon under the pointer, as the Dock last said, with its element; for
// the click tap.
static HOVERED: Mutex<Option<(DockItem, Cf)>> = Mutex::new(None);

type Launches = Option<Retained<ProtocolObject<dyn NSObjectProtocol>>>;
type OnHover = fn(Option<DockItem>);

struct Watch {
    _observer: Observer,
    list: Cf,
}

thread_local! {
    static WATCH: RefCell<Option<Watch>> = const { RefCell::new(None) };
    static ON_HOVER: Cell<Option<OnHover>> = const { Cell::new(None) };
    static LAUNCHES: RefCell<Launches> = const { RefCell::new(None) };
}

/// The Dock's process id, once watched.
pub fn dock_pid() -> Option<i32> {
    Some(DOCK_PID.load(Ordering::SeqCst)).filter(|&p| p > 0)
}

fn running_dock() -> Option<i32> {
    NSRunningApplication::runningApplicationsWithBundleIdentifier(&NSString::from_str(DOCK))
        .iter()
        .map(|a| a.processIdentifier())
        .find(|&p| p > 0)
}

// The running app whose bundle is at `path`, through symlinks too
// (/Applications/Safari.app is one).
fn pid_of_bundle(path: &str) -> Option<i32> {
    NSWorkspace::sharedWorkspace()
        .runningApplications()
        .iter()
        .find(|a| a.bundleURL().and_then(|u| u.path()).is_some_and(|p| crate::peek_rules::same_bundle(&p.to_string(), path)))
        .map(|a| a.processIdentifier())
}

// An app icon of the Dock as a DockItem; folders, the Trash and minimized
// windows are not.
fn item(element: &Cf) -> Option<DockItem> {
    if ax::subrole(element).as_deref() != Some(APP_ITEM) {
        return None;
    }
    let frame = ax::frame(element)?;
    let pid = ax::url(element).and_then(|p| pid_of_bundle(&p));
    Some(DockItem { pid, name: ax::title(element).unwrap_or_default(), frame })
}

/// The app icon the pointer is on, if it contains this point (global CG
/// points). Its frame is read again from the Dock: minimized windows joining
/// the Dock, magnification or auto-hide move the icons after they were
/// hovered. With no icon hovered nothing is asked, so a click elsewhere costs
/// nothing. Safe from any thread.
pub fn hovered_at(x: f64, y: f64) -> Option<DockItem> {
    let (item, element) = HOVERED.lock().unwrap().clone()?;
    let frame = ax::frame(&element).unwrap_or(item.frame);
    frame.contains(x, y).then_some(DockItem { frame, ..item })
}

unsafe extern "C" fn on_selected(_observer: *const c_void, _element: *const c_void, _name: *const c_void, _refcon: *mut c_void) {
    let hovered = WATCH.with(|w| {
        w.borrow().as_ref().and_then(|w| ax::selected_children(&w.list).into_iter().next().and_then(|e| item(&e).map(|i| (i, e))))
    });
    let item = hovered.as_ref().map(|(i, _)| i.clone());
    *HOVERED.lock().unwrap() = hovered;
    let hovered = item;
    if let Some(on_hover) = ON_HOVER.get() {
        on_hover(hovered);
    }
}

fn detach() {
    WATCH.with(|w| *w.borrow_mut() = None);
    DOCK_PID.store(0, Ordering::SeqCst);
    *HOVERED.lock().unwrap() = None;
}

// Watches the running Dock's icon list, replacing any earlier watch. True once
// watched; the Dock's pid is kept only then.
fn attach() -> bool {
    detach();
    let Some(pid) = running_dock() else { return false };
    let Some(app) = ax::app(pid) else { return false };
    let Some(list) = ax::children(&app).into_iter().find(|c| ax::role(c).as_deref() == Some("AXList")) else { return false };
    let Some(observer) = Observer::new(pid, on_selected) else { return false };
    if !observer.watch(&list, "AXSelectedChildrenChanged") {
        eprintln!("notching: dock watch refused for pid {pid}");
        return false;
    }
    eprintln!("notching: dock watch attached to pid {pid}");
    WATCH.with(|w| *w.borrow_mut() = Some(Watch { _observer: observer, list }));
    DOCK_PID.store(pid, Ordering::SeqCst);
    watch_exit(pid);
    true
}

// Bumped by every start and stop, so retries and exit watches of an older one stop.
static ROUND: AtomicI32 = AtomicI32::new(0);

// Tries to watch the Dock now, then after each retry delay until it works
// (a Dock just started, or the login, may not answer yet). Main thread.
fn attach_with_retries(attempt: u32) {
    if ON_HOVER.get().is_none() || attach() {
        return;
    }
    let Some(delay) = crate::peek_rules::retry_delay(attempt) else { return };
    let round = ROUND.load(Ordering::SeqCst);
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(delay));
        if let Some(app) = APP_HANDLE.get() {
            let _ = app.run_on_main_thread(move || {
                if ROUND.load(Ordering::SeqCst) == round {
                    attach_with_retries(attempt + 1);
                }
            });
        }
    });
}

// Waits on a thread of its own for the Dock process to end (a kqueue, so it
// costs nothing meanwhile), then watches the next Dock. The Dock is a UI
// element app, which the workspace's launch notices may leave out.
fn watch_exit(pid: i32) {
    let round = ROUND.load(Ordering::SeqCst);
    std::thread::spawn(move || {
        // SAFETY: a kqueue of our own, one process-exit filter, closed once.
        let exited = unsafe {
            let kq = libc::kqueue();
            if kq < 0 {
                return;
            }
            let change = libc::kevent {
                ident: pid as usize,
                filter: libc::EVFILT_PROC,
                flags: libc::EV_ADD | libc::EV_ONESHOT,
                fflags: libc::NOTE_EXIT,
                data: 0,
                udata: std::ptr::null_mut(),
            };
            let mut event: libc::kevent = std::mem::zeroed();
            let n = libc::kevent(kq, &change, 1, &mut event, 1, std::ptr::null());
            libc::close(kq);
            n > 0
        };
        if !exited {
            return;
        }
        if let Some(app) = APP_HANDLE.get() {
            let _ = app.run_on_main_thread(move || {
                if ROUND.load(Ordering::SeqCst) == round && ON_HOVER.get().is_some() {
                    eprintln!("notching: the dock (pid {pid}) went away; watching the next one");
                    detach();
                    attach_with_retries(0);
                }
            });
        }
    });
}

static APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

/// Starts telling `on_hover` which app icon the pointer is on (None: none).
/// Main thread.
pub fn start(app: &tauri::AppHandle, on_hover: OnHover) {
    let _ = APP_HANDLE.set(app.clone());
    ROUND.fetch_add(1, Ordering::SeqCst);
    ON_HOVER.set(Some(on_hover));
    attach_with_retries(0);
    LAUNCHES.with(|l| {
        if l.borrow().is_some() {
            return;
        }
        let block = RcBlock::new(move |_: NonNull<NSNotification>| {
            // A new Dock process: watch it instead, while the watch is wanted.
            if ON_HOVER.get().is_some() && running_dock() != dock_pid() {
                attach_with_retries(0);
            }
        });
        let center = NSWorkspace::sharedWorkspace().notificationCenter();
        // SAFETY: AppKit's notification name is a static string; the block lives
        // as long as its observer, kept for the app's life.
        let observer = unsafe {
            center.addObserverForName_object_queue_usingBlock(
                Some(NSWorkspaceDidLaunchApplicationNotification),
                None,
                Some(&NSOperationQueue::mainQueue()),
                &block,
            )
        };
        *l.borrow_mut() = Some(observer);
    });
}

/// Stops the watch. Main thread.
pub fn stop() {
    ROUND.fetch_add(1, Ordering::SeqCst);
    ON_HOVER.set(None);
    detach();
}
