//! Which Dock icon the pointer is on (Intip jendela, design 5 Nov §6, §8): an
//! Accessibility observer on the Dock's icon list, told by the Dock itself when
//! the icon under the pointer changes. Nothing is polled. A restarted Dock
//! (`killall Dock`, a Dock setting changed) is followed through the workspace's
//! launch notices. Main thread, except `item_at` and `dock_pid`.

use std::cell::{Cell, RefCell};
use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicI32, Ordering};

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

type Launches = Option<Retained<ProtocolObject<dyn NSObjectProtocol>>>;

struct Watch {
    _observer: Observer,
    list: Cf,
}

thread_local! {
    static WATCH: RefCell<Option<Watch>> = const { RefCell::new(None) };
    static ON_HOVER: Cell<Option<fn(Option<DockItem>)>> = const { Cell::new(None) };
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

// The running app whose bundle is at `path`.
fn pid_of_bundle(path: &str) -> Option<i32> {
    let path = path.trim_end_matches('/');
    NSWorkspace::sharedWorkspace()
        .runningApplications()
        .iter()
        .find(|a| a.bundleURL().and_then(|u| u.path()).is_some_and(|p| p.to_string().trim_end_matches('/') == path))
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

/// The app icon at a point in global CG points, if any. Safe from any thread.
pub fn item_at(x: f64, y: f64) -> Option<DockItem> {
    let dock = ax::app(dock_pid()?)?;
    let element = ax::element_at(&dock, x, y)?;
    if ax::pid(&element) != dock_pid() {
        return None;
    }
    item(&element)
}

unsafe extern "C" fn on_selected(_observer: *const c_void, _element: *const c_void, _name: *const c_void, _refcon: *mut c_void) {
    let hovered = WATCH.with(|w| w.borrow().as_ref().and_then(|w| ax::selected_children(&w.list).first().and_then(item)));
    if let Some(on_hover) = ON_HOVER.get() {
        on_hover(hovered);
    }
}

// Watches the running Dock's icon list, replacing any earlier watch.
fn attach() {
    WATCH.with(|w| *w.borrow_mut() = None);
    let Some(pid) = running_dock() else {
        DOCK_PID.store(0, Ordering::SeqCst);
        return;
    };
    DOCK_PID.store(pid, Ordering::SeqCst);
    let Some(app) = ax::app(pid) else { return };
    let Some(list) = ax::children(&app).into_iter().find(|c| ax::role(c).as_deref() == Some("AXList")) else { return };
    let Some(observer) = Observer::new(pid, on_selected) else { return };
    if !observer.watch(&list, "AXSelectedChildrenChanged") {
        eprintln!("notching: dock watch refused for pid {pid}");
        return;
    }
    eprintln!("notching: dock watch attached to pid {pid}");
    WATCH.with(|w| *w.borrow_mut() = Some(Watch { _observer: observer, list }));
}

/// Starts telling `on_hover` which app icon the pointer is on (None: none).
/// Main thread.
pub fn start(on_hover: fn(Option<DockItem>)) {
    ON_HOVER.set(Some(on_hover));
    attach();
    LAUNCHES.with(|l| {
        if l.borrow().is_some() {
            return;
        }
        let block = RcBlock::new(move |_: NonNull<NSNotification>| {
            // A new Dock process: watch it instead, while the watch is wanted.
            if ON_HOVER.get().is_some() && running_dock() != dock_pid() {
                attach();
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
    ON_HOVER.set(None);
    WATCH.with(|w| *w.borrow_mut() = None);
}
