//! Intip jendela's window switcher (design 5 Nov §2.3, §6): its key, its list,
//! its panel and what its keys and clicks do. The key tap (switch_tap.rs)
//! sends each switcher key here, on the main thread. The list is made on
//! threads of their own, one per app, and waited for at most half a second;
//! a quick ⌘Tab let go before then opens the second item without a panel. The
//! panel is never closed, only ordered out, and never becomes key: the pointer
//! comes from native monitors, only while it is up.

use std::cell::RefCell;
use std::collections::HashMap;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU64, Ordering};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant};

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::MainThreadMarker;
use objc2_core_graphics::CGImage;
use objc2_app_kit::{NSApplicationActivationPolicy, NSEvent, NSEventMask, NSWorkspace};
use serde::Serialize;
use tauri::{AppHandle, Emitter, EventTarget, Manager};
use tauri_nspanel::ManagerExt;

use crate::app_core::CoreState;
use crate::geometry::Rect;
use crate::glass_capture::{self, Owner};
use crate::glass_rules::{opening, Snap};
use crate::glass_view::{self, Enter};
use crate::locale::Lang;
use crate::module_commands::change;
use crate::peek_rules::{card_point, CardColor, Material, PeekSettings, SwitchLayout, SwitchPlace};
use crate::shot_keys::{switch_from_web, Combo};
use crate::peek_rules::WinInfo;
use crate::switch_rules::{
    apps_of, first_selection, items, native_off, nothing_left, own_act, own_listed, refusal, show_delay, step, Act, Item, OwnAct,
    PointerGate, SwitchAction, SwitchKeyError,
};

pub(crate) const PANEL: &str = "switcher";
const VIEW_EVENT: &str = "notching://switch";
const POINTER_EVENT: &str = "notching://switch-pointer";
/// Above the Dock and the notch panels, like the peek card.
const LEVEL: i32 = 26;
/// How long the list may take: an app that has not answered by then is an app card.
const LIST_WAIT: Duration = Duration::from_millis(500);

// The list while the switcher is up.
#[derive(Clone)]
struct Open {
    items: Vec<Item>,
    apps: Vec<i32>,
    names: HashMap<i32, String>,
    sel: usize,
    win: usize,
    sticky: bool,
    screen: Rect,
    visible: Rect,
    // The panel may show: SHOW_AFTER has passed since the key.
    shown: bool,
}

static OPEN: Mutex<Option<Open>> = Mutex::new(None);
// Bumped at every opening and closing, so a list made for an older one is dropped.
static ROUND: AtomicU64 = AtomicU64::new(0);
// Keys pressed before the list was ready: moves, and whether it was let go.
static EARLY_STEPS: AtomicI32 = AtomicI32::new(0);
static EARLY_COMMIT: AtomicBool = AtomicBool::new(false);
static EARLY_ACT: Mutex<Option<Act>> = Mutex::new(None);
// One sync at a time: two at once could leave the tap out and macOS's ⌘Tab off.
static SYNC: Mutex<()> = Mutex::new(());
static ICONS: Mutex<Option<HashMap<i32, Option<String>>>> = Mutex::new(None);
static FRAME: Mutex<Option<Rect>> = Mutex::new(None);
// The panel's frame in CG points while it is up, for Notching's own glass.
static GLASS_AT: Mutex<Option<Rect>> = Mutex::new(None);
static GATE: Mutex<PointerGate> = Mutex::new(PointerGate::new());

thread_local! {
    static MONITORS: RefCell<Vec<Retained<AnyObject>>> = const { RefCell::new(Vec::new()) };
}

fn settings(app: &AppHandle) -> PeekSettings {
    app.state::<CoreState>().0.lock().unwrap().peek_settings()
}

/// The switcher holds this key: the tool installed and on, the switcher on.
pub fn holds(app: &AppHandle, c: Combo) -> bool {
    let s = settings(app);
    crate::peek_service::installed_and_on(app) && s.switcher && s.switcher_key == c
}

/// The key tap and macOS's own ⌘Tab as the tool, the switcher and the
/// permission say. Safe from any thread.
pub fn sync(app: &AppHandle) {
    let _one = SYNC.lock().unwrap_or_else(|e| e.into_inner());
    let s = settings(app);
    let want = crate::peek_service::installed_and_on(app) && crate::keyclean_tap::trusted(false) && s.switcher;
    let on = crate::switch_tap::sync(app, want, s.switcher_key);
    let (tab, shift_tab) = if on { native_off(s.switcher_key) } else { (false, false) };
    crate::switch_symbolic::set_native(!tab, !shift_tab);
    if !on {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || hide(&handle));
    }
}

/// While a key is being recorded in Settings: every key passes the tap.
pub fn hold(on: bool) {
    crate::switch_tap::hold(on);
}

fn icon(pid: i32) -> Option<String> {
    let mut cache = ICONS.lock().unwrap();
    let cache = cache.get_or_insert_with(HashMap::new);
    cache.entry(pid).or_insert_with(|| crate::peek_service::app_icon(pid)).clone()
}

// The running apps (regular ones, not Notching), with their names. Main thread.
fn running_apps() -> Vec<(i32, String)> {
    let own = std::process::id() as i32;
    NSWorkspace::sharedWorkspace()
        .runningApplications()
        .iter()
        .filter(|a| a.activationPolicy() == NSApplicationActivationPolicy::Regular && !a.isTerminated())
        .map(|a| (a.processIdentifier(), a.localizedName().map(|n| n.to_string()).unwrap_or_default()))
        .filter(|(pid, _)| *pid != own && *pid > 0)
        .collect()
}

// Notching's own windows a person works in. Their state and actions come from
// AppKit on the main thread: Accessibility on Notching's own windows off the
// main thread crashes it (Task 7, 6 Nov).
const OWN_LABELS: [&str; 2] = [crate::settings_window::SETTINGS_LABEL, crate::editor_window::EDITOR_LABEL];

fn own_pid() -> i32 {
    std::process::id() as i32
}

fn ns_window(w: &tauri::WebviewWindow, _mtm: MainThreadMarker) -> Option<&objc2_app_kit::NSWindow> {
    let ptr = w.ns_window().ok()?;
    // SAFETY: Tauri hands out its own live NSWindow; the marker says this is the main thread.
    Some(unsafe { &*(ptr as *const objc2_app_kit::NSWindow) })
}

// Notching's own open or minimized windows, for the list. Main thread.
fn own_windows(app: &AppHandle) -> Vec<WinInfo> {
    let Some(mtm) = MainThreadMarker::new() else { return Vec::new() };
    OWN_LABELS
        .iter()
        .filter_map(|l| app.get_webview_window(l))
        .filter_map(|w| {
            let ns = ns_window(&w, mtm)?;
            let minimized = ns.isMiniaturized();
            own_listed(ns.isVisible(), minimized).then(|| WinInfo {
                id: ns.windowNumber() as u32,
                pid: own_pid(),
                title: ns.title().to_string(),
                minimized,
                frame: Rect { x: 0.0, y: 0.0, w: 0.0, h: 0.0 },
            })
        })
        .collect()
}

// Notching's own window numbered `id`. Main thread.
fn own_window(app: &AppHandle, id: u32) -> Option<tauri::WebviewWindow> {
    let mtm = MainThreadMarker::new()?;
    OWN_LABELS
        .iter()
        .filter_map(|l| app.get_webview_window(l))
        .find(|w| ns_window(w, mtm).is_some_and(|ns| ns.windowNumber() as u32 == id))
}

// The apps' names, with Notching's own when one of its windows is listed.
fn names_of(app: &AppHandle, apps: Vec<(i32, String)>, own: &[WinInfo]) -> HashMap<i32, String> {
    let mut names: HashMap<i32, String> = apps.into_iter().collect();
    if !own.is_empty() {
        names.insert(own_pid(), app.package_info().name.clone());
    }
    names
}

// Every app's windows, each app on a thread of its own, waited for together at
// most LIST_WAIT: a hung app does not hold the switcher up (it shows as an app).
// `own`: Notching's own windows, read on the main thread.
fn list(apps: &[(i32, String)], minimized: bool, own: Vec<WinInfo>) -> Vec<Item> {
    let (sent, got) = mpsc::channel();
    for &(pid, _) in apps {
        let sent = sent.clone();
        std::thread::spawn(move || {
            let _ = sent.send(crate::peek_windows::app_windows(pid));
        });
    }
    drop(sent);
    let end = Instant::now() + LIST_WAIT;
    let mut windows = own;
    for _ in apps {
        match got.recv_timeout(end.saturating_duration_since(Instant::now())) {
            Ok(w) => windows.extend(w),
            Err(_) => break,
        }
    }
    if !minimized {
        windows.retain(|w| !w.minimized);
    }
    let z: Vec<u32> = crate::notify::window_list().iter().filter(|w| w.layer == 0).map(|w| w.number).collect();
    items(windows, &z, apps)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ItemDto {
    kind: &'static str,
    pid: i32,
    id: Option<u32>,
    title: String,
    app_name: String,
    minimized: bool,
    icon: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppDto {
    pid: i32,
    name: String,
    icon: Option<String>,
    count: usize,
}

/// What the switcher shows; same shape as SwitchView in src/peek/switcher.ts.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SwitchViewDto {
    items: Vec<ItemDto>,
    apps: Vec<AppDto>,
    sel: usize,
    win: usize,
    layout: SwitchLayout,
    place: SwitchPlace,
    card: CardColor,
    material: Material,
    accent: String,
    lang: Lang,
    sticky: bool,
    max_width: f64,
}

fn view(app: &AppHandle, o: &Open) -> SwitchViewDto {
    let s = settings(app);
    let (accent, lang) = {
        let core = app.state::<CoreState>();
        let core = core.0.lock().unwrap();
        (core.accent(), core.lang())
    };
    let name = |pid: i32| o.names.get(&pid).cloned().unwrap_or_default();
    let items = o
        .items
        .iter()
        .map(|i| match i {
            Item::Window { pid, id, title, minimized } => ItemDto {
                kind: "window",
                pid: *pid,
                id: Some(*id),
                title: title.clone(),
                app_name: name(*pid),
                minimized: *minimized,
                icon: icon(*pid),
            },
            Item::App { pid, name: n } => {
                ItemDto { kind: "app", pid: *pid, id: None, title: n.clone(), app_name: n.clone(), minimized: false, icon: icon(*pid) }
            }
        })
        .collect();
    let apps = o
        .apps
        .iter()
        .map(|&pid| AppDto {
            pid,
            name: name(pid),
            icon: icon(pid),
            count: o.items.iter().filter(|i| matches!(i, Item::Window { pid: p, .. } if *p == pid)).count(),
        })
        .collect();
    SwitchViewDto {
        items,
        apps,
        sel: o.sel,
        win: o.win,
        layout: s.layout,
        place: s.place,
        card: s.card,
        material: s.material,
        accent,
        lang,
        sticky: o.sticky,
        max_width: (o.visible.w - 48.0).max(240.0),
    }
}

// The windows of the app chosen per app.
fn app_windows_of(o: &Open, pid: i32) -> Vec<(i32, u32, bool)> {
    o.items
        .iter()
        .filter_map(|i| match i {
            Item::Window { pid: p, id, minimized, .. } if *p == pid => Some((*p, *id, *minimized)),
            _ => None,
        })
        .collect()
}

// What the selection points at: a window, or an app with no window here.
enum Target {
    Window(i32, u32, bool),
    App(i32),
}

fn target(app: &AppHandle, o: &Open) -> Option<Target> {
    match settings(app).layout {
        SwitchLayout::Windows => match o.items.get(o.sel)? {
            Item::Window { pid, id, minimized, .. } => Some(Target::Window(*pid, *id, *minimized)),
            Item::App { pid, .. } => Some(Target::App(*pid)),
        },
        SwitchLayout::Apps => {
            let pid = *o.apps.get(o.sel)?;
            match app_windows_of(o, pid).get(o.win) {
                Some(&(p, id, m)) => Some(Target::Window(p, id, m)),
                None => Some(Target::App(pid)),
            }
        }
    }
}

fn emit(app: &AppHandle) {
    let Some(o) = OPEN.lock().unwrap().clone().filter(|o| o.shown) else { return };
    let v = view(app, &o);
    let _ = app.emit_to(EventTarget::webview_window(PANEL), VIEW_EVENT, &v);
}

fn move_sel(app: &AppHandle, d: i32, by_window: bool) {
    let layout = settings(app).layout;
    let mut open = OPEN.lock().unwrap();
    let Some(o) = open.as_mut() else {
        EARLY_STEPS.fetch_add(d, Ordering::SeqCst);
        return;
    };
    match (layout, by_window) {
        (SwitchLayout::Apps, true) => {
            let n = o.apps.get(o.sel).map_or(0, |&pid| app_windows_of(o, pid).len());
            o.win = step(o.win, n, d);
        }
        (SwitchLayout::Apps, false) => {
            o.sel = step(o.sel, o.apps.len(), d);
            o.win = 0;
        }
        (SwitchLayout::Windows, _) => o.sel = step(o.sel, o.items.len(), d),
    }
    drop(open);
    emit(app);
}

// Opens what is selected and closes the switcher.
fn commit(app: &AppHandle) {
    let chosen = OPEN.lock().unwrap().clone().and_then(|o| target(app, &o));
    hide(app);
    match chosen {
        Some(Target::Window(pid, id, _)) if pid == own_pid() => {
            if let Some(w) = own_window(app, id) {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        Some(Target::Window(pid, id, _)) => {
            std::thread::spawn(move || {
                crate::peek_windows::raise(pid, id);
            });
        }
        Some(Target::App(pid)) => {
            std::thread::spawn(move || crate::peek_windows::activate(pid));
        }
        None => {}
    }
}

// A window button, by key or click: the switcher stays, sticky, and lists again.
fn act(app: &AppHandle, a: Act) {
    let Some(o) = OPEN.lock().unwrap().clone() else {
        // Pressed before the list was ready: done on the selection once it is.
        *EARLY_ACT.lock().unwrap() = Some(a);
        return;
    };
    let Some(chosen) = target(app, &o) else { return };
    crate::switch_tap::acted();
    if let Some(open) = OPEN.lock().unwrap().as_mut() {
        open.sticky = true;
    }
    let handle = app.clone();
    if let Target::Window(pid, id, minimized) = chosen
        && pid == own_pid()
    {
        let own = own_window(app, id);
        std::thread::spawn(move || {
            if let Some(w) = own {
                match own_act(a, minimized) {
                    OwnAct::Minimize => {
                        crate::peek_capture::remember_before_minimize(id);
                        let _ = w.minimize();
                    }
                    OwnAct::Restore => {
                        let _ = w.unminimize();
                    }
                    OwnAct::Close => {
                        let _ = w.close();
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(250));
            relist(&handle);
        });
        return;
    }
    std::thread::spawn(move || {
        match (a, chosen) {
            (Act::Minimize, Target::Window(pid, id, minimized)) => {
                if !minimized {
                    crate::peek_capture::remember_before_minimize(id);
                }
                crate::peek_windows::set_all_minimized(pid, &[id], !minimized);
            }
            (Act::Close, Target::Window(pid, id, _)) => {
                crate::peek_windows::close(pid, id);
            }
            (Act::Quit, Target::Window(pid, ..) | Target::App(pid)) => {
                crate::peek_windows::quit(pid);
            }
            _ => {}
        }
        std::thread::sleep(Duration::from_millis(250));
        relist(&handle);
    });
}

// Makes the list again after a window button, keeping the selection's place.
fn relist(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let apps = running_apps();
        let own = own_windows(&handle);
        let names = names_of(&handle, apps.clone(), &own);
        let minimized = settings(&handle).minimized;
        let round = ROUND.load(Ordering::SeqCst);
        let app = handle.clone();
        std::thread::spawn(move || {
            let list = list(&apps, minimized, own);
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                if ROUND.load(Ordering::SeqCst) != round {
                    return;
                }
                let mut open = OPEN.lock().unwrap();
                let Some(o) = open.as_mut() else { return };
                if nothing_left(&list) {
                    drop(open);
                    hide(&handle);
                    return;
                }
                o.apps = apps_of(&list);
                o.sel = o.sel.min(match settings(&handle).layout {
                    SwitchLayout::Windows => list.len() - 1,
                    SwitchLayout::Apps => o.apps.len().saturating_sub(1),
                });
                o.items = list;
                o.names = names;
                o.win = 0;
                drop(open);
                emit(&handle);
                // What is behind the switcher has changed: its glass is pictured again.
                glass_capture::retake(&handle, Owner::Switcher, crate::peek_service::glass_exclude(&handle), glass_ready);
            });
        });
    });
}

// Starts a new switcher: the list on threads of its own, then the panel, or,
// let go already, the second item opened at once.
fn open(app: &AppHandle) {
    let started = Instant::now();
    let round = ROUND.fetch_add(1, Ordering::SeqCst) + 1;
    EARLY_STEPS.store(0, Ordering::SeqCst);
    EARLY_COMMIT.store(false, Ordering::SeqCst);
    *EARLY_ACT.lock().unwrap() = None;
    *OPEN.lock().unwrap() = None;
    let Some(mtm) = MainThreadMarker::new() else { return };
    let screens = crate::win_service::screens(mtm);
    let primary = screens.first().map_or(0.0, |(full, _)| full.h);
    let p = NSEvent::mouseLocation();
    let (screen, visible) = crate::peek_service::screen_at(&screens, p.x, primary - p.y);
    let apps = running_apps();
    let own = own_windows(app);
    let names = names_of(app, apps.clone(), &own);
    let s = settings(app);
    // Notching's own glass (design 7 Nov §4): the screen behind is pictured while the list is made.
    if glass_capture::can_draw(s.material) {
        glass_capture::begin(app, Owner::Switcher, screen, crate::peek_service::glass_exclude(app), glass_ready);
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        let list = list(&apps, s.minimized, own);
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if ROUND.load(Ordering::SeqCst) != round {
                return;
            }
            let apps = apps_of(&list);
            let len = match s.layout {
                SwitchLayout::Windows => list.len(),
                SwitchLayout::Apps => apps.len(),
            };
            let sel = step(first_selection(len), len, EARLY_STEPS.swap(0, Ordering::SeqCst));
            *OPEN.lock().unwrap() =
                Some(Open { items: list, apps, names, sel, win: 0, sticky: false, screen, visible, shown: false });
            if EARLY_COMMIT.swap(false, Ordering::SeqCst) {
                eprintln!("notching: switcher let go before it showed; opening the selection");
                commit(&app);
                return;
            }
            if let Some(a) = EARLY_ACT.lock().unwrap().take() {
                act(&app, a);
            }
            // A quick ⌘Tab is let go before this: nothing flashes on screen.
            let wait = show_delay(started.elapsed());
            if wait.is_zero() {
                show(&app, round);
                return;
            }
            std::thread::spawn(move || {
                std::thread::sleep(wait);
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || show(&handle, round));
            });
        });
    });
}

// The panel for this opening, if it is still the one. Main thread.
fn show(app: &AppHandle, round: u64) {
    if ROUND.load(Ordering::SeqCst) != round {
        return;
    }
    match OPEN.lock().unwrap().as_mut() {
        Some(o) => o.shown = true,
        None => return,
    }
    crate::peek_service::make_panel(app, PANEL, "switcher.html", LEVEL);
    emit(app);
}

// The switcher's glass at `frame` (CG points) from its picture, when it can be drawn there.
fn glass_at(frame: Rect, s: PeekSettings) -> Option<Retained<CGImage>> {
    if !glass_capture::can_draw(s.material) {
        return None;
    }
    let snap = glass_capture::snapshot(Owner::Switcher)?;
    if !snap.screen.contains(frame.x + frame.w / 2.0, frame.y + frame.h / 2.0) {
        return None;
    }
    crate::glass_draw::render(&snap, frame, crate::peek_rules::glass_shape(Some(s.place)), crate::glass_draw::current_look(), None)
}

// The switcher's picture came while it is up: its glass fades in.
fn glass_ready(app: &AppHandle, _owner: Owner) {
    let Some(frame) = *GLASS_AT.lock().unwrap() else { return };
    let s = settings(app);
    let Some(image) = glass_at(frame, s) else { return };
    let Ok(panel) = app.get_webview_panel(PANEL) else { return };
    let shape = crate::peek_rules::glass_shape(Some(s.place));
    crate::peek_service::dress_window(app, PANEL, s, shape, true);
    glass_view::show(app, PANEL, panel.as_panel(), &image, shape, crate::glass_draw::current_look(), Enter::Fade);
}

fn hide(app: &AppHandle) {
    ROUND.fetch_add(1, Ordering::SeqCst);
    *OPEN.lock().unwrap() = None;
    *FRAME.lock().unwrap() = None;
    *GLASS_AT.lock().unwrap() = None;
    glass_capture::forget(Owner::Switcher);
    glass_view::clear(app, PANEL);
    GATE.lock().unwrap().reset();
    watch_pointer(app, false);
    crate::switch_tap::closed();
    if let Ok(panel) = app.get_webview_panel(PANEL) {
        panel.hide();
    }
    let _ = app.emit_to(EventTarget::webview_window(PANEL), VIEW_EVENT, None::<SwitchViewDto>);
}

/// A switcher key from the tap, on the main thread.
pub fn key(app: &AppHandle, action: SwitchAction) {
    match action {
        SwitchAction::Open => open(app),
        SwitchAction::Next => move_sel(app, 1, false),
        SwitchAction::Prev => move_sel(app, -1, false),
        SwitchAction::NextWin => move_sel(app, 1, true),
        SwitchAction::PrevWin => move_sel(app, -1, true),
        SwitchAction::Commit => {
            if OPEN.lock().unwrap().is_some() {
                commit(app);
            } else {
                EARLY_COMMIT.store(true, Ordering::SeqCst);
            }
        }
        SwitchAction::Cancel => hide(app),
        SwitchAction::Act(a) => act(app, a),
        SwitchAction::Pass | SwitchAction::Swallow => {}
    }
}

#[derive(Serialize, Clone, Copy)]
struct PointDto {
    x: f64,
    y: f64,
}

fn send_pointer(app: &AppHandle, clicked: bool) {
    let Some(frame) = *FRAME.lock().unwrap() else { return };
    let p = NSEvent::mouseLocation();
    let point = card_point((p.x, p.y), frame);
    // A click off the panel closes the switcher.
    if clicked && point.is_none() {
        hide(app);
        return;
    }
    // Only a pointer that moved picks: one resting where the panel appeared does not.
    if !GATE.lock().unwrap().moved((p.x, p.y)) {
        return;
    }
    let _ = app.emit_to(EventTarget::webview_window(PANEL), POINTER_EVENT, point.map(|(x, y)| PointDto { x, y }));
}

// Follows the pointer while the panel is up, over other apps and over the
// panel itself; a click elsewhere closes it. Main thread.
fn watch_pointer(app: &AppHandle, on: bool) {
    MONITORS.with(|m| {
        let mut m = m.borrow_mut();
        if !on {
            for token in m.drain(..) {
                // SAFETY: a monitor added below, removed once.
                unsafe { NSEvent::removeMonitor(&token) };
            }
            return;
        }
        if !m.is_empty() {
            return;
        }
        let moves = NSEventMask::MouseMoved | NSEventMask::LeftMouseDragged;
        let local_app = app.clone();
        let local = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
            send_pointer(&local_app, false);
            event.as_ptr()
        });
        let global_app = app.clone();
        let global = RcBlock::new(move |_: NonNull<NSEvent>| send_pointer(&global_app, false));
        let click_app = app.clone();
        let click = RcBlock::new(move |_: NonNull<NSEvent>| send_pointer(&click_app, true));
        // SAFETY: the blocks live as long as their monitors, removed above.
        if let Some(token) = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(moves, &local) } {
            m.push(token);
        }
        if let Some(token) = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(moves, &global) {
            m.push(token);
        }
        if let Some(token) = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(NSEventMask::LeftMouseDown, &click) {
            m.push(token);
        }
    });
}

/// The page's size: the panel is placed (centred, or under the notch) and shown.
#[tauri::command]
pub fn switch_size(app: AppHandle, width: f64, height: f64) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(o) = OPEN.lock().unwrap().clone().filter(|o| o.shown) else { return };
        let s = settings(&handle);
        let (w, h) = (width.min(o.visible.w - 24.0), height.min(o.visible.h - 24.0));
        let x = o.screen.x + (o.screen.w - w) / 2.0;
        let y = match s.place {
            SwitchPlace::Center => o.visible.y + (o.visible.h - h) / 2.0,
            SwitchPlace::Notch => o.screen.y,
        };
        let primary = crate::peek_service::primary_height();
        let frame = Rect { x, y, w, h };
        let at = crate::peek_service::appkit(frame, primary);
        let Ok(panel) = handle.get_webview_panel(PANEL) else { return };
        let shape = crate::peek_rules::glass_shape(Some(s.place));
        let glass = glass_at(frame, s);
        crate::peek_service::dress_window(&handle, PANEL, s, shape, glass.is_some());
        panel.as_panel().setFrame_display(at, true);
        panel.as_panel().invalidateShadow();
        let first = !panel.as_panel().isVisible();
        panel.as_panel().orderFrontRegardless();
        *GLASS_AT.lock().unwrap() = Some(frame);
        match glass {
            Some(image) => {
                let enter = if first {
                    Enter::Opening(opening(Some(s.place)))
                } else if glass_view::showing(PANEL) {
                    Enter::Now
                } else {
                    Enter::Fade
                };
                glass_view::show(&handle, PANEL, panel.as_panel(), &image, shape, crate::glass_draw::current_look(), enter);
            }
            // No picture yet: macOS's glass now, Notching's when it comes, or none after a second.
            None if first && glass_capture::state(Owner::Switcher) == Snap::Waiting => glass_capture::give_up_later(&handle, Owner::Switcher),
            None => {}
        }
        if first {
            eprintln!("notching: switcher shown ({} items)", o.items.len());
        }
        *FRAME.lock().unwrap() = Some(Rect { x: at.origin.x, y: at.origin.y, w: at.size.width, h: at.size.height });
        let p = NSEvent::mouseLocation();
        GATE.lock().unwrap().shown((p.x, p.y));
        watch_pointer(&handle, true);
    });
}

/// The pointer came onto the panel, or left it; nothing to do but keep the page honest.
#[tauri::command]
pub fn switch_pointer(_inside: bool) {}

fn choose(index: usize, win: Option<usize>) {
    if let Some(o) = OPEN.lock().unwrap().as_mut() {
        o.sel = index;
        o.win = win.unwrap_or(0);
    }
}

/// The pointer on a card or app: it becomes the selection.
#[tauri::command]
pub fn switch_pick(app: AppHandle, index: usize, win: Option<usize>) {
    choose(index, win);
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || emit(&handle));
}

/// A card or app clicked: opened.
#[tauri::command]
pub fn switch_open(app: AppHandle, index: usize, win: Option<usize>) {
    choose(index, win);
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || commit(&handle));
}

/// A window button clicked on a card.
#[tauri::command]
pub fn switch_act(app: AppHandle, index: usize, win: Option<usize>, act: Act) {
    choose(index, win);
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || self::act(&handle, act));
}

/// A window's picture for its card, as a PNG data URL; None: the app's icon stays.
#[tauri::command]
pub async fn switch_picture(id: u32) -> Option<String> {
    let minimized = OPEN.lock().unwrap().as_ref().and_then(|o| {
        o.items.iter().find_map(|i| match i {
            Item::Window { id: w, minimized, .. } if *w == id => Some(*minimized),
            _ => None,
        })
    })?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::peek_capture::picture(id, minimized, crate::peek_capture::PictureSize::Thumb)
            .map(|png| crate::peek_service::data_url(&png))
    })
    .await
    .ok()
    .flatten()
}

/// The switcher's view, for a page that loaded after it went out.
#[tauri::command]
pub fn switch_view(app: AppHandle) -> Option<SwitchViewDto> {
    OPEN.lock().unwrap().clone().filter(|o| o.shown).map(|o| view(&app, &o))
}

/// At launch: the tap and macOS's ⌘Tab as the settings say.
pub fn start(app: &AppHandle) {
    sync(app);
}

fn save_key(app: &AppHandle, key: Combo) -> Result<(), String> {
    let core = app.state::<CoreState>();
    let next = PeekSettings { switcher_key: key, ..settings(app) };
    change(app, &core, |c| c.set_peek_settings(next))?;
    sync(app);
    Ok(())
}

/// A key recorded on Pintasan for the switcher. Refuses Screenshot's,
/// Atur jendela's and the app keys while they are on.
#[tauri::command]
pub async fn switch_set_key(app: AppHandle, code: String, cmd: bool, ctrl: bool, alt: bool, shift: bool) -> Result<(), SwitchKeyError> {
    let combo = switch_from_web(&code, cmd, ctrl, alt, shift);
    let shot = combo.is_some_and(|c| {
        crate::shot_service::enabled(&app) && {
            let s = app.state::<CoreState>().0.lock().unwrap().shot_keys();
            s.screen == c || s.pick == c
        }
    });
    let window = combo.is_some_and(|c| crate::win_service::holds(&app, c));
    let keys = combo.is_some_and(|c| crate::app_keys_service::holds(&app, c));
    if let Some(e) = refusal(combo, shot, window, keys) {
        return Err(e);
    }
    save_key(&app, combo.unwrap_or(crate::peek_rules::SWITCHER_KEY)).map_err(|_| SwitchKeyError::Invalid)
}

/// Back to ⌘Tab.
#[tauri::command]
pub async fn switch_reset_key(app: AppHandle) -> Result<(), String> {
    save_key(&app, crate::peek_rules::SWITCHER_KEY)
}
